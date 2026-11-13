// T5-25 · Ajuste de cámara a una referencia (encuadre equivalente medido, no a ojo): dados puntos del mundo del juego y su
// posición marcada a mano en la imagen de referencia (fracción 0–1), busca posición, yaw, pitch y FOV vertical de una cámara
// perspectiva (aspecto de la imagen) que minimizan el error de reproyección (Nelder–Mead con varios arranques). Salida: pose y
// residuo por punto (en % de la imagen). Uso: node camfit.mjs <json con {aspect, pts:[[x,y,z,u,v,etiqueta]], guess?}>
import fs from 'node:fs';
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (process.argv[3] != null) cfg.pts = cfg.pts.filter((_, i) => !process.argv[3].split(',').map(Number).includes(i));   // puntos excluidos
const proj = (p, [cx, cy, cz, yaw, pitch, vfov]) => {
  const dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz;
  // marco de cámara: forward = (sin yaw cos pitch, sin pitch, cos yaw cos pitch); pitch < 0 mira hacia abajo
  const f = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const r = [Math.cos(yaw), 0, -Math.sin(yaw)];           // derecha (y arriba = r × f)
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < 0.1) return null;
  const xc = dx * r[0] + dy * r[1] + dz * r[2], yc = dx * u[0] + dy * u[1] + dz * u[2];
  const t = Math.tan(vfov / 2);
  return [0.5 - xc / (zc * t * cfg.aspect) / 2, 0.5 - yc / (zc * t) / 2];
};
const cost = (x) => { let s = 0; for (const p of cfg.pts) { const q = proj(p, x); if (!q) return 1e9; s += (q[0] - p[3]) ** 2 + (q[1] - p[4]) ** 2; } if (x[5] < 0.15 || x[5] > 1.6) s += 10; if (x[1] < 2) s += 10 + (2 - x[1]); if (x[4] > -0.05 || x[4] < -1.5) s += 10; return s; };   // por encima del suelo y mirando hacia abajo
function nm(x0, step, it = 4000) {
  const n = x0.length; let S = [x0, ...x0.map((_, i) => x0.map((v, j) => v + (i === j ? step[i] : 0)))]; let F = S.map(cost);
  for (let k = 0; k < it; k++) {
    const o = F.map((f, i) => [f, i]).sort((a, b) => a[0] - b[0]).map((a) => a[1]); S = o.map((i) => S[i]); F = o.map((i) => F[i]);
    const c = S.slice(0, n).reduce((a, s) => a.map((v, i) => v + s[i] / n), Array(n).fill(0));
    const xr = c.map((v, i) => v + (v - S[n][i])), fr = cost(xr);
    if (fr < F[0]) { const xe = c.map((v, i) => v + 2 * (v - S[n][i])), fe = cost(xe); if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; } }
    else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
    else { const xc = c.map((v, i) => v + 0.5 * (S[n][i] - v)), fc = cost(xc); if (fc < F[n]) { S[n] = xc; F[n] = fc; } else { for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, j) => S[0][j] + 0.5 * (v - S[0][j])); F[i] = cost(S[i]); } } }
  }
  const i = F.indexOf(Math.min(...F)); return [S[i], F[i]];
}
let best = null;
const cen = cfg.pts.reduce((a, p) => a.map((v, i) => v + p[i] / cfg.pts.length), [0, 0, 0]);
for (let a = 0; a < 16; a++) for (const dist of [15, 30, 50]) for (const h of [8, 20, 35]) {
  const yaw = a * Math.PI / 8, x0 = [cen[0] - Math.sin(yaw) * dist, h, cen[2] - Math.cos(yaw) * dist, yaw, -Math.atan2(h, dist), 0.8];
  const [x, f] = nm(x0, [3, 3, 3, 0.3, 0.2, 0.2]); if (!best || f < best[1]) best = [x, f];
}
const [x, f] = nm(best[0], [0.5, 0.5, 0.5, 0.05, 0.05, 0.05], 8000);
const res = cfg.pts.map((p) => { const q = proj(p, x); return { label: p[5], ref: [p[3], p[4]], fit: q.map((v) => +v.toFixed(3)), errPct: +(Math.hypot(q[0] - p[3], (q[1] - p[4]) / cfg.aspect) * 100).toFixed(2) }; });
const tgt = [x[0] + Math.sin(x[3]) * Math.cos(x[4]) * 10, x[1] + Math.sin(x[4]) * 10, x[2] + Math.cos(x[3]) * Math.cos(x[4]) * 10];
const vfovDeg = x[5] * 180 / Math.PI, hfovDeg = 2 * Math.atan(Math.tan(x[5] / 2) * cfg.aspect) * 180 / Math.PI;
console.log(JSON.stringify({ pos: x.slice(0, 3).map((v) => +v.toFixed(2)), target: tgt.map((v) => +v.toFixed(2)), yawDeg: +(x[3] * 180 / Math.PI).toFixed(1), pitchDeg: +(x[4] * 180 / Math.PI).toFixed(1), vfovDeg: +vfovDeg.toFixed(1), hfovDeg: +hfovDeg.toFixed(1), rmsPct: +(Math.sqrt(f / cfg.pts.length) * 100).toFixed(2), res }, null, 1));
