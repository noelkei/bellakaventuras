// ANIM-03/04: continuidad INTERNA de cada clip del GLB final (sin mezcla de runtime): muestreo a 120 Hz, salto angular
// máximo por hueso (normalizado a 60 Hz) y, en bucles, salto en la costura fin→inicio.
//   node tools/v3/clip-continuity.mjs → captures/v3/P2/ANIM-04/clip-continuity.json
import { Report, launch, openGame } from './lib.mjs';

const R = new Report('P2/ANIM-04', 'clip-continuity', { method: 'mixer aislado sobre el GLB cargado por el juego, 120 Hz', limitDegPer60: 30 });
const browser = await launch();
const page = await openGame(browser, R, { save: null });
try {
  const res = await page.evaluate(() => {
    const T = window.__bkTHREE, v = window.__bk.visual;
    const bones = []; v.model.traverse((o) => { if (o.isBone) bones.push(o); });
    const keyB = bones.filter((b) => /Board|Hips|Spine2|Arm$|ForeArm$|UpLeg$|Leg$|Head$|Foot$/.test(b.name));
    const out = {};
    const q = new T.Quaternion();
    for (const [name, a0] of v.actions) {
      const clip = a0.getClip(); const mixer = new T.AnimationMixer(v.model); const act = mixer.clipAction(clip); act.play();
      const n = Math.max(2, Math.round(clip.duration * 120));
      let prev = null, worst = { v: 0 }; const first = {};
      for (let i = 0; i <= n; i++) {
        mixer.setTime(Math.min(clip.duration - 1e-4, i / 120)); v.root.updateMatrixWorld(true);
        const cur = {}; for (const b of keyB) { b.getWorldQuaternion(q); cur[b.name] = q.clone(); }
        if (i === 0) Object.assign(first, cur);
        if (prev) for (const k of Object.keys(cur)) { const d = cur[k].angleTo(prev[k]) * 180 / Math.PI * 2; if (d > worst.v) worst = { v: +d.toFixed(1), bone: k, t: +(i / 120).toFixed(3) }; }
        prev = cur;
      }
      let seam = null;
      if (v.meta[name]?.loop) { seam = { v: 0 }; for (const k of Object.keys(first)) { const d = first[k].angleTo(prev[k]) * 180 / Math.PI; if (d > seam.v) seam = { v: +d.toFixed(1), bone: k }; } }
      act.stop(); mixer.uncacheRoot(v.model);
      out[name] = { seconds: +clip.duration.toFixed(3), worst, seam };
    }
    return out;
  });
  R.data.result = res;
  for (const [k, r] of Object.entries(res)) {
    if (/Dance|Breakdance/.test(k)) { R.note({ clip: k, ...r }); continue; } // bailes de captura: se revisan en ANIM-06
    R.check(r.worst.v <= 30, `${k}: sin saltos internos (≤30°/fotograma a 60 Hz)`, 'static', r);
    if (r.seam) R.check(r.seam.v <= 6, `${k}: costura de bucle continua (≤6°)`, 'static', r.seam);
  }
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
