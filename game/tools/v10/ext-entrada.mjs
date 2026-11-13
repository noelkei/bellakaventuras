// V10 R3 · ext-entrada · E-17, E-18, E-38 (Bola de Oro §05, §16 «Entrada y percepción»; `entrada-v27/camaras.json`).
//  · partida nueva: contacto en (40; 0; −40) + 0,02 del controlador, rumbo −π/4 (mirando al centro/SO);
//  · cámara de presentación a 6°: el ojo coincide con `camara-entrada` (43,80; 1,71; −43,80) ± 0,3 m y mira a (40; 1,15; −40) ± 3°;
//    al avanzar con W 2,5 s el seguimiento recupera su inclinación (> 10°);
//  · percepción desde (40; 1,65; −40): la Rana (izquierda), el Fennec (derecha) y las letras de BELLAKACIONES (frente) se ven: el primer
//    objeto que corta el rayo del ojo a su centro es la propia figura o letra (nada delante).
// Uso: node tools/v10/ext-entrada.mjs --url v10 --task V10-R3 --label final
import fs from 'node:fs';
import { Report, runTest, launch, openGame, clickStart, sleep } from '../v8/lib.mjs';
const R = new Report('ext-entrada');
const DOS = '/Users/TU_USUARIO/Desktop/Bellakaventuras/referencias/escenarios/BOLA DE ORO/dossier-definitivo-v1-2026-10-17';
const CAMS = JSON.parse(fs.readFileSync(`${DOS}/anexos/entrada-v27/camaras.json`, 'utf8'));
const CE = CAMS.find((c) => c.id === 'camara-entrada');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: null }); await clickStart(page); await sleep(1500);
    const s0 = await page.evaluate((CE) => { const g = window.__bk, s = g.skater, c = g.rig.cam, T = window.__bkTHREE;
      const dir = new T.Vector3(); c.getWorldDirection(dir); const want = new T.Vector3(...CE.target).sub(c.position).normalize();
      return { foot: s.footPos.toArray(), heading: s.heading, eye: c.position.toArray(), ang: dir.angleTo(want) * 180 / Math.PI, pitch: g.rig.pitch * 180 / Math.PI }; }, CE);
    R.measure('salida', s0);
    R.check(Math.hypot(s0.foot[0] - 40, s0.foot[2] + 40) < 0.05 && Math.abs(s0.foot[1] - 0.02) < 0.05, `partida nueva en la plaza (40; 0; −40): ${s0.foot.map((v) => v.toFixed(2))}`, 'input');
    R.check(Math.abs(Math.atan2(Math.sin(s0.heading + Math.PI / 4), Math.cos(s0.heading + Math.PI / 4))) < 0.01, `rumbo −π/4 (al centro): ${s0.heading.toFixed(3)}`, 'input');
    const de = Math.hypot(s0.eye[0] - CE.eye[0], s0.eye[1] - CE.eye[1], s0.eye[2] - CE.eye[2]);
    R.check(de <= 0.3 && s0.ang <= 3, `cámara de presentación = camara-entrada (ojo a ${de.toFixed(2)} m; mirada a ${s0.ang.toFixed(1)}°)`, 'input', { eye: s0.eye, dossier: CE.eye });
    await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW'); await sleep(1500);
    const p1 = await page.evaluate(() => { const g = window.__bk, c = g.rig.cam.position, f = g.skater.footPos; return { mode: g.rig.mode, ang: Math.atan2(c.y - f.y - 1.15, Math.hypot(c.x - f.x, c.z - f.z)) * 180 / Math.PI }; });
    R.check(p1.mode === 'follow' && p1.ang > 10, `al avanzar vuelve el seguimiento normal (modo ${p1.mode}, inclinación ${p1.ang.toFixed(1)}°)`, 'input', p1);
    // percepción
    const vis = await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, eye = new T.Vector3(40, 1.65, -40), rc = new T.Raycaster(), out = {};
      rc.camera = g.rig.cam; const vis = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
      const meshes = []; g.park.root.traverse((o) => { if (o.isMesh && !o.isSprite && vis(o) && !/^VEG_|^ANMI/.test(o.name)) meshes.push(o); });
      const firstName = (to) => { rc.set(eye, to.clone().sub(eye).normalize()); rc.far = eye.distanceTo(to) + 2; const hits = rc.intersectObjects(meshes, false);
        let o = hits[0]?.object; const chain = []; while (o) { if (o.name) chain.push(o.name); o = o.parent; } return chain.slice(0, 3); };
      const fig = g.park.root.getObjectByName('BOLA_FIGURAS'), let_ = g.park.root.getObjectByName('BOLA_LETRAS');
      const ctr = (o) => new T.Box3().setFromObject(o).getCenter(new T.Vector3());
      if (fig) for (const ch of fig.children) out[ch.name] = { at: ctr(ch).toArray().map((v) => +v.toFixed(1)), first: firstName(ctr(ch)) };
      if (let_) { const bb = new T.Box3().setFromObject(let_), c = bb.getCenter(new T.Vector3()); out.letras = { at: c.toArray().map((v) => +v.toFixed(1)), first: firstName(c) }; }
      return out; });
    R.measure('percepcion', vis);
    const ok = (k, re) => vis[k] && vis[k].first.some((n) => re.test(n));
    const fen = Object.keys(vis).find((k) => /FEN/.test(k)), ran = Object.keys(vis).find((k) => /RAN/.test(k));
    R.check(!!fen && ok(fen, /FEN|FIGURAS/), `desde la plaza se ve el Fennec (derecha) sin nada delante`, 'vision', vis[fen]);
    R.check(!!ran && ok(ran, /RAN|FIGURAS/), `desde la plaza se ve la Rana (izquierda) sin nada delante`, 'vision', vis[ran]);
    R.check(ok('letras', /LETRA|LETRAS/), 'desde la plaza se ven las letras de BELLAKACIONES de frente', 'vision', vis.letras);
  } finally { await b.close(); }
}, { timeoutMs: 200000 });
