// V4-CAM-02 · Tramado cercano a la cámara: cámara fija a 1,0 m de un tronco de palmera REAL (collider `palm_trunk`) mirando
// a ANMI a través de él. Se mide la fracción de píxeles del centro de la imagen que cambian al quitar el tronco del render
// (= cobertura del tronco) a resolución completa (cada píxel es tronco o fondo: el tramado no se promedia), con el tramado
// activo y con el tramado anulado (near = 0, negativo sensible).
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';
const R = new Report('CAM-02', 'camfade');
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    await clickStart(page); await sleep(1500);
    const res = await page.evaluate(async () => {
      const g = window.__bk, T = window.__bkTHREE, cf = window.__bkCamFade;
      let trunk = null; g.world.forEachCollider((c) => { if (!trunk && g.park.colliderName(c.handle) === 'palm_trunk') { const t = c.translation(); trunk = new T.Vector3(t.x, 0, t.z); } });
      if (!trunk) return { err: 'sin palm_trunk' };
      // ANMI a 4 m del tronco hacia el centro del parque; la cámara a 1,0 m al otro lado del tronco, a 1,4 m de altura
      const dir = trunk.clone().multiplyScalar(-1).setY(0).normalize();
      const anmi = trunk.clone().addScaledVector(dir, 4); g.skater.teleport(anmi, Math.atan2(dir.x, dir.z), 'walk'); g.input.clear();
      const cam = trunk.clone().addScaledVector(dir, -1.0).setY(1.4);
      // la cámara se coloca DIRECTAMENTE (el rig fijo la alejaría del collider: el caso a medir es la cámara de juego que
      // pasa rozando un tronco que ignora a propósito)
      const look = anmi.clone().setY(1.0); window.__cfSetup = { cam: cam.toArray(), look: look.toArray() };
      for (const id of ['hud', 'touch']) document.getElementById(id).style.visibility = 'hidden';
      const grab = () => { g.rig.cam.position.copy(cam); g.rig.cam.lookAt(look); g.rig.cam.updateMatrixWorld(); g.render(); const c = document.getElementById('game'), w = c.width, h = c.height, t = document.createElement('canvas'); t.width = w; t.height = h; const x = t.getContext('2d'); x.drawImage(c, 0, 0, w, h); return x.getImageData(0, 0, w, h).data; };
      // meshes del tronco: los que corta un rayo de la cámara al centro del collider
      const rc = new T.Raycaster(cam.clone(), trunk.clone().setY(1.4).sub(cam).normalize(), 0, 2.5);
      const hits = rc.intersectObject(g.park.root, true).filter((h) => h.object.visible);
      const occl = hits[0]?.object;
      // rectángulo de ANMI en pantalla (caja de su malla visible proyectada con la misma cámara)
      g.rig.cam.position.copy(cam); g.rig.cam.lookAt(look); g.rig.cam.updateMatrixWorld();
      const fp = g.skater.footPos, bb = new T.Box3(fp.clone().add(new T.Vector3(-0.3, 0.05, -0.3)), fp.clone().add(new T.Vector3(0.3, 1.6, 0.3))), cn = [];   // cápsula de ANMI (la malla visual se mueve al presentar el fotograma)
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) cn.push(new T.Vector3(x, y, z).project(g.rig.cam));
      const RX = [Math.min(...cn.map((v) => v.x)), Math.max(...cn.map((v) => v.x))].map((v) => (v + 1) / 2), RY = [Math.min(...cn.map((v) => v.y)), Math.max(...cn.map((v) => v.y))].map((v) => (1 - v) / 2).reverse();
      const anmiBox = { x0: RX[0], x1: RX[1], y0: RY[0], y1: RY[1] };
      const diffIn = (a, b, R0) => { const W = document.getElementById('game').width, Hh = document.getElementById('game').height; let n = 0, tot = 0; for (let i = 0; i < a.length; i += 4) { const px = (i / 4) % W / W, py = Math.floor(i / 4 / W) / Hh; if (px < R0.x0 || px > R0.x1 || py < R0.y0 || py > R0.y1) continue; tot++; if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++; } return tot ? n / tot : 1; };
      const diff = (a, b) => { let n = 0, tot = 0; for (let i = 0; i < a.length; i += 4) { const W = document.getElementById('game').width, Hh = document.getElementById('game').height; const px = (i / 4) % W, py = Math.floor(i / 4 / W); if (px < W * 0.25 || px > W * 0.75 || py < Hh * 0.17 || py > Hh * 0.83) continue; tot++; if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++; } return n / tot; };
      await new Promise((r) => requestAnimationFrame(r));
      // referencia «sin tronco»: se quita solo de la pasada de color (su sombra sigue: el tramado no debe quitar sombras)
      const on = grab(); const mats = occl ? [].concat(occl.material) : []; for (const m of mats) { m.colorWrite = false; m.depthWrite = false; }
      const none = grab(); for (const m of mats) { m.colorWrite = true; m.depthWrite = true; }
      const near0 = cf.near0, near1 = cf.near1; cf.near0 = 0; cf.near1 = 0.0001;
      // el uniforme se lee de CAM_FADE solo al construir: se actualiza el valor compartido
      const u = window.__bkCamFadeUniform; if (u) u.value.set(0, 0.0001);
      const off = grab(); if (u) u.value.set(near0, near1); cf.near0 = near0; cf.near1 = near1;
      return { trunk: trunk.toArray().map((v) => +v.toFixed(2)), occluder: occl?.name ?? null, occDist: hits[0] ? +hits[0].distance.toFixed(2) : null, coverOn: +diff(on, none).toFixed(3), coverOff: +diff(off, none).toFixed(3), anmiOn: +diffIn(on, none, anmiBox).toFixed(3), anmiOff: +diffIn(off, none, anmiBox).toFixed(3), anmiBox, mats: g.stats.camFadeMats };
    });
    if (res.err) throw new Error(res.err);
    for (const [nm, off] of [['con_tramado', false], ['sin_tramado', true]]) {
      const url = await page.evaluate((off) => { const g = window.__bk, u = window.__bkCamFadeUniform, c = window.__bkCamFade; const S = window.__cfSetup, T = window.__bkTHREE; if (off) u.value.set(0, 0.0001); g.rig.cam.position.fromArray(S.cam); g.rig.cam.lookAt(new T.Vector3(...S.look)); g.rig.cam.updateMatrixWorld(); g.render(); const d = document.getElementById('game').toDataURL('image/png'); u.value.set(c.near0, c.near1); return d; }, off);
      fs.writeFileSync(path.join(R.dir, `camfade_tronco_1m_${nm}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
    R.check(!!res.occluder && res.occDist < 1.2, 'el tronco de palmera real está entre la cámara (a ~1 m) y ANMI', 'vision', { occluder: res.occluder, occDist: res.occDist });
    R.check(res.coverOff > 0.2, 'negativo sensible: con el tramado anulado el tronco tapa una parte grande del centro', 'vision', { coverOff: res.coverOff });
    R.check(res.anmiOff > 0.8, 'negativo sensible: sin tramado ANMI queda tapada por el tronco', 'vision', { anmiOff: res.anmiOff, anmiBox: res.anmiBox });
    R.check(res.anmiOn < 0.3, 'con el tramado activo ANMI se ve a través del tronco (≤30 % de su rectángulo alterado)', 'vision', { anmiOn: res.anmiOn, coverCentroOn: res.coverOn, coverCentroOff: res.coverOff, mats: res.mats });
  } finally { await browser.close(); }
});
