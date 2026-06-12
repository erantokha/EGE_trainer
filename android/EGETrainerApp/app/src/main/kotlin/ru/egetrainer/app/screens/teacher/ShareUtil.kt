package ru.egetrainer.app.screens.teacher

import android.content.Context
import android.content.Intent

/** Системный share текста/ссылки (аналог ShareLink iOS). */
fun shareText(context: Context, text: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    val chooser = Intent.createChooser(send, "Поделиться ссылкой").apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(chooser)
}
