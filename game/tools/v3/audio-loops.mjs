// AUD-04: puntos de bucle de los cortes con el decodificador del navegador (el mismo del juego). Por tema: envolvente de
// ataques (10 ms), tempo por autocorrelación (70–180 BPM), y búsqueda de (inicio, fin) con fin − inicio = N compases de 4
// tiempos, maximizando el parecido de la envolvente justo tras el fin con la de justo tras el inicio y penalizando energía
// alta en los puntos (no cortar palabra/golpe). Se hornea con bakeLoop del juego (xfade 60 ms) y se mide la costura:
// salto PCM en la unión frente al percentil 99 de saltos del propio tema y continuidad RMS a ambos lados, en dos ciclos.
// --apply escribe audio.loops en public/game-config.json.  «Costura medida» no es «escucha aprobada».
//   node tools/v3/audio-loops.mjs [--apply] → captures/v3/P4/AUD-04/loops.json
import fs from 'node:fs';
import path from 'node:path';
import { Report, launch, openGame, GAME } from './lib.mjs';

const APPLY = process.argv.includes('--apply');
const CFG = path.join(GAME, 'public', 'game-config.json');
const R = new Report('P4/AUD-04', 'loops', { method: 'decodeAudioData del navegador; envolvente 10 ms; tempo por autocorrelación; bakeLoop del juego; medidas de costura en PCM' });
const browser = await launch();
const page = await openGame(browser, R, { save: null });
try {
  const res = await page.evaluate(async () => {
    const g = window.__bk; g.audio.unlock(); const mu = g.audio.music, ctx = g.audio.ctx ?? mu.ctx;
    const { bakeLoop } = await import('/src/music.ts');
    const out = {};
    for (const [id, t] of mu.tracks) {
      const arr = await (await fetch(t.url ?? mu.cfg.tracks[id])).arrayBuffer();
      const buf = await ctx.decodeAudioData(arr); const sr = buf.sampleRate, L = buf.getChannelData(0), Rr = buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0);
      const hop = Math.round(sr * 0.01), nF = Math.floor(L.length / hop);
      const rms = new Float32Array(nF); for (let f = 0; f < nF; f++) { let a = 0; for (let i = f * hop; i < (f + 1) * hop; i++) { const v = (L[i] + Rr[i]) / 2; a += v * v; } rms[f] = Math.sqrt(a / hop); }
      const onset = new Float32Array(nF); for (let f = 1; f < nF; f++) onset[f] = Math.max(0, rms[f] - rms[f - 1]);
      // tempo
      const acs = []; for (let lag = Math.round(6000 / 180); lag <= Math.round(6000 / 70); lag++) { let ac = 0; for (let f = 0; f + lag < nF; f++) ac += onset[f] * onset[f + lag]; acs.push([lag, ac]); }
      // candidatos de tempo (máximos locales de la autocorrelación) en orden de fuerza: se usa el primero que admite una costura
      // con nivel continuo (|Δ| ≤ 1,5 dB en 250 ms, margen frente al ±3 medido tras hornear); el siguiente candidato solo entra si el más fuerte no la admite
      const peaksAc = acs.filter((x, i) => i > 0 && i < acs.length - 1 && x[1] >= acs[i - 1][1] && x[1] >= acs[i + 1][1]).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
      const dur = L.length / sr, W = 60; // 0,6 s de comparación
      const corr = (a0, b0) => { let s = 0, sa = 0, sb = 0; for (let k = 0; k < W; k++) { const a = onset[a0 + k] ?? 0, b = onset[b0 + k] ?? 0; s += a * b; sa += a * a; sb += b * b; } const env = Math.abs((rms[a0] ?? 0) - (rms[b0] ?? 0)); return s / Math.sqrt(sa * sb + 1e-12) - env * 4; };
      // nivel en 250 ms: lo que suena antes del fin debe continuar con lo que sigue al inicio (la unión salta de e a s)
      const lvl = (f0, n) => { let a = 0; for (let k = 0; k < n; k++) a += (rms[f0 + k] ?? 0) ** 2; return 10 * Math.log10(a / n + 1e-12); };
      // candidatos puntuados por envolvente; los 40 mejores se hornean con bakeLoop y se miden en PCM estéreo (lo mismo que
      // comprueba el informe), y gana el primero (por puntuación) que pasa salto y nivel
      const xfade = 0.06; const cands = [];
      for (const lag of peaksAc) { const bt = lag / 100, br = bt * 4; const c0 = cands.length;
        for (let s0 = 0.4; s0 <= 8.0; s0 += 0.01) for (let N = 2; N <= 16; N++) {
          const e = s0 + N * br; if (e > dur - 0.9 || e < dur * 0.45) continue;
          const fs0 = Math.round(s0 * 100), fe = Math.round(e * 100);
          const dLvl = Math.abs(lvl(fe - 25, 25) - lvl(fs0, 25)); if (dLvl > 2) continue;
          cands.push({ start: +s0.toFixed(3), end: +e.toFixed(3), bars: N, score: +(corr(fs0, fe) - 0.6 * dLvl - 0.5 * (rms[fs0] + rms[fe])).toFixed(3), bpm: 60 / bt });
        }
        if (cands.length > c0) break;   // el tempo más fuerte con candidatos manda
      }
      cands.sort((a, b) => b.score - a.score);
      const measure = (c) => {
        const looped = bakeLoop(ctx, buf, c.start, c.end, xfade), n = looped.length, chs = [0, looped.numberOfChannels > 1 ? 1 : 0].map((k) => looped.getChannelData(k));
        const LL = chs[0]; const jumps = []; for (let i = 1; i < n; i += 7) jumps.push(Math.abs(LL[i] - LL[i - 1])); jumps.sort((a, b) => a - b); const p99 = jumps[Math.floor(jumps.length * 0.99)];
        const seamJump = Math.max(...chs.map((C) => Math.abs(C[0] - C[n - 1])));
        const rmsAt = (a, len) => { let s = 0; for (const C of chs) for (let i = 0; i < len; i++) { const v = C[(a + i + n) % n]; s += v * v; } return Math.sqrt(s / (len * chs.length)); };
        const w = Math.round(sr * 0.25), before = rmsAt(n - w, w), after = rmsAt(0, w);
        return { loopS: +(n / sr).toFixed(3), seamJump: +seamJump.toFixed(4), p99Jump: +p99.toFixed(4), seamRmsDb: +(20 * Math.log10((after + 1e-9) / (before + 1e-9))).toFixed(2) };
      };
      let best = null, m = null, tried = 0;
      for (const c of cands.slice(0, 40)) { tried++; const mm = measure(c); if (mm.seamJump <= mm.p99Jump * 1.5 && Math.abs(mm.seamRmsDb) <= 2.5) { best = c; m = mm; break; } if (!best) { best = c; m = mm; } }
      const bpm = best.bpm; delete best.bpm;
      out[id] = { durS: +dur.toFixed(2), bpm: +bpm.toFixed(1), ...best, xfade, ...m, tried, candidates: cands.length };
    }
    return out;
  });
  R.data.loops = res;
  for (const [id, v] of Object.entries(res)) {
    R.check(v.seamJump <= v.p99Jump * 1.5, `${id}: sin chasquido en la costura (salto PCM ≤ 1,5 × p99 del tema)`, 'static', v);
    R.check(Math.abs(v.seamRmsDb) <= 3, `${id}: nivel continuo a ambos lados de la costura (±3 dB en 250 ms)`, 'static', v);
    R.check(v.bars >= 2, `${id}: bucle de ${v.bars} compases a ${v.bpm} BPM (no corta a mitad de compás)`, 'static', v);
  }
  if (APPLY) {
    const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
    cfg.audio.loops = Object.fromEntries(Object.entries(res).filter(([id]) => id !== 'secrenovio_preview').map(([id, v]) => [id, { start: v.start, end: v.end, xfade: v.xfade }]));
    fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2) + '\n'); R.note({ applied: cfg.audio.loops });
  }
  R.note('Costura MEDIDA (PCM/RMS); la escucha de los bucles queda pendiente.');
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
