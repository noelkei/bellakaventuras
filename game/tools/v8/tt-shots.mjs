// V7 · capturas de revisión de TRA TRA TRA con cámara DIRECTA (no acreditan jugabilidad). Vistas comparables a las del
// dossier (V01–V06 y D01–D06) + inventario del manifiesto. `--cols` superpone las colisiones en alambre rojo.
// Uso: node game/tools/v7/tt-shots.mjs --url dev --task T7-02 [--label blockout] [--cols] [--only v01,d04]
import { Report, runTest, launch, openGame, clickStart, directShot, arg, flag, sleep } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const KIT = JSON.parse(fs.readFileSync(new URL('../../src/world/tt_kit.json', import.meta.url)));
// V10 (preparación; mismas fórmulas que world/tt.ts): giro de corona +9° (Bola de Oro §07): el origen (punto de MUNDO del contrato) se gira
// como punto y el yaw del marco resta 9°. Copia previa en V10/backups/pruebas/.
const CORONA = 9 * Math.PI / 180;
const [OX, OZ] = [Math.cos(CORONA) * KIT.frame.origin[0] - Math.sin(CORONA) * KIT.frame.origin[1], Math.sin(CORONA) * KIT.frame.origin[0] + Math.cos(CORONA) * KIT.frame.origin[1]];
const ROT = (KIT.frame.rotDeg ?? 0) * Math.PI / 180 - CORONA, CR = Math.round(Math.cos(ROT) * 1e12) / 1e12, SR = Math.round(Math.sin(ROT) * 1e12) / 1e12;
/** local (x, y, h) → mundo three [x, y, z] (marco girado `frame.rotDeg`, como world/tt.ts) */
export const W = (x, y, h = 0) => [OX + x * CR - y * SR, h, OZ - (x * SR + y * CR)];
/** Cámaras: [posición local, objetivo local, hfov]. Encuadres ajustados a las referencias del dossier. */
export const VIEWS = {
  v01: [[24.5, -24.5, 27.5], [0.7, 1.0, 1.6], 36],          // axonometría frontal elegida (desde el sureste, alta)
  v02: [[1.2, -17.6, 2.6], [1.2, 1.5, 3.9], 66],            // frontal (dentro del recinto: el muro está a y ≈ −19)
  v03: [[1.2, 25.5, 2.6], [1.2, 1.5, 3.9], 60],             // posterior
  v04: [[32, 1.5, 2.6], [1, 1.5, 4.1], 36],                 // lateral derecho (desde el este)
  v05: [[-34, 1.5, 2.6], [1, 1.5, 4.1], 36],                // lateral izquierdo (desde el oeste)
  v06: [[1.3, 1.2, 44], [1.3, 1.35, 0], 32],                // superior
  d01: [[6.2, -9.6, 6.6], [0.4, -2.2, 0.7], 44],            // escaleras principales E1
  d02: [[10.5, -8.5, 8.2], [4.6, 0.4, 1.0], 44],            // camino inferior
  d03: [[15.5, -5.2, 8.6], [9.8, 2.0, 3.0], 44],            // EV1 / P1 / E2
  d04: [[12.5, 11.8, 10.6], [6.9, 5.3, 4.6], 44],           // E3 y descanso superior (desde el noreste)
  d05: [[6.5, -6.2, 11.0], [0.2, 3.2, 5.4], 44],            // recta, rampita y salto
  d06: [[-1.6, -6.4, 12.2], [-7.3, 2.6, 6.3], 44],          // pasarela y limusina
};

const R = new Report('tt-shots');
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R); await clickStart(page);
    // TT y sus NPC cargados: se acerca a ANMI al sector (fixture) y se espera a los modelos
    await page.evaluate((p) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(p[0], 0, p[2]), 0); g.loadNpc('aissa'); g.loadNpc('juseph'); }, W(0, -7));
    R.fixture('ANMI colocada junto a la entrada de TT para cargar el sector', W(0, -7));
    await page.waitForFunction(() => window.__bk.npcs.has('aissa') && window.__bk.npcs.has('juseph'), { timeout: 30000 }).catch(() => R.note('NPC sin cargar en 30 s'));
    await sleep(2500);
    const info = await page.evaluate(() => { const g = window.__bk, m = g.manifest;
      return { manifestErrors: m.validate(), fries: m.fries.filter((f) => f.zone === 'tratratra').map((f) => ({ id: f.id, pos: f.pos.toArray().map((v) => +v.toFixed(2)), hover: f.hover, trig: f.trigger.x, reach: f.reach })),
        ladders: m.ladders.map((l) => ({ id: l.id, bottom: l.bottom, top: l.top })), colliders: g.park.stats.colliders, limo: g.park.propStats.limo, npcs: [...g.npcs.keys()], log: g.log.slice(-8) }; });
    R.measure('info', info);
    R.check(info.manifestErrors.length === 0, 'manifiesto sin errores (20 patatas, 6 cassettes, sectores)', 'static', info.manifestErrors);
    // V10 R7 (cambio de diseño aprobado): SECRETNOVIO añade la escalera vertical del muro A (`sn`, S-07); las tres de siempre siguen
    const lids = info.ladders.map((l) => l.id).sort();
    R.check(JSON.stringify(lids) === JSON.stringify(['fg', 'sn', 'tt.EV1', 'tt.EV2']), 'escaleras de mano registradas: fg, tt.EV1, tt.EV2 y (V10) la del muro A de SECRETNOVIO', 'static', info.ladders);
    // ANMI fuera de cuadro para las vistas (fixture)
    await page.evaluate((p) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(p[0], 0, p[2]), 0); }, W(30, -6));
    await sleep(600);
    const only = arg('only'); const names = only ? only.split(',') : Object.keys(VIEWS);
    const files = {};
    for (const n of names) { const [p, t, f] = VIEWS[n]; files[n] = path.basename(await directShot(page, R, n, W(...p), W(...t), f, { debugCols: flag('cols') })); }
    R.measure('shots', files);
    R.check(Object.keys(files).length === names.length, `${names.length} vistas capturadas`, 'vision');
  } finally { await browser.close(); }
});
