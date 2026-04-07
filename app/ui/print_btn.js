// app/ui/print_btn.js
// Кнопка «Печать» — ждёт завершения MathJax и вызывает window.print().

export function initPrintBtn() {
  const btn = document.getElementById('printBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      if (window.MathJax?.typesetPromise) {
        await window.MathJax.typesetPromise();
      }
    } catch (_) {}
    window.print();
    setTimeout(() => { btn.disabled = false; }, 500);
  });
}
