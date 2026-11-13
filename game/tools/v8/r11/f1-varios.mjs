// R11 · F1 · COD-03, PAD-01, SIS-06, ONB-01, SIS-25, SIS-18, SIS-04, SIS-26, SIS-17 (atascos de control y guardado).
import { Report, runTest } from '../lib.mjs';
import { launch, openGame, clickStart, sleep, SAVE_NUEVA, SAVE_20_TRIPLE, ui, atZone, padOn, padBtn } from './lib-r11.mjs';
const R = new Report('r11-f1-varios');
const conPagina = async (save, fn, start = true) => { const b = await launch(); try { const page = await openGame(b, R, { save }); if (start) { await clickStart(page); await sleep(1000); } await fn(page); } finally { await b.close(); } };
await runTest(R, async () => {
  for (let k = 1; k <= 2; k++) {
    // COD-03: en una charla, la pausa no ofrece «Ver preview» (o, si lo ofrece, al cerrar el preview la charla sigue viva y se cierra)
    await conPagina(SAVE_20_TRIPLE, async (page) => { await atZone(page, 'act.pantherTalk'); await page.keyboard.press('KeyE'); await sleep(1500);
      await page.keyboard.press('Escape'); await sleep(400);
      const btn = await page.evaluate(() => !document.getElementById('btn-preview-again').hidden);
      let after = null;
      if (btn) { await page.click('#btn-preview-again'); await sleep(1200); await page.evaluate(() => window.__bk.closePreview()); await sleep(600); await page.keyboard.press('Enter'); await sleep(500); after = await ui(page); }
      R.check(!btn || (after && after.mode !== 'explore') , `#${k} COD-03: «Ver preview» no rompe una charla abierta (botón visible: ${btn}${after ? `, tras cerrar: modo ${after.mode}, diálogo ${after.dialog}` : ''})`, 'input', { btn, after }); });
    // PAD-01: en la portada, A del mando pulsa JUGAR
    await conPagina(SAVE_NUEVA, async (page) => { await padOn(page); await sleep(300); await padBtn(page, 0); await sleep(1500);
      const started = await page.evaluate(() => window.__bk.started);
      R.check(started, `#${k} PAD-01: A en la portada empieza la partida`, 'input', { started }); }, false);
    // SIS-06: P abre y cierra la pausa
    await conPagina(SAVE_NUEVA, async (page) => { await page.keyboard.press('KeyP'); await sleep(400); const a = await ui(page); await page.keyboard.press('KeyP'); await sleep(400); const b = await ui(page);
      R.check(a.paused && !b.paused, `#${k} SIS-06: P abre y P cierra la pausa`, 'input', { a, b }); });
    // ONB-01: con el abanico de bailes abierto, Esc lo cierra (sin pausar)
    await conPagina(SAVE_NUEVA, async (page) => { await page.keyboard.press('KeyB'); await sleep(400); await page.keyboard.press('Escape'); await sleep(400);
      const s = await page.evaluate(() => ({ paused: window.__bk.paused, menu: !!window.__bk.activities.find((a) => a.id === 'freeDance').menu }));
      R.check(!s.menu && !s.paused, `#${k} ONB-01: Esc cierra el abanico de bailes sin abrir la pausa`, 'input', s); });
    // SIS-25: ⌘ (Meta) soltado mientras se mantiene W suelta W
    await conPagina(SAVE_NUEVA, async (page) => { await page.keyboard.down('KeyW'); await sleep(300); await page.keyboard.down('MetaLeft'); await sleep(100); await page.keyboard.up('MetaLeft'); await sleep(600);   // macOS: con ⌘ pulsada no llega el keyup de W
      const v = await page.evaluate(() => { const s = window.__bk.skater; return { held: window.__bk.input.keys?.has?.('KeyW') ?? null, sp: Math.hypot(s.vel.x, s.vel.z) }; });
      R.check(!v.held, `#${k} SIS-25: al soltar ⌘ se sueltan las teclas de juego (W ya no cuenta)`, 'input', v); });
    // SIS-18: si el mando se desconecta con la última conducción de mando, el juego se pausa
    await conPagina(SAVE_NUEVA, async (page) => { await padOn(page); await page.evaluate(() => { window.__bk.input.fakePad.axes = [0, -1, 0, 0]; }); await sleep(800);
      await page.evaluate(() => { window.__bk.input.fakePad = null; window.dispatchEvent(new Event('gamepaddisconnected')); }); await sleep(800);
      const s = await ui(page); R.check(s.paused, `#${k} SIS-18: mando desconectado en marcha → pausa`, 'input', s); });
  }
  // SIS-04: ajustes con cadenas no se interpretan como verdadero
  await conPagina({ ...SAVE_NUEVA, settings: { volume: 0.8, muted: 'no', invertY: 'false', reducedMotion: 'false', advancedControls: false, camSens: 1, orientation: 'auto', mouseLock: false } }, async (page) => {
    const s = await page.evaluate(() => window.__bk.state.p.settings); R.check(s.muted === false && s.invertY === false && s.reducedMotion === false, 'SIS-04: «no»/«false» en ajustes no activan nada', 'input', s); }, false);
  // SIS-26: un grafiti a medias cuenta como partida empezada (CONTINUAR + Reiniciar)
  await conPagina({ ...SAVE_NUEVA, partials: { graffitiIntro: true } }, async (page) => {
    const s = await page.evaluate(() => ({ txt: document.getElementById('btn-start').textContent, reset: !document.getElementById('btn-reset-start').hidden }));
    R.check(s.txt === 'CONTINUAR' && s.reset, 'SIS-26: con el grafiti empezado la portada ofrece CONTINUAR y Reiniciar', 'input', s); }, false);
}, { timeoutMs: 1200000 });
