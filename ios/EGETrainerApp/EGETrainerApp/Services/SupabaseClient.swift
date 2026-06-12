import Foundation

/// Единый сетевой слой Supabase (зеркало app/providers/supabase.js + supabase-rest.js):
/// - GoTrue: password-login, refresh, logout;
/// - PostgREST: rpc / select / insert;
/// - авто-refresh access_token и один повтор запроса на 401;
/// - ретраи ТОЛЬКО сетевых сбоев/таймаутов (любой HTTP-ответ не ретраится),
///   backoff как в вебе: 350 / 800 / 1500 мс.
actor SupabaseClient {
    static let shared = SupabaseClient(store: KeychainSessionStore())

    private let store: SessionStore
    private var session: AuthSession?
    private var refreshTask: Task<AuthSession?, Never>?

    private let urlSession: URLSession

    init(store: SessionStore) {
        self.store = store
        self.session = store.load()
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 20
        cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.urlSession = URLSession(configuration: cfg)
    }

    // MARK: - Session

    var currentSession: AuthSession? { session }

    func restoreSession() async -> AuthSession? {
        guard let s = session else { return nil }
        if !s.isExpiringSoon { return s }
        return await refreshSession()
    }

    func setSession(_ s: AuthSession?) {
        session = s
        if let s { store.save(s) } else { store.clear() }
    }

    // MARK: - Auth (GoTrue)

    func signIn(email: String, password: String) async throws -> AuthSession {
        var req = URLRequest(url: SupabaseConfig.baseURL.appendingPathComponent("auth/v1/token"))
        req.url = req.url?.appending(queryItems: [URLQueryItem(name: "grant_type", value: "password")])
        req.httpMethod = "POST"
        req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["email": email, "password": password])

        let (data, resp) = try await dataWithRetry(req)
        guard let http = resp as? HTTPURLResponse else { throw SupabaseError.emptyResponse }
        guard http.statusCode == 200 else {
            throw SupabaseError.fromAuthBody(status: http.statusCode, body: data)
        }
        let s = try decode(AuthSession.self, from: data)
        setSession(s)
        return s
    }

    @discardableResult
    func refreshSession() async -> AuthSession? {
        if let task = refreshTask { return await task.value }
        guard let current = session, !current.refreshToken.isEmpty else { return nil }

        let task = Task<AuthSession?, Never> { [urlSession] in
            var req = URLRequest(url: SupabaseConfig.baseURL.appendingPathComponent("auth/v1/token"))
            req.url = req.url?.appending(queryItems: [URLQueryItem(name: "grant_type", value: "refresh_token")])
            req.httpMethod = "POST"
            req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONEncoder().encode(["refresh_token": current.refreshToken])
            guard let (data, resp) = try? await urlSession.data(for: req),
                  let http = resp as? HTTPURLResponse, http.statusCode == 200,
                  let s = try? JSONDecoder().decode(AuthSession.self, from: data)
            else { return nil }
            return s
        }
        refreshTask = task
        let refreshed = await task.value
        refreshTask = nil
        // Refresh не удался — сессию не трогаем (best-effort, как в вебе);
        // протухший токен поймает 401-ветка конкретного запроса.
        if let refreshed { setSession(refreshed) }
        return refreshed
    }

    func signOut() async {
        if let s = session {
            var req = URLRequest(url: SupabaseConfig.baseURL.appendingPathComponent("auth/v1/logout"))
            req.httpMethod = "POST"
            req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
            req.setValue("Bearer \(s.accessToken)", forHTTPHeaderField: "Authorization")
            _ = try? await urlSession.data(for: req) // best-effort revoke, UX не блокируем
        }
        setSession(nil)
    }

    // MARK: - PostgREST

    /// RPC-вызов: POST /rest/v1/rpc/<name>. Декодирует ответ в T.
    func rpc<T: Decodable>(_ name: String, params: [String: JSONValue] = [:], as type: T.Type) async throws -> T {
        let url = SupabaseConfig.baseURL.appendingPathComponent("rest/v1/rpc/\(name)")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(params)
        let data = try await authedRequest(req)
        return try decode(T.self, from: data)
    }

    /// RPC без интереса к телу ответа.
    func rpcVoid(_ name: String, params: [String: JSONValue] = [:]) async throws {
        let url = SupabaseConfig.baseURL.appendingPathComponent("rest/v1/rpc/\(name)")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(params)
        _ = try await authedRequest(req)
    }

    /// REST select: GET /rest/v1/<table>?<query>
    func select<T: Decodable>(_ table: String, query: [URLQueryItem], as type: T.Type) async throws -> T {
        var comps = URLComponents(url: SupabaseConfig.baseURL.appendingPathComponent("rest/v1/\(table)"),
                                  resolvingAgainstBaseURL: false)!
        comps.queryItems = query
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "GET"
        let data = try await authedRequest(req)
        return try decode(T.self, from: data)
    }

    /// REST insert: POST /rest/v1/<table> (Prefer: return=representation).
    func insert<T: Decodable>(_ table: String, values: [String: JSONValue], as type: T.Type) async throws -> T {
        var req = URLRequest(url: SupabaseConfig.baseURL.appendingPathComponent("rest/v1/\(table)"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        req.httpBody = try JSONEncoder().encode(values)
        let data = try await authedRequest(req)
        return try decode(T.self, from: data)
    }

    // MARK: - Internals

    /// Запрос с auth-заголовками, авто-refresh при близком к истечению токене
    /// и одним повтором на 401 (зеркало 401-retry из supabase-rest.js).
    private func authedRequest(_ request: URLRequest) async throws -> Data {
        guard var s = session else { throw SupabaseError.authRequired }
        if s.isExpiringSoon {
            if let refreshed = await refreshSession() { s = refreshed }
        }

        func attempt(token: String) async throws -> (Data, Int) {
            var req = request
            req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            let (data, resp) = try await dataWithRetry(req)
            let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
            return (data, status)
        }

        var (data, status) = try await attempt(token: s.accessToken)
        if status == 401 {
            guard let refreshed = await refreshSession() else {
                setSession(nil)
                throw SupabaseError.authRequired
            }
            (data, status) = try await attempt(token: refreshed.accessToken)
        }

        guard (200..<300).contains(status) else {
            throw mapHTTPError(status: status, body: data)
        }
        return data
    }

    /// Сетевые ретраи: повторяем только URLError (сбой/таймаут), любой HTTP-ответ возвращаем сразу.
    func dataWithRetry(_ req: URLRequest, retries: Int = 2) async throws -> (Data, URLResponse) {
        let backoffsMs: [UInt64] = [350, 800, 1500]
        var lastError: Error = SupabaseError.timeout
        for attemptIdx in 0...retries {
            do {
                return try await urlSession.data(for: req)
            } catch {
                lastError = error
                let isRetryable = (error as? URLError).map {
                    [.timedOut, .cannotConnectToHost, .networkConnectionLost,
                     .notConnectedToInternet, .dnsLookupFailed, .cannotFindHost].contains($0.code)
                } ?? false
                if !isRetryable || attemptIdx == retries {
                    if let urlErr = error as? URLError, urlErr.code == .timedOut {
                        throw SupabaseError.timeout
                    }
                    throw SupabaseError.network(underlying: error)
                }
                let delay = backoffsMs[min(attemptIdx, backoffsMs.count - 1)]
                try? await Task.sleep(nanoseconds: delay * 1_000_000)
            }
        }
        throw SupabaseError.network(underlying: lastError)
    }

    private func mapHTTPError(status: Int, body: Data) -> SupabaseError {
        struct PgErr: Decodable { let message: String?; let hint: String?; let details: String? }
        let parsed = try? JSONDecoder().decode(PgErr.self, from: body)
        let msg = parsed?.message ?? ""
        if status == 403 || msg.uppercased().contains("ACCESS_DENIED") { return .accessDenied }
        if status == 401 { return .authRequired }
        return .http(status: status, message: msg)
    }

    func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw SupabaseError.decoding(message: String(describing: error))
        }
    }
}

extension SupabaseClient {
    /// PostgREST для scalar-RPC может вернуть как объект, так и массив из одной строки —
    /// хелпер разворачивает обе формы (зеркало normalizeAttemptRowFromRpc в вебе).
    func rpcSingleRow<T: Decodable>(_ name: String, params: [String: JSONValue] = [:], as type: T.Type) async throws -> T {
        if let rows = try? await rpc(name, params: params, as: [T].self) {
            if let first = rows.first { return first }
            throw SupabaseError.emptyResponse
        }
        return try await rpc(name, params: params, as: T.self)
    }
}
