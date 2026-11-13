// R11 · utilidades comunes de las pruebas de arreglos (rojo en la línea base `--url pre`, verde en `--url v8`).
import { launch, openGame, clickStart, sleep, SAVE_20 } from '../lib.mjs';
export { launch, openGame, clickStart, sleep, SAVE_20 };
export const SAVE_NUEVA = { version: 4, collected: [], activities: {} };
export const SAVE_20_TRIPLE = { ...SAVE_20, finalDone: true, finalProof: { kind: 'triple_v3', at: '2026-10-16T00:00:00.000Z', turns: 3 }, revealSeen: true };
/** Estado de diálogo/pausa/foco. */
export const ui = (page) => page.evaluate(() => { const vis = (id) => { const e = document.getElementById(id); return !!e && !e.hidden; };
  return { mode: window.__bk.mode, paused: window.__bk.paused, dialog: vis('dialog'), pause: vis('pause'), focus: document.activeElement?.id || document.activeElement?.tagName }; });
/** Coloca a ANMI en el centro de una zona de actividad (a pie) y deja asentar. */
export async function atZone(page, zoneId, heading = 0) {
  await page.evaluate((zoneId, heading) => { const g = window.__bk, T = window.__bkTHREE, z = g.park.zones.get(zoneId); g.input.clear();
    g.skater.teleport(new T.Vector3(z.pos.x, (z.yMin ?? 0) + 0.52, z.pos.z), heading, 'walk'); g.rig.snapBehind(g.skater); }, zoneId, heading);
  await sleep(700);
}
/** Mando simulado del propio juego. */
export const padOn = (page) => page.evaluate(() => { window.__bk.input.fakePad = { id: 'r11', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; });
export async function padBtn(page, i, ms = 120) { await page.evaluate((i) => { window.__bk.input.fakePad.buttons[i].pressed = true; }, i); await sleep(ms); await page.evaluate((i) => { window.__bk.input.fakePad.buttons[i].pressed = false; }, i); await sleep(300); }
