// Service-layer harness shim. The app's ProtoPick lives beside its SwiftUI sheet,
// while StudentPickEngine is compiled by the CLI harness without UI files.
struct ProtoPick: Equatable {
    var topicId: String
    var count: Int
}
