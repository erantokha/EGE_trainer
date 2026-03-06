// app/ui/safe_dom.js
// Минимальные безопасные утилиты для DOM-вставок (P0 XSS hardening).

export function setText(el, value) {
  if (!el) return;
  el.textContent = value == null ? '' : String(value);
}

// Стемы задач в проекте — это текст + TeX (MathJax). HTML-теги в stem не поддерживаем.
export function setStem(el, stem) {
  setText(el, stem);
}

function isBadUrl(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return false;
  if (s.startsWith('#')) return false;
  if (s.startsWith('javascript:')) return true;
  if (s.startsWith('data:')) return true;
  return false;
}

function sanitizeSvgElement(svgRoot) {
  if (!svgRoot) return;

  // Убираем потенциально опасные узлы
  const forbidden = ['script', 'foreignObject', 'iframe', 'object', 'embed'];
  forbidden.forEach((tag) => {
    svgRoot.querySelectorAll(tag).forEach((n) => n.remove());
  });

  // Убираем on* атрибуты и опасные href
  svgRoot.querySelectorAll('*').forEach((node) => {
    try {
      const names = node.getAttributeNames ? node.getAttributeNames() : [];
      names.forEach((name) => {
        const lname = String(name || '').toLowerCase();
        if (lname.startsWith('on')) node.removeAttribute(name);
        if (lname === 'href' || lname === 'xlink:href') {
          const v = node.getAttribute(name);
          if (isBadUrl(v)) node.removeAttribute(name);
        }
      });
    } catch (_) {}
  });
}

// Вставка inline SVG без innerHTML: парсим, чистим, вставляем как DOM.
export function mountInlineSvg(container, svgString) {
  if (!container) return;
  container.textContent = '';

  const s = String(svgString || '').trim();
  if (!s) return;
  if (!s.startsWith('<svg')) return;

  let doc = null;
  try {
    doc = new DOMParser().parseFromString(s, 'image/svg+xml');
  } catch (_) {
    return;
  }

  if (!doc) return;

  const root = doc.documentElement;
  const name = root && root.nodeName ? String(root.nodeName).toLowerCase() : '';
  if (name !== 'svg') return;

  // parsererror (в разных браузерах по-разному)
  if (root.querySelector && root.querySelector('parsererror')) return;

  sanitizeSvgElement(root);

  try {
    const clean = document.importNode(root, true);
    container.appendChild(clean);
  } catch (_) {
    // fallback: если importNode не удался
    try {
      container.appendChild(root);
    } catch (_) {}
  }
}
