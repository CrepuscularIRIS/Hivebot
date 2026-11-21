async page => {
  const OUT='/home/lingxufeng/bot/work/p5-parity/evidence/P5-61';
  await page.addInitScript({path:OUT+'/trace-init.js'});
  await page.reload();await page.waitForTimeout(1800);
  const mark=async label=>page.evaluate(l=>window.__p561Mark(l),label);
  await page.keyboard.press('Escape'); await mark('before-light-to-dark');
  await page.emulateMedia({colorScheme:'dark'});
  await page.waitForTimeout(50);await page.screenshot({path:OUT+'/light-to-dark-early.png'});
  await page.waitForTimeout(600);await page.screenshot({path:OUT+'/light-to-dark-stable.png'});await mark('after-light-to-dark');
  await page.emulateMedia({colorScheme:'light'});
  await page.waitForTimeout(50);await page.screenshot({path:OUT+'/dark-to-light-early.png'});
  await page.waitForTimeout(600);await page.screenshot({path:OUT+'/dark-to-light-stable.png'});await mark('after-dark-to-light');
  const switches=await page.evaluate(()=>window.__p561Trace);
  // Explicit preference opposite to media; only uses the product's actual theme setter.
  await page.emulateMedia({colorScheme:'light'});await page.evaluate(()=>window.desktop.theme.set('dark'));
  await page.waitForTimeout(600);await page.reload();await page.waitForTimeout(1800);
  await page.screenshot({path:OUT+'/reload-explicit-dark.png'});const reloadDark=await page.evaluate(()=>window.__p561Trace);
  await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>window.desktop.theme.set('light'));
  await page.waitForTimeout(600);await page.reload();await page.waitForTimeout(1800);
  await page.screenshot({path:OUT+'/reload-explicit-light.png'});const reloadLight=await page.evaluate(()=>window.__p561Trace);
  await page.evaluate(()=>window.desktop.theme.set('system'));await page.emulateMedia({colorScheme:'light'});await page.waitForTimeout(500);
  return {switches,reloadDark,reloadLight};
}
