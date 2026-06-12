# Вердикты независимых проверок П-Т4…П-Т8 (дословно от verifier-агентов)

## П-Т4 (сетевое ядро) — PASS 11/11

Кодовая сверка с цитатами обеих сторон: (а) авто-refresh <60с ✓; (б) ровно один 401-ретрай с принудительным refresh, при неуспехе сброс сессии + AuthRequired ✓; (в) ретраи только сетевых исключений, backoff 350/800/1500, max 3 попытки, HTTP не ретраится ✓; (г) таймауты 20с ✓; (д) rpcSingleRow объект/массив, пустой массив → EmptyResponse ✓; (е) PKCE S256, verifier 86 симв. base64url, challenge=SHA256, redirect в authorize-URL ✓; (ж) все 9 текстов ошибок + 3 fromAuthBody-маппинга побайтно совпадают с iOS ✓; (з) signup/resend/recover/exchange — retries=0 ✓.
Юниты: ClientErrorTest 11/11 зелёные. Живой прогон --block auth: 5/5 OK против прода (bad_password/student.signin/refresh/profile/teacher.signin), TOTAL ok=5 fail=0.

Замечания вне гейта (не дефекты): backoff-элемент 1500 недостижим при retries=2 (идентично iOS); Kotlin ретраит любой IOException против whitelist URLError в iOS (оба удовлетворяют требованию); тест границы isExpiringSoon — точки 59с/120с.

## П-Т6 (движок подбора и кеши) — PASS 10/10

Harness --block pick живой: TOTAL ok=8 fail=0 (pick.spread без дублей баз; pick.resolve.batch — ОДИН RPC, 3 бакета разных scope_kind, все виды в ответе; pick.filtered — фильтр=приоритет, добор без фильтра помечен, честный shortage на исчерпании кандидатов). Кодовая сверка (а–ж) построчно с iOS: over-fetch want+6 cap 40 ✓; приоритет proto>topic>section ✓; один батч (не цикл RPC) ✓; добор без фильтра с exclude ✓; двухпроходная ротация по атрибуции ✓; ProtoStatsCache TTL 60с, teacher=proto_last3+question_stats по РЕАЛЬНЫМ protoIds (дата max), self=proto_last3_for_self_v1 ✓; TrainingDraftStore TTL 12ч + очистка пустых refs ✓. Юниты LogicTest 17/17 (дедуп конкурентных прогревов → один вызов провайдера; TTL 59с/61с; ротация; TTL черновика). Сигнатура question_stats_for_teacher_v2 строго p_student_id+p_question_ids ✓.

Замечание verifier'а: doc-comment в Swift-эталоне («последовательный обход») устарел против собственного кода iOS (фактически один батч) — Kotlin следует фактическому поведению.

## П-Т5 (контент + проверка ответов + прогноз) — PASS

Unit-блок 15/15 (полный чек-лист: целое/запятая/юникод-минус/дробь/tolerance/text exact/regex+i/ege_decimal; forecast 5 точек с границами 0→0, 12→70, интерполяция 2.5→14). Content-блок живой 6/6 (index 108 записей/12 секций; манифест темы 1.1: 2 типа, 42 прототипа; build с непустым stem; figure_url на contentBaseURL; video: 407 ключей, embed-форма play/embed). Параллельный прогрев манифестов подтверждён цитатой (coroutineScope+async, зеркало withTaskGroup iOS); baseId-готча (≥4 сегмента + числовой хвост) покрыта юнитами. AnswerChecker/ScoreForecast — точные порты iOS.

Verifier перечислил 2 edge-расхождения (не блокеры): (1) Math.rint = half-to-even против Math.round/rounded() = half-up на ровно .5; (2) Java toDoubleOrNull принимает суффиксы "5d"/hex-флоты, JS/Swift — нет.

**Пост-вердиктные фиксы исполнителя (примечание):** оба расхождения устранены сразу — half-up округление в ScoreForecast.compute (floor(x+0.5)) и DECIMAL_RE-валидация в parseNumber; добавлены 2 юнит-теста (62.5→63; "5d"/"5f"/"0x1p3"→null, "1e3"/".5" валидны). :core:test и unit-блок harness повторно зелёные (15/15).

## П-Т7 (RPC-сервисы + полный DevHarness) — PASS 5/5

1. Полный read-only прогон: TOTAL ok=54 fail=0 (N=54 ≥ 37), exit 0; вывод — reports/wand_0/harness_readonly_pt7_verify.txt.
2. Поимённое покрытие всех доменов подтверждено (auth/unit/content/analytics/picking/proto stats/consent/homework/teacher/негатив).
3. Сопоставление с iOS DevHarness: все 38 read-only + 5 write проверок iOS имеют соответствие (таблица в полном вердикте verifier'а); молча отсутствующих НЕТ; Android — надмножество (+16 проверок сверх iOS: расширенный checker, forecast-границы, content.manifest/figure/video, hw.archive, picking.self_gate, pick.resolve.batch/filtered, proto_last3 обоих скоупов).
4. Write-прогон ОДНОКРАТНО: TOTAL ok=21 fail=0 — write.start_attempt (573fafbc…, already=true), write.submit (верно 2 из 2), write.create_pick (2 задачи), write.create → https://ege-trainer.ru/tasks/hw.html?token=6a43189f388207c9d0b45152471b40d5, write.create_visible (ДЗ видно ученику). Вывод — reports/wand_0/harness_write_pt7_verify.txt.
5. Скоуп: дельта WAND.0 целиком в маске android/** + reports/** + WAND*-планы + GLOBAL_PLAN.md. Оговорка verifier'а: в рабочем дереве есть незакоммиченные артефакты ПРОШЛЫХ волн (ios/, WIOS_1_PLAN.md, WSA*-планы) — зафиксированы в снимке git status ДО старта WAND.0, к этой волне не относятся; рекомендация куратору — решить судьбу (коммит/уборка).

## П-Т8 (каркас :app + отчёт волны) — PASS 8/8

1. Установка/запуск: adb install Success; PID 5240 стабилен 10 с; logcat '*:E' по PID пуст, FATAL=0.
2. Скриншот 1080×2400 (31 КБ) просмотрен verifier'ом глазами: заглушка «EGE Trainer / WAND.0 — каркас», не launcher и не крэш-диалог.
3. Отчёт: (а) версии тулчейна ✓; (б) таблица Т1–Т8 ✓ (строка Т8 — намеренный placeholder до настоящего вердикта, исполнитель не выписал себе PASS сам); (в) все три harness-файла существуют, TOTAL-строки совпадают дословно (52/0, 54/0, 21/0); (г) write-следы (токен 6a43189f…, attempt 573fafbc…) ✓; (д) находки — 5 пунктов ✓; (е) остаток оператора ✓; (ж) все 4 артефакта на месте ✓.

