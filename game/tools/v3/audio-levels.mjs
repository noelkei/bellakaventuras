// AUD-03: nivel entre canciones con la MISMA cadena del juego (renderState offline). Para cada tema: estados exteriores
// 0/4…4/4 y el central, mismo fragmento; RMS y pico (dBFS). Recorte propuesto = objetivo − nivel del estado limpio 4/4
// (objetivo absoluto --target, por defecto −14 dBFS RMS, sobre la media de estados exteriores). Con --apply escribe audio.trims en public/game-config.json y vuelve a medir.
// Comprueba banda ±2 dB entre temas en cada estado comparable, pico <−1 dBFS y suma de dos temas (frontera) sin clip.
// «Balance medido» no es «escucha aprobada»: la aprobación musical queda pendiente.
//   node tools/v3/audio-levels.mjs [--apply] [--offset 8] [--seconds 8] → captures/v3/P4/AUD-03/levels.json (+ WAV fuera de public)
import fs from 'node:fs';
import path from 'node:path';
import { Report, launch, openGame, GAME } from './lib.mjs';

const args = process.argv.slice(2), arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const APPLY = args.includes('--apply'), offset = +arg('--offset', 8), seconds = +arg('--seconds', 8);
const CFG = path.join(GAME, 'public', 'game-config.json');
const R = new Report('P4/AUD-03', 'levels', { method: `renderState (cadena del juego) offline 22,05 kHz, fragmento ${offset}–${offset + seconds} s; RMS/pico estéreo`, offset, seconds });
const measure = async () => {
  const browser = await launch();
  const page = await openGame(browser, R, { save: null });
  const res = await page.evaluate(async ({ offset, seconds }) => {
    const g = window.__bk; g.audio.unlock(); const mu = g.audio.music, P = mu.params, out = {};
    const db = (x) => +(20 * Math.log10(Math.max(1e-9, x))).toFixed(2);
    const mixes = {};
    for (const id of mu.tracks.keys()) {
      await mu.ensure(id); const t = mu.tracks.get(id); const trim = mu.cfg.trims?.[id] ?? 0, pre = mu.cfg.trimsPre?.[id] ?? 0;
      out[id] = { trim, pre, states: {} };
      for (const r of [0, 0.25, 0.5, 0.75, 1, -1]) {
        const x = await window.__bkRenderState(t.buffer, P, r, offset, seconds, 22050, trim, pre);
        out[id].states[r === -1 ? 'central' : `${Math.round(r * 4)}/4`] = { rmsDb: db(x.rms), peakDb: db(x.peak) };
        if (r === 1) mixes[id] = x.buffer;
      }
    }
    // frontera: suma de dos temas limpios a −3 dB cada uno (cruce equipotencia), pico del peor par
    const ids = Object.keys(mixes); let worst = { a: null, b: null, peakDb: -99 };
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const A = mixes[ids[i]], B = mixes[ids[j]]; let pk = 0; const k = Math.SQRT1_2;
      for (let c = 0; c < 2; c++) { const a = A.getChannelData(c), b = B.getChannelData(c); for (let n = 0; n < a.length; n++) pk = Math.max(pk, Math.abs((a[n] + b[n]) * k)); }
      if (db(pk) > worst.peakDb) worst = { a: ids[i], b: ids[j], peakDb: db(pk) };
    }
    return { out, worst };
  }, { offset, seconds });
  await browser.close();
  return res;
};

try {
  let m = await measure();
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  // recortes: post (lineal tras la saturación) a un objetivo absoluto sobre la media PONDERADA de estados (4/4 cuenta triple);
  // si el post necesario lleva el pico por encima de −1,5 dBFS, el exceso pasa a pre (antes de la saturación, que comprime
  // los picos) y se itera midiendo. Escribe audio.trims / audio.trimsPre.
  const target = +arg('--target', -14);
  const W = { '0/4': 1, '1/4': 1, '2/4': 1, '3/4': 1, '4/4': 3, central: 1 }, Wsum = 8;
  // el estado central solo lo usa SECRENOVIO (game.ts: levels.secrenovio = −1 antes del final): no cuenta para los demás
  const wmean = (v, id) => { const ww = { ...W, central: id === 'secrenovio' ? 1 : 0 }; const tot = Object.values(ww).reduce((a, b) => a + b, 0); return Object.entries(ww).reduce((a, [k, w]) => a + v.states[k].rmsDb * w, 0) / tot; };
  const peakOf = (v) => Math.max(...Object.values(v.states).map((x) => x.peakDb));
  let trims = {}, pre = {};
  for (const [id, v] of Object.entries(m.out)) { trims[id] = v.trim; pre[id] = v.pre; }
  R.data.target = target;
  const iters = APPLY ? 6 : 1;
  for (let it = 0; it < iters; it++) {
    for (const [id, v] of Object.entries(m.out)) {
      const need = target - wmean(v, id);                       // dB que faltan (post lineal)
      const room = -1.5 - peakOf(v);                        // dB de margen de pico con la configuración actual
      if (need <= room) trims[id] = +(v.trim + need).toFixed(1);
      else { trims[id] = +(v.trim + room).toFixed(1); pre[id] = +(v.pre + (need - room) * 0.8).toFixed(1); }
    }
    if (!APPLY) break;
    const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
    cfg.audio.trims = trims; cfg.audio.trimsPre = Object.fromEntries(Object.entries(pre).filter(([, x]) => x !== 0));
    fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2) + '\n');
    m = await measure();
  }
  R.data.trims = trims; R.data.trimsPre = pre; R.data.after = m;
  const states = ['0/4', '1/4', '2/4', '3/4', '4/4'];
  for (const st of states) {
    const vals = Object.values(m.out).map((v) => v.states[st].rmsDb), spread = Math.max(...vals) - Math.min(...vals);
    const med = median(vals), dev = Math.max(...vals.map((x) => Math.abs(x - med)));
    R.check(dev <= 2.0, `${st}: los seis temas a ±2 dB de su mediana (${APPLY ? 'con' : 'sin'} recortes)`, 'static', { medianDb: med, maxDevDb: +dev.toFixed(2), spreadDb: +spread.toFixed(2), byTrack: Object.fromEntries(Object.entries(m.out).map(([id, v]) => [id, v.states[st].rmsDb])) });
  }
  { const ext = Object.values(m.out).map((v) => v.states['4/4'].rmsDb), med = median(ext), c = m.out.secrenovio.states.central.rmsDb;
    R.check(Math.abs(c - med) <= 2, 'central (solo SECRENOVIO antes del triple): a ±2 dB del nivel típico exterior 4/4', 'static', { centralDb: c, exterior44MedianDb: med, devDb: +(c - med).toFixed(2) }); }
  const peaks = Object.entries(m.out).map(([id, v]) => [id, Math.max(...Object.values(v.states).map((s) => s.peakDb))]);
  R.check(peaks.every(([, p]) => p < -1), 'pico de cada tema y estado por debajo de −1 dBFS', 'static', Object.fromEntries(peaks));
  R.check(m.worst.peakDb < -0.5, 'frontera: suma de dos temas limpios sin recorte (pico < −0,5 dBFS)', 'static', m.worst);
  R.note('Balance MEDIDO; la escucha/aprobación musical de los cortes y niveles queda pendiente (no se declara que «suena bien»).');
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { R.finish(); }
