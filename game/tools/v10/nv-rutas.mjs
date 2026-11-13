// V10 IT2 · nv-rutas · plan 20 N-04, N-06 y §3 (`nv-rutas.mjs`: E1 a pie, B1 en tabla, T1 agachada, R1, G1). Recorridos con TECLAS REALES
// en la simulación determinista del juego (`r11/f5-lib.mjs`); colocación inicial = fixture. Marco local de NVDA con el eje del sector que da
// el juego (`__bkSectors`): x tangencial, y radial, h altura (contrato `nvda_kit.json`).
//  · E1 a pie: desde el suelo delante de la escalinata, W mantenida → sube los 19 peldaños y llega a la cota 3,40 (M1/P1), sin recolocación.
//  · B1 en tabla: desde M2 (3,40) hacia la bajada, sin empujar → baja el perfil coseno hasta el suelo sin bote (≤ 0,1 s seguidos en el aire
//    dentro de B1) y sin caída.
//  · T1: de pie, andando contra la boca → no pasa (gálibo 1,25); en tabla AGACHADA (C mantenida) a 4 m/s → la atraviesa sin estrella ni
//    caída.
//  · R1 en tabla a 6 m/s: sube el funbox (cota ≥ 0,6) y lo pasa sin estrella ni caída (se mide hasta antes de T1).
//  · G1: en tabla a 3 m/s por la boca abierta (−x) → entra sin estrella ni caída.
//  · (IT2b) bajo el puente P1 a pie hasta el pilar; y en TODOS los recorridos la cámara nunca está dentro de un sólido ni deja a ANMI tapada
//    más de 0,2 s seguidos.
// Uso: node tools/v10/nv-rutas.mjs --url v10 --task V10-IT2 --label final
import fs from 'node:fs';
import { Report, runTest } from '../v8/lib.mjs';
import { launch, abrir, run } from '../v8/r11/f5-lib.mjs';
const R = new Report('nv-rutas');
const K = JSON.parse(fs.readFileSync('/Users/TU_USUARIO/Desktop/Bellakaventuras/assets/derived/v10/nvda/nvda_kit.json', 'utf8'));
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await abrir(b, R);
    const A = await page.evaluate(() => window.__bkSectors.find((q) => q.id === 'nosvamosdeaqui').axis * Math.PI / 180), c = Math.cos(A), s = Math.sin(A);
    const W = (x, y, h = 0) => [x * c + y * s, h, x * s - y * c], HD = (dx, dy) => Math.atan2(dx * c + dy * s, dx * s - dy * c);
    // en página: coordenadas locales del pie (x, y) con el mismo marco
    const LOC = `const lx = s.footPos.x * ${c} + s.footPos.z * ${s}, ly = s.footPos.x * ${s} - s.footPos.z * ${c};`;
    // cámara en cada paso (como vert-camara): dentro de un sólido (sin sensores, NPC, ignorados por la cámara ni piezas finas) y racha de
    // pasos con el rayo cámara→pecho cortado por geometría sólida
    const CAM = `{ const RA = window.__bkRapier, c = g.rig.cam.position, ok = (h) => { const q = g.world.getCollider(h); return q && !q.isSensor() && !g.npcColliders.has(h) && !g.park.cameraIgnore.has(h) && !g.park.b.thin.has(h) && h !== s.collider.handle; };
      let dentro = null; g.world.intersectionsWithPoint({ x: c.x, y: c.y, z: c.z }, (col) => { if (ok(col.handle)) { dentro = g.park.colliderName(col.handle) ?? '#'; return false; } return true; });
      if (dentro) { M.camIn = (M.camIn || 0) + 1; M.camInN ??= dentro; }
      const p = { x: s.footPos.x, y: s.footPos.y + 1.1, z: s.footPos.z }, d = { x: p.x - c.x, y: p.y - c.y, z: p.z - c.z }, L = Math.hypot(d.x, d.y, d.z);
      const h = L > 0.3 ? g.world.castRay(new RA.Ray({ x: c.x, y: c.y, z: c.z }, { x: d.x / L, y: d.y / L, z: d.z / L }), L - 0.25, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider, undefined, (q) => ok(q.handle)) : null;
      M.tap = h ? (M.tap || 0) + 1 : 0; M.tapMax = Math.max(M.tapMax || 0, M.tap); if (h) M.tapN ??= g.park.colliderName(h.collider.handle); }`;
    const MAL = "if (s.loco === 'impact') M.imp = 1; if (s.loco === 'bail') M.bail = 1; " + CAM;
    const camOk = (r, tag, k) => R.check(!r.camIn && (r.tapMax ?? 0) <= 12, `#${k} ${tag}: cámara fuera de sólidos (${r.camIn ?? 0} pasos dentro${r.camInN ? ' de ' + r.camInN : ''}) y ANMI sin tapar más de 0,2 s (racha ${r.tapMax ?? 0}${r.tapN ? ', ' + r.tapN : ''})`, 'vision', { end: r.end });
    R.fixture(`marco de NVDA: eje ${(A * 180 / Math.PI).toFixed(1)}°`, {});
    for (let k = 1; k <= 2; k++) {
      // ---------------------------------------------------------------- E1 a pie
      { const [x0, x1, y0] = K.E1.box, r = await run(page, { p: W((x0 + x1) / 2, y0 - 1.2, 0.02), h: HD(0, 1), loco: 'walk', sec: 7, pre: "key('KeyW', true)",
          script: `${LOC} M.ymax = Math.max(M.ymax ?? -9, s.footPos.y); M.ly = ly; ${MAL}` });
        R.check(r.ymax > K.E1.level - 0.1 && r.ly > K.E1.box[3] - 0.2 && r.respawns === 0 && !r.bail, `#${k} E1 a pie con W: sube la escalinata hasta la cota ${K.E1.level} (máx. ${r.ymax.toFixed(2)}; y local ${r.ly.toFixed(2)}), sin recolocación`, 'input', { end: r.end, respawns: r.respawns }); camOk(r, 'E1 a pie', k); }
      // ---------------------------------------------------------------- B1 en tabla desde M2
      { const [x0, x1, y0, y1] = K.B1.box, r = await run(page, { p: W((x0 + x1) / 2, y1 + 0.9, K.M2.level + 0.02), h: HD(0, -1), v: 1.5, loco: 'ride', sec: 5,
          script: `${LOC} if (ly < ${y1} && ly > ${y0}) { M.aire = s.grounded ? 0 : (M.aire || 0) + 1; M.aireMax = Math.max(M.aireMax || 0, M.aire); } M.ymin = Math.min(M.ymin ?? 9, s.footPos.y); M.ly = ly; ${MAL}` });
        const aire = +((r.aireMax ?? 0) / 60).toFixed(2);
        R.check(r.ly < y0 && r.ymin < 0.1 && aire <= 0.1 && !r.bail && !r.imp, `#${k} B1 en tabla desde M2: baja el perfil hasta el suelo (y local ${r.ly.toFixed(2)}; cota mín. ${r.ymin.toFixed(2)}) sin bote (aire seguido ${aire} s ≤ 0,1) ni caída`, 'input', { end: r.end, ev: r.ev.slice(0, 6) }); camOk(r, 'B1 en tabla', k); }
      // ---------------------------------------------------------------- T1 de pie (no cabe) y agachada en tabla (pasa)
      { const [x0, x1, y0, y1] = K.T1.box, ym = (y0 + y1) / 2;
        const pie = await run(page, { p: W(x0 - 1.5, ym, 0.02), h: HD(1, 0), loco: 'walk', sec: 3, pre: "key('KeyW', true)", script: `${LOC} M.lxMax = Math.max(M.lxMax ?? -99, lx);` });
        R.check(pie.lxMax < x0 + 0.3, `#${k} T1 de pie: andando contra la boca no entra (x local máx. ${pie.lxMax.toFixed(2)} < ${(x0 + 0.3).toFixed(2)})`, 'input', { end: pie.end });
        const ag = await run(page, { p: W(x0 - 2.5, ym, 0.02), h: HD(1, 0), v: 4, loco: 'ride', sec: 3, pre: "key('KeyC', true); key('KeyW', true)",
          script: `${LOC} M.lxMax = Math.max(M.lxMax ?? -99, lx); if (lx > ${x0} && lx < ${x1}) M.dentro = 1; ${MAL}` });
        R.check(ag.lxMax > x1 + 0.3 && !ag.imp && !ag.bail, `#${k} T1 en tabla agachada (C) a 4 m/s: atraviesa el paso (x local máx. ${ag.lxMax.toFixed(2)} > ${(x1 + 0.3).toFixed(2)}) sin estrella ni caída`, 'input', { end: ag.end, ev: ag.ev.slice(0, 6) }); camOk(ag, 'T1 agachada', k); }
      // ---------------------------------------------------------------- bajo el puente P1 (a pie, a lo largo, desde el extremo hasta el pilar C1)
      { const [x0, x1, y0, y1] = K.P1.box, ym = (y0 + y1) / 2, r = await run(page, { p: W(x1 - 0.6, ym, 0.02), h: HD(-1, 0), loco: 'walk', sec: 4, pre: "key('KeyW', true)",
          script: `${LOC} M.lxMin = Math.min(M.lxMin ?? 99, lx); ${MAL}` });
        R.check(r.lxMin < K.C1.box[1] + 0.9, `#${k} bajo el puente P1 a pie: se camina por debajo del tablero desde el extremo hasta el pilar C1 (que ocupa todo el fondo; x local mín. ${r.lxMin.toFixed(2)})`, 'input', { end: r.end });
        camOk(r, 'bajo el puente P1', k); }
      // ---------------------------------------------------------------- R1 a 6 m/s (hasta antes de T1)
      { const [x0, x1, y0, y1] = K.R1.box, ym = (y0 + y1) / 2;
        const r = await run(page, { p: W(x0 - 1.8, ym, 0.02), h: HD(1, 0), v: 6, loco: 'ride', sec: 2,   /* entre E1 (x ≤ −5) y R1 */
          script: `${LOC} if (lx < ${K.T1.box[0] - 0.8}) { M.ymax = Math.max(M.ymax ?? -9, s.footPos.y); M.lxMax = Math.max(M.lxMax ?? -99, lx); ${MAL} }` });
        R.check(r.ymax >= 0.6 && r.lxMax > x1 && !r.imp && !r.bail, `#${k} R1 en tabla a 6 m/s: sube el funbox (cota máx. ${r.ymax.toFixed(2)} ≥ 0,6) y lo pasa (x local ${r.lxMax.toFixed(2)} > ${x1.toFixed(2)}) sin estrella ni caída`, 'input', { end: r.end, ev: r.ev.slice(0, 6) }); camOk(r, 'R1', k); }
      // ---------------------------------------------------------------- G1 por la boca
      { const [cx, cy] = K.G1.center, r = await run(page, { p: W(cx - K.G1.r_out - 1.2, cy, 0.02), h: HD(1, 0), v: 3, loco: 'ride', sec: 2.5,
          script: `${LOC} M.d = Math.min(M.d ?? 99, Math.hypot(lx - ${cx}, ly - ${cy})); ${MAL}` });
        R.check(r.d < K.G1.r_in && !r.imp && !r.bail, `#${k} G1 en tabla a 3 m/s por la boca: entra en la herradura (a ${r.d.toFixed(2)} m del centro < ${K.G1.r_in}) sin estrella ni caída`, 'input', { end: r.end, ev: r.ev.slice(0, 6) }); }
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
