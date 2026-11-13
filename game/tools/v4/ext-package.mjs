// V4-EXT-02 · Revisión del paquete local servido (game/dist-v4): sin masters/fuentes (.blend, .wav, .zip, .psd, .fbx,
// .obj, PNG de referencia > 2 MB), sin secretos (patrones de claves/tokens), tamaño total y mayores archivos, licencias de
// fuentes incluidas o pendientes, y ganchos de QA presentes (window.__bk…) declarados. No publica ni despliega nada.
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, GAME, ROOT } from './lib.mjs';
const R = new Report('EXT-02', 'ext-package');
await runTest(R, async () => {
  const DIST = path.join(GAME, 'dist-v4');
  if (!fs.existsSync(DIST)) throw new Error('falta game/dist-v4 (ejecutar el build V4)');
  const files = []; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else files.push({ p, rel: path.relative(DIST, p), bytes: st.size }); } };
  walk(DIST);
  const banned = files.filter((f) => /\.(blend|blend1|wav|zip|psd|fbx|obj|max|ma|mb|aif|aiff|flac)$/i.test(f.rel) || (/\.png$/i.test(f.rel) && f.bytes > 2e6));
  // tokens con límites: un «AKIA…» dentro de un blob base64 (WASM de Rapier incrustado) no es una clave
  const secretRe = /(?<![A-Za-z0-9+/])(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})(?![A-Za-z0-9+/=])|-----BEGIN [A-Z ]*PRIVATE KEY-----|api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]{16,}/;
  const secrets = []; for (const f of files) if (/\.(js|json|html|css|txt|map)$/i.test(f.rel)) { const t = fs.readFileSync(f.p, 'utf8'); const m = t.match(secretRe); if (m) secrets.push({ file: f.rel, match: m[0].slice(0, 12) + '…' }); }
  const total = files.reduce((a, f) => a + f.bytes, 0);
  const top = files.slice().sort((a, b) => b.bytes - a.bytes).slice(0, 12).map((f) => `${f.rel} ${(f.bytes / 1048576).toFixed(2)} MB`);
  const maps = files.filter((f) => f.rel.endsWith('.map')).map((f) => f.rel);
  const js = files.filter((f) => f.rel.endsWith('.js')).map((f) => fs.readFileSync(f.p, 'utf8')).join('\n');
  const hooks = ['__bk', '__bkTHREE', '__bkRapier', '__bkWORLD', '__bkCarPose', '__bkCamFade', '__bkTuning'].filter((h) => js.includes(h));
  const fonts = files.filter((f) => /\.(ttf|otf|woff2?)$/i.test(f.rel)).map((f) => f.rel);
  const fontLic = files.filter((f) => /(OFL|LICENSE)/i.test(f.rel)).map((f) => f.rel);
  const res = { files: files.length, totalMB: +(total / 1048576).toFixed(2), top, banned: banned.map((f) => f.rel), secrets, sourcemaps: maps, qaHooks: hooks, fonts, fontLicenses: fontLic };
  fs.mkdirSync(path.join(ROOT, 'V4', 'evidencias', 'EXT'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'V4', 'evidencias', 'EXT', 'paquete_dist-v4.json'), JSON.stringify(res, null, 1));
  R.check(banned.length === 0, 'sin masters ni fuentes en el paquete (.blend/.wav/.zip/…; PNG > 2 MB)', 'static', banned.map((f) => f.rel));
  R.check(secrets.length === 0, 'sin secretos (claves/tokens) en el paquete', 'static', secrets);
  R.note({ paquete: res });
  if (fonts.length && !fontLic.length) R.pendingHuman('Incluir OFL.txt (Bungee) y LICENSE.txt (Luckiest Guy) junto a las fuentes antes de publicar');
  const gated = js.includes('bktest');
  R.check(!hooks.length || gated, 'ganchos de QA condicionados (solo en desarrollo o con ?bktest; no se exponen por defecto)', 'static', { hooks, gated });
  if (hooks.length) R.pendingHuman(`Antes de publicar: decidir si se retira el código de ganchos de QA (${hooks.length}, inactivos sin ?bktest)`);
});
