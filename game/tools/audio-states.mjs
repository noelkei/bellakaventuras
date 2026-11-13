// Render offline reproducible de los cinco estados de restauración (0/4…4/4) de cada canción, con la MISMA cadena del
// juego. Mide RMS y exporta WAV de escucha (no se publican) en captures/audio-states/.
//   node tools/audio-states.mjs [--url http://localhost:5173/] [--offset 10] [--seconds 6] [--params '{"inBroken":0.4}']
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'captures', 'audio-states');
const args = process.argv.slice(2); const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const url = arg('--url', 'http://localhost:5173/'), offset = +arg('--offset', 10), seconds = +arg('--seconds', 6), extra = JSON.parse(arg('--params', '{}'));
const wav = !args.includes('--no-wav');
fs.mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.goto(url, { waitUntil: 'load' });
await p.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
const res = await p.evaluate(async (offset, seconds, extra, wav) => {
  const g = window.__bk; g.audio.unlock(); const mu = g.audio.music;
  const P = { ...mu.params, ...extra };
  const toWav = (buf) => { const n = buf.length, ch = 2, sr = buf.sampleRate, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
    out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const L = buf.getChannelData(0), R = buf.getChannelData(1); let o = 44;
    for (let i = 0; i < n; i++) { for (const v of [L[i], R[i]]) { out.setInt16(o, Math.max(-1, Math.min(1, v)) * 32767, true); o += 2; } }
    let s = ''; const bytes = new Uint8Array(out.buffer); for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const out = {};
  for (const id of mu.tracks.keys()) {
    await mu.ensure(id); const t = mu.tracks.get(id);
    out[id] = [];
    for (let k = 0; k <= 4; k++) {
      const r = await window.__bkRenderState(t.buffer, P, k / 4, offset, seconds);
      out[id].push({ level: k, rms: +r.rms.toFixed(4), wav: wav ? toWav(r.buffer) : null });
    }
    t.buffer = null; // liberar
  }
  return out;
}, offset, seconds, extra, wav);
await b.close();
const table = {};
for (const [id, states] of Object.entries(res)) {
  table[id] = states.map((s) => s.rms);
  if (wav) states.forEach((s) => fs.writeFileSync(path.join(OUT, `${id}_${s.level}de4.wav`), Buffer.from(s.wav, 'base64')));
  const clean = states[4].rms;
  console.log(id.padEnd(15), states.map((s) => `${s.level}/4 ${s.rms.toFixed(3)} (${(20 * Math.log10(s.rms / clean)).toFixed(1)} dB)`).join('  '));
}
fs.writeFileSync(path.join(OUT, 'levels.json'), JSON.stringify({ offset, seconds, params: extra, rms: table }, null, 1));
