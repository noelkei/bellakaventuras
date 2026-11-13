// V10.2 · Q08 (D-08, D2-04; usuario: «los trucos de secretnovio, que vuelvan a ser 5… debe ser más ágil… comprimimos el tiempo… la idea es
// que los trucos se vean conectados y bien»): en el vuelo salen 5 círculos en el orden BACKFLIP → GIRO 360 → BACKFLIP → GRAB → BACKFLIP,
// encadenados (el siguiente sale ≤ 0,25 s después de acertar el anterior), los 5 se aciertan con Espacio, el vuelo entero (despegue →
// recepción) dura ≤ 4 s reales, hay 3 vueltas de backflip y la recepción es buena. Con «reducir movimiento» el vuelo se para en cada círculo.
import { Report, runTest, launch, openGame, clickStart, sleep, SAVE_20 } from '../v8/lib.mjs';
import { snRun } from '../v10/sn-lib.mjs';
const R = new Report('sn-cinco');
const ORDER = ['BACKFLIP', 'GIRO 360', 'BACKFLIP', 'GRAB', 'BACKFLIP'];
const REC = () => { window.__t102sn = []; const loop = () => { const g = window.__bk, a = g?.activities.find((x) => x.id === 'secretJump'); if (a) { const el = document.getElementById('hit-circle');
  window.__t102sn.push({ t: performance.now(), ph: a.phase, c: a.circle ? a.circle.i : -1, name: el && !el.hidden ? el.querySelector('.hc-name')?.textContent : null, n: (a.hits ?? []).filter((h) => h !== null).length, ft: a.t, flip: g.visual.extPose?.flip ?? 0 }); }
  if (window.__t102sn.length < 20000) requestAnimationFrame(loop); }; requestAnimationFrame(loop); };
await runTest(R, async () => {
  const b = await launch();
  for (const red of [false, true]) {
    const page = await openGame(b, R, { save: { ...SAVE_20, settings: red ? { reducedMotion: true, reducedMotionSet: true } : {} } }); await clickStart(page);
    await page.evaluate(REC);
    const r = await snRun(page, R, { jump: 'hot', circles: 'hit' });
    const L = await page.evaluate(() => window.__t102sn);
    const fl = L.filter((x) => x.ph === 'flight'), t0 = fl[0]?.t, t1 = L.find((x) => x.t > (t0 ?? 0) && x.ph !== 'flight')?.t;
    const opens = []; for (let i = 1; i < L.length; i++) if (L[i].c >= 0 && L[i].c !== L[i - 1].c) opens.push({ i: L[i].c, t: L[i].t, name: L[i].name });
    const hitsAt = []; for (let i = 1; i < L.length; i++) if (L[i].n > L[i - 1].n) hitsAt.push(L[i].t);
    const gaps = hitsAt.slice(0, -1).map((h, k) => { const o = opens.find((x) => x.i === k + 1 && x.t >= h - 1); return o ? +((o.t - h) / 1000).toFixed(3) : null; });
    const names = opens.map((o) => o.name), dur = t0 && t1 ? +((t1 - t0) / 1000).toFixed(2) : null, cl = r.fin?.land?.circles ?? [];
    const tag = red ? 'reducido' : 'normal';
    R.measure(tag, { names, dur, gaps, hits: hitsAt.length, cl, ok: r.end.ok, maxFlip: r.log.maxFlip });
    R.check(names.length === 5 && names.every((n, i) => n === ORDER[i]), `${tag}: 5 círculos en el orden D-08 (${names.join(' → ')})`, 'input', names);
    R.check(r.fin?.land?.hits === 5 && cl.filter((c) => c.ok && !c.auto).length === 5 && r.end.ok >= 1, `${tag}: los 5 acertados con Espacio y recepción buena (aciertos ${cl.filter((c) => c.ok && !c.auto).length}, final ${r.end.ok})`, 'input', { cl: cl.slice(0, 12), fin: r.fin?.land });
    R.check(r.log.maxFlip >= 3 * 2 * Math.PI * 0.95, `${tag}: 3 vueltas de backflip (${(r.log.maxFlip / (2 * Math.PI)).toFixed(2)})`, 'input');
    if (!red) {
      R.check(dur !== null && dur <= 4.0, `normal: el vuelo con los 5 trucos dura ${dur} s reales (≤ 4 s)`, 'input', { dur });
      R.check(gaps.length === 4 && gaps.every((g) => g !== null && g <= 0.25), `normal: encadenados, el siguiente círculo sale ≤ 0,25 s tras acertar (${gaps.join(', ')} s)`, 'input', gaps);
    } else {
      // reducido: mientras hay círculo el vuelo no avanza (tiempo de vuelo quieto)
      const still = L.filter((x) => x.ph === 'flight' && x.c >= 0); let moved = 0; for (let i = 1; i < still.length; i++) if (still[i].c === still[i - 1].c && Math.abs(still[i].ft - still[i - 1].ft) > 1e-4) moved++;
      R.check(still.length > 10 && moved === 0, `reducido: el vuelo se para en cada círculo (${moved} avances con círculo abierto)`, 'input', { n: still.length, moved });
    }
    await page.close();
  }
  await b.close();
}, { timeoutMs: 600000 });
