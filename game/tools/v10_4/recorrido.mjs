// V10.4 R8 · guardián del recorrido (dossier 01 §5–9, 02 D–J, 04 §6.4, §9, §10):
//  · OBJ: la primera patata de exploración de NMG → OBJ-01…03 (una vez) y el contador ya marca 1/20;
//  · PAS: al cerrar NMG (4.ª patata) → PAS-01, viaje de cámara a NVDA y PAS-02 en plano fijo; una vez;
//  · desvío: cerrar YY con NVDA pendiente no lanza PAS (no hay frase falsa);
//  · FIN: la 20.ª → FIN-01/02, una sola revelación (sin valla al acabar), FIN-03, guía SN-GUIDE-01 y FIN-04; vuelve el control;
//  · DES: tras la escena final (SALTAR) → DES-01…03 una vez; «Volver a la plaza» en mitad de la escena no la dispara.
import { Report, runTest, launch, openGame, clickStart, sleep, SAVE_20 } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
const R = new Report('recorrido');
const Q = '?bktest=1';
const N = (vistos) => ({ v: 1, estado: 'hecho', paso: '', practica: true, vistos, ayuda: 'no' });
const BASE = ['PLA-10', 'CIN-01', 'PAR', 'NMG'];
const d2 = (page) => page.evaluate(() => { const d = document.getElementById('d2'); return d && !d.hidden ? d.querySelector('.d2-text').textContent : null; });
const waitD2 = async (page, re, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await d2(page); if (d && (!re || re.test(d))) return d; await sleep(100); } return null; };
const adv = async (page) => { await sleep(420); await page.keyboard.press('KeyE'); await sleep(250); };
const grab = (page, id) => page.evaluate((id) => { const g = window.__bk, p = g.pickups.find((x) => x.id === id); if (!p) return false; p.available = true; p.group.visible = true; g.skater.teleport(p.spawn.pos.clone(), 0, 'walk'); return true; }, id);
const S = (page) => page.evaluate(() => { const g = window.__bk; return { mode: g.mode, total: g.state.total, vistos: g.state.p.narr.vistos, centerOpen: g.centerOpen, valla: g.park.vallaUp, reveal: g.state.p.revealSeen }; });
await runTest(R, async () => {
  const b = await launch();
  try {
    // OBJ
    { const page = await openGame(b, R, { save: { ...FRESH, narr: N(BASE) }, query: Q }); await clickStart(page); await sleep(2000);
      await grab(page, 'no_me_guillo.visible'); const o1 = await waitD2(page, /La primera/); const s1 = await S(page);
      R.check(!!o1 && s1.total === 1, `primera patata de NMG → OBJ-01 con el contador en ${s1.total}/20`, 'input', { o1 });
      await adv(page); const o2 = await waitD2(page, /dos que faltan/); await adv(page); const o3 = await waitD2(page, /veinte/); await adv(page); await sleep(800);
      const s2 = await S(page); R.check(!!o2 && !!o3 && s2.mode === 'explore' && s2.vistos.includes('OBJ'), 'OBJ-02 y OBJ-03 y vuelve el control', 'input', s2);
      await grab(page, 'no_me_guillo.medium'); await sleep(1500); R.check(!(await d2(page)), 'la segunda patata no repite el recordatorio', 'input');
      await page.close(); }
    // PAS NMG → NVDA, y desvío
    { const col = ['no_me_guillo.visible', 'no_me_guillo.medium', 'no_me_guillo.hidden', 'yinyang.visible', 'yinyang.medium', 'yinyang.hidden'];
      const page = await openGame(b, R, { save: { ...FRESH, collected: col, activities: { ...FRESH.activities, pantherTalk: true, graffiti: true }, narr: N([...BASE, 'OBJ']) }, query: Q }); await clickStart(page); await sleep(2000);
      await grab(page, 'yinyang.activity'); await sleep(2500); const dv = await d2(page);
      R.check(!dv, 'desvío: cerrar YINYANG con NOSVAMOSDEAQUI pendiente no lanza ninguna transición', 'input', { dv });
      await grab(page, 'no_me_guillo.activity'); const p1 = await waitD2(page, /cuatro/); await adv(page);
      const cam0 = await page.evaluate(() => window.__bk.rig.cam.position.toArray()); const p2 = await waitD2(page, /NOSVAMOSDEAQUI/, 8000); const cam1 = await page.evaluate(() => window.__bk.rig.cam.position.toArray());
      const moved = Math.hypot(cam1[0] - cam0[0], cam1[2] - cam0[2]);
      R.check(!!p1 && !!p2 && moved > 5, `cerrar NMG → PAS-01, la cámara viaja a NVDA (${moved.toFixed(1)} m) y PAS-02`, 'input', { p1, p2, moved });
      await adv(page); await sleep(2500); const s = await S(page); R.check(s.mode === 'explore' && s.vistos.includes('PAS-01'), 'vuelve el control tras la transición', 'input', s);
      await page.close(); }
    // FIN con la 20.ª
    { const col = SAVE_20.collected.filter((x) => x !== 'fashion_girl.activity');
      // V10.5 (E5-30; copia previa en V10/backups/pruebas/V10_5-R2): una presentación con su 1.ª frase vista y no la 2.ª se vuelve a ofrecer; la
      // partida de prueba las da por TERMINADAS (las dos frases), como queda una partida real que las vio
      const page = await openGame(b, R, { save: { ...SAVE_20, collected: col, revealSeen: false, narr: N([...BASE, 'OBJ', 'PAS-01', 'PAS-02', 'PAS-03', 'PAS-04', 'PAS-05', 'PAS-06', 'PAS-07', 'PAS-08']) }, query: Q }); await clickStart(page); await sleep(2000);
      await grab(page, 'fashion_girl.activity'); const f1 = await waitD2(page, /veinte/); await adv(page); const f2 = await waitD2(page, /centro/); await adv(page);
      const f3 = await waitD2(page, /escaleras/, 20000); const sr = await S(page);
      R.check(!!f1 && !!f2 && !!f3 && sr.centerOpen && !sr.valla, 'la 20.ª → FIN-01, FIN-02, revelación (sin valla) y FIN-03 en plano fijo', 'input', { f1, f2, f3, sr });
      await adv(page); const f4 = await waitD2(page, /sorpresa/, 20000); await adv(page); await sleep(2500); const s = await S(page);
      R.check(!!f4 && s.mode === 'explore' && s.vistos.includes('FIN') && s.reveal, 'guía de SN y FIN-04; vuelve el control con la revelación vista', 'input', { f4, s });
      await page.close(); }
    // DES tras la escena final (SALTAR); con «Volver a la plaza» no
    { const page = await openGame(b, R, { save: { ...SAVE_20, finalDone: true, finalProof: { kind: 'secretnovio_v10', at: 'x' }, narr: N([...BASE, 'OBJ', 'FIN']) }, query: Q }); await clickStart(page); await sleep(2000);
      await page.evaluate(() => window.__bk.showPreview()); await sleep(3000); await page.evaluate(() => window.__bk.goToPlaza()); await sleep(3000);
      R.check(!(await d2(page)), 'cortar la escena con «Volver a la plaza» no dispara la despedida', 'input');
      await page.evaluate(() => window.__bk.showPreview()); await sleep(3000); await page.keyboard.press('Escape'); const d1 = await waitD2(page, /Bellakaciones/, 8000);
      await adv(page); const d2b = await waitD2(page, /termina/); await adv(page); const d3 = await waitD2(page, /parque es tuyo/); await adv(page); await sleep(800);
      const s = await S(page); R.check(!!d1 && !!d2b && !!d3 && s.vistos.includes('DES') && s.mode === 'explore', 'tras SALTAR la escena: DES-01…03 y vuelve el control', 'input', { d1, d2b, d3, s });
      await page.evaluate(() => window.__bk.showPreview()); await sleep(3000); await page.keyboard.press('Escape'); await sleep(4000);
      R.check(!(await d2(page)), 'la despedida no se repite', 'input');
      await page.close(); }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
