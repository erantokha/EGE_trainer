import Foundation
import Security

/// Хранилище сессии. Протокол — чтобы dev-harness/тесты могли подменить Keychain.
protocol SessionStore {
    func load() -> AuthSession?
    func save(_ session: AuthSession)
    func clear()
}

/// Keychain-хранилище (kSecClassGenericPassword) — сессия переживает перезапуск приложения.
final class KeychainSessionStore: SessionStore {
    private let service = "ru.egetrainer.ios.session"
    private let account = "supabase"

    func load() -> AuthSession? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(AuthSession.self, from: data)
    }

    func save(_ session: AuthSession) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let update: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var add = query
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

/// In-memory хранилище для тестов/харнесса.
final class InMemorySessionStore: SessionStore {
    private var session: AuthSession?
    func load() -> AuthSession? { session }
    func save(_ session: AuthSession) { self.session = session }
    func clear() { session = nil }
}
