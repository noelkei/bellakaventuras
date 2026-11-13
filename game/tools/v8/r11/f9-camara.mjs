// R11 · F9 · cámara (2 repeticiones). «Visible» = píxeles de ANMI (pintada en magenta) en un render 256×160 desde la cámara del juego,
// frente al mismo render con solo ANMI visible: proporción 0–1.
//  CAM-01  de espaldas a los carteles de FASHION GIRL y TRA TRA TRA, quieta 1,5 s: ANMI se ve (≥ 50 %).
//  CAM-02  junto a los árboles del rincón NO y del borde E, quieta 1,5 s: ANMI se ve (≥ 40 %).
//  NMG-03  agachada en tabla dentro del túnel del circuito (V10: paso agachado T1 de NVDA): la cámara queda a ≥ 1,5 m de la cabeza (base 0,9–1,0 m).
//  CAM-04  de espaldas al muro de la plaza de TT: la cámara no queda casi cenital (≤ 45° sobre la horizontal vista desde la cabeza; base 53–54°).
//  NMG-10  charla con La Pantera desde el borde oeste del recuadro: la cabeza de ANMI dentro de la imagen (|x NDC| ≤ 0,95).
//  No empeorar: en llano abierto (NMG) cámara a ≥ 4 m y ANMI visible ≥ 90 %.
//   node tools/v8/r11/f9-camara.mjs --url pre --task R11 --label pre
import { Report, runTest } from '../lib.mjs';
import { launch, abrir, sleep, corona, giro } from './f5-lib.mjs';
const R = new Report('r11-f9-camara');
// en la página: coloca a ANMI, simula `sec` y mide; `oculta`: 'signs' | 'follaje' | null
const MEDIR = async ({ p, h, loco = 'walk', sec = 1.5, crouch = false, oculta = null, pre = '' }) => {
  const g = window.__bk, T = window.__bkTHREE, s = g.skater, key = window.__R11.key;
  window.__R11.releaseAll(); g.autoMode = true;
  s.teleport(new T.Vector3(p[0], p[1], p[2]), h, loco); s.vel.set(0, 0, 0); g.rig.snapBehind(s);
  if (crouch) key('KeyC', true);
  if (pre) new Function('g', 's', 'key', pre)(g, s, key);
  await g.simulate(sec);
  const cam = g.rig.cam, head = s.footPos.clone().add(new T.Vector3(0, s.isCrouched ? 1.0 : 1.5, 0));
  const out = { camDist: +cam.position.distanceTo(head).toFixed(2), elev: +(Math.atan2(cam.position.y - head.y, Math.hypot(cam.position.x - head.x, cam.position.z - head.z)) * 180 / Math.PI).toFixed(1) };
  const r = g.renderer, W = 256, H = 160, rt = new T.WebGLRenderTarget(W, H), mag = new T.MeshBasicMaterial({ color: 0xff00ff, toneMapped: false });
  const sw = []; g.visual.root.traverse((o) => { if (o.isMesh) { sw.push([o, o.material]); o.material = mag; } });
  const count = () => { r.setRenderTarget(rt); r.render(g.scene, cam); const px = new Uint8Array(W * H * 4); r.readRenderTargetPixels(rt, 0, 0, W, H, px); r.setRenderTarget(null); let n = 0; for (let i = 0; i < px.length; i += 4) if (px[i] > 200 && px[i + 1] < 90 && px[i + 2] > 200) n++; return n; };
  const n1 = count();
  // referencia: el mismo render con SOLO ANMI visible (todo lo demás oculto)
  const hid = [], mine = new Set(); g.visual.root.traverse((o) => mine.add(o));
  if (oculta) g.scene.traverse((o) => { if (o.isMesh && o.visible && !mine.has(o)) { hid.push(o); o.visible = false; } });
  const n0 = oculta ? count() : n1; for (const o of hid) o.visible = true; for (const [o, m] of sw) o.material = m; rt.dispose();
  const ndc = head.clone().project(cam);
  if (crouch) key('KeyC', false);
  return { ...out, n1, n0, vis: n0 ? +(n1 / n0).toFixed(2) : 0, ndcX: +ndc.x.toFixed(2), mode: g.mode };
};
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await abrir(b, R);
    await page.evaluate(() => { window.__bkCamFadeUniform?.value; });
    const medir = (o) => page.evaluate(`(${MEDIR.toString()})(${JSON.stringify(o)})`);
    await sleep(2500);   // GLB de props cargados
    // V10 (preparación): literales de V9 girados con la corona (+9°; las esquinas, r > 46, son el parque exterior y no giran). Cambio de
    // diseño aprobado: el túnel del circuito (NMG-03) desaparece con NOSVAMOSDEAQUÍ → paso agachado T1 (`nv.t1`, gálibo 1,25), en su
    // centro y mirando a lo largo del paso
    const G = giro(await corona(page));
    const TUN = G.rot ? await page.evaluate(() => { const bx = window.__bk.park.boxes.get('nv.t1'); return { p: [bx.c.x, 0.02, bx.c.z], h: Math.atan2(Math.cos(bx.yaw), -Math.sin(bx.yaw)) }; }) : { p: [-17.49, 0.02, -22.38], h: 0.663 };
    for (let k = 1; k <= 2; k++) {
      for (const [tag, p, h] of [['FG', [24.52, 0.02, -5.22], -0.07], ['TT', [-12.71, 0.02, 23.07], 0.41]]) {
        const r = await medir({ p: G.P(p), h: G.H(h), oculta: 'signs' });
        if (r.n0 < 50) R.invalid(`#${k} CAM-01 ${tag}: ANMI no aparece ni sin el cartel (${r.n0} px)`, r);
        else R.check(r.vis >= 0.5, `#${k} CAM-01 cartel de ${tag}: de espaldas al tablero ANMI se ve (${Math.round(r.vis * 100)} % de sus píxeles)`, 'vision', r);
      }
      for (const [tag, p, h] of [['rincón NO', [-49.17, 0.02, -39.76], 1.085], ['borde E', [49.29, 0.02, 7.0], -0.615]]) {
        const r = await medir({ p: G.P(p), h: G.P(p)[0] === p[0] ? h : G.H(h), oculta: 'follaje' });
        if (r.n0 < 50) R.invalid(`#${k} CAM-02 ${tag}: ANMI no aparece ni sin follaje (${r.n0} px)`, r);
        else R.check(r.vis >= 0.4, `#${k} CAM-02 árbol del ${tag}: ANMI se ve a través de la copa (${Math.round(r.vis * 100)} % de sus píxeles)`, 'vision', r);
      }
      { const r = await medir({ p: TUN.p, h: TUN.h, loco: 'ride', crouch: true, sec: 1.5 });
        R.check(r.camDist >= 1.5, `#${k} NMG-03 dentro del túnel, agachada: cámara a ${r.camDist} m de la cabeza (≥ 1,5)`, 'input', r); }
      { const r = await medir({ p: G.P([-3.92, 0.02, 31.8]), h: G.H(3.02), sec: 2 });
        R.check(r.elev <= 45 && r.vis >= 0.5, `#${k} CAM-04 de espaldas al muro de la plaza de TT: cámara a ${r.elev}° sobre la cabeza (≤ 45, «por encima del hombro»; base 53–54) y ANMI visible`, 'input', r); }
      { const r = await medir({ p: G.P([11.15, 0.02, -31.29]), h: G.H(Math.PI / 2), sec: 0.6, pre: "key('KeyE', true); setTimeout(() => key('KeyE', false), 0);" });
        await page.evaluate(async () => { await window.__bk.simulate(1.2); });
        const r2 = await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, s = g.skater; const head = s.footPos.clone().add(new T.Vector3(0, 1.5, 0)).project(g.rig.cam); return { ndcX: +head.x.toFixed(2), mode: g.mode, dlg: !document.getElementById('dialog').hidden }; });
        await page.evaluate(() => { document.getElementById('dialog-ok').click(); window.__R11.releaseAll(); });
        if (!r2.dlg) R.invalid(`#${k} NMG-10: no se abrió la charla con La Pantera`, { r, r2 });
        else R.check(Math.abs(r2.ndcX) <= 0.95, `#${k} NMG-10 charla con La Pantera desde el borde oeste: cabeza de ANMI dentro de la imagen (x NDC ${r2.ndcX})`, 'vision', r2);
        await page.evaluate(async () => { await window.__bk.simulate(2); }); }
      { const r = await medir({ p: G.P([20, 0.02, -38]), h: G.H(1.6), sec: 1.5 });
        R.check(r.camDist >= 4 && r.vis >= 0.9, `#${k} no empeorar: en llano abierto cámara a ${r.camDist} m y ANMI visible`, 'input', r); }
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
