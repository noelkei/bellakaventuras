// IT8 · A2 · guardián: dos pestañas del mismo navegador con entradas reales (amplía r11/f1-pestanas, que usa atajos internos).
//  1 · A juega; B está en la portada: al pulsar CONTINUAR en B se ve el progreso de A (contador).
//  2 · A recoge una patata andando encima; en B (al traerla al frente) esa patata desaparece del mundo y el contador la cuenta.
//  3 · B recoge otra; recargar A → tiene las dos.
//  4 · Las dos 20 s «a la vez» (se alternan al frente con W pulsada): sin errores y el guardado sigue siendo válido.
//  5 · A reinicia con su botón («Reiniciar partida…» → «Borrar y empezar»): B avisa de que la partida cambió en otra pestaña, B NO vuelve a
//      escribir lo borrado aunque recoja otra patata, y al recargar B la partida está a 0.
// `--rojo`: B deja de escuchar el evento `storage` (y no fusiona al guardar) → la comprobación 2 o 5 tiene que salir roja.
import { Report, runTest, launch, sleep, arg, flag } from '../v8/lib.mjs';
import { open8, start8, dev, S0, collectFry, disk, reload8, tapOrClick, cleanState, saveJson } from './lib8.mjs';
const R = new Report('it8-pestanas', { task: arg('task', 'IT8') });
const ROJO = flag('rojo');
/** Traer una pestaña al frente como el jugador: la otra pierde el foco y se pausa (correcto); en esta, si está en pausa, «Seguir». */
async function front(P) { await P.bringToFront(); await sleep(500); if (await P.evaluate(() => window.__bk?.started && window.__bk.paused)) { await P.click('#btn-resume').catch(() => {}); await sleep(500); } }
await runTest(R, async () => {
  const b = await launch(); const out = {}; const errA = [], errB = [];
  try {
    const d = dev('pc720');
    const A = await open8(b, R, d, 'h', { save: S0, errors: errA }); await start8(A, false); await sleep(1200);
    const B = await open8(b, R, d, 'h', { save: undefined, errors: errB });
    if (ROJO) await B.evaluate(() => { const st = window.__bk.state; st.mergeFromDisk = () => false; });
    // 1 · progreso de A visible en la portada de B tras recoger en A
    await front(A); const c1 = await collectFry(A, 'no_me_guillo.visible', 2500); await sleep(500);
    await B.bringToFront(); await sleep(400); await start8(B, false); await sleep(1500);
    out.b1 = await B.evaluate(() => ({ total: window.__bk.state.total, contador: document.getElementById('count')?.textContent }));
    R.check(c1.got && out.b1.total >= 1, '1 · al empezar en B se ve la patata que A recogió antes', 'input', { a: c1, b: out.b1 });
    // 2 · A recoge otra con B ya jugando: B la quita del mundo
    await front(A); const c2 = await collectFry(A, 'no_me_guillo.medium', 2500); await sleep(400);
    await front(B); await sleep(1800);
    out.b2 = await B.evaluate(() => { const g = window.__bk, p = g.pickups.find((x) => x.id === 'no_me_guillo.medium'); return { total: g.state.total, enMundo: !!p && !p.collected && p.group.parent !== null, contador: document.getElementById('count')?.textContent }; });
    R.check(c2.got && out.b2.total >= 2 && !out.b2.enMundo, '2 · B quita del mundo la patata que A recogió mientras B jugaba y la cuenta', 'input', out.b2);
    // 3 · B recoge otra, A recarga y tiene las tres
    const c3 = await collectFry(B, 'yinyang.visible', 2500); await sleep(400);
    await A.bringToFront(); await reload8(A); await start8(A, false); await sleep(1000);
    out.a3 = await A.evaluate(() => window.__bk.state.p.collected.slice().sort());
    R.check(c3.got && ['no_me_guillo.visible', 'no_me_guillo.medium', 'yinyang.visible'].every((x) => out.a3.includes(x)), '3 · al recargar A tiene las patatas de las dos pestañas', 'input', out.a3);
    // 4 · 20 s alternando
    for (let i = 0; i < 8; i++) { const P = i % 2 ? B : A; await front(P); await P.keyboard.down('KeyW'); await sleep(1200); await P.keyboard.up('KeyW'); await P.keyboard.press('Space'); await sleep(1300); }
    const dk = await disk(A); out.d4 = { version: dk?.version, n: dk?.collected?.length };
    R.check(dk && dk.version === 5 && dk.collected.length >= 3 && !errA.length && !errB.length, '4 · 20 s jugando en las dos: sin errores y el guardado sigue válido', 'input', { ...out.d4, errA: errA.slice(0, 3), errB: errB.slice(0, 3) });
    // 5 · reiniciar en A con sus botones
    await front(A); await A.keyboard.press('Escape'); await sleep(700);
    await tapOrClick(A, '#btn-restart', false); await sleep(600); await tapOrClick(A, '#btn-confirm-yes', false); await sleep(1500);
    out.a5 = await A.evaluate(() => ({ total: window.__bk.state.total, started: window.__bk.started }));
    await front(B); await sleep(1200);
    const c5 = await collectFry(B, 'tratratra.visible', 2500); await sleep(800);
    out.b5 = await B.evaluate(() => ({ stale: window.__bk.state.stale, toast: document.getElementById('toast')?.textContent ?? '', badge: document.getElementById('save-badge')?.hidden === false ? document.getElementById('save-badge').textContent : null }));
    const dk5 = await disk(B); out.d5 = dk5?.collected;
    R.check(out.a5.total === 0, '5 · «Reiniciar partida…» → «Borrar y empezar» en A deja la partida a 0', 'input', out.a5);
    R.check(Array.isArray(dk5?.collected) && !dk5.collected.includes('no_me_guillo.visible') && !dk5.collected.includes('tratratra.visible'), '5 · B no vuelve a escribir la partida borrada aunque recoja otra patata', 'input', { disco: dk5?.collected, b: out.b5, c5 });
    R.check(out.b5.stale && (/otra pestaña/i.test(out.b5.toast) || !!out.b5.badge), '5 · B avisa de que la partida cambió en otra pestaña', 'emulation', out.b5);
    await reload8(B); await start8(B, false); await sleep(800);
    out.b6 = await B.evaluate(() => window.__bk.state.total);
    R.check(out.b6 === 0, '5 · al recargar B, la partida está reiniciada', 'input', { total: out.b6 });
    saveJson(`A2-pestanas/resultado${ROJO ? '_rojo' : ''}.json`, { out, errA, errB });
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
