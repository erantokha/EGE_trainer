
# tasks: статистика и умный режим (L2)

## ../../../tasks/stats.js

Назначение: статистика ученика “для себя”.
Особенность: использует прямые REST вызовы к Supabase:
- берёт access_token из localStorage (sb-...-auth-token)
- при необходимости обновляет через refresh_token
- вызывает /rest/v1/rpc/student_dashboard_self

Тонкости:
- ошибки 401/403 чаще всего связаны с токеном или RLS

## ../../../tasks/stats_view.js

Назначение: отрисовка dashboard (темы/подтемы, проценты, счетчики).
Зависимости: DOM, CSS stats.css.

## ../../../tasks/recommendations.js

Назначение: правила “какие темы рекомендовать” по данным dashboard.

## ../../../tasks/smart_select.js, smart_mode.js, smart_hw_builder.js, smart_hw.js

Назначение: “умный режим” — из статистики построить план тем и собрать конкретные question_id.
Тонкости:
- нужно избегать дублей, соблюдать k, учитывать нехватку задач в теме
