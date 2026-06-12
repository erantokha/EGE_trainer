import SwiftUI

/// Нижняя навигация преподавателя.
struct TeacherTabView: View {
    var body: some View {
        TabView {
            NavigationStack { TeacherHomeView() }
                .tabItem { Label("Подбор", systemImage: "square.grid.2x2") }

            NavigationStack { MyStudentsView() }
                .tabItem { Label("Мои ученики", systemImage: "person.2.fill") }

            NavigationStack { ProfileView() }
                .tabItem { Label("Профиль", systemImage: "person.crop.circle") }
        }
    }
}
