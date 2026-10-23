'use strict';
(() => {
  const root=document.documentElement;
  let saved=null;
  try { saved=localStorage.getItem('qrw-public-snapshot-theme'); } catch (_) { /* Theme works without storage. */ }
  const systemDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme=saved==='dark'||saved==='light'?saved:(systemDark?'dark':'light');
  window.addEventListener('DOMContentLoaded',()=>{
    const button=document.getElementById('theme-toggle');
    function show(){
      const dark=root.dataset.theme==='dark';
      button.textContent=dark?'☀ Sáng':'☾ Tối';
      button.setAttribute('aria-pressed',String(dark));
      button.setAttribute('aria-label',dark?'Chuyển sang giao diện sáng':'Chuyển sang giao diện tối');
      button.setAttribute('title',dark?'Chuyển sang giao diện sáng':'Chuyển sang giao diện tối');
    }
    button.addEventListener('click',()=>{
      root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';
      try { localStorage.setItem('qrw-public-snapshot-theme',root.dataset.theme); } catch (_) { /* Optional persistence. */ }
      show();
    });
    show();
  });
})();
