# EGE Trainer — iOS-приложение

Нативное iOS-приложение (SwiftUI) для EGE-тренажёра по профильной математике —
мобильный клиент к существующему продукту [ege-trainer.ru](https://ege-trainer.ru).
Повторяет мобильную веб-версию визуально и функционально, работает с тем же
бэкендом (Supabase через прокси `api.ege-trainer.ru`) и тем же контентом задач.

## Требования

- macOS с Xcode 16+ (формат проекта — objectVersion 77, synchronized folders);
- iOS 17.0+ (Simulator или устройство);
- зависимостей нет: только системные фреймворки (SwiftUI, Foundation, WebKit, Security).

## Запуск

1. Открыть `EGETrainerApp.xcodeproj` в Xcode.
2. Выбрать target **EGETrainerApp** и любой iPhone-симулятор (iOS 17+).
3. `Cmd+R` (Run).

> ⚠️ Проект собран и проверен автономно на машине **без установленного Xcode**:
> весь код прошёл компиляцию `swiftc` (macOS SDK) и интеграционные тесты против
> продакшен-Supabase, но сборка именно в Xcode/Simulator ещё не запускалась.
> Если Xcode пожалуется на мелочь (например, iOS-специфичный модификатор) —
> это правится точечно; ядро (сеть, модели, логика) проверено на живых данных.

## Тестовый вход

Аккаунты — те же, что для e2e-тестов веба (`.env.local` в корне репозитория):

- ученик: `E2E_STUDENT_EMAIL` / `E2E_STUDENT_PASSWORD`;
- преподаватель: `E2E_TEACHER_EMAIL` / `E2E_TEACHER_PASSWORD`.

Вход — по email/паролю на первом экране. Роль определяется по `profiles.role`,
как в вебе: ученик попадает на главную ученика, преподаватель — на подбор задач.

## Конфигурация Supabase

`EGETrainerApp/Services/SupabaseConfig.swift`:

- `baseURL` — `https://api.ege-trainer.ru` (тот же прокси, что у веба; откаты в комментарии);
- `anonKey` — публичный anon-ключ (идентичен ключу в `app/config.js` веба);
- `contentBaseURL` — `https://ege-trainer.ru` (статический контент задач);
- `siteBaseURL` — база для shareable-ссылок ДЗ.

Никаких секретов в проекте нет: используется только публичный anon-ключ.

## Структура

```
ios/EGETrainerApp/
  EGETrainerApp.xcodeproj/        Xcode-проект (Xcode 16+, synchronized folders)
  EGETrainerApp/
    App/                          входная точка, роутинг по роли, AppState
    DesignSystem/                 токены из tokens.css веба + компоненты (Card, Badge, ...)
    Models/                       typed-модели всех RPC и контента (по live-контрактам)
    Services/                     URLSession-слой: auth (Keychain), RPC, контент, проверка ответов
    Screens/
      Auth/                       вход (email/password)
      Student/                    главная (прогноз+аккордеон+подбор), тренировка
      Homework/                   мои ДЗ, выполнение, результат
      Stats/                      статистика (self и teacher-scope)
      Teacher/                    подбор для ученика, мои ученики, карточка, создание ДЗ
      Shared/                     профиль/consent, рендер задач и рисунков (SVG в WKWebView)
  DevHarness/
    main.swift                    интеграционный CLI-прогон сервисного слоя (42 проверки)
    screenshots.swift             рендер скриншотов экранов с live-данными (macOS fallback)
  Screenshots/
    web-reference/                эталонные мобильные скриншоты веб-версии (390×844)
    app-result/                   скриншоты экранов приложения
  README.md
  REPORT.md                       подробный отчёт: что работает / частично / не успело
```

## Dev-harness (без Xcode)

Интеграционные тесты сервисного слоя против живого Supabase:

```bash
cd ios/EGETrainerApp/EGETrainerApp
swiftc -O -o /tmp/ege_harness Models/*.swift Services/*.swift ../DevHarness/main.swift
EGE_STUDENT_EMAIL=... EGE_STUDENT_PASSWORD=... \
EGE_TEACHER_EMAIL=... EGE_TEACHER_PASSWORD=... /tmp/ege_harness
```

Флаги `EGE_WRITE_SUBMIT=1` / `EGE_WRITE_CREATE=1` включают write-сценарии
(сдача ДЗ учеником / создание+назначение ДЗ учителем) — по умолчанию выключены.

## Известные ограничения

См. подробности в `REPORT.md`. Кратко:

- регистрация, сброс пароля, Google OAuth — только в веб-версии (в приложении вход по email/паролю);
- подбор задач в тренировке ученика — упрощённый (случайные прототипы темы, без весов и анти-повторов pick-движка);
- session-ссылки (`?session=...`), архив ДЗ, «Решить аналог», рисовалка-оверлей, печать — не переносились;
- видео-разбор открывается ссылкой на Rutube (не встроенный плеер);
- скриншоты `app-result` отрендерены на macOS (нет Simulator на машине сборки) — системный хром может слегка отличаться.
