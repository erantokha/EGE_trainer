Инструкция: tools/bump_build.mjs и tools/check_build.mjs

Сценарий:
- bump_build.mjs: выставляет единый build-id во всём фронтенде:
  - meta app-build во всех HTML
  - все вхождения ?v=... в HTML/JS/CSS (только в index.html, tasks/** и app/**)
  - app/config.js: синхронизирует content.version

- check_build.mjs: проверяет, что build-id и ?v=... едины (в тех же зонах).
