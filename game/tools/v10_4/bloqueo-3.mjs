// V10.4 R8 · guardián del bloqueo de 3 patatas (dossier 04 §8, W-D01, W-D36): en las cinco actividades de zona, con 0–2 patatas de exploración
// de su zona el botón se ve deshabilitado con cuántas faltan y no empieza nada; con las 3 se puede empezar; una actividad ya completada se
// repite siempre aunque falten patatas; al coger la 3.ª sale el aviso «3/3 · Actividad disponible».
import { Report, runTest, launch, openGame, clickStart, sleep } from '../v8/lib.mjs';
import { FRESH, toZone } from '../v10_2/lib102.mjs';
const R = new Report('bloqueo-3');
const Q = '?bktest=1';
const N = { v: 1, estado: 'hecho', paso: '', practica: true, vistos: ['PLA-10', 'CIN-01', 'PAR', 'NMG', 'OBJ'], ayuda: 'no' };
const ZONES = [['no_me_guillo', 'act.pantherTalk'], ['nosvamosdeaqui', 'act.skateTutorial'], ['yinyang', 'act.graffiti'], ['tratratra', 'act.bridgeTalk.aissa'], ['fashion_girl', 'act.danceCombo']];
const btn = (page) => page.evaluate(() => { const b = document.getElementById('btn-action'), n = document.getElementById('prompt-note'); return b && b.offsetParent !== null ? { label: b.textContent.trim(), off: b.classList.contains('off'), note: n && !n.hidden ? n.textContent : '' } : null; });
const waitBtn = async (page, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const b = await btn(page); if (b) return b; await sleep(120); } return null; };
const busy = (page) => page.evaluate(() => window.__bk.activities.some((a) => a.busy) || window.__bk.mode === 'activity');
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const [nexp, label] of [[0, '0'], [2, '2']]) {
      const col = ZONES.flatMap(([z]) => ['visible', 'medium', 'hidden'].slice(0, nexp).map((k) => `${z}.${k}`));
      const page = await openGame(b, R, { save: { ...FRESH, collected: col, narr: N }, query: Q }); await clickStart(page); await sleep(2500);
      for (const [z, act] of ZONES) {
        if (z === 'yinyang') await page.evaluate(() => window.__bk.loadNpc('rana')); 
        await toZone(page, act); const bt = await waitBtn(page);
        await page.keyboard.press('KeyE'); await sleep(600); const bz = await busy(page);
        const want = nexp === 2 ? /falta una patata/i : /faltan 3 patatas/i;
        R.check(!!bt && bt.off && want.test(bt.note) && !bz, `${z} con ${label} patatas: botón deshabilitado («${bt?.note}») y E no empieza nada`, 'input', { bt, bz });
      }
      await page.close();
    }
    // con 3: se puede empezar (NMG: hablar con La Pantera); al coger la 3.ª, aviso
    { const page = await openGame(b, R, { save: { ...FRESH, collected: ['no_me_guillo.visible', 'no_me_guillo.medium'], narr: N }, query: Q }); await clickStart(page); await sleep(2500);
      await page.evaluate(() => { const g = window.__bk, p = g.pickups.find((x) => x.id === 'no_me_guillo.hidden'); g.skater.teleport(p.spawn.pos.clone(), 0, 'walk'); });
      let toast = null; for (let i = 0; i < 30 && !toast; i++) { await sleep(100); toast = await page.evaluate(() => { const t = document.getElementById('toast'); return !t.hidden && /3\/3/.test(t.textContent) ? t.textContent : null; }); }
      R.check(!!toast, `al coger la 3.ª: «${toast}»`, 'input', { toast });
      await sleep(2500); await toZone(page, 'act.pantherTalk'); const bt = await waitBtn(page); await sleep(300); await page.keyboard.press('KeyE'); await sleep(900);
      R.check(!!bt && !bt.off && (await busy(page)), 'con las 3 patatas de NMG la charla con La Pantera empieza', 'input', bt);
      await page.close(); }
    // actividad completada en una partida antigua sin sus patatas: se repite
    { const page = await openGame(b, R, { save: { ...FRESH, activities: { ...FRESH.activities, danceCombo: true }, narr: { ...N, estado: 'antigua' } }, query: Q }); await clickStart(page); await sleep(2500);
      await toZone(page, 'act.danceCombo'); const bt = await waitBtn(page);
      R.check(!!bt && !bt.off, `actividad ya completada (baile de FG) sin sus patatas: se puede repetir («${bt?.label}»)`, 'input', bt);
      await page.close(); }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
