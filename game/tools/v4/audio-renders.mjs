// V4-AUD-04 · Material de ESCUCHA (no aceptación): renders offline reproducibles con la misma cadena del juego.
//  - <id>-loop-x3.wav: tres repeticiones del loop horneado (costura incluida), sin radio, para juzgar la frase y la costura.
//  - <id>-estados-0-2-4.wav: el mismo fragmento por la cadena exterior 0/4, 2/4 y 4/4 (6 s cada uno).
//  - secrenovio-central-destello.wav: 26 s del centro con el preset central y destellos 2/4 de 1 s cada X (como en juego).
//  - ab-exterior0-vs-central.wav: 6 s exterior 0/4 de SECRENOVIO seguidos de 6 s central (comparar «ligeramente peor»).
// Guardado en V4/evidencias/AUD/escucha/. Una máquina no aprueba la escucha: queda pendiente humano.
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, launch, openGame, clickStart, ROOT } from './lib.mjs';

const R = new Report('AUD', 'audio-renders');
const OUT = path.join(ROOT, 'V4', 'evidencias', 'AUD', 'escucha');
function wav16(file, chans, sr) {
  const n = chans[0].length, ch = chans.length, b = Buffer.alloc(44 + n * ch * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * ch * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * ch * 2, 28); b.writeUInt16LE(ch * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * ch * 2, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(chans[c][i] * 32767))), 44 + (i * ch + c) * 2);
  fs.writeFileSync(file, b);
}
await runTest(R, async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    await clickStart(page);   // el motor de música se crea con el gesto de JUGAR
    const ids = await page.evaluate(() => Object.keys(window.__bk.cfg.audio.tracks));
    const files = [];
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
      }, id);
      const sr = r.sr;
      wav16(path.join(OUT, `${id}-loop-x3.wav`), r.x3, sr); files.push(`${id}-loop-x3.wav`);
      const cat = [r.states.flatMap((s) => s.ch[0]), r.states.flatMap((s) => s.ch[1])];
      wav16(path.join(OUT, `${id}-estados-0-2-4.wav`), cat, sr); files.push(`${id}-estados-0-2-4.wav`);
      R.check(r.states.every((s) => s.peak <= 1.0 && s.rms > 0.01), `${id}: renders de estados sin recorte y con señal`, 'unit', r.states.map((s) => ({ rms: +s.rms.toFixed(4), peak: +s.peak.toFixed(3) })));
      if (r.ab) {
        wav16(path.join(OUT, 'ab-exterior0-vs-central.wav'), [r.ab.ext0[0].concat(r.ab.cen[0]), r.ab.ext0[1].concat(r.ab.cen[1])], sr); files.push('ab-exterior0-vs-central.wav');
        wav16(path.join(OUT, 'secrenovio-central-destello.wav'), r.flash, sr); files.push('secrenovio-central-destello.wav');
        R.note({ ab_rms: r.ab.rms, nota: r.flashNote });
      }
    }
    fs.writeFileSync(path.join(OUT, 'README.md'), `# Escucha V4 (material, no aceptación)\n\nRenders offline con la cadena del juego (22,05 kHz). Escuchar con altavoz y auricular, también a volumen bajo.\n\n${files.map((f) => `- ${f}`).join('\n')}\n\nEstado: **escucha humana pendiente** (V4-AUD-04 / V4-VAL-03). Las métricas de la prueba \`audio-v4\` no sustituyen esta escucha.\n`);
    R.check(files.length === 14, 'catorce archivos de escucha generados', 'unit', files);
    R.pendingHuman('Escuchar V4/evidencias/AUD/escucha: frase y costura de los seis loops, A/B exterior 0 vs central, central→destello→central');
  } finally { await browser.close(); }
});
