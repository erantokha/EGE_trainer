package ru.egetrainer.app

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Star
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ru.egetrainer.app.designsystem.EgeDims
import ru.egetrainer.app.designsystem.EgeTheme
import ru.egetrainer.app.designsystem.EmptyStateView
import ru.egetrainer.app.screens.auth.AuthScreen
import ru.egetrainer.app.screens.auth.CompleteProfileScreen
import ru.egetrainer.app.screens.shared.ProfileScreen

/**
 * Корневой роутер: восстановление сессии -> auth -> главная по роли —
 * порт RootView.swift (зеркало tasks/home_router.js).
 */
@Composable
fun RootNavigation(app: AppState, autologin: Pair<String, String>?, initialAuthTab: String?) {
    val phase by app.phase.collectAsState()

    LaunchedEffect(Unit) {
        if (phase is AppState.Phase.Launching) {
            app.bootstrap()
            // DEBUG-хук скриптовой приёмки: E2E_EMAIL/_PASSWORD форсируют вход
            // под этими кредами, даже если в хранилище есть другая сессия.
            if (autologin != null) {
                val (email, password) = autologin
                val current = app.profile
                if (current?.email?.lowercase() != email.lowercase()) {
                    runCatching { app.signOut() }
                    runCatching { app.signIn(email, password) }
                }
            }
        }
    }

    when (val p = phase) {
        is AppState.Phase.Launching -> LaunchScreen()
        is AppState.Phase.SignedOut -> AuthScreen(app, initialTab = initialAuthTab)
        is AppState.Phase.SignedIn ->
            if (p.profile.needsCompletion) {
                CompleteProfileScreen(app)
            } else if (p.profile.isTeacher) {
                TeacherTabScaffold(app)
            } else {
                StudentTabScaffold(app)
            }
    }
}

@Composable
private fun LaunchScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(EgeTheme.colors.bg),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BrandLogo()
        CircularProgressIndicator(
            color = EgeTheme.colors.accent,
            modifier = Modifier.padding(top = 16.dp),
        )
    }
}

/** Логотип «EGE-trainer» (как на экране входа веба). */
@Composable
fun BrandLogo(modifier: Modifier = Modifier) {
    Row(modifier = modifier) {
        Text(
            "EGE",
            color = EgeTheme.colors.text,
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
        )
        Text(
            "-trainer",
            color = EgeTheme.colors.accent,
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

private data class TabItem(
    val title: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
)

/** Табы ученика: Главная, Мои ДЗ, Статистика, Профиль (контент — WAND.2). */
@Composable
fun StudentTabScaffold(app: AppState) {
    val tabs = listOf(
        TabItem("Главная", Icons.Filled.Home),
        TabItem("Мои ДЗ", Icons.Filled.DateRange),
        TabItem("Статистика", Icons.Filled.Star),
        TabItem("Профиль", Icons.Filled.Person),
    )
    var selected by remember { mutableIntStateOf(0) }
    val pending by app.pendingHomeworksCount.collectAsState()

    LaunchedEffect(Unit) { app.refreshHomeworkBadge() }

    RoleTabScaffold(
        tabs = tabs,
        selected = selected,
        onSelect = { selected = it },
        badgeOnIndex = 1,
        badgeCount = pending,
    ) {
        when (selected) {
            0 -> StubScreen("Главная ученика", "Подбор задач появится в WAND.2")
            1 -> StubScreen("Мои ДЗ", "Список и выполнение ДЗ появятся в WAND.2")
            2 -> StubScreen("Статистика", "Аналитика появится в WAND.2")
            else -> ProfileScreen(app)
        }
    }
}

/** Табы учителя: Подбор, Ученики, Статистика, Профиль (контент — WAND.3). */
@Composable
fun TeacherTabScaffold(app: AppState) {
    val tabs = listOf(
        TabItem("Подбор", Icons.Filled.Home),
        TabItem("Ученики", Icons.Filled.DateRange),
        TabItem("Статистика", Icons.Filled.Star),
        TabItem("Профиль", Icons.Filled.Person),
    )
    var selected by remember { mutableIntStateOf(0) }

    RoleTabScaffold(tabs = tabs, selected = selected, onSelect = { selected = it }) {
        when (selected) {
            0 -> StubScreen("Подбор задач", "Главная учителя появится в WAND.3")
            1 -> StubScreen("Мои ученики", "Кабинет появится в WAND.3")
            2 -> StubScreen("Статистика", "Аналитика появится в WAND.3")
            else -> ProfileScreen(app)
        }
    }
}

@Composable
private fun RoleTabScaffold(
    tabs: List<TabItem>,
    selected: Int,
    onSelect: (Int) -> Unit,
    badgeOnIndex: Int = -1,
    badgeCount: Int = 0,
    content: @Composable () -> Unit,
) {
    val colors = EgeTheme.colors
    Scaffold(
        containerColor = colors.bg,
        bottomBar = {
            NavigationBar(containerColor = colors.panel) {
                tabs.forEachIndexed { i, tab ->
                    NavigationBarItem(
                        selected = selected == i,
                        onClick = { onSelect(i) },
                        label = { Text(tab.title, fontSize = EgeDims.fs2xs) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = colors.accent,
                            selectedTextColor = colors.accent,
                            unselectedIconColor = colors.textDim,
                            unselectedTextColor = colors.textDim,
                            indicatorColor = colors.accentLight,
                        ),
                        icon = {
                            if (i == badgeOnIndex && badgeCount > 0) {
                                BadgedBox(badge = {
                                    Badge(containerColor = colors.danger) {
                                        Text("$badgeCount")
                                    }
                                }) { Icon(tab.icon, contentDescription = tab.title) }
                            } else {
                                Icon(tab.icon, contentDescription = tab.title)
                            }
                        },
                    )
                }
            }
        },
    ) { inner ->
        Box(Modifier.padding(inner)) { content() }
    }
}

@Composable
private fun StubScreen(title: String, subtitle: String) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(EgeTheme.colors.bg)
            .padding(16.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        EmptyStateView(title = title, subtitle = subtitle)
    }
}
