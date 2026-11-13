// T5-24 · Paquete de ESCUCHA reproducible (OPUS-020, COV-04). Una máquina no aprueba la escucha: esto prepara el material
// para la sesión del usuario (G8-A, auriculares y altavoz) con índice de tiempos para marcar incidencias.
//  · Offline (misma cadena que el juego, `music.ts` importado del servidor de DESARROLLO): <id>-loop-x3.wav (costuras),
//    <id>-estados-0-2-4.wav, secrenovio-central-destello.wav, ab-exterior0-vs-central.wav.
//  · Tiempo real (derivación del bus maestro del juego con un ScriptProcessor, build servida): rodadura a 3/9/14/20 m/s
//    (velocidad mantenida por fixture declarada, 4 s cada una), cruce de sector empujando con salto y recepción, impacto de
//    coche hasta levantarse, y triple → preview (entrada) → volver (salida).
// Salida: V5/G8/escucha/ (WAV 16 bit + indice.json con segmentos y segundos).
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, SAVE_20, ROOT, arg } from '../lib.mjs';
const R = new Report('audio-package');
const OUT = path.join(ROOT, 'V5', 'G8', 'escucha'); fs.mkdirSync(OUT, { recursive: true });
const DEV = arg('dev', 'http://127.0.0.1:5198/');
function wav16(file, chans, sr) {
  const n = chans[0].length, ch = chans.length, b = Buffer.alloc(44 + n * ch * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * ch * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * ch * 2, 28); b.writeUInt16LE(ch * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * ch * 2, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(chans[c][i] * 32767))), 44 + (i * ch + c) * 2);
  fs.writeFileSync(file, b);
}
const index = { generado: new Date().toISOString(), nota: 'Material de escucha; marcar incidencias con archivo, segundo y descripción.', archivos: [] };
await runTest(R, async () => {
  const browser = await launch();
  try {
    // ------------------------------------------------------------------ offline (servidor de desarrollo)
    {
      const page = await openGame(browser, R, { url: DEV, save: null }); await clickStart(page);
      const ids = await page.evaluate(() => Object.keys(window.__bk.cfg.audio.tracks));
      for (const id of ids) {
        const r = await page.evaluate(async (id) => {
          const M = await import('/src/music.ts');
          const g = window.__bk, cfg = g.cfg.audio, sr = 22050;
          const ac = new OfflineAudioContext(2, 1, 48000);
          const dec = M.checkWindow(ac, await ac.decodeAudioData(await (await fetch(cfg.tracks[id])).arrayBuffer()), cfg.cuts[id], id);
          const loop = M.bakeLoop(ac, dec, cfg.loops[id].xfade);
          // tres repeticiones del loop (remuestreado a 22,05 kHz para escuchar ligero)
          const L = loop.length, rep = new OfflineAudioContext(2, Math.round(3 * L / 48000 * sr), sr);
          const s = rep.createBufferSource(); s.buffer = loop; s.loop = true; s.connect(rep.destination); s.start(0); const x3 = await rep.startRendering();
          const P = g.audio.music.params, trim = cfg.trims[id] ?? 0, pre = cfg.trimsPre[id] ?? 0;
          const st = []; for (const lv of [0, 0.5, 1]) st.push(await M.renderState(loop, P, lv, 2, 6, sr, trim, pre));
          const pack = (b) => [Array.from(b.getChannelData(0)), Array.from(b.getChannelData(1))];
          const res = { x3: pack(x3), states: st.map((q) => ({ ch: pack(q.buffer), rms: q.rms, peak: q.peak })), sr };
          if (id === 'secrenovio') {
            const ext0 = await M.renderState(loop, P, 0, 2, 6, sr, trim, pre), cen = await M.renderState(loop, P, -1, 2, 6, sr, trim, pre);
            res.ab = { ext0: pack(ext0.buffer), cen: pack(cen.buffer), rms: [ext0.rms, cen.rms] };
            // central con destellos: misma cadena, flash 0/1 con rampas, X/meseta del juego (reloj de juego empezando en 0)
            const C = cfg.central, secs = 26, oc = new OfflineAudioContext(2, secs * sr, sr);
            const ch = M.createChain(oc, oc.destination); ch.out.gain.value = 1; ch.post.gain.value = M.dbToGain(M.HEADROOM_DB + trim); ch.pre.gain.value = M.dbToGain(pre);
            const flashAt = (t) => { if (t < C.flashPeriod) return 0; const u = (t - C.flashPeriod) % C.flashPeriod; return u < C.flashRamp ? u / C.flashRamp : u < C.flashRamp + C.flashHold ? 1 : u < 2 * C.flashRamp + C.flashHold ? 1 - (u - C.flashRamp - C.flashHold) / C.flashRamp : 0; };
            let curveF = -1;
            for (let t = 0; t < secs; t += 1 / 60) { const f = flashAt(t); const cf = f >= 0.5 ? 1 : 0; M.setChainLevel(ch, P, -1, t, false, f, 0.015, cf !== curveF && t === 0); curveF = cf; }
            M.setChainLevel(ch, P, -1, 0, true, 0);
            const src = oc.createBufferSource(); src.buffer = loop; src.loop = true; src.connect(ch.pre); src.start(0);
            const nb = oc.createBuffer(1, sr * 2, sr); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
            const nsrc = oc.createBufferSource(); nsrc.buffer = nb; nsrc.loop = true; nsrc.connect(ch.noiseGain); nsrc.start();
            const out = await oc.startRendering(); res.flash = pack(out); res.flashNote = 'curvas de saturación fijas del central en este render offline (el juego las cambia a mitad de rampa)';
          }
          return res;
        }, id).catch((e) => ({ error: String(e) }));
        if (r.error) { R.note(`${id}: render offline no disponible (${r.error.slice(0, 160)})`); continue; }
        wav16(path.join(OUT, `${id}-loop-x3.wav`), r.x3, r.sr); index.archivos.push({ archivo: `${id}-loop-x3.wav`, que: `${id}: loop horneado ×3 seguidas (costuras incluidas), 22,05 kHz` });
        const cat = [0, 1].map((c) => r.states.flatMap((s) => s.ch[c])); wav16(path.join(OUT, `${id}-estados-0-2-4.wav`), cat, r.sr);
        index.archivos.push({ archivo: `${id}-estados-0-2-4.wav`, que: `${id}: el mismo fragmento por la cadena exterior 0/4 (0–6 s), 2/4 (6–12 s) y 4/4 (12–18 s)`, rms: r.states.map((s) => +s.rms.toFixed(4)), pico: r.states.map((s) => +s.peak.toFixed(3)) });
        if (r.ab) { wav16(path.join(OUT, 'ab-exterior0-vs-central.wav'), [r.ab.ext0[0].concat(r.ab.cen[0]), r.ab.ext0[1].concat(r.ab.cen[1])], r.sr); index.archivos.push({ archivo: 'ab-exterior0-vs-central.wav', que: 'SECRENOVIO exterior 0/4 (0–6 s) frente a central (6–12 s): «ligeramente peor»' }); }
        if (r.flash) { wav16(path.join(OUT, 'secrenovio-central-destello.wav'), r.flash, r.sr); index.archivos.push({ archivo: 'secrenovio-central-destello.wav', que: 'Centro 26 s con destellos 2/4 como en juego', nota: r.flashNote }); }
      }
      await page.close();
    }
    // ------------------------------------------------------------------ tiempo real (build servida)
    const page = await openGame(browser, R, { save: SAVE_20 }); await clickStart(page); await sleep(2000);
    await page.evaluate(() => { document.getElementById('hint').hidden = true; window.__bkFinalLog = []; const a = window.__bk.audio, c = a.ctx; const sp = c.createScriptProcessor(4096, 2, 2); const L = [], Rr = [];
      sp.onaudioprocess = (e) => { if (window.__tap.on) { L.push(new Float32Array(e.inputBuffer.getChannelData(0))); Rr.push(new Float32Array(e.inputBuffer.getChannelData(1))); } };
      a.master.connect(sp); const z = c.createGain(); z.gain.value = 0; sp.connect(z); z.connect(c.destination); window.__tap = { on: false, L, R: Rr, sr: c.sampleRate, marks: [] }; });
    const tapStart = () => page.evaluate(() => { window.__tap.L.length = 0; window.__tap.R.length = 0; window.__tap.marks = []; window.__tap.t0 = performance.now(); window.__tap.on = true; });
    const mark = (txt) => page.evaluate((txt) => window.__tap.marks.push([+((performance.now() - window.__tap.t0) / 1000).toFixed(2), txt]), txt);
    const tapSave = async (file, que) => { const d = await page.evaluate(() => { window.__tap.on = false; const cat = (a) => { const n = a.reduce((s, x) => s + x.length, 0), o = new Float32Array(n); let k = 0; for (const x of a) { o.set(x, k); k += x.length; } return Array.from(o); }; return { L: cat(window.__tap.L), R: cat(window.__tap.R), sr: window.__tap.sr, marks: window.__tap.marks }; });
      wav16(path.join(OUT, file), [d.L, d.R], d.sr); const rms = Math.sqrt(d.L.reduce((s, x) => s + x * x, 0) / Math.max(1, d.L.length)); index.archivos.push({ archivo: file, que, marcas: d.marks, segundos: +(d.L.length / d.sr).toFixed(2), rms: +rms.toFixed(4) }); return rms; };
    // rodadura
    await fixture(page, R, 'recta larga en tabla, velocidad mantenida por fixture', () => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(-43.2, 0, -50), 39 * Math.PI / 180, 'ride'); return {}; });
    await tapStart();
    for (const v of [3, 9, 14, 20]) { await mark(`rodadura ${v} m/s`); const t0 = Date.now(); while (Date.now() - t0 < 4000) { await page.evaluate((v) => { const s = window.__bk.skater; if (Date.now() % 1 === 0) s.vel.set(Math.sin(s.heading) * v, 0, Math.cos(s.heading) * v); if (Math.hypot(s.footPos.x + 43.2, s.footPos.z + 50) > 45) s.teleport(new window.__bkTHREE.Vector3(-43.2, 0, -50), s.heading, 'ride'); }, v); await sleep(30); } }
    const r1 = await tapSave('rodadura-3-9-14-20.wav', 'Rodadura mantenida 4 s a 3, 9, 14 y 20 m/s (teletransporte declarado al final de la recta)');
    // cruce de sector con push, salto y recepción
    await fixture(page, R, 'NMG → FG en tabla por el paseo exterior', () => { const g = window.__bk, T = window.__bkTHREE, th = 60 * Math.PI / 180; g.skater.teleport(new T.Vector3(40 * Math.sin(th), 0, -40 * Math.cos(th)), th + Math.PI / 2, 'ride'); g.rig.snapBehind(g.skater); return {}; });
    await tapStart(); await mark('empuje (W)'); await page.keyboard.down('KeyW'); await sleep(2500); await mark('ollie'); await page.keyboard.press('Space'); await sleep(1200); await mark('recepción'); await sleep(2500); await page.keyboard.up('KeyW'); await mark('rodar'); await sleep(1500);
    const r2 = await tapSave('cruce-sector-push-ollie-land.wav', 'Cruce de sector NMG→FG empujando, ollie y recepción');
    // impacto de coche hasta levantarse
    await tapStart(); await mark('golpe de coche');
    await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, C = g.cars, c = C.cars[0]; const a = C.phase + c.offset - 12 / 17.5, pose = window.__bkCarPose(a), p = pose.pos; g.skater.teleport(new T.Vector3(p.x, 0, p.z), Math.atan2(-pose.vel.x, -pose.vel.z), 'walk'); g.rig.snapBehind(g.skater); g.skater.impactProtectUntil = -1; });
    for (let i = 0; i < 200; i++) { const ph = await page.evaluate(() => window.__bk.skater.impactPhase); if (ph === 'getup') { await mark('levantarse'); break; } await sleep(40); }
    await sleep(2500); const r3 = await tapSave('impacto-coche-getup.wav', 'Golpe de coche: vuelo, caída y levantarse');
    // triple → preview → volver
    for (let i = 0; i < 400; i++) { const a = await page.evaluate(() => window.__bk.cars.cars.map((c) => { let a = Math.atan2(c.pos.x, -c.pos.z); if (a < 0) a += 2 * Math.PI; return a; })); const ahead = (q, t) => ((q - t) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); if (a.every((q) => [3 * Math.PI / 2, Math.PI / 2].every((c) => ahead(q, c) > 2.4 && ahead(q, c) < 2 * Math.PI - 0.6))) break; await sleep(40); }
    await fixture(page, R, 'final.approach a 9 m/s', () => { const g = window.__bk, a = g.manifest.get('final.approach'); g.input.clear(); g.skater.teleport(a.pos.clone(), a.heading, 'ride'); g.skater.vel.set(Math.sin(a.heading) * 9, 0, Math.cos(a.heading) * 9); g.rig.snapBehind(g.skater); return {}; });
    await tapStart(); await mark('aproximación'); await page.keyboard.down('KeyW'); let pressed = false;
    for (let i = 0; i < 600; i++) { const q = await page.evaluate(() => ({ inW: window.__bk.activities[5].inWindow(), ph: window.__bk.activities[5].phase })); if (!pressed && q.inW) { await page.keyboard.press('Space'); pressed = true; await mark('SALTO'); } if (q.ph === 'flight') break; await sleep(8); }
    await page.keyboard.up('KeyW');
    for (let i = 0; i < 150; i++) { if (await page.evaluate(() => window.__bk.mode) === 'preview') { await mark('preview (entrada)'); break; } await sleep(100); }
    await sleep(6000); await page.keyboard.press('Escape'); await mark('volver (salida)'); await sleep(3000);
    const r4 = await tapSave('final-preview-entrada-salida.wav', 'Triple real → preview exclusivo (entrada) → volver al parque (salida)');
    fs.writeFileSync(path.join(OUT, 'indice.json'), JSON.stringify(index, null, 1));
    R.measure('indice', index);
    R.check([r1, r2, r3, r4].every((x) => x > 0.001), 'renders en tiempo real con señal', 'unit', { r1, r2, r3, r4 });
    R.pendingHuman('Sesión de escucha del usuario con el paquete V5/G8/escucha (G8-A)');
  } finally { await browser.close(); }
}, { timeoutMs: 900000 });
