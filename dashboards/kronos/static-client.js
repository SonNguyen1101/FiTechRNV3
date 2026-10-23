/* Offline adapter for the original Kronos production UI. No backend calls. */
(() => {
  'use strict';
  const load = window.fetch.bind(window);
  const data = load(new URL('./snapshot.json', document.currentScript.src),{cache:'no-store'}).then(r => {
    if (!r.ok) throw new Error('Snapshot unavailable');
    return r.json();
  });
  const page = (rows, p) => rows.slice(Number(p.get('offset') || 0), Number(p.get('offset') || 0) + Number(p.get('limit') || 50));
  const contains = (row, q) => (row.ticker + ' ' + (row.company_name || '')).toLocaleLowerCase().includes(q.toLocaleLowerCase());
  const denied = () => { throw new Error('PUBLIC_STATIC_SNAPSHOT: chức năng này cần backend và đã bị khóa.'); };
  window.SnapshotEventSource = class { close() {} };
  window.EventSource = window.SnapshotEventSource;
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if ((options.method || 'GET').toUpperCase() !== 'GET' || !url.pathname.startsWith('/api/v2/')) return denied();
    const d = await data, key = url.pathname.slice('/api/v2'.length), p = url.searchParams;
    let value;
    const direct = {'/jobs':'jobs','/health':'health','/readiness':'readiness','/capabilities':'capabilities','/snapshots':'snapshots','/filters/registries':'filters/registries','/filters/policies':'filters/policies','/filters/schema':'filters/schema','/filters/runs':'filters/runs'};
    if (direct[key]) value = d[direct[key]];
    else if (key === '/settings') value = {...d.settings, host:'PUBLIC_STATIC_SNAPSHOT', port:'—'};
    else {
      let m;
      if ((m = key.match(/^\/snapshots\/([^/]+)\/instruments$/))) {
        let rows = d.catalogs[m[1]] || [];
        if (p.get('q')) rows = rows.filter(x => contains(x,p.get('q')));
        if (p.get('exchange')) rows = rows.filter(x => x.exchange === p.get('exchange'));
        if (p.get('status') === 'imported') rows = rows.filter(x => x.partition);
        if (p.get('status') === 'excluded') rows = rows.filter(x => !x.scope_allowed || !x.partition);
        if (p.get('status') === 'warning') rows = rows.filter(x => x.flags.length);
        value = {items:page(rows,p),total:rows.length};
      } else if ((m = key.match(/^\/snapshots\/([^/]+)\/qc\/([^/]+)$/))) {
        const item = (d.catalogs[m[1]] || []).find(x => x.ticker === decodeURIComponent(m[2]));
        value = {quality:item?.quality || null, omitted:'Private QC source lines and raw price rows are not exported.'};
      } else if (/^\/snapshots\/[^/]+\/bars\//.test(key)) value = {items:[], omitted:'RAW_PRICE_DATA_NOT_EXPORTED'};
      else if ((m = key.match(/^\/filters\/registries\/([^/]+)\/sectors$/))) {
        const registry = d.sectors[m[1]];
        if (!registry) throw new Error('Hồ sơ cũ chưa có bảng ngành đủ bốn cấp trong bản chụp.');
        const level = p.get('level') || '2', scope = p.get('scope') || 'project';
        let rows = registry.items.map(x => ({...x,selected_sector:x.ssi_sector?.levels?.[level] || null}));
        if (scope === 'project') rows = rows.filter(x => x.project_member);
        if (p.get('q')) rows = rows.filter(x => contains(x,p.get('q')));
        if (p.get('comparison')) rows = rows.filter(x => x.ssi_sector?.comparison?.status === p.get('comparison'));
        if (p.get('industry_code')) rows = rows.filter(x => x.selected_sector?.code === p.get('industry_code'));
        value = {registry_id:m[1],level:Number(level),scope,scope_counts:{project:rows.filter(x=>x.project_member).length,outside_project:rows.filter(x=>!x.project_member).length},items:page(rows,p),total_filtered:rows.length,sector_comparison:registry.sector_comparison};
      } else if ((m = key.match(/^\/filters\/registries\/([^/]+)$/))) value = d.registries[m[1]];
      else if ((m = key.match(/^\/filters\/runs\/([^/]+)$/))) {
        const result = d.run_results[m[1]];
        if (!result) return denied();
        let rows = result.items;
        if (p.get('q')) rows=rows.filter(x=>contains(x,p.get('q')));
        if (p.get('group')) rows=rows.filter(x=>x.group===p.get('group') || x.group==='UNKNOWN'&&x.reference_group===p.get('group'));
        if (p.get('status')) rows=rows.filter(x=>x.screen_status===p.get('status'));
        value={...result,items:page(rows,p),total_filtered:rows.length};
      } else if (/^\/jobs\/[^/]+\/events$/.test(key)) value = [];
      else return denied();
    }
    if (value === undefined) return denied();
    return new Response(JSON.stringify(value), {headers:{'Content-Type':'application/json'}});
  };
  const locked = /^(Chạy kiểm tra|Hủy tác vụ|Hủy xem trước|Chạy lại phần còn lại|Xem trước nguồn local|Đăng ký phiên bản nguồn mới|Nhập dữ liệu đã xem trước|So sánh phiên bản|Lưu.*nháp|Lưu và xem trước|Xem trước bộ lọc)/;
  function lockUI() {
    document.querySelectorAll('button').forEach(button => {
      if (locked.test(button.textContent.trim()) || button.type === 'submit' && button.closest('form')) {
        button.disabled=true;button.title='Đã khóa: bản chụp công khai chỉ đọc';
        button.dataset.snapshotLocked='true';
      }
    });
    document.querySelectorAll('a[href^="/api/"]').forEach(link => {
      link.removeAttribute('href');link.removeAttribute('download');link.setAttribute('aria-disabled','true');
      link.title='Xuất backend không khả dụng trong bản chụp công khai';
    });
    document.querySelectorAll('form input, form textarea').forEach(input => {input.readOnly=true;input.title='Cấu hình nháp đã chụp · Không thể lưu/chạy';});
    document.querySelectorAll('form select').forEach(select => {
      if (select.getAttribute('aria-label') !== 'Phiên bản bộ lọc') select.disabled=true;
    });
  }
  document.addEventListener('click',event => {
    const button=event.target.closest('button[data-snapshot-locked],a[aria-disabled="true"]');
    if(button){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  document.addEventListener('submit', event => {event.preventDefault();event.stopImmediatePropagation();},true);
  document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(lockUI);observer.observe(document.getElementById('root'),{childList:true,subtree:true});
    data.then(d => {document.getElementById('snapshot-time').textContent='Chụp '+new Date(d.captured_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})+' · Giờ Việt Nam';lockUI();});
  });
})();
