(() => {
  const rows = []; window.__p561Trace = rows;
  const selectors = ['html','body','#root','.sand-shell','.sand-agents-sidebar','.sand-chat','.sand-prompt-shell','#pbots-boot'];
  let frames = 0; let shell = null;
  const sample = (kind) => {
    const html = document.documentElement;
    const nowShell = document.querySelector('.sand-shell');
    rows.push({ t: performance.now(), wall: Date.now(), kind, theme: html?.dataset.theme ?? null, style: !!document.getElementById('sand-cursor-theme'), preference: window.desktop?.theme.initial, remount: !!shell && !!nowShell && shell !== nowShell,
      colors: Object.fromEntries(selectors.map(s=>{const e=document.querySelector(s);return [s,e ? {bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color,opacity:getComputedStyle(e).opacity,phase:e.getAttribute('data-phase')} : null]})),
      tokens: html ? Object.fromEntries(['--cursor-bg-editor','--sand-bg-pane','--sand-bg-base','--sand-bg-chrome','--dsw-bg-base'].map(k=>[k,getComputedStyle(html).getPropertyValue(k)])) : {}, workers: [...document.querySelectorAll('.sand-agents-section')].map(e=>e.getAttribute('data-section-id')) });
    if(nowShell) shell=nowShell;
  };
  const observer=new MutationObserver(records=>{if(records.some(r=>r.target===document.documentElement || (r.target.nodeType===1 && r.target.id==='sand-cursor-theme'))) sample('mutation')});
  observer.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-theme','style']});
  function tick() {sample('raf'); if(++frames<2000) requestAnimationFrame(tick);else observer.disconnect()};requestAnimationFrame(tick);
  window.__p561Mark = label => sample(label);
})()
