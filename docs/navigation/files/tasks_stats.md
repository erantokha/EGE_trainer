# tasks: статистика и умный режим (L2)


Оглавление
- [../../../tasks/stats.js](#tasksstatsjs)
- [../../../tasks/stats_view.js](#tasksstats_viewjs)
- [../../../tasks/recommendations.js](#tasksrecommendationsjs)
- [../../../tasks/smart_select.js, smart_mode.js, smart_hw_builder.js, smart_hw.js](#taskssmart_selectjs-smart_modejs-smart_hw_builderjs-smart_hwjs)

## ../../../tasks/stats.js

Ссылка на код: [tasks/stats.js](../../../tasks/stats.js) / [snapshot](../code/tasks/stats.js)


Назначение: статистика ученика “для себя”.
Особенность: использует прямые REST вызовы к Supabase:
- берёт access_token из localStorage (sb-...-auth-token)
- при необходимости обновляет через refresh_token
- вызывает /rest/v1/rpc/student_dashboard_self

Тонкости:
- ошибки 401/403 чаще всего связаны с токеном или RLS

## ../../../tasks/stats_view.js

Ссылка на код: [tasks/stats_view.js](../../../tasks/stats_view.js) / [snapshot](../code/tasks/stats_view.js)


Назначение: отрисовка dashboard (темы/подтемы, проценты, счетчики).
Зависимости: DOM, CSS stats.css.

## ../../../tasks/recommendations.js

Ссылка на код: [tasks/recommendations.js](../../../tasks/recommendations.js) / [snapshot](../code/tasks/recommendations.js)


Назначение: правила “какие темы рекомендовать” по данным dashboard.

## ../../../tasks/smart_select.js, smart_mode.js, smart_hw_builder.js, smart_hw.js

Ссылки на код:
- [tasks/smart_select.js](../../../tasks/smart_select.js) / [snapshot](../code/tasks/smart_select.js)
- [tasks/smart_mode.js](../../../tasks/smart_mode.js) / [snapshot](../code/tasks/smart_mode.js)
- [tasks/smart_hw_builder.js](../../../tasks/smart_hw_builder.js) / [snapshot](../code/tasks/smart_hw_builder.js)
- [tasks/smart_hw.js](../../../tasks/smart_hw.js) / [snapshot](../code/tasks/smart_hw.js)

Назначение: “умный режим” — из статистики построить план тем и собрать конкретные question_id.
Тонкости:
- нужно избегать дублей, соблюдать k, учитывать нехватку задач в теме
