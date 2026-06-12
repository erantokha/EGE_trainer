import SwiftUI

/// Выполнение ДЗ по токену — флоу tasks/hw.js:
/// get_homework_by_token -> (есть завершённая попытка? -> результат)
/// -> start_homework_attempt -> сборка задач из контента -> ввод ответов
/// -> подтверждение «Не заполнено N из M» -> submit -> итог + разбор.
struct HomeworkRunView: View {
    @EnvironmentObject private var app: AppState

    let token: String

    enum Phase {
        case loading
        case error(String)
        case run(homework: Homework, attemptId: String?, questions: [RunQuestion])
        case result(attempt: HomeworkAttempt, questions: [RunQuestion])
        case submitted(title: String, result: SubmitAttemptResult, items: [AttemptQuestion], questions: [RunQuestion])
    }

    @State private var phase: Phase = .loading
    @State private var answers: [String: String] = [:]
    @State private var startedAt = Date()
    @State private var showConfirm = false
    @State private var isSubmitting = false
    @State private var onlyWrong = false
    @State private var analogTarget: AttemptQuestion?
    @State private var focusQuestion: RunQuestion?
    @State private var submitError: String?

    var body: some View {
        Group {
            switch phase {
            case .loading:
                LoadingStateView(text: "Проверяем доступ и собираем задачи...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .error(let message):
                ScrollView {
                    ErrorStateView(message: message) { await load() }
                        .padding(16)
                }
            case .run(let homework, _, let questions):
                runScreen(homework: homework, questions: questions)
            case .result(let attempt, let questions):
                resultScreen(
                    title: attempt.homeworkTitle ?? attempt.payload?.title ?? "Домашнее задание",
                    correct: attempt.correct ?? 0,
                    total: attempt.total ?? 0,
                    durationMs: attempt.durationMs,
                    items: attempt.payload?.questions ?? [],
                    questions: questions
                )
            case .submitted(let title, let result, let items, let questions):
                resultScreen(
                    title: title,
                    correct: result.correct ?? items.filter { $0.correct == true }.count,
                    total: result.total ?? items.count,
                    durationMs: result.durationMs,
                    items: items,
                    questions: questions,
                    justSubmitted: true
                )
            }
        }
        .background(Theme.bg)
        .navigationTitle(navTitle)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                if case .run(_, _, let questions) = phase {
                    PDFExportButton(questions: questions, defaultTitle: navTitle)
                }
            }
        }
        #endif
        .drawOverlay()
        #if os(iOS)
        .fullScreenCover(item: $focusQuestion) { q in
            FocusCardView(question: q)
        }
        #endif
        .task { await load() }
        .alert("Не удалось сдать ДЗ", isPresented: Binding(
            get: { submitError != nil },
            set: { if !$0 { submitError = nil } }
        )) {
            Button("Повторить") { Task { await submit() } }
            Button("Отмена", role: .cancel) {}
        } message: {
            Text(submitError ?? "")
        }
    }

    private var navTitle: String {
        switch phase {
        case .run(let hw, _, _): return hw.title ?? "Домашнее задание"
        case .result(let attempt, _): return attempt.homeworkTitle ?? "Домашнее задание"
        case .submitted(let title, _, _, _): return title
        default: return "Домашнее задание"
        }
    }

    // MARK: - Прохождение

    private func runScreen(homework: Homework, questions: [RunQuestion]) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Text("Всего задач: \(questions.count)")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textDim)

                ForEach(Array(questions.enumerated()), id: \.element.id) { idx, q in
                    QuestionRunCard(
                        index: idx,
                        question: q,
                        answer: Binding(
                            get: { answers[q.id] ?? "" },
                            set: { answers[q.id] = $0 }
                        ),
                        onFocus: { focusQuestion = q }
                    )
                }

                Button {
                    let empty = emptyCount(questions)
                    if empty > 0 {
                        showConfirm = true
                    } else {
                        Task { await submit() }
                    }
                } label: {
                    if isSubmitting { ProgressView().tint(.white) } else { Text("Завершить") }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(isSubmitting)
                .padding(.top, 8)
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .confirmationDialog(
            confirmTitle(questions),
            isPresented: $showConfirm,
            titleVisibility: .visible
        ) {
            Button("Сдать", role: .destructive) {
                Task { await submit() }
            }
            Button("Продолжить решать", role: .cancel) {}
        }
    }

    private func emptyCount(_ questions: [RunQuestion]) -> Int {
        questions.filter { (answers[$0.id] ?? "").trimmingCharacters(in: .whitespaces).isEmpty }.count
    }

    private func confirmTitle(_ questions: [RunQuestion]) -> String {
        "Не заполнено \(emptyCount(questions)) из \(questions.count). Сдать домашнее задание?"
    }

    // MARK: - Результат / разбор

    private func resultScreen(
        title: String,
        correct: Int,
        total: Int,
        durationMs: Int?,
        items: [AttemptQuestion],
        questions: [RunQuestion],
        justSubmitted: Bool = false
    ) -> some View {
        let wrong = items.filter { $0.correct != true }.count
        return ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                if justSubmitted {
                    let pct = total > 0 ? Int((Double(correct) / Double(total) * 100).rounded()) : 0
                    Text("ДЗ сдано! Верно \(correct) из \(total). Точность \(pct)%.")
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .background(Theme.successBg)
                        .foregroundStyle(Theme.success)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusMd))
                }

                Text("Отчет и статистика")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Theme.text)

                AttemptSummaryHeader(correct: correct, total: total, durationMs: durationMs)

                if wrong > 0 {
                    Button {
                        onlyWrong.toggle()
                    } label: {
                        Text(onlyWrong ? "Все задачи" : "Только неверные (\(wrong))")
                            .font(.subheadline.weight(.medium))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(onlyWrong ? Theme.accentLight : Theme.surface2)
                            .foregroundStyle(onlyWrong ? Theme.accent : Theme.textDim)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }

                let visible = Array(items.enumerated())
                    .filter { !onlyWrong || $0.element.correct != true }
                ForEach(visible, id: \.element.id) { idx, item in
                    QuestionReviewCard(
                        index: idx,
                        item: item,
                        stem: questions.first(where: { $0.id == item.questionId })?.stem,
                        figure: questions.first(where: { $0.id == item.questionId })?.figure,
                        analogAction: item.questionId == nil ? nil : { analogTarget = item }
                    )
                }
            }
            .padding(16)
        }
        .sheet(item: $analogTarget) { target in
            if let qid = target.questionId, let topicId = target.topicId {
                AnalogRunView(topicId: topicId, baseQuestionId: qid)
            }
        }
    }

    // MARK: - Данные

    private func load() async {
        phase = .loading
        do {
            let homework = try await app.homework.homework(byToken: token)
            guard homework.isActive != false else {
                phase = .error("Ссылка на это ДЗ больше не активна.")
                return
            }

            let refs = homework.questionRefs
            guard !refs.isEmpty else {
                phase = .error("Не удалось собрать задачи: состав ДЗ пуст. Возможно, это session-ссылка — откройте её в веб-версии.")
                return
            }
            let questions = try await app.content.buildQuestions(refs: refs)
            guard !questions.isEmpty else {
                phase = .error("Не удалось загрузить условия задач. Проверьте интернет и попробуйте ещё раз.")
                return
            }

            // Попытка: уже завершена -> показываем результат (повторный вход).
            let studentName = app.profile?.hwStudentName ?? "Ученик"
            let started = try await app.homework.startAttempt(token: token, studentName: studentName)
            if started.alreadyExists == true {
                if let attempt = try? await app.homework.attempt(byToken: token),
                   attempt.isFinished, (attempt.payload?.questions?.isEmpty == false) {
                    phase = .result(attempt: attempt, questions: questions)
                    return
                }
            }
            startedAt = Date()
            phase = .run(homework: homework, attemptId: started.resolvedAttemptId, questions: questions)
        } catch {
            phase = .error(error.localizedDescription)
        }
    }

    private func submit() async {
        guard case .run(let homework, let attemptId, let questions) = phase else { return }
        guard let attemptId else {
            phase = .error("Не удалось начать попытку — попробуйте открыть ДЗ заново.")
            return
        }
        isSubmitting = true
        defer { isSubmitting = false }

        let finishedAt = Date()
        let durationMs = Int(finishedAt.timeIntervalSince(startedAt) * 1000)
        let perQuestionMs = questions.isEmpty ? 0 : durationMs / questions.count

        let items: [AttemptQuestion] = questions.map { q in
            let check = AnswerChecker.check(spec: q.spec, rawInput: answers[q.id] ?? "")
            return AttemptQuestion(
                questionId: q.questionId,
                topicId: q.topicId,
                correct: check.correct,
                chosenText: check.chosenText,
                correctText: check.correctText,
                normalizedText: check.normalizedText,
                timeMs: perQuestionMs,
                difficulty: q.difficulty
            )
        }
        let correct = items.filter { $0.correct == true }.count
        let title = homework.title ?? "Домашнее задание"

        let payload = AttemptPayload(
            title: title,
            homeworkId: homework.homeworkId,
            studentName: app.profile?.hwStudentName,
            questions: items
        )

        do {
            let result = try await app.homework.submitAttempt(
                attemptId: attemptId,
                payload: payload,
                total: items.count,
                correct: correct,
                durationMs: durationMs
            )
            phase = .submitted(title: title, result: result, items: items, questions: questions)
            await app.refreshHomeworkBadge()
        } catch {
            // Ответы не теряем: остаёмся на прохождении и предлагаем повторить сдачу.
            submitError = error.localizedDescription
        }
    }
}
