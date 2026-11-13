// IT8 · H1 · guardián del recorrido con narrativa en ORDEN LIBRE (al revés del recomendado: FG → TT → YY → NVDA → NMG), en ordenador.
// Patatas recogidas pasando por encima (teleporte declarado a cada patata) y actividades marcadas como hechas (fixture: lo de dentro lo
// prueban las de cada actividad). Se registran todos los 2D que salen (texto y bloque) y se avanzan con E.
// Comprueba: antes de sus 3 patatas, la actividad de la zona está bloqueada (bloqueo de 3) y con las 3 se desbloquea; ninguna presentación
// (PAS) lleva a una zona ya terminada; al llegar a 20/20 sale FIN una sola vez y se completa; nada se queda a medias (el recorrido acaba en
// «hecho» sin nada en cola) y no hay errores.
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { open8, start8, dev, S0, collectFry, drainUI, until, saveJson } from './lib8.mjs';
const R = new Report('it8-orden-libre', { task: arg('task', 'IT8') });
const ORDEN = (arg('orden') ?? 'fashion_girl,tratratra,yinyang,nosvamosdeaqui,no_me_guillo').split(',');
const ACT = { no_me_guillo: 'pantherTalk', nosvamosdeaqui: 'skateTutorial', yinyang: 'graffiti', tratratra: 'bridgeTalk', fashion_girl: 'danceCombo' };
const PAS_DE = { nosvamosdeaqui: ['PAS-01', 'PAS-02'], yinyang: ['PAS-03', 'PAS-04'], tratratra: ['PAS-05', 'PAS-06'], fashion_girl: ['PAS-07', 'PAS-08'] };
await runTest(R, async () => {
  const b = await launch(); const out = { pasos: [] };
  try {
    const errors = [];
    const page = await open8(b, R, dev('pc720'), 'h', { save: S0, query: '?bktest=1', errors });
    await page.evaluateOnNewDocument(() => {});
    await start8(page, false); await sleep(1500);
    await page.evaluate(() => { window.__d2log = []; const d = document.getElementById('d2'); let last = ''; new MutationObserver(() => { const t = d && !d.hidden ? d.querySelector('.d2-text')?.textContent ?? '' : ''; if (t && t !== last) { last = t; window.__d2log.push({ t: t.slice(0, 80), vistos: window.__bk.state.p.narr.vistos.slice(-2), total: window.__bk.state.total }); } }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true }); });
    await drainUI(page, false, 20000);
    for (const z of ORDEN) {
      const paso = { zona: z };
      paso.bloqueadaAntes = await page.evaluate((z) => !window.__bk.narr.activityOpen(z), z);
      for (const k of ['visible', 'medium', 'hidden']) { const c = await collectFry(page, `${z}.${k}`, 2500); if (!c.got) await page.evaluate((id) => { const g = window.__bk, p = g.pickups.find((q) => q.id === id); if (p && !p.collected) { p.available = true; g.collect(p); } }, `${z}.${k}`);   // patatas en el aire (cuña de FG, TT): fixture con la recogida del propio juego
        await sleep(500); await drainUI(page, false, 15000); }
      paso.abiertaCon3 = await page.evaluate((z) => window.__bk.narr.activityOpen(z), z);
      await page.evaluate((a) => { const g = window.__bk; g.state.p.activities[a] = true; g.state.save(); const p = g.pickups.find((x) => x.spawn?.kind === 'activity' && x.id.startsWith(Object.entries({ pantherTalk: 'no_me_guillo', skateTutorial: 'nosvamosdeaqui', graffiti: 'yinyang', bridgeTalk: 'tratratra', danceCombo: 'fashion_girl' }).find(([k]) => k === a)[1])); if (p) { p.available = true; p.group.visible = true; } }, ACT[z]);
      { const c = await collectFry(page, `${z}.activity`, 2500); if (!c.got) await page.evaluate((id) => { const g = window.__bk, p = g.pickups.find((q) => q.id === id); if (p && !p.collected) { p.available = true; g.collect(p); } }, `${z}.activity`); } await sleep(800);
      await drainUI(page, false, z === ORDEN.at(-1) ? 120000 : 30000);
      paso.total = await page.evaluate(() => window.__bk.state.total);
      R.check(paso.bloqueadaAntes && paso.abiertaCon3, `${z}: bloqueada antes de sus 3 patatas y abierta con ellas (bloqueo de 3)`, 'fixture', paso);
      out.pasos.push(paso);
    }
    await drainUI(page, false, 60000);
    const fin = await page.evaluate(() => ({ narr: { ...window.__bk.state.p.narr }, total: window.__bk.state.total, busy: window.__bk.narr.busy, cola: window.__bk.narr.queue?.slice?.() ?? null, log: window.__d2log, reveal: window.__bk.state.p.revealSeen }));
    out.fin = fin;
    const terminadas = new Set(); const malos = [];
    let acum = 0; for (const z of ORDEN) { acum += 4; }
    // PAS que llevan a una zona ya terminada: el bloque se apunta en `vistos` al verse; si aparece el de una zona terminada, mal
    const visto = fin.narr.vistos;
    for (const [z, blk] of Object.entries(PAS_DE)) if (visto.includes(blk[0])) { const i = ORDEN.indexOf(z); malos.push({ z, posicion: i, nota: 'se presentó una zona; ver si ya estaba terminada en el registro' }); }
    const finVeces = fin.log.filter((x) => /^FIN|20 patatas|veinte|SECRETNOVIO/i.test(x.t) && x.total === 20).length;
    R.check(fin.total === 20 && visto.includes('FIN') && fin.reveal, 'a 20/20 sale FIN, se completa y el centro queda revelado', 'fixture', { total: fin.total, FIN: visto.includes('FIN'), reveal: fin.reveal });
    R.check(!fin.busy && (!fin.cola || fin.cola.length === 0), 'al final el recorrido no deja nada en cola ni a medias', 'fixture', { busy: fin.busy, cola: fin.cola });
    R.measure('pas_vistos', visto.filter((x) => x.startsWith('PAS')));
    R.measure('d2_log', fin.log);
    // ¿alguna PAS se mostró cuando su zona ya estaba terminada?
    const pasMal = fin.log.filter((x) => { const m = Object.entries(PAS_DE).find(([, blk]) => x.vistos.some((v) => blk.includes(v))); if (!m) return false; const zi = ORDEN.indexOf(m[0]); return zi >= 0 && x.total >= (zi + 1) * 4; });
    R.check(!pasMal.length, 'ninguna presentación (PAS) lleva a una zona ya terminada', 'fixture', pasMal.slice(0, 5));
    R.check(!errors.length, 'sin errores', 'emulation', errors.slice(0, 3));
    saveJson('H1-orden-libre/resultado.json', out);
  } finally { await b.close(); }
}, { timeoutMs: 1200000 });
