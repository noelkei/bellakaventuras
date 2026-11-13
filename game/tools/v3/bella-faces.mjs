// NPC-02: primer plano frontal de las tres Bella (GLB comprimido, shader de variantes real) bajo la luz del juego y bajo
// luz neutra (hemisférica blanca, sin sol), en reposo y a mitad de su animación. → captures/v3/P2/NPC/bella_faces.jpg
import path from 'node:path';
import sharp from 'sharp';
import { Report, launch, openGame, clickStart } from './lib.mjs';

const R = new Report('P2/NPC', 'bella-faces', { method: 'NpcActor real con variantMaterial; cámara a 0,9 m de la cara; luz de juego y luz neutra' });
const browser = await launch();
const page = await openGame(browser, R, { viewport: { width: 360, height: 420, deviceScaleFactor: 1 }, save: null });
const shots = [];
try {
  await clickStart(page);
  await page.evaluate(async () => {
    const g = window.__bk; for (const id of ['hud', 'touch', 'hint']) document.getElementById(id).hidden = true;
    await g.loadNpc('bella'); g.autoMode = true; g.skater.frozen = true;
  });
  for (const light of ['juego', 'neutra']) for (const zoom of ['cara', 'cuerpo']) for (let i = 0; i < 3; i++) {
    await page.evaluate(({ i, light, zoom }) => {
      const g = window.__bk, T = window.__bkTHREE, a = g.npcs.get('bella')[i];
      a.root.visible = true; a.mixer.update(0);
      let head = null; a.model.traverse((o) => { if (o.isBone && /Head$/.test(o.name)) head = o; });
      a.root.updateMatrixWorld(true);
      const hp = head.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, zoom === 'cara' ? 0.12 : -0.55, 0));
      const h = a.root.rotation.y, fwd = new T.Vector3(Math.sin(h), 0, Math.cos(h));
      const cam = g.rig.cam; g.rig.mode = 'fixed';
      cam.position.copy(hp).addScaledVector(fwd, zoom === 'cara' ? 0.9 : 3.0); cam.lookAt(hp); cam.fov = 40; cam.updateProjectionMatrix();
      // los demás NPC no tapan el plano
      for (const [k, list] of g.npcs) list.forEach((n, j) => { n.root.visible = k === 'bella' && j === i; });
      // luz neutra: se apagan las luces del juego y se pone una hemisférica blanca (el bucle del juego renderiza la captura)
      if (light === 'neutra' && !window.__neutral) {
        window.__neutral = { lights: [], hemi: new T.HemisphereLight('#ffffff', '#ffffff', 2.6) };
        g.scene.traverse((o) => { if (o.isLight) { window.__neutral.lights.push(o); o.visible = false; } });
        g.scene.add(window.__neutral.hemi);
      }
    }, { i, light, zoom });
    shots.push(await page.screenshot({ type: 'png' }));
  }
  const reg = await page.evaluate(() => {
    const a = window.__bk.npcs.get('bella')[0]; let body = null; a.model.traverse((o) => { if (o.isSkinnedMesh) body = o; });
    const at = body.geometry.attributes._region; if (!at) return null;
    const c = { 0: 0, 1: 0, 2: 0 }; for (let i = 0; i < at.count; i++) c[Math.round(at.getX(i))]++; return c;
  });
  R.check(!!reg && reg[1] > 0 && reg[2] > 0, 'el GLB comprimido conserva el atributo _region (pelo/piel por isla)', 'static', reg);
  const W = 360, H = 420;
  await sharp({ create: { width: W * 3, height: H * 4, channels: 3, background: '#fff' } })
    .composite(shots.map((b, k) => ({ input: b, left: (k % 3) * W, top: Math.floor(k / 3) * H }))).jpeg({ quality: 85 }).toFile(path.join(R.dir, 'bella_faces.jpg'));
  R.note('bella_faces.jpg: columnas = variantes 1–3 (rubia, castaña, morena); filas = cara/cuerpo con luz de juego, cara/cuerpo con luz neutra');
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
