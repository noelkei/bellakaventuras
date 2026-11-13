// IT8 · E5 · guardián: «Volver a la plaza» (salida de emergencia) con el DEDO y con el MANDO desde cada zona, el exterior, el centro abierto,
// lo alto del muro de SN, el fondo del vaso de YY y desde dentro del grind de Bellakat. Pausa (II / Start) → «Volver a la plaza» →
// confirmación «Volver a la plaza». Comprueba: ANMI en la plaza de salida (≤ 3 m del punto de salida), juego limpio (explorando, sin capas
// ni actividad), no se pierde nada (patatas, actividades), y ANMI anda.
// (Con teclado lo cubren v10_1/interfaz y sn-centro; «Salir de la actividad» con las tres entradas, v10_1/actividades-matriz.)
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { open8, start8, dev, S20, toAct, actBusy, cleanState, walks, tapOrClick, pad, padTap, PAD, saveJson } from './lib8.mjs';
const R = new Report('it8-volver-plaza', { task: arg('task', 'IT8') });
const VIAS = (arg('vias') ?? 'tactil,mando').split(',');
const EJE = { no_me_guillo: 45, nosvamosdeaqui: 333, yinyang: 261, tratratra: 189, fashion_girl: 117 }, pol = (r, th) => [r * Math.sin(th * Math.PI / 180), -r * Math.cos(th * Math.PI / 180)];
const SITIOS = { ...Object.fromEntries(Object.entries(EJE).map(([z, t]) => [z, pol(32, t)])), exterior: [44, 44], centro: [3, 3], 'muro-sn': 'sn', 'vaso-yy': 'yy', grind: 'grind' };
async function focusPad(page, sel) { for (const dir of [PAD.DOWN, PAD.UP]) for (let i = 0; i < 16; i++) { if (await page.evaluate((q) => document.activeElement === document.querySelector(q), sel)) { await padTap(page, PAD.A); return true; } await padTap(page, dir); } return false; }
await runTest(R, async () => {
  const b = await launch(); const filas = [];
  try {
    for (const via of VIAS) {
      const touch = via === 'tactil', d = touch ? dev('ip14') : dev('pc1080');
      const page = await open8(b, R, d, 'h', { save: S20 });
      if (!touch) { await pad(page, {}); await padTap(page, PAD.A); await sleep(1500); } else await start8(page, true);
      await sleep(1200);
      const sp = await page.evaluate(() => [window.__bk.manifest.spawn.pos.x, window.__bk.manifest.spawn.pos.z]);
      for (const [id, p] of Object.entries(SITIOS)) {
        const tag = `${via} · ${id}`;
        await page.evaluate(() => { const g = window.__bk; for (const a of g.activities) if (a.busy) a.cancel?.(); if (g.paused) g.setPaused(false); });
        if (p === 'grind') { await toAct(page, 'act.skateTutorial'); await sleep(700); if (touch) await tapOrClick(page, '#btn-action', true); else await padTap(page, PAD.Y); await sleep(1500); if (!(await actBusy(page, 'skateTutorial'))) { R.invalid(`${tag}: no empezó el grind`); continue; } }
        else await page.evaluate((p) => { const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier, s = g.skater; let x, z, y = null;
          if (p === 'sn') { const L = g.manifest.ladders.find((l) => l.id === 'sn'); x = L.topPos.x; z = L.topPos.z; y = L.topPos.y; } else if (p === 'yy') { let best = null; for (let r = 24; r <= 40; r += 1) for (let th = 245; th <= 277; th += 2) { const t = th * Math.PI / 180, px = r * Math.sin(t), pz = -r * Math.cos(t); const h = g.world.castRay(new RA.Ray({ x: px, y: 20, z: pz }, { x: 0, y: -1, z: 0 }), 30, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider); if (h && (!best || 20 - h.timeOfImpact < best[2])) best = [px, pz, 20 - h.timeOfImpact]; } x = best[0]; z = best[1]; }   // punto más bajo del sector de YY (fondo del vaso) else { [x, z] = p; }
          if (y === null) { const h = g.world.castRay(new RA.Ray({ x, y: 20, z }, { x: 0, y: -1, z: 0 }), 30, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider); y = h ? 20 - h.timeOfImpact : 0; }
          g.input.clear(); s.teleport(new T.Vector3(x, y + 0.05, z), s.heading, 'walk'); g.rig.snapBehind(s); }, p);
        await sleep(900);
        const t0 = await page.evaluate(() => ({ total: window.__bk.state.total, acts: Object.values(window.__bk.state.p.activities).filter(Boolean).length }));
        if (touch) { await tapOrClick(page, '#btn-pause', true); await sleep(600); await tapOrClick(page, '#btn-plaza', true); await sleep(600); await tapOrClick(page, '#btn-plaza-yes', true); }
        else { await padTap(page, PAD.START); await sleep(600); await focusPad(page, '#btn-plaza'); await sleep(600); await focusPad(page, '#btn-plaza-yes'); }
        await sleep(2000);
        const st = await cleanState(page), t1 = await page.evaluate(() => ({ total: window.__bk.state.total, acts: Object.values(window.__bk.state.p.activities).filter(Boolean).length }));
        const dist = Math.hypot(st.pos[0] - sp[0], st.pos[2] - sp[1]);
        // en la plaza la cámara de presentación de la entrada es guionizada hasta que ANMI se mueve (diseño, game.ts entranceCam): se acepta y,
        // tras andar, tiene que pasar a seguir
        const limpio = st.ok || (st.cam === 'scripted' && st.mode === 'explore' && !st.paused && !st.capas.length && !st.overlays.length && !st.d2 && !st.narrBusy && !st.frozen && !st.busy.length);
        const w = limpio ? await walks(page) : null; const camTras = await page.evaluate(() => window.__bk.rig.mode); st.ok = limpio && camTras === 'follow'; st.camTras = camTras;
        filas.push({ tag, st, dist, t0, t1, anda: w });
        R.check(dist <= 3 && st.ok && t1.total === t0.total && t1.acts === t0.acts && w > 0.5, `${tag}: «Volver a la plaza» lleva a la plaza, deja el juego limpio, sin perder nada, y ANMI anda`, 'input', { dist: +dist.toFixed(2), st, t0, t1, anda: w });
      }
      await page.close();
    }
    saveJson('E5-volver-plaza/resultado.json', filas);
  } finally { await b.close(); }
}, { timeoutMs: 1200000 });
