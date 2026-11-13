// R11 · F10 · mezcla de audio REAL (AudioContext en marcha; captura de solo lectura con un AudioWorklet sin salidas, como la sonda
// AUD-JUG/MEZCLA). «Salida» = el último nodo antes de los altavoces (`audio.limiter` si existe; si no, `audio.master`).
//  MEZ-01  junto a La Pantera (1,5 m) con el volumen al 100 %: la salida no recorta (0 muestras ≥ 0,999; pico ≤ −0,3 dBFS).
//  MEZ-02  rodando a 8 m/s en hormigón sin empujar: la rodadura (bus de efectos) queda a ≥ −12 dB de la música (base −23 a −31).
//  MEZ-06  grind en el raíl de esquina y caída (`bail`) en pleno grind: al alejarse, el bucle de grind está a 0 (sin siseo).
//  MEZ-07  a pie a 4 m de la pista con coches: el motor (bus de efectos sin rodadura) a ≥ −14 dB de la música (base −16 a −21).
//  No empeorar: en una zona tranquila (NMG, lejos de La Pantera y de la pista) la salida y el master difieren < 0,5 dB (el limitador no
//  toca el nivel normal) y no hay recortes.
//   node tools/v8/r11/f10-audio.mjs --url pre --task R11 --label pre
import { Report, runTest } from '../lib.mjs';
import { launch, abrir, run, sleep, corona } from './f5-lib.mjs';
const R = new Report('r11-f10-audio');
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -200);
async function instalar(page) {
  return page.evaluate(async () => {
    const g = window.__bk, a = g.audio, c = a.ctx; if (!c) return { error: 'sin contexto' };
    const code = `class Cap extends AudioWorkletProcessor { constructor() { super(); this.n = 0; this.pk = 0; this.ss = 0; this.cl = 0; this.win = Math.round(sampleRate * 0.02); }
      process(inputs) { const inp = inputs[0]; const L = inp.length ? inp[0].length : 128;
        for (let ch = 0; ch < inp.length; ch++) { const d = inp[ch]; for (let i = 0; i < d.length; i++) { const x = d[i], ax = x < 0 ? -x : x; if (ax > this.pk) this.pk = ax; this.ss += x * x / inp.length; if (ax >= 0.999) this.cl++; } }
        this.n += L; if (this.n >= this.win) { this.port.postMessage([currentTime, this.pk, Math.sqrt(this.ss / this.n), this.cl]); this.n = 0; this.pk = 0; this.ss = 0; this.cl = 0; } return true; } }
      registerProcessor('bk-cap11', Cap);`;
    await c.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'application/javascript' })));
    window.__cap = {};
    const taps = { out: a.limiter ?? a.master, master: a.master, music: a.music.bus, sfx: a.sfxBus };
    for (const [k, node] of Object.entries(taps)) { const w = new AudioWorkletNode(c, 'bk-cap11', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' });
      window.__cap[k] = []; w.port.onmessage = (e) => { const arr = window.__cap[k]; arr.push(e.data); if (arr.length > 20000) arr.splice(0, 5000); }; node.connect(w); }
    return { ok: true, limiter: !!a.limiter, state: c.state };
  });
}
const tramo = async (page, segReal) => { const t0 = await page.evaluate(() => window.__bk.audio.ctx.currentTime); await sleep(segReal * 1000); const t1 = await page.evaluate(() => window.__bk.audio.ctx.currentTime);
  return page.evaluate((t0, t1) => { const o = {}; for (const [k, rows] of Object.entries(window.__cap)) { const r = rows.filter((q) => q[0] >= t0 && q[0] <= t1); if (!r.length) { o[k] = null; continue; }
    o[k] = { pk: Math.max(...r.map((q) => q[1])), rms: Math.sqrt(r.reduce((s, q) => s + q[2] * q[2], 0) / r.length), clips: r.reduce((s, q) => s + q[3], 0) }; } return o; }, t0, t1); };
const fmt = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v && { pkDb: +db(v.pk).toFixed(1), rmsDb: +db(v.rms).toFixed(1), clips: v.clips }]));
await runTest(R, async () => {
  const b = await launch();
  try {
    for (let k = 1; k <= 2; k++) {
      const page = await abrir(b, R, { cars: false });
      await page.evaluate(() => { const g = window.__bk; g.autoMode = false; g.audio.setVolume?.(1); if (!g.audio.setVolume) g.audio.volume = 1; });
      const cap = await instalar(page); if (cap.error) { R.invalid(`#${k} sin AudioContext`, cap); await page.close(); continue; }
      // ---------------------------------------------------------------- no empeorar: zona tranquila
      await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(20, 0.02, -40), 1.6, 'walk'); });
      await sleep(2500); { const m = await tramo(page, 3); const d = Math.abs(db(m.out.rms) - db(m.master.rms));
        R.check(d < 0.5 && m.out.clips === 0, `#${k} no empeorar: zona tranquila, salida y master a ${d.toFixed(2)} dB (< 0,5) y sin recortes`, 'input', fmt(m)); }
      // ---------------------------------------------------------------- MEZ-01
      { const pa = await page.evaluate(() => { const a = window.__bk.manifest.get('npc.la_pantera'); return [a.pos.x, a.pos.z]; });
        await page.evaluate((pa) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(pa[0] - 1.5, 0.02, pa[1] - 0.2), Math.PI / 2, 'walk'); }, pa);
        await sleep(2500); const m = await tramo(page, 4);
        R.check(m.out.clips === 0 && db(m.out.pk) <= -0.3, `#${k} MEZ-01 junto a La Pantera al 100 %: sin recortes (${m.out.clips}) y pico ${db(m.out.pk).toFixed(1)} dBFS (≤ −0,3)`, 'input', fmt(m)); }
      // ---------------------------------------------------------------- MEZ-02 (rodadura a 8 m/s, tiempo real)
      { await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, s = g.skater; s.teleport(new T.Vector3(-6, 0.02, -40), Math.PI / 2, 'ride'); s.vel.set(8, 0, 0); s.vLong = 8; });
        await sleep(300); const m = await tramo(page, 1.0);
        const rel = db(m.sfx.rms) - db(m.music.rms);
        R.check(rel >= -12, `#${k} MEZ-02 rodando a ~8 m/s sin empujar: rodadura a ${rel.toFixed(1)} dB de la música (≥ −12)`, 'input', fmt(m)); }
      // ---------------------------------------------------------------- MEZ-06 (caída en pleno grind)
      { // V10 (cambio de diseño aprobado): el raíl de la plaza de esquina desaparece con el parque exterior → raíl `bola_rail` del exterior
        // (mismo carril de llegada libre que f7-impactos y f8-trucos)
        const v10 = (await corona(page)) !== 0, A0 = v10 ? [-31.94, -38.59] : [-38.47, -31.96], B0 = v10 ? [-29.33, -41.35] : [-41.3, -34.79], L = Math.hypot(B0[0] - A0[0], B0[1] - A0[1]), u = [(B0[0] - A0[0]) / L, (B0[1] - A0[1]) / L], h = Math.atan2(u[0], u[1]);
        await page.evaluate(() => { window.__bk.autoMode = true; });
        const r = await run(page, { p: [A0[0] - u[0] * 4, 0.02, A0[1] - u[1] * 4], h, v: 5, sec: 2, script: `{ const al = (${A0[0]} - s.footPos.x) * ${u[0]} + (${A0[1]} - s.footPos.z) * ${u[1]}; if (!M.j && al <= 1.6) { M.j = st; key('Space', true); } if (M.j && st === M.j + 3) { key('Space', false); key('KeyF', true); } if (s.loco === 'grind' && !M.g) { M.g = st; } if (M.g && st === M.g + 10) { s.bail('r11-golpe'); key('KeyF', false); } }` });
        await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.autoMode = false; window.__R11.releaseAll(); g.skater.teleport(new T.Vector3(0, 0.02, -45), 0, 'walk'); });
        if (!r.g) R.invalid(`#${k} MEZ-06: no llegó a hacer grind`, {});
        else { await sleep(1500); const gg = await page.evaluate(() => window.__bk.audio.grind ? window.__bk.audio.grind.gain.gain.value : 0);
          R.check(gg < 0.005, `#${k} MEZ-06 caída en pleno grind: al alejarse el bucle de grind queda a 0 (ganancia ${gg.toFixed(3)})`, 'input', {}); } }
      // ---------------------------------------------------------------- MEZ-07 (motor de coches a 4 m de la pista)
      { await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.cars.setActive(true); const R0 = 17.5 + 4; g.skater.teleport(new T.Vector3(R0, 0.02, 0), 0, 'walk'); });
        await sleep(2000); const m = await tramo(page, 6); const rel = db(m.sfx.rms) - db(m.music.rms);
        await page.evaluate(() => window.__bk.cars.setActive(false));
        R.check(rel >= -14, `#${k} MEZ-07 a pie a ~4 m de la pista con coches: motor a ${rel.toFixed(1)} dB de la música (≥ −14)`, 'input', fmt(m)); }
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
