// V10 · capturas con cámaras reproducibles (vistas de los dossiers): perspectiva (eye, target, fov HORIZONTAL) u ortográfica (eye, target,
// ancho visible). Uso:
//   node tools/v10/shots.mjs --url v10 --task V10-R1 --out ../V10/evidencias/exterior --list cams.json [--w 1500 --h 1000] [--save fixture.json]
//   cams.json = [{ "id": "NO-pov", "proj": "p", "eye": [x,y,z], "target": [x,y,z], "hfov": 66 } | { "id": "...", "proj": "o", "eye": [...], "target": [...], "scale": 49 }]
// La cámara del juego se sustituye SOLO para la captura (fixture declarada); ANMI se aparca fuera de cuadro salvo `keepPlayer`.
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, launch, openGame, clickStart, sleep, arg } from '../v8/lib.mjs';

const R = new Report('shots-v10');
const OUT = path.resolve(arg('out', '../V10/evidencias/shots'));
const LIST = JSON.parse(fs.readFileSync(arg('list'), 'utf8'));
const W = +arg('w', '1500'), H = +arg('h', '1000');
const SAVE = arg('save') ? JSON.parse(fs.readFileSync(arg('save'), 'utf8')) : null;
fs.mkdirSync(OUT, { recursive: true });

await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { viewport: { width: W, height: H, deviceScaleFactor: 1 }, save: SAVE });
    await clickStart(page); await sleep(+arg('wait', '1500'));   // `--wait ms`: p. ej. los personajes del centro se cargan a los ~3 s
    for (const c of LIST) {
      const ok = await page.evaluate((c) => {
        const g = window.__bk, T = window.__bkTHREE;
        g.autoMode = true;   // el bucle real solo dibuja: la cámara no la mueve el seguimiento
        // R6: ANMI (oculta) se aparca en el objetivo de la cámara: las reglas del juego por distancia a ANMI (NPC a > 62 m ocultos, niveles de
        // vegetación…) se aplican como si el jugador estuviera mirando ese sitio
        if (!c.keepPlayer) { g.skater.teleport(new T.Vector3(c.target[0], 0, c.target[2]), 0, 'walk'); g.skater.frozen = true; }
        // R2: bajo el suelo el juego la devuelve a la salida (ahora la plaza, delante de las cámaras de entrada): además se OCULTA su malla
        g.scene.traverse((o) => { if (/^ANMI/.test(o.name)) o.visible = !!c.keepPlayer; });
        // R2: HUD fuera de las capturas de comparación (no tapa la escena)
        for (const id of ['ui', 'touch']) { const e = document.getElementById(id); if (e) e.style.visibility = c.keepHud ? '' : 'hidden'; }
        const aspect = innerWidth / innerHeight;
        let cam;
        if (c.proj === 'o') { const hw = c.scale / 2, hh = hw / aspect; cam = new T.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 600); }
        else { const v = 2 * Math.atan(Math.tan((c.hfov ?? 66) * Math.PI / 360) / aspect) * 180 / Math.PI; cam = new T.PerspectiveCamera(v, aspect, 0.05, 900); }
        cam.position.set(...c.eye); cam.up.set(...(c.up ?? [0, 1, 0])); cam.lookAt(new T.Vector3(...c.target)); cam.updateMatrixWorld(true);   // `up` opcional (cenitales)
        // fuera del bucle del juego: el sol y el tramado siguen a ANMI; aquí se centran en el objetivo para que las sombras salgan donde se mira
        g.sun.target.position.set(...c.target); g.sun.position.set(...c.target).addScaledVector(g.sunDir, 46); g.sun.target.updateMatrixWorld();
        window.__shotCam = cam;
        // niveles de la vegetación (D-EX-07): en ortográfica la distancia del ojo es artificial (la escala hace de zoom): se usa el objetivo
        window.__shotTier = c.proj === 'o' ? new T.Vector3(...c.target) : null;
        // el bucle de RAF sigue dibujando: durante las capturas dibuja con esta cámara (fixture; no cambia el juego)
        if (!g.__shotRender) { g.__shotRender = true; g.render = function () { this.park.vegTiers?.update(window.__shotTier ?? window.__shotCam.position); const T = window.__bkTHREE, ref = window.__shotTier ?? window.__shotCam.position, w = new T.Vector3(); for (const l of this.npcs.values()) for (const n of l) n.root.visible = n.root.getWorldPosition(w).distanceTo(ref) < 70; this.renderer.render(this.scene, window.__shotCam); }; /* R6: la regla de NPC a < 70 m, con la cámara de la captura */ }
        return true;
      }, c);
      await sleep(250);
      const file = path.join(OUT, `${c.id}.png`);
      await page.evaluate(() => { const g = window.__bk; g.park.vegTiers?.update(window.__shotTier ?? window.__shotCam.position, true); g.renderer.render(g.scene, window.__shotCam); });
      await page.screenshot({ path: file });
      R.check(ok && fs.existsSync(file), `captura ${c.id} (${c.proj === 'o' ? 'ortográfica ' + c.scale + ' m' : 'perspectiva ' + (c.hfov ?? 66) + '°'})`, 'vision', { file: path.relative(process.cwd(), file) });
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
