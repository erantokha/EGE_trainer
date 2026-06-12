import SwiftUI

/// Карточка ученика (tasks/student.html): шапка, выполненные работы,
/// статистика (переиспользуем StatsView в teacher scope).
struct StudentCardView: View {
    @EnvironmentObject private var app: AppState

    let student: StudentListItem

    @Environment(\.dismiss) private var dismiss

    @State private var attempts: [StudentAttemptRow] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showAllAttempts = false

    // Метрики за период (как на карточке ученика веба)
    @State private var metricsDays = 30
    @State private var analytics: AnalyticsScreen?
    @State private var showUnlinkConfirm = false
    @State private var unlinkError: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Card {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(student.displayName)
                            .font(.title3.weight(.bold))
                            .foregroundStyle(Theme.text)
                        HStack(spacing: 8) {
                            if let grade = student.studentGrade {
                                Text("\(grade) класс")
                            }
                            if let email = student.email {
                                Text(email)
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(Theme.textDim)
                    }
                }

                metricsCard

                attemptsCard

                NavigationLink {
                    StatsView(studentId: student.studentId)
                } label: {
                    Card(padding: 14) {
                        HStack {
                            Label("Полная статистика ученика", systemImage: "chart.bar.fill")
                                .font(.body.weight(.medium))
                                .foregroundStyle(Theme.accent)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(Theme.textDim)
                        }
                    }
                }
                .buttonStyle(.plain)

                if let unlinkError {
                    Text(unlinkError)
                        .font(.caption)
                        .foregroundStyle(Theme.danger)
                }

                Button {
                    showUnlinkConfirm = true
                } label: {
                    Text("Отвязать ученика")
                        .font(.caption)
                        .foregroundStyle(Theme.danger)
                }
                .buttonStyle(.plain)
            }
            .padding(16)
        }
        .background(Theme.bg)
        .navigationTitle("Карточка ученика")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog(
            "Отвязать ученика \(student.displayName)? Вы перестанете видеть его статистику и назначать ДЗ.",
            isPresented: $showUnlinkConfirm,
            titleVisibility: .visible
        ) {
            Button("Отвязать", role: .destructive) {
                Task { await unlink() }
            }
            Button("Отмена", role: .cancel) {}
        }
    }

    // MARK: - Метрики за период

    private var metricsCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Метрики")
                        .font(.headline)
                        .foregroundStyle(Theme.text)
                    Spacer()
                    Picker("Период", selection: $metricsDays) {
                        Text("7 дн").tag(7)
                        Text("14 дн").tag(14)
                        Text("30 дн").tag(30)
                        Text("90 дн").tag(90)
                    }
                    .pickerStyle(.menu)
                    .tint(Theme.accent)
                    .onChange(of: metricsDays) { _, _ in
                        Task { await loadAnalytics() }
                    }
                }
                if let o = analytics?.overall {
                    HStack(spacing: 10) {
                        metricCell("Последние 10", counterText(o.last10))
                        metricCell("За период", counterText(o.period))
                        metricCell("Всё время", counterText(o.allTime))
                    }
                } else {
                    Text("Статистика загружается...")
                        .font(.caption)
                        .foregroundStyle(Theme.textDim)
                }
            }
        }
    }

    private func metricCell(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption2).foregroundStyle(Theme.textDim)
            Text(value).font(.subheadline.weight(.bold)).foregroundStyle(Theme.text)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(Theme.surface2)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm))
    }

    private func counterText(_ c: Counter?) -> String {
        guard let c, c.total > 0 else { return "—" }
        return "\(c.correct)/\(c.total) · \(Int((Double(c.correct) / Double(c.total) * 100).rounded()))%"
    }

    private func loadAnalytics() async {
        analytics = try? await app.student.analytics(
            scope: "teacher", studentId: student.studentId, days: metricsDays
        )
    }

    private func unlink() async {
        unlinkError = nil
        do {
            try await app.teacher.removeStudent(studentId: student.studentId)
            dismiss()
        } catch {
            unlinkError = error.localizedDescription
        }
    }

    private var attemptsCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                Text("Выполненные работы")
                    .font(.headline)
                    .foregroundStyle(Theme.text)

                if isLoading {
                    LoadingStateView(text: "Загрузка...")
                } else if let errorMessage {
                    Text(errorMessage).font(.subheadline).foregroundStyle(Theme.danger)
                } else if attempts.isEmpty {
                    Text("Ученик ещё не сдал ни одной работы.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textDim)
                } else {
                    let visible = showAllAttempts ? attempts : Array(attempts.prefix(5))
                    ForEach(visible) { attempt in
                        NavigationLink {
                            AttemptReviewView(attemptId: attempt.attemptId)
                        } label: {
                            attemptRow(attempt)
                        }
                        .buttonStyle(.plain)
                    }
                    if attempts.count > 5 && !showAllAttempts {
                        Button("Показать все (\(attempts.count))") {
                            showAllAttempts = true
                        }
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Theme.accent)
                    }
                }
            }
        }
    }

    private func attemptRow(_ a: StudentAttemptRow) -> some View {
        let correct = a.correct ?? 0
        let total = a.total ?? 0
        let good = total > 0 && Double(correct) / Double(total) >= 0.5
        return HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(a.homeworkTitle ?? "Работа")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.leading)
                Text(Fmt.dateTime(a.finishedAt))
                    .font(.caption)
                    .foregroundStyle(Theme.textDim)
            }
            Spacer()
            StatusBadge(text: "\(correct)/\(total)", style: good ? .success : .danger)
            Image(systemName: "chevron.right")
                .font(.caption2)
                .foregroundStyle(Theme.textDim)
        }
        .padding(.vertical, 6)
    }

    private func load() async {
        isLoading = attempts.isEmpty
        errorMessage = nil
        do {
            attempts = try await app.teacher.studentAttempts(studentId: student.studentId)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
        await loadAnalytics()
    }
}
