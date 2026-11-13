// T5-25 · Encuadre equivalente APROXIMADO cuando la referencia no es proyección de la geometría actual (V4 MAP-02/NMG-02:
// mapa compactado y cluster replanteado/espejado). Barre el azimut (paso 5°) alrededor del centro del cluster con pitch y
// distancia dados y, para cada uno, mide cuánto se parece la DISPOSICIÓN en pantalla de las piezas a la referencia tras la
// mejor semejanza 2D (escala + traslación, sin rotación). Devuelve los mejores azimuts y su RMS (en % de la imagen).
// Uso: node camsweep.mjs <json camfit> <pitchDeg> <dist> [espejo]
import fs from 'node:fs';
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const pitch = -Math.abs(+process.argv[3]) * Math.PI / 180, dist = +process.argv[4], mirror = process.argv[5] === 'espejo';
const pts = cfg.pts.map((p) => [p[0], p[1], p[2], mirror ? 1 - p[3] : p[3], p[4], p[5]]);
const cen = pts.reduce((a, p) => a.map((v, i) => v + p[i] / pts.length), [0, 0, 0]);
const out = [];
for (let a = 0; a < 360; a += 5) {
  const yaw = a * Math.PI / 180; // la cámara mira con este rumbo (atan2(x,z)); se coloca detrás
  const f = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)], cp = [cen[0] - f[0] * dist, cen[1] - f[1] * dist, cen[2] - f[2] * dist];
  const r = [Math.cos(yaw), 0, -Math.sin(yaw)], u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const P = pts.map((p) => { const d = [p[0] - cp[0], p[1] - cp[1], p[2] - cp[2]]; const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2]; return [-(d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / z, -(d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / z]; });
  // semejanza 2D (s, tx, ty) por mínimos cuadrados: q ≈ s·P + t (y escalado por aspecto)
  const Q = pts.map((p) => [p[3] * cfg.aspect, p[4]]);
  const mP = P.reduce((a, p) => [a[0] + p[0] / P.length, a[1] + p[1] / P.length], [0, 0]), mQ = Q.reduce((a, p) => [a[0] + p[0] / Q.length, a[1] + p[1] / Q.length], [0, 0]);
  let num = 0, den = 0; P.forEach((p, i) => { num += (p[0] - mP[0]) * (Q[i][0] - mQ[0]) + (p[1] - mP[1]) * (Q[i][1] - mQ[1]); den += (p[0] - mP[0]) ** 2 + (p[1] - mP[1]) ** 2; });
  const s = num / den; if (s <= 0) continue;
  const err = P.map((p, i) => Math.hypot(s * (p[0] - mP[0]) + mQ[0] - Q[i][0], s * (p[1] - mP[1]) + mQ[1] - Q[i][1]));
  out.push({ azimutDeg: a, rmsPct: +(Math.sqrt(err.reduce((x, e) => x + e * e, 0) / err.length) * 100).toFixed(2), pos: cp.map((v) => +v.toFixed(2)), target: cen.map((v) => +v.toFixed(2)), perPoint: err.map((e, i) => [pts[i][5], +(e * 100).toFixed(1)]) });
}
out.sort((a, b) => a.rmsPct - b.rmsPct);
console.log(JSON.stringify({ mirror, pitchDeg: +process.argv[3], dist, best: out.slice(0, 3) }, null, 1));
