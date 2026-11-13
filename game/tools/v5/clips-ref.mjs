// T5-00 (referencia visual A) y repeticiones en V5 · Clips de una familia cada uno, con cámara lateral fija que sigue a
// ANMI (rig.toTrack, fixture de cámara declarada) y entrada real: impacto ordinario frontal contra el muro YY, choque de
// coche S-car-A (guardado 20/20), salto a pie y giro lateral a pie. Salida: carpetas de fotogramas + WebP animado + hoja.
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, findFaces, recordClip, SAVE_20, arg } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const R = new Report('clips-ref');
const WHICH = arg('clips', 'impacto,coche,salto,giro').split(',');
const mk = (dir) => { try { R.note(execFileSync('python3', [path.join(path.dirname(new URL(import.meta.url).pathname), 'frames2webp.py'), dir]).toString().trim()); } catch (e) { R.error(e); } };

await runTest(R, async () => {
  const b = await launch();
  try {
    let page = await openGame(b, R); await clickStart(page);
    const side = (p, n, back = 6) => fixture(page, R, 'cámara lateral fija que sigue a ANMI (toTrack)', (p, n, back) => { const g = window.__bk, T = window.__bkTHREE; g.rig.toTrack(new T.Vector3(p[0] - n[1] * back, 1.8, p[1] + n[0] * back), 62); for (const id of ['hud', 'touch']) document.getElementById(id).style.visibility = 'hidden'; return {}; }, p, n, back);
    if (WHICH.includes('impacto')) {
      const [f] = await findFaces(page, ['yy_wall'], { runway: 18, minWidth: 1.5, minTop: 0.85 });
      const ux = -f.n[0], uz = -f.n[1], st = [f.face[0] - ux * 17, f.face[1] - uz * 17];
      await fixture(page, R, 'carrerilla frontal hacia el muro YY', (st, h) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(st[0], 0, st[1]), h, 'ride'); g.rig.snapBehind(g.skater); return {}; }, st, Math.atan2(ux, uz));
      await sleep(300);
      await page.keyboard.down('KeyW');
      const t0 = Date.now(); while (Date.now() - t0 < 6000) { const v = await page.evaluate(() => Math.hypot(window.__bk.skater.vel.x, window.__bk.skater.vel.z)); if (v >= 9.25) break; await sleep(16); }
      await page.keyboard.up('KeyW');
      const near = [f.face[0] + f.n[0] * 2.5, f.face[1] + f.n[1] * 2.5];
      await side(near, f.n, 7);
      mk(await recordClip(page, R, 'impacto_ordinario', async () => { await sleep(4200); }));
    }
    if (WHICH.includes('salto')) {
      await fixture(page, R, 'llano (-14,0,-2) a pie', () => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(-14, 0, -2), 0, 'walk'); g.rig.snapBehind(g.skater); return {}; });
      await side([-14, -2], [1, 0], 4.5); await sleep(400);
      mk(await recordClip(page, R, 'salto_a_pie', async () => { await sleep(200); await page.keyboard.press('Space'); await sleep(1200); await page.keyboard.down('KeyW'); await sleep(700); await page.keyboard.press('Space'); await sleep(900); await page.keyboard.up('KeyW'); await sleep(300); }));
    }
    if (WHICH.includes('giro')) {
      await fixture(page, R, 'llano (-14,0,-2) a pie', () => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(-14, 0, -2), 0, 'walk'); g.rig.snapBehind(g.skater); return {}; });
      await side([-14, -2], [1, 0], 4); await sleep(400);
      mk(await recordClip(page, R, 'giro_lateral_a_pie', async () => { await page.keyboard.down('KeyD'); await sleep(1200); await page.keyboard.up('KeyD'); await sleep(400); }));
    }
    if (WHICH.includes('escalera')) {
      // escalera NMG a pie (rampa de colisión bajo las huellas): vista lateral a la altura de los peldaños
      const th = 33 * Math.PI / 180, O = [33.4 * Math.sin(th), -33.4 * Math.cos(th)], X = [Math.cos(th), Math.sin(th)], Z = [-Math.sin(th), Math.cos(th)];
      const V = (x, z) => [O[0] + X[0] * x + Z[0] * z, O[1] + X[1] * x + Z[1] * z];
      const st = V(-1.5, 5.6), cam = V(-1.5 + 4.5, 3.0), look = V(-1.5, 3.0);
      await fixture(page, R, 'pie de la escalera NMG a pie, rumbo hacia la plataforma; cámara lateral fija', (st, h, cam, look) => { const g = window.__bk, T = window.__bkTHREE;
        g.skater.teleport(new T.Vector3(st[0], 0, st[1]), h, 'walk'); g.rig.toTrack(new T.Vector3(cam[0], 0.9, cam[1]), 50); for (const id of ['hud', 'touch']) document.getElementById(id).style.visibility = 'hidden'; return {}; },
        st, Math.atan2(-Z[0], -Z[1]), cam, look);
      await sleep(500);
      mk(await recordClip(page, R, 'escalera_nmg_a_pie', async () => { await page.keyboard.down('KeyW'); await sleep(2200); await page.keyboard.up('KeyW'); await sleep(300); }));
    }
    if (WHICH.includes('coche')) {
      await page.close();
      page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(800);
      await fixture(page, R, 'S-car-A: ANMI quieta 12 m por delante del coche A; cámara lateral', () => {
        const g = window.__bk, T = window.__bkTHREE, C = g.cars, c = C.cars[0];
        const a = C.phase + c.offset - 12 / 17.5, pose = window.__bkCarPose(a), p = pose.pos;
        g.skater.teleport(new T.Vector3(p.x, 0, p.z), Math.atan2(-pose.vel.x, -pose.vel.z), 'walk');
        const out = new T.Vector3(p.x, 0, p.z).normalize();
        g.rig.toTrack(new T.Vector3(p.x + out.x * 7, 2.6, p.z + out.z * 7), 64);
        for (const id of ['hud', 'touch']) document.getElementById(id).style.visibility = 'hidden';
        return {};
      });
      mk(await recordClip(page, R, 'choque_coche', async () => { await sleep(4500); }));
    }
    R.check(true, 'clips de referencia grabados (revisión visual aparte)', 'vision');
    R.pendingHuman('Revisión visual humana de los clips (G8-V)');
  } finally { await b.close(); }
});
