import Foundation
import CryptoKit

/// GoTrue-флоу регистрации/сброса/OAuth — зеркало signUpWithPassword /
/// resendSignupEmail / sendPasswordReset / signInWithGoogle (PKCE)
/// из app/providers/supabase.js.
extension SupabaseClient {

    /// POST /auth/v1/signup. Возвращает true, если сессия выдана сразу
    /// (autoconfirm выключен на проде → обычно false: ждём письмо).
    func signUp(email: String, password: String,
                meta: [String: JSONValue], emailRedirectTo: URL) async throws -> Bool {
        var comps = URLComponents(
            url: SupabaseConfig.baseURL.appendingPathComponent("auth/v1/signup"),
            resolvingAgainstBaseURL: false
        )!
        comps.queryItems = [URLQueryItem(name: "redirect_to", value: emailRedirectTo.absoluteString)]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "POST"
        req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: JSONValue = .object([
            "email": .string(email),
            "password": .string(password),
            "data": .object(meta),
        ])
        req.httpBody = try JSONEncoder().encode(body)

        let (data, resp) = try await dataWithRetry(req, retries: 0)
        guard let http = resp as? HTTPURLResponse else { throw SupabaseError.emptyResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw SupabaseError.fromAuthBody(status: http.statusCode, body: data)
        }
        if let s = try? decode(AuthSession.self, from: data), !s.accessToken.isEmpty {
            setSession(s)
            return true
        }
        return false
    }

    /// POST /auth/v1/resend {type:'signup'} — переотправка письма подтверждения.
    func resendSignupEmail(email: String, emailRedirectTo: URL) async throws {
        var comps = URLComponents(
            url: SupabaseConfig.baseURL.appendingPathComponent("auth/v1/resend"),
            resolvingAgainstBaseURL: false
        )!
        comps.queryItems = [URLQueryItem(name: "redirect_to", value: emailRedirectTo.absoluteString)]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "POST"
        req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(
            JSONValue.object(["type": .string("signup"), "email": .string(email)])
        )
        let (data, resp) = try await dataWithRetry(req, retries: 0)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SupabaseError.fromAuthBody(
                status: (resp as? HTTPURLResponse)?.statusCode ?? 0, body: data)
        }
    }

    /// POST /auth/v1/recover — письмо для смены пароля (redirect на веб auth_reset).
    func sendPasswordReset(email: String, redirectTo: URL) async throws {
        var comps = URLComponents(
            url: SupabaseConfig.baseURL.appendingPathComponent("auth/v1/recover"),
            resolvingAgainstBaseURL: false
        )!
        comps.queryItems = [URLQueryItem(name: "redirect_to", value: redirectTo.absoluteString)]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "POST"
        req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(JSONValue.object(["email": .string(email)]))
        let (data, resp) = try await dataWithRetry(req, retries: 0)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SupabaseError.fromAuthBody(
                status: (resp as? HTTPURLResponse)?.statusCode ?? 0, body: data)
        }
    }

    // MARK: - OAuth (Google, PKCE)

    /// URL /auth/v1/authorize для ASWebAuthenticationSession.
    nonisolated func oauthAuthorizeURL(provider: String, redirectTo: String, codeChallenge: String) -> URL {
        var comps = URLComponents(
            url: SupabaseConfig.baseURL.appendingPathComponent("auth/v1/authorize"),
            resolvingAgainstBaseURL: false
        )!
        comps.queryItems = [
            URLQueryItem(name: "provider", value: provider),
            URLQueryItem(name: "redirect_to", value: redirectTo),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: "s256"),
        ]
        return comps.url!
    }

    /// POST /auth/v1/token?grant_type=pkce — обмен кода на сессию.
    func exchangeOAuthCode(_ code: String, codeVerifier: String) async throws -> AuthSession {
        var comps = URLComponents(
            url: SupabaseConfig.baseURL.appendingPathComponent("auth/v1/token"),
            resolvingAgainstBaseURL: false
        )!
        comps.queryItems = [URLQueryItem(name: "grant_type", value: "pkce")]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "POST"
        req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(JSONValue.object([
            "auth_code": .string(code),
            "code_verifier": .string(codeVerifier),
        ]))
        let (data, resp) = try await dataWithRetry(req, retries: 0)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
            throw SupabaseError.fromAuthBody(
                status: (resp as? HTTPURLResponse)?.statusCode ?? 0, body: data)
        }
        let s = try decode(AuthSession.self, from: data)
        setSession(s)
        return s
    }
}

/// PKCE-пара verifier/challenge (S256), как в supabase-js.
struct PKCEPair {
    let verifier: String
    let challenge: String

    init() {
        var bytes = [UInt8](repeating: 0, count: 64)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        verifier = Data(bytes).base64URLEncoded()
        let digest = SHA256.hash(data: Data(verifier.utf8))
        challenge = Data(digest).base64URLEncoded()
    }
}

private extension Data {
    func base64URLEncoded() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
