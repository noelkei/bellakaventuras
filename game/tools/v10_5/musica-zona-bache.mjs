// V10.5 r3 · guardián (D5-27; usuario: «al cambiar de zona la música baje casi al cero y vuelva a subir, no por proximidad o coordenadas,
// simplemente al entrar a la zona, a la velocidad que vayas da igual»). Con la partida libre (narr=off), ANMI se coloca en el centro de una
// zona y luego en el de la de al lado de dos formas: de golpe (velocidad infinita) y andando con W por la frontera. En cada cambio:
//  · la música baja por debajo del 10 % y vuelve a ≥ 90 % en ≤ 2,5 s;
//  · nunca suenan dos canciones de zona a la vez (como mucho una con peso > 0,1);
//  · el bache dura lo mismo de golpe que andando (±0,3 s): va por tiempo, no por distancia.
import { Report, runTest, launch, sleep, SAVE_20 } from '../v8/lib.mjs';
import { dev, open7, start7 } from './lib105.mjs';
const R = new Report('musica-zona-bache');
/** Muestras cada 50 ms durante `ms`: bache (zoneDip), canción de la zona y cuántas canciones suenan con peso > 0,1. */
const muestrea = (page, ms) => page.evaluate(async (ms) => { const g = window.__bk, out = [], t0 = performance.now();
  while (performance.now() - t0 < ms) { const mu = g.audio.music, act = [...mu.tracks.values()].filter((t) => t.id !== 'secretnovio' && t.gain > 0.1).map((t) => t.id);
    out.push({ t: (performance.now() - t0) / 1000, dip: mu.zoneDip, zona: g.zonaMus, act }); await new Promise((r) => setTimeout(r, 50)); }
  return out; }, ms);
const pon = (page, th, r = 32) => page.evaluate((th, r) => { const g = window.__bk, T = window.__bkTHREE, a = th * Math.PI / 180;
  g.skater.teleport(new T.Vector3(r * Math.sin(a), g.skater.visualPos.y, -r * Math.cos(a)), a + Math.PI / 2, 'walk'); }, th, r);
function bache(m) { const i0 = m.findIndex((x) => x.dip < 0.1); if (i0 < 0) return null; const i1 = m.findIndex((x, i) => i > i0 && x.dip >= 0.9);
  const ib = m.findIndex((x) => x.dip < 0.99); return { baja: m[ib].t, fondo: m[i0].t, vuelve: i1 > 0 ? m[i1].t : null, dura: i1 > 0 ? m[i1].t - m[ib].t : null }; }

await runTest(R, async () => {
  const b = await launch(); const errors = [];
  try {
    const page = await open7(b, R, dev('pc720'), 'h', { save: { ...SAVE_20, settings: { iosAppAsked: true } }, query: '?bktest=1&narr=off', errors });
    await start7(page, false); await sleep(1500);
    const S = await page.evaluate(() => window.__bkSectors.map((s) => ({ id: s.id, axis: s.axis })));
    const [A, B] = [S[0], S[1]];
    // 1 · de golpe
    await pon(page, A.axis); await sleep(4000);
    const z0 = await page.evaluate(() => window.__bk.zonaMus);
    await pon(page, B.axis); const m1 = await muestrea(page, 4000), b1 = bache(m1), dos1 = m1.filter((x) => x.act.length > 1);
    R.check(z0 === A.id && m1.at(-1).zona === B.id && !!b1 && b1.vuelve !== null && b1.dura <= 2.5,
      `de golpe ${A.id} → ${B.id}: baja < 10 % y vuelve a ≥ 90 % (${b1?.dura?.toFixed(2) ?? '—'} s)`, 'listen', { z0, fin: m1.at(-1), b1 });
    R.check(!dos1.length, 'de golpe: nunca dos canciones de zona a la vez', 'listen', dos1.slice(0, 3));
    // 2 y 3 · andando y en tabla por la frontera (de A hacia B, por el arco)
    const mid = (A.axis + ((B.axis - A.axis + 540) % 360 - 180) / 2 + 360) % 360, dir = ((B.axis - A.axis + 540) % 360 - 180) > 0 ? 1 : -1;
    // IT8-r3 (23 oct, solo preparación; copia previa en V10/backups/pruebas/IT8-r3/): antes se giraba `rig.yaw`, pero en modo «seguir» la
    // cámara vuelve sola detrás de ANMI y W la llevaba por el rumbo del teletransporte (hacia el centro). Ahora ANMI mira al objetivo y se
    // corrige el rumbo con A/D en bucle cerrado (como it8/caos.mjs). Añadido el caso en tabla (lo pedía el encargo de V10.5: «andando y en
    // tabla»). Los límites del bache no cambian.
    const objetivo = (mid + dir * 15 + 360) % 360, Q = [32 * Math.sin(objetivo * Math.PI / 180), -32 * Math.cos(objetivo * Math.PI / 180)];
    const cruza = async (loco) => {
      await pon(page, A.axis); await sleep(4000);
      await pon(page, (mid - dir * (loco === 'ride' ? 8 : 4) + 360) % 360);
      await page.evaluate((q, loco) => { const g = window.__bk, T = window.__bkTHREE, f = g.skater.footPos; g.skater.teleport(new T.Vector3(f.x, g.skater.visualPos.y, f.z), Math.atan2(q[0] - f.x, q[1] - f.z), loco); g.rig.snapBehind(g.skater); }, Q, loco);
      await sleep(2500);
      const mp = page.evaluate(async (ms) => { const g = window.__bk, out = [], t0 = performance.now();
        while (performance.now() - t0 < ms) { const mu = g.audio.music, act = [...mu.tracks.values()].filter((t) => t.id !== 'secretnovio' && t.gain > 0.1).map((t) => t.id);
          out.push({ t: (performance.now() - t0) / 1000, dip: mu.zoneDip, zona: g.zonaMus, act }); await new Promise((r) => setTimeout(r, 50)); } return out; }, 11000);
      await page.keyboard.down('KeyW'); const held = new Set(); const tw = Date.now(); let vmax = 0;
      while (Date.now() - tw < 9000) {
        const st = await page.evaluate((q) => { const s = window.__bk.skater, f = s.footPos; let d = Math.atan2(q[0] - f.x, q[1] - f.z) - s.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return { d, lejos: Math.hypot(q[0] - f.x, q[1] - f.z), v: Math.hypot(s.vel.x, s.vel.z), loco: s.loco }; }, Q);
        vmax = Math.max(vmax, st.v); if (st.lejos < 1.5) break;
        const k = st.d > 0.15 ? 'KeyA' : st.d < -0.15 ? 'KeyD' : null;
        for (const h of [...held]) if (h !== k) { await page.keyboard.up(h); held.delete(h); } if (k && !held.has(k)) { await page.keyboard.down(k); held.add(k); }
        await sleep(100);
      }
      for (const h of held) await page.keyboard.up(h); await page.keyboard.up('KeyW');
      const m = await mp; return { m, b: bache(m), dos: m.filter((x) => x.act.length > 1), vmax: +vmax.toFixed(2) };
    };
    for (const [loco, nom] of [['walk', 'andando'], ['ride', 'en tabla']]) {
      const c = await cruza(loco);
      R.check(!!c.b && c.b.vuelve !== null && c.b.dura <= 2.5 && c.m.at(-1).zona === B.id, `${nom} ${A.id} → ${B.id} (vel. máx. ${c.vmax} m/s): baja < 10 % y vuelve (${c.b?.dura?.toFixed(2) ?? '—'} s)`, 'listen', { b: c.b, fin: c.m.at(-1), vmax: c.vmax });
      R.check(!c.dos.length, `${nom}: nunca dos canciones de zona a la vez`, 'listen', c.dos.slice(0, 3));
      R.check(!!b1?.dura && !!c.b?.dura && Math.abs(b1.dura - c.b.dura) <= 0.3, `el bache dura lo mismo de golpe (${b1?.dura?.toFixed(2)} s) que ${nom} (${c.b?.dura?.toFixed(2)} s)`, 'listen', { b1, b: c.b });
    }
    R.check(!errors.length, 'sin errores de página', 'listen', errors.slice(0, 5));
    await page.close();
  } finally { await b.close(); }
}, { timeoutMs: 300000 });
