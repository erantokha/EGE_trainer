// :harness — JVM-порт ios/EGETrainerApp/DevHarness: интеграционные проверки
// сервисного слоя против live Supabase. Креды — из env (см. .env.local).
plugins {
    kotlin("jvm")
    application
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation(project(":core"))
}

application {
    mainClass.set("ru.egetrainer.harness.MainKt")
}

tasks.named<JavaExec>("run") {
    // Прокидываем env вызова (EGE_*) в процесс harness как есть.
    standardOutput = System.out
    errorOutput = System.err
}
