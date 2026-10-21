// Shared navigation and data-kind banner. All links are relative siblings under /app, so they work from any of the pages.
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else n.setAttribute(k, v); } for (const k of kids) n.append(k); return n; };
const TICKER_RE = /^[A-Z0-9]{2,10}$/;

export function renderTopbar(active, { ticker = null } = {}) {
  const t = ticker && TICKER_RE.test(ticker) ? ticker : null;
  const links = [
    ['panel', '../panel/', 'Cửa vào', 'Chọn sản phẩm'],
    ['php', '../php-reference/', 'Bản PHP tham chiếu', 'ảnh chụp 09/10/2026, độc lập'],
    ['dossier', t ? `../dossier/?ticker=${t}` : '../dossier/', 'Hồ sơ doanh nghiệp', 'bản đang xây'],
    ['market', '../market/', 'Thị trường', 'bảng toàn thị trường'],
    ['inspector', t ? `../qrw/?ticker=${t}` : '../qrw/', 'Kiểm tra dữ liệu', 'công cụ kỹ thuật, không phải Panel'],
  ];
  const nav = el('nav', { class: 'topbar', 'aria-label': 'Điều hướng giữa các sản phẩm' });
  const inner = el('div', { class: 'topbar-in' }, el('span', { class: 'brand', text: 'Fundamental_Panel' }));
  for (const [key, href, label, tag] of links) {
    const a = el('a', { href, text: label }); if (key === active) a.setAttribute('aria-current', 'page');
    inner.append(a, el('span', { class: 'tag', text: tag }));
  }
  nav.append(inner); return nav;
}
export function dataKindBanner(manifest) {
  if (manifest && manifest.data_kind === 'SYNTHETIC_FIXTURE') return el('div', { class: 'banner-synth', role: 'alert', text: 'DỮ LIỆU GIẢ LẬP (SYNTHETIC FIXTURE): các mã FAKE… và mọi con số do bộ sinh tạo ra để kiểm thử giao diện. Đây KHÔNG phải dữ liệu thật của doanh nghiệp nào.' });
  return null;
}
