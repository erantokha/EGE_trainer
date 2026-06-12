import SwiftUI

/// Нижняя навигация ученика (native tab bar вместо бургер-сайдбара веба).
struct StudentTabView: View {
    @EnvironmentObject private var app: AppState

    var body: some View {
        TabView {
            NavigationStack { StudentHomeView() }
                .tabItem { Label("Тренировка", systemImage: "square.grid.2x2") }

            NavigationStack { MyHomeworksView() }
                .tabItem { Label("Мои ДЗ", systemImage: "checklist") }
                .badge(app.pendingHomeworksCount)

            NavigationStack { StatsView() }
                .tabItem { Label("Статистика", systemImage: "chart.bar.fill") }

            NavigationStack { ProfileView() }
                .tabItem { Label("Профиль", systemImage: "person.crop.circle") }
        }
        .task { await app.refreshHomeworkBadge() }
    }
}
