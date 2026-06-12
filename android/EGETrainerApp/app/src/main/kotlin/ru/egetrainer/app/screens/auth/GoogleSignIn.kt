package ru.egetrainer.app.screens.auth

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent

/**
 * Google-вход: PKCE через Custom Tabs — аналог ASWebAuthenticationSession iOS
 * (GoogleSignIn.swift). Redirect — тот же scheme, что у iOS: один URL
 * в Supabase Redirect URLs покрывает обе платформы. Перехват колбэка —
 * intent-filter MainActivity (egetrainer://auth-callback) + onNewIntent.
 */
object GoogleSignIn {
    const val REDIRECT_URL = "egetrainer://auth-callback"

    /** Открыть authorize-URL во внешней Custom Tab (или браузере-фоллбэке). */
    fun launch(context: Context, authorizeUrl: String) {
        val tab = CustomTabsIntent.Builder()
            .setShowTitle(true)
            .build()
        tab.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        tab.launchUrl(context, Uri.parse(authorizeUrl))
    }

    /** Достать code из deep-link колбэка (null — не наш URI или ошибка провайдера). */
    fun codeFromCallback(uri: Uri?): String? {
        if (uri == null) return null
        if (uri.scheme != "egetrainer" || uri.host != "auth-callback") return null
        return uri.getQueryParameter("code")?.takeIf { it.isNotEmpty() }
    }
}
