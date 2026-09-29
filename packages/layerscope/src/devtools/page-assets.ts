export const PAGE_STYLE = `
:root { color-scheme: light dark; font: 14px/1.5 system-ui, sans-serif; }
body { margin: 0; padding: 16px 24px; }
header { display: flex; align-items: center; justify-content: space-between; }
h1 { font-size: 18px; margin: 0; }
h2 { font-size: 15px; margin: 24px 0 8px; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #8884; }
ul.findings { list-style: none; padding: 0; margin: 0; }
ul.findings li { padding: 8px 0; border-bottom: 1px solid #8884; }
.badge { font-size: 12px; padding: 1px 6px; border-radius: 4px; color: #fff; }
.error .badge { background: #d73a49; }
.warn .badge { background: #b08800; }
.rule, .summary, .target { opacity: 0.7; }
.note, .error-message { padding: 8px; border-radius: 4px; background: #b0880022; }
.ok { color: #22863a; }
a { color: inherit; }
button { cursor: pointer; }
`;

// Links use Vite's open-in-editor endpoint, which the Vue inspector relies on as well.
export const PAGE_SCRIPT = `
const endpoint = document.getElementById('open-endpoint')?.textContent;
document.addEventListener('click', event => {
  const link = event.target.closest('[data-open]');
  if (link && endpoint) {
    event.preventDefault();
    fetch(endpoint + '?file=' + encodeURIComponent(link.dataset.open));
  }
  if (event.target.closest('[data-reload]')) {
    location.reload();
  }
});
`;
