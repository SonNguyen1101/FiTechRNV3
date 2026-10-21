'use strict';
// Relative resources work at / and at /FiTechRNV3/. No Windows API or write endpoint.
window.FiTechPublic = (() => {
  const base = new URL('./', document.baseURI);
  let currentState, sourcePromise;
  const candidates = new Map();
  async function json(path) {
    const response = await fetch(new URL(path, base), {cache: 'no-store'});
    if (!response.ok) throw new Error('Không đọc được snapshot (' + response.status + ')');
    return response.json();
  }
  function download(id) {
    const path = currentState?.public_downloads[id];
    return path ? new URL(path, base).href : '#evidence';
  }
  async function api(path) {
    const url = new URL(path, 'https://snapshot.invalid');
    if (url.pathname === '/api/state' && !url.search) {
      currentState = await json('data/state.json');
      sourcePromise = undefined;
      candidates.clear();
      return currentState;
    }
    if (url.pathname === '/api/matrix' && !url.search) return json('data/matrix.json');
    if (url.pathname === '/api/source') {
      const id = url.searchParams.get('id');
      sourcePromise ||= json('data/sources.json');
      const sources = await sourcePromise;
      if (!Object.hasOwn(sources, id)) throw new Error('Nguồn chưa đăng ký');
      return sources[id];
    }
    if (url.pathname === '/api/cell') {
      const key = url.searchParams.get('key') || '';
      if (!/^IND\d{3}\/DIM\d{2}$/.test(key)) throw new Error('Sai khóa ô');
      const candidate = key.split('/')[0];
      if (!candidates.has(candidate)) candidates.set(candidate, json('data/candidates/' + candidate + '.json'));
      const data = await candidates.get(candidate);
      const cell = data.rows.find(row => row.cell_key === key);
      if (!cell) throw new Error('Ô chưa đăng ký');
      return {cell, source_id: 'cells'};
    }
    throw new Error('Bản chia sẻ chỉ hỗ trợ đọc snapshot');
  }
  return {api, download};
})();
window.publicDownload = id => window.FiTechPublic.download(id);
