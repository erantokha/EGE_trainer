package ru.egetrainer.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import ru.egetrainer.app.designsystem.EgeAppTheme
import ru.egetrainer.app.screens.auth.GoogleSignIn

/**
 * Точка входа: тема EgeAppTheme + корневой роутер (порт EGETrainerApp.swift
 * + RootView.swift). Deep link `egetrainer://auth-callback` (Google OAuth)
 * перехватывается onCreate/onNewIntent (launchMode singleTask).
 */
class MainActivity : ComponentActivity() {
    private val app: AppState by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleOAuthIntent(intent)

        val demo = DevSupport.demo(intent)
        val autologin = DevSupport.autologin(intent)
        val authTab = DevSupport.authTab(intent)

        setContent {
            EgeAppTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    when (demo) {
                        "math" -> MathDemoScreen()
                        else -> RootNavigation(app, autologin = autologin, initialAuthTab = authTab)
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleOAuthIntent(intent)
    }

    private fun handleOAuthIntent(intent: Intent?) {
        val code = GoogleSignIn.codeFromCallback(intent?.data) ?: return
        app.handleOAuthCallback(code)
    }
}
