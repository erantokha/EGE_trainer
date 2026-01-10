# tasks: статистика и рекомендации (L1)

Назначение

- дашборд ученика по темам/подтемам
- рекомендации “что потренировать”
- сборка “умного режима” и “умного ДЗ” на основе статистики

Файлы

- [tasks/stats.html](../../../tasks/stats.html), [tasks/stats.js](../../../tasks/stats.js)
  - получает dashboard через RPC student_dashboard_self
  - использует прямой REST вызов /rest/v1/rpc + access_token из localStorage
- [tasks/stats_view.js](../../../tasks/stats_view.js)
  - отрисовка дашборда (темы → подтемы)
- [tasks/stats.css](../../../tasks/stats.css)
  - стили статистики
- [tasks/recommendations.js](../../../tasks/recommendations.js)
  - логика “слабых мест” по dashboard
- [tasks/smart_select.js](../../../tasks/smart_select.js)
  - строит план подбора задач из рекомендаций
- [tasks/smart_hw_builder.js](../../../tasks/smart_hw_builder.js)
  - превращает план в frozen_questions (конкретные question_id)
- [tasks/smart_hw.js](../../../tasks/smart_hw.js)
  - сборка “умного ДЗ” поверх builder/select
- [tasks/smart_mode.js](../../../tasks/smart_mode.js)
  - хранение состояния “умного режима” (local/session storage)

Зависимости

- Supabase:
  - RPC: student_dashboard_self (и/или teacher‑варианты)
  - данные для дашборда обычно собираются из attempts/homework_attempts/answer_events
- контент: [content/tasks/](../../../content/tasks/) для выбора конкретных question_id
- общий хедер: [app/ui/header.js](../../../app/ui/header.js)

Точки расширения

- новая метрика в статистике:
  - Supabase: расширить RPC dashboard
  - фронт: [tasks/stats_view.js](../../../tasks/stats_view.js)
- новая стратегия рекомендаций:
  - править [tasks/recommendations.js](../../../tasks/recommendations.js)

Тонкости/риски

- прямой REST доступ к rpc:
  - надо аккуратно работать с токенами и их обновлением (см. stats.js)
- несогласованность источников:
  - если часть событий пишется в attempts, а часть в homework_attempts, важно, чтобы answer_events заполнялась корректно

Дата обновления: 2026-01-10
