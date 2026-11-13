// V4-AUD-01/02 · Audio: cortes exactos servidos, costura interna, destello central y preview. Escucha humana: PENDIENTE.
// - Servido: SHA-256 de los bytes que sirve el juego = manifiesto; decodificación en Chrome = muestras declaradas.
// - Costura: el loop horneado solo usa muestras de la ventana (prueba sintética etiquetada); la costura V3 (material
//   previo al inicio) se ejecuta como NEGATIVA y debe detectarse. Discontinuidad en el salto final→inicio medida.
// - Central (fixture: ANMI colocada junto al cassette central para que suene SECRENOVIO): primer destello a X s de juego,
//   meseta ≥ 0,95 s con la cadena EXACTA de 2/4, pausa congela el reloj y no dispara destellos, ≤ 2 voces.
// - Preview: buffer limpio de 19 s.
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';

const R = new Report('AUD', 'audio-v4');
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    await clickStart(page);
    // ------------------------------------------------ 1. bytes servidos y ventana decodificada
    const served = await page.evaluate(async () => {
      const g = window.__bk, cfg = g.cfg.audio, out = [];
      const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
      for (const [id, url] of Object.entries(cfg.tracks)) {
        const r = await fetch(url); const buf = await r.arrayBuffer();
        const sha = hex(await crypto.subtle.digest('SHA-256', buf));
        const ac = new OfflineAudioContext(2, 1, 48000);
        const dec = await ac.decodeAudioData(buf.slice(0));
        out.push({ id, url: url.split('/').pop(), status: r.status, bytes: buf.byteLength, sha, want: cfg.cuts[id].sha256, decoded: dec.length, sr: dec.sampleRate, declared: cfg.cuts[id].samples, seconds: +(dec.length / dec.sampleRate).toFixed(4), window: [cfg.cuts[id].in, cfg.cuts[id].out] });
      }
      return out;
    });
    R.nonEmpty(served, 'pistas configuradas');
    for (const s of served) {
      R.check(s.status === 200 && s.sha === s.want, `${s.id}: los bytes servidos (${s.url}) son el derivado V4 del manifiesto`, 'static', { bytes: s.bytes, sha: s.sha.slice(0, 16) });
      R.check(s.decoded - s.declared >= 0 && s.decoded - s.declared <= 4096 && s.sr === 48000, `${s.id}: Chrome decodifica la ventana ${s.window[0]}–${s.window[1]} s (${s.declared} muestras + relleno ≤4096)`, 'static', { decoded: s.decoded, declared: s.declared, seconds: s.seconds });
    }
    const durations = Object.fromEntries(served.map((s) => [s.id, s.declared / 48000]));
    R.check(JSON.stringify(durations) === JSON.stringify({ no_me_guillo: 15, nosvamosdeaqui: 27, yinyang: 30, tratratra: 24, fashion_girl: 36, secrenovio: 19 }), 'duraciones exactas HUM-A4-014 (15/27/30/24/36/19 s)', 'static', durations);

    // ------------------------------------------------ 2. costura: solo muestras internas (positiva) y V3 detectada (negativa)
    const seam = await page.evaluate(async () => {
      const M = await import('/src/music.ts');
      const ac = new OfflineAudioContext(1, 1, 48000);
      // canción sintética: fuera de la ventana = −1 (etiqueta); dentro = rampa en [0,1)
      const song = ac.createBuffer(1, 48000 * 6, 48000), a = song.getChannelData(0);
      const s0 = 48000 * 2, e0 = 48000 * 4;
      for (let i = 0; i < a.length; i++) a[i] = i >= s0 && i < e0 ? (i - s0) / (e0 - s0) : -1;
      // derivado V4 = solo la ventana
      const win = ac.createBuffer(1, e0 - s0, 48000); win.getChannelData(0).set(a.subarray(s0, e0));
      const v4 = M.bakeLoop(ac, win, 0.09).getChannelData(0);
      const v3 = M.bakeLoopV3Legacy(ac, song, 2, 4, 0.09).getChannelData(0);
      const minV4 = v4.reduce((m, x) => Math.min(m, x), 9), minV3 = v3.reduce((m, x) => Math.min(m, x), 9);
      return { v4Len: v4.length, minV4, minV3, v4Outside: v4.filter((x) => x < -1e-6).length, v3Outside: v3.filter((x) => x < -1e-6).length };
    });
    R.check(seam.v4Outside === 0 && seam.minV4 >= 0, 'costura V4: ninguna muestra fuera de la ventana (señal etiquetada)', 'unit', seam);
    R.check(seam.v3Outside > 0, 'NEGATIVA: la costura V3 (material previo al inicio) SÍ mete muestras exteriores y se detecta', 'unit', { v3Outside: seam.v3Outside, minV3: seam.minV3 });
    const seams = await page.evaluate(async () => {
      const M = await import('/src/music.ts');
      const g = window.__bk, cfg = g.cfg.audio, out = [];
      const ac = new OfflineAudioContext(2, 1, 48000);
      for (const [id, url] of Object.entries(cfg.tracks)) {
        const dec = M.checkWindow(ac, await ac.decodeAudioData(await (await fetch(url)).arrayBuffer()), cfg.cuts[id], id);
        const L = M.bakeLoop(ac, dec, cfg.loops[id].xfade);
        const o = L.getChannelData(0);
        const diffs = []; for (let i = 1; i < o.length; i += 7) diffs.push(Math.abs(o[i] - o[i - 1]));
        diffs.sort((x, y) => x - y);
        const p999 = diffs[Math.floor(diffs.length * 0.999)];
        out.push({ id, wrapJump: +Math.abs(o[0] - o[o.length - 1]).toFixed(5), p999: +p999.toFixed(5), loopPeriod: +(L.length / L.sampleRate).toFixed(3), extract: +(dec.length / dec.sampleRate).toFixed(3) });
      }
      return out;
    });
    for (const s of seams) R.check(s.wrapJump <= s.p999, `${s.id}: salto final→inicio del loop dentro de la variación normal (≤ p99,9)`, 'unit', s);
    R.note({ periodos_de_loop: seams.map((s) => `${s.id} extracto ${s.extract}s → periodo ${s.loopPeriod}s`) });

    // ------------------------------------------------ 3. destello central
    R.fixture('ANMI colocada a 2 m del cassette central (secrenovio audible)', await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(2, 0, -2), 0, 'walk'); g.rig.snapBehind(g.skater); return { clock: g.centralClock }; }));
    const P = await page.evaluate(() => { const C = window.__bk.cfg.audio.central; return C; });
    const samples = [];
    const t0 = Date.now();
    let paused = null;
    while (Date.now() - t0 < 27000) {
      const s = await page.evaluate(async () => {
        const g = window.__bk, mu = g.audio.music, t = mu.tracks.get('secrenovio');
        const M = await import('/src/music.ts');
        const ref = M.stateAt(mu.params, 0.5), cen = M.stateAt(mu.params, -1);
        return { clock: +g.centralClock.toFixed(3), flash: +g.centralFlash().toFixed(3), playing: t.playing, level: t.level, tflash: +t.flash.toFixed(3), lp: +t.lp.frequency.value.toFixed(1), hp: +t.hp.frequency.value.toFixed(1),
          refLp: +ref.lp.toFixed(1), cenLp: +cen.lp.toFixed(1), st: t.st, ref, live: mu.liveCount, paused: g.paused };
      });
      samples.push({ ...s, wall: Date.now() - t0 });
      // pausa justo antes del segundo destello: el reloj se congela y no hay destello mientras dura
      if (!paused && s.clock > 2 * P.flashPeriod - 0.6 && s.clock < 2 * P.flashPeriod - 0.1) { await page.keyboard.press('Escape'); paused = { at: s.clock, wall: Date.now() }; }
      if (paused && !paused.done && Date.now() - paused.wall > 2500) { paused.after = (await page.evaluate(() => window.__bk.centralClock)); paused.flashDuring = samples.filter((q) => q.paused && q.flash > 0).length; await page.keyboard.press('Escape'); paused.done = true; }
      await sleep(40);
    }
    const playing = samples.filter((q) => q.playing && q.level < 0);
    R.nonEmpty(playing, 'muestras con SECRENOVIO sonando en estado central');
    const firstFlash = samples.find((q) => q.flash > 0);
    R.check(firstFlash && firstFlash.clock >= P.flashPeriod - 0.05 && firstFlash.clock < P.flashPeriod + 0.2, `primer destello al completar X=${P.flashPeriod} s de juego (no al primer fotograma)`, 'unit', { firstAt: firstFlash?.clock });
    // meseta: tiempo de reloj de juego con el lp real a ≤2 % del objetivo 2/4
    const plateau = (k) => { const lo = k * P.flashPeriod, hi = lo + P.flashHold + 2 * P.flashRamp + 0.4; const w = samples.filter((q) => q.clock >= lo && q.clock <= hi && Math.abs(q.lp - q.refLp) / q.refLp < 0.02); return w.length ? +(w.at(-1).clock - w[0].clock).toFixed(3) : 0; };
    const p1 = plateau(1);
    R.check(p1 >= P.flashHold - 0.12 && p1 <= P.flashHold + 0.15, 'primer destello: meseta ≈1 s con el filtro de la cadena 2/4 (medido en el AudioParam real, muestreo ~40 ms)', 'unit', { plateau: p1 });
    const atPlateau = samples.find((q) => q.flash === 1 && q.st);
    const exact = atPlateau && ['hp', 'lp', 'drive', 'noise', 'dropRate', 'dropDepth', 'crush', 'peak', 'inGain'].every((k) => Math.abs(atPlateau.st[k] - atPlateau.ref[k]) < 1e-6);
    R.check(exact, 'en la meseta los parámetros de estado son EXACTAMENTE los del exterior 2/4 (r=0,5)', 'unit', { st: atPlateau?.st, ref: atPlateau?.ref });
    const base = samples.filter((q) => q.playing && q.flash === 0 && q.clock > 2 && q.clock < P.flashPeriod - 0.3);
    R.check(base.length && base.every((q) => Math.abs(q.lp - q.cenLp) / q.cenLp < 0.03), 'fuera del destello suena el preset central (ligeramente peor que 0/4)', 'unit', { lp: base.slice(-1)[0]?.lp, cenLp: base[0]?.cenLp });
    R.check(paused && Math.abs(paused.after - paused.at) < 0.06 && paused.flashDuring === 0, 'pausa: el reloj central se congela y no hay destello mientras dura', 'input', paused);
    const p2 = plateau(2);
    R.check(p2 >= P.flashHold - 0.12, 'tras reanudar, el segundo destello ocurre completo (meseta ≈1 s)', 'unit', { plateau2: p2 });
    R.check(Math.max(...samples.map((q) => q.live)) <= 2, 'máximo dos voces vivas (colas incluidas) durante el destello', 'unit', { maxLive: Math.max(...samples.map((q) => q.live)) });

    // ------------------------------------------------ 3b. punto triple (frontera de dos sectores junto al centro): hasta tres
    // pistas tienen peso; el límite real de DOS voces (colas incluidas) debe mantenerse mientras se cruza
    R.fixture('ANMI en la frontera NMG/NV junto al centro (r 21,5, θ 0°): tres pistas con peso', await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(0, 0, -21.5), Math.PI / 2, 'walk'); return true; }));
    const tri = []; const tt = Date.now();
    await page.keyboard.down('KeyW');
    while (Date.now() - tt < 6000) { tri.push(await page.evaluate(() => { const g = window.__bk, mu = g.audio.music; const w = g.musicDebug; return { live: mu.liveCount, weighted: Object.values(w).filter((v) => v > 0.01).length }; })); await sleep(50); }
    await page.keyboard.up('KeyW');
    R.check(tri.some((q) => q.weighted >= 3), 'el recorrido pasa por un punto con ≥3 pistas con peso (la prueba es sensible al límite)', 'unit', { maxWeighted: Math.max(...tri.map((q) => q.weighted)) });
    R.check(Math.max(...tri.map((q) => q.live)) <= 2, 'en el punto triple nunca hay más de dos voces vivas (colas incluidas)', 'unit', { maxLive: Math.max(...tri.map((q) => q.live)) });

    // ------------------------------------------------ 4. preview limpio de 19 s
    const pv = await page.evaluate(async () => { const mu = window.__bk.audio.music; await mu.ensure('secrenovio'); const t = mu.tracks.get('secrenovio'); return { preview: t.previewBuf ? +t.previewBuf.duration.toFixed(4) : null, loop: +t.buffer.duration.toFixed(4) }; });
    R.check(pv.preview === 19, 'preview central = ventana limpia 0:42–1:01 (19 s exactos)', 'unit', pv);
    R.pendingHuman('Escucha humana de los seis loops, la mezcla, el central malo→destello→malo y el preview (altavoz/auricular, volumen bajo)');
  } finally { await browser.close(); }
});
