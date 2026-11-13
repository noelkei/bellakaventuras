// V10.4 R9 · guardián del modo ayuda y del aviso de volver (W03, W-D03, W-D04, W-D13…W-D20, W-D29):
//  · el contador cuenta explorando; a los 60 s sin patata en un escenario sale UN anfitrión en 2D con la pista de nivel 1 de la patata
//    pendiente más cercana y la línea amarilla en el suelo; sus puntos siguen un camino andable (ningún tramo atraviesa una colisión) y acaba
//    junto a la patata; a los otros 60 s, pista de nivel 2 y el otro anfitrión; al coger la patata la línea desaparece;
//  · escenario terminado → la siguiente zona del recorrido; 20/20 sin el final → la escalera de SN;
//  · fuera (plaza): a los 15 s, con modo ayuda, el 2D la primera vez y después el aviso corto; sin modo ayuda, solo el aviso corto;
//  · sin modo ayuda no hay pistas a los 60 s; con el final hecho, ni pistas ni aviso.
import { Report, runTest, launch, openGame, clickStart, sleep, SAVE_20 } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
const R = new Report('modo-ayuda');
const Q = '?bktest=1';
const N = (ayuda) => ({ v: 1, estado: 'hecho', paso: '', practica: true, vistos: ['PLA-10', 'CIN-01', 'PAR', 'NMG', 'OBJ'], ayuda });
const d2 = (page) => page.evaluate(() => { const d = document.getElementById('d2'); return d && !d.hidden ? { name: d.querySelector('.d2-name').textContent, text: d.querySelector('.d2-text').textContent, solo: d.dataset.solo, imgs: [...d.querySelectorAll('.d2-host')].filter((i) => !i.hidden).length } : null; });
const waitD2 = async (page, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await d2(page); if (d) return d; await sleep(80); } return null; };
const toZone = (page, z) => page.evaluate((z) => { const g = window.__bk, T = window.__bkTHREE, S = g.park.sector(z), p = S.P(30, 0); g.input.clear(); g.skater.teleport(new T.Vector3(p.x, 0, p.z), 0, 'walk'); g.rig.snapBehind(g.skater); }, z);
const setIdle = (page, k, v) => page.evaluate((k, v) => { window.__bk.ayuda[k] = v; }, k, v);
const A = (page) => page.evaluate(() => { const a = window.__bk.ayuda, g = window.__bk, RA = window.__bkRapier, P = a.lastPath, F = RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC;
  let cross = 0; if (P) for (let i = 1; i < P.length; i++) { const p0 = P[i - 1], p1 = P[i], dx = p1.x - p0.x, dz = p1.z - p0.z, L = Math.hypot(dx, dz); if (L < 1e-3 || L > 1.2) continue;
    const y = Math.max(p0.y, p1.y) + 0.45; const h = g.world.castRay(new RA.Ray({ x: p0.x, y, z: p0.z }, { x: dx / L, y: 0, z: dz / L }), L, true, F, undefined, g.skater.collider); if (h) cross++; }
  return { idle: +a.idle.toFixed(2), log: a.log.slice(-4), line: a.lineaVisible, n: P?.length ?? 0, end: P?.length ? [P.at(-1).x, P.at(-1).z] : null, obj: a.obj ? { key: a.obj.key, pos: [a.obj.pos.x, a.obj.pos.z] } : null, cross }; });
const adv = async (page) => { await sleep(420); await page.keyboard.press('KeyE'); await sleep(300); };
await runTest(R, async () => {
  const b = await launch();
  try {
    // ------------------------------------------------------------------ con modo ayuda, en NMG
    { const page = await openGame(b, R, { save: { ...FRESH, narr: N('si') }, query: Q }); await clickStart(page); await sleep(1500);
      await toZone(page, 'no_me_guillo'); await sleep(2200); let a = await A(page);
      R.check(a.idle > 1.2 && a.idle < 3, `el contador cuenta explorando (${a.idle} s tras ~2 s)`, 'input', a);
      await setIdle(page, 'idle', 59.5); const d = await waitD2(page, 3000); a = await A(page);
      R.check(!!d && d.imgs === 1 && !!d.solo && /HLP-NMG-(visible|medium|hidden)-1/.test(a.log.at(-1)?.id ?? ''), `a los 60 s: un solo anfitrión (${d?.name}) con la pista de nivel 1 de la patata más cercana (${a.log.at(-1)?.id})`, 'input', { d, log: a.log });
      await adv(page); await sleep(1200); a = await A(page);
      const near = a.end && a.obj ? Math.hypot(a.end[0] - a.obj.pos[0], a.end[1] - a.obj.pos[1]) : 99;
      R.check(a.line && a.n > 3 && a.cross === 0 && near < 2.0, `línea amarilla visible por un camino andable (${a.n} puntos, ${a.cross} tramos que atraviesan algo) hasta ${near.toFixed(2)} m de la patata`, 'input', a);
      const first = a.log.at(-1);
      await setIdle(page, 'idle', 59.5); const d2b = await waitD2(page, 3000); a = await A(page);
      R.check(!!d2b && /-2$/.test(a.log.at(-1)?.id ?? '') && a.log.at(-1)?.quien !== first?.quien, `a los otros 60 s: pista de nivel 2 y el otro anfitrión (${first?.quien} → ${a.log.at(-1)?.quien})`, 'input', a.log);
      await adv(page);
      // coger la patata objetivo: la línea desaparece
      await page.evaluate(() => { const g = window.__bk, k = g.ayuda.obj?.key, p = g.pickups.find((x) => x.id === k); if (p) { g.skater.teleport(p.spawn.pos.clone(), 0, 'walk'); } });
      await sleep(1500); a = await A(page); const got = await page.evaluate(() => window.__bk.state.total);
      R.check(got >= 1 && !a.line, `al coger esa patata la línea desaparece (total ${got})`, 'input', a);
      // fuera: plaza → a los 15 s el 2D (primera vez) y después el aviso corto
      await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(40, 0, -40), 0, 'walk'); }); await sleep(800);
      await setIdle(page, 'fueraT', 14.6); const df = await waitD2(page, 3000); await adv(page); await sleep(800); a = await A(page);
      R.check(!!df && /FUERA-2d/.test(a.log.at(-1)?.id ?? '') && a.line, `fuera a los 15 s: Bellakroak o Bellakat en 2D y la línea a la zona que toca (${a.obj?.key})`, 'input', { df, a });
      await setIdle(page, 'fueraT', 14.6); await sleep(1200); const t2 = await page.evaluate(() => { const t = document.getElementById('toast'); return !t.hidden ? t.textContent : null; }); const d3 = await d2(page);
      R.check(!!t2 && !d3, `después, cada 15 s, solo el aviso corto («${t2}»)`, 'input', { t2, d3 });
      await page.close(); }
    // ------------------------------------------------------------------ escenario terminado → siguiente zona; 20/20 → escalera de SN
    { const z = ['visible', 'medium', 'hidden', 'activity'].map((k) => `no_me_guillo.${k}`);
      const page = await openGame(b, R, { save: { ...FRESH, collected: z, activities: { ...FRESH.activities, pantherTalk: true }, narr: N('si') }, query: Q }); await clickStart(page); await sleep(1500);
      await toZone(page, 'no_me_guillo'); await sleep(500); await setIdle(page, 'idle', 59.5); await waitD2(page, 3000); const a = await A(page);
      R.check(/HLP-SIG-NVDA/.test(a.log.at(-1)?.id ?? ''), `NMG terminado: la pista lleva a la siguiente zona del recorrido (${a.log.at(-1)?.id})`, 'input', a.log);
      await page.close(); }
    { const z = ['visible', 'medium', 'hidden'].map((k) => `no_me_guillo.${k}`);
      const page = await openGame(b, R, { save: { ...FRESH, collected: z, narr: N('si') }, query: Q }); await clickStart(page); await sleep(1500);
      await toZone(page, 'no_me_guillo'); await sleep(500); await setIdle(page, 'idle', 59.5); const d = await waitD2(page, 3000); const a = await A(page);
      R.check(!!d && /HLP-NMG-ACT-1/.test(a.log.at(-1)?.id ?? ''), `con las 3 de NMG y la actividad sin hacer: la pista lleva a La Pantera (${a.log.at(-1)?.id})`, 'input', { d, log: a.log });
      await page.close(); }
    { const page = await openGame(b, R, { save: { ...SAVE_20, narr: { ...N('si'), vistos: [...N('si').vistos, 'FIN'] } }, query: Q }); await clickStart(page); await sleep(2000);
      await toZone(page, 'yinyang'); await sleep(500); await setIdle(page, 'idle', 59.5); await waitD2(page, 3000); await adv(page); await sleep(1200); const a = await A(page);
      R.check(/HLP-SN-1/.test(a.log.at(-1)?.id ?? '') && a.obj?.key === 'sn-ladder' && a.line, `20/20 sin el final: a la escalera del muro de SN (${a.log.at(-1)?.id}, ${a.n} puntos)`, 'input', a);
      await page.close(); }
    // ------------------------------------------------------------------ sin modo ayuda / con el final hecho
    { const page = await openGame(b, R, { save: { ...FRESH, narr: N('no') }, query: Q }); await clickStart(page); await sleep(1500);
      await toZone(page, 'no_me_guillo'); await setIdle(page, 'idle', 59.5); await sleep(1500); const d = await d2(page);
      await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(40, 0, -40), 0, 'walk'); }); await sleep(600);
      await setIdle(page, 'fueraT', 14.6); await sleep(1200); const t = await page.evaluate(() => { const t = document.getElementById('toast'); return !t.hidden ? t.textContent : null; }); const d4 = await d2(page);
      R.check(!d && !!t && !d4, `sin modo ayuda: ninguna pista a los 60 s y fuera solo el aviso corto («${t}»)`, 'input', { d, t, d4 });
      await page.close(); }
    { const page = await openGame(b, R, { save: { ...SAVE_20, finalDone: true, finalProof: { kind: 'secretnovio_v10', at: 'x' }, narr: { ...N('si'), vistos: [...N('si').vistos, 'FIN', 'DES'] } }, query: Q }); await clickStart(page); await sleep(1500);
      await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(40, 0, -40), 0, 'walk'); }); await sleep(600);
      await setIdle(page, 'fueraT', 14.6); await setIdle(page, 'idle', 59.5); await sleep(1500); const d = await d2(page), t = await page.evaluate(() => { const t = document.getElementById('toast'); return !t.hidden ? t.textContent : null; });
      R.check(!d && !(t && /parque|dentro|centro/.test(t)), 'con el final hecho: ni pistas ni aviso de volver', 'input', { d, t });
      await page.close(); }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
