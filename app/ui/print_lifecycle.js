// app/ui/print_lifecycle.js
// Единый lifecycle печати:
// - включает body.print-layout-active
// - держит состояние во время печати
// - централизует page-level hooks (zoom / fixed cleanup)
// - гарантирует cleanup через afterprint и страховочные fallback'и

const PRINT_LAYOUT_CLASS = 'print-layout-active';
const PRINT_WITH_ANSWERS_CLASS = 'print-with-answers';
const FIXED_HIDDEN_ATTR = 'data-print-was-fixed';
const SAVED_HTML_ATTR = 'data-print-html';

let listenersInstalled = false;
let activeSession = null;
let nextSessionId = 1;
let fallbackTimer = 0;

const lifecycleHooks = new Set();

export function getPrintLayoutClassName() {
  return PRINT_LAYOUT_CLASS;
}

export function isPrintLayoutActive() {
  return !!activeSession;
}

export function registerPrintLifecycleHook(hook) {
  if (!hook || typeof hook !== 'object') return () => {};
  lifecycleHooks.add(hook);
  ensureLifecycleListeners();
  return () => lifecycleHooks.delete(hook);
}

export function registerStandardPrintPageLifecycle(options = {}) {
  const {
    blankInnerHtmlSelector = '',
    logFixedElements = false,
  } = options;

  return registerPrintLifecycleHook({
    onEnter() {
      document.body.style.zoom = '0.7';

      if (blankInnerHtmlSelector) {
        document.querySelectorAll(blankInnerHtmlSelector).forEach((el) => {
          if (!el.hasAttribute(SAVED_HTML_ATTR)) {
            el.setAttribute(SAVED_HTML_ATTR, el.innerHTML);
            el.innerHTML = '';
          }
        });
      }

      try {
        document.querySelectorAll('*').forEach((el) => {
          try {
            if (window.getComputedStyle(el).position !== 'fixed') return;
            if (logFixedElements) {
              console.log(
                '[print-fixed]',
                el.tagName,
                '#' + (el.id || '-'),
                '.' + (el.className || '-'),
                el.getBoundingClientRect(),
              );
            }
            el.setAttribute(FIXED_HIDDEN_ATTR, '1');
            el.style.setProperty('display', 'none', 'important');
          } catch (_) {}
        });
      } catch (_) {}
    },
    onExit() {
      document.body.style.zoom = '';

      if (blankInnerHtmlSelector) {
        document.querySelectorAll(`${blankInnerHtmlSelector}[${SAVED_HTML_ATTR}]`).forEach((el) => {
          el.innerHTML = el.getAttribute(SAVED_HTML_ATTR) || '';
          el.removeAttribute(SAVED_HTML_ATTR);
        });
      }

      document.querySelectorAll(`[${FIXED_HIDDEN_ATTR}]`).forEach((el) => {
        try {
          el.style.removeProperty('display');
          el.removeAttribute(FIXED_HIDDEN_ATTR);
        } catch (_) {}
      });
    },
  });
}

export async function runManagedPrintFlow(options = {}) {
  ensureLifecycleListeners();

  const {
    withAnswers = false,
    onEnter,
    onPrepare,
  } = options;

  const session = activatePrintSession({ withAnswers, source: 'managed' });

  try {
    if (typeof onEnter === 'function') {
      const cleanup = await onEnter(session);
      if (typeof cleanup === 'function') {
        session.localCleanups.push(cleanup);
      }
    }

    if (typeof onPrepare === 'function') {
      await onPrepare(session);
    }
  } catch (error) {
    cleanupPrintSession('prepare-error');
    throw error;
  }

  try {
    window.print();
  } catch (error) {
    cleanupPrintSession('print-error');
    throw error;
  }

  notifyPrintInvocationReturned();
}

function ensureLifecycleListeners() {
  if (listenersInstalled) return;
  listenersInstalled = true;

  window.addEventListener('beforeprint', onBeforePrint);
  window.addEventListener('afterprint', onAfterPrint);
  window.addEventListener('focus', onFocusAfterPrintLike);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function onBeforePrint() {
  const existingSession = activeSession;
  const session = activatePrintSession({
    withAnswers: document.body.classList.contains(PRINT_WITH_ANSWERS_CLASS),
    source: 'beforeprint',
  });
  if (!existingSession) {
    // Для нативного Ctrl+P нет managed callback после window.print(),
    // поэтому fallback cleanup должен считаться доступным сразу.
    session.printReturned = true;
  }
}

function onAfterPrint() {
  cleanupPrintSession('afterprint');
}

function onFocusAfterPrintLike() {
  armFallbackCleanup('focus');
}

function onVisibilityChange() {
  if (!document.hidden) armFallbackCleanup('visibilitychange');
}

function activatePrintSession({ withAnswers = false, source = 'unknown' } = {}) {
  ensureLifecycleListeners();

  if (activeSession) {
    if (withAnswers) activeSession.withAnswers = true;
    activeSession.sources.add(source);
    syncBodyPrintClasses(activeSession);
    return activeSession;
  }

  const session = {
    id: nextSessionId++,
    withAnswers: !!withAnswers,
    sources: new Set([source]),
    printReturned: false,
    localCleanups: [],
  };

  activeSession = session;
  syncBodyPrintClasses(session);

  for (const hook of lifecycleHooks) {
    try {
      hook.onEnter?.(session);
    } catch (error) {
      console.warn('[print-lifecycle] hook enter failed', error);
    }
  }

  return session;
}

function syncBodyPrintClasses(session) {
  document.body.classList.add(PRINT_LAYOUT_CLASS);
  document.body.classList.toggle(PRINT_WITH_ANSWERS_CLASS, !!session?.withAnswers);
}

function notifyPrintInvocationReturned() {
  if (!activeSession) return;
  activeSession.printReturned = true;
  armFallbackCleanup('print-return');
}

function armFallbackCleanup(reason) {
  if (!activeSession || !activeSession.printReturned) return;
  clearFallbackCleanup();
  fallbackTimer = window.setTimeout(() => {
    cleanupPrintSession(`fallback:${reason}`);
  }, 1500);
}

function clearFallbackCleanup() {
  if (!fallbackTimer) return;
  window.clearTimeout(fallbackTimer);
  fallbackTimer = 0;
}

function cleanupPrintSession(reason) {
  if (!activeSession) {
    document.body.classList.remove(PRINT_LAYOUT_CLASS);
    document.body.classList.remove(PRINT_WITH_ANSWERS_CLASS);
    clearFallbackCleanup();
    return;
  }

  const session = activeSession;
  activeSession = null;
  clearFallbackCleanup();

  for (const hook of lifecycleHooks) {
    try {
      hook.onExit?.(session, reason);
    } catch (error) {
      console.warn('[print-lifecycle] hook exit failed', error);
    }
  }

  for (let i = session.localCleanups.length - 1; i >= 0; i--) {
    try {
      session.localCleanups[i]?.(reason);
    } catch (error) {
      console.warn('[print-lifecycle] local cleanup failed', error);
    }
  }

  document.body.classList.remove(PRINT_LAYOUT_CLASS);
  document.body.classList.remove(PRINT_WITH_ANSWERS_CLASS);
}
