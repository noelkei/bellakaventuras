// R4 (usuario, 12 oct) · Sin zoom por doble toque ni pellizco en el móvil. EMULACIÓN de Chrome (no reproduce Safari de iPhone,
// que ignora user-scalable=no: allí actúan los bloqueos por código de main.ts; validación final en el teléfono):
//  · doble toque (CDP synthesizeTapGesture ×2) sobre el contador, la zona, un diálogo y el lienzo: visualViewport.scale = 1;
//  · pellizco ×2,5 sobre el HUD: escala 1; el meta viewport y touch-action del HUD son los esperados;
//  · control: los botones siguen respondiendo a dos toques rápidos (BAILAR abre y cierra el abanico).
import { Report, runTest, launch, openGame, clickStart, sleep, VIEWPORTS } from './lib.mjs';
const R = new Report('no-zoom');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { viewport: VIEWPORTS.phone }); await clickStart(page); await sleep(900);
    const cdp = await page.target().createCDPSession();
    const scale = () => page.evaluate(() => window.visualViewport?.scale ?? 1);
    const meta = await page.evaluate(() => ({ vp: document.querySelector('meta[name=viewport]').content, ta: getComputedStyle(document.getElementById('counter')).touchAction }));
    R.check(/maximum-scale=1/.test(meta.vp) && /user-scalable=no/.test(meta.vp) && /manipulation|none/.test(meta.ta), 'viewport sin escalado y HUD con touch-action manipulation', 'unit', meta);
    for (const sel of ['#counter', '#zone', '#game']) {
      const r = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel);
      if (!r) { R.invalid(`${sel} no visible`, {}); continue; }
      await cdp.send('Input.synthesizeTapGesture', { x: r[0], y: r[1], tapCount: 2, gestureSourceType: 'touch' }); await sleep(500);
      R.check((await scale()) === 1, `doble toque sobre ${sel}: sin zoom (escala ${await scale()})`, 'emulation');
    }
    await cdp.send('Input.synthesizePinchGesture', { x: 195, y: 200, scaleFactor: 2.5, gestureSourceType: 'touch' }); await sleep(600);
    R.check((await scale()) === 1, `pellizco ×2,5: sin zoom (escala ${await scale()})`, 'emulation');
    const p = await page.evaluate(() => { const r = document.getElementById('btn-dance').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await cdp.send('Input.synthesizeTapGesture', { x: p[0], y: p[1], tapCount: 1, gestureSourceType: 'touch' }); await sleep(250);
    const open1 = await page.evaluate(() => !document.getElementById('dance-ring').hidden);
    await cdp.send('Input.synthesizeTapGesture', { x: p[0], y: p[1], tapCount: 1, gestureSourceType: 'touch' }); await sleep(250);
    const open2 = await page.evaluate(() => !document.getElementById('dance-ring').hidden);
    R.check(open1 && !open2, 'los botones responden a dos toques rápidos (BAILAR abre y cierra)', 'emulation', { open1, open2 });
    R.pendingHuman('iPhone/Safari real: doble toque y pellizco sobre el HUD sin zoom');
  } finally { await b.close(); }
}, { timeoutMs: 120000 });
