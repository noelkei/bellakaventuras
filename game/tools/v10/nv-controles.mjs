// V10 IT2 · nv-controles · el grind de RG1 de NOSVAMOSDEAQUÍ con TÁCTIL (emulación CDP, 390×844, sin teclado) y con MANDO (mando simulado
// del juego `input.fakePad`, sin teclado). Encargo V10: «toda interacción nueva con teclado, táctil y mando, con textos de ayuda»; el teclado
// lo cubre `nv-grind`. Fixture declarada: partida nueva y ANMI en la zona de la charla con Fennec. Un piloto lee el estado (inclinación,
// aviso) y responde como un jugador atento, solo con el dispositivo del caso:
//  · táctil: HABLAR/EMPEZAR con el botón de acción, «Vale» tocando el botón del diálogo; equilibrio manteniendo ◀ / ▶ (`btn-lean-l/r`, que
//    aparecen al empezar el grind y se ocultan al terminar); AGACHARSE tocando su botón en el aviso; ayuda del equilibrio habla de botones;
//  · mando: Y = acción, A = «Vale», stick izquierdo ◀ ▶ = equilibrio, B mantenido = agacharse; la ayuda habla del stick y de B.
// Esperado: el grind se completa (Fennec abajo, frase final), sin teclas de teclado en las ayudas, y los dedos quedan libres al terminar.
// Emulación ≠ teléfono ni mando físico (pendiente humano).
// Uso: node tools/v10/nv-controles.mjs --url v10 --task V10-IT2 --label final
import { Report, runTest, launch, openGame, clickStart, sleep, VIEWPORTS } from '../v8/lib.mjs';
import { nvState } from './nv-lib.mjs';
const R = new Report('nv-controles');
const KEYS = /\bA\/D\b|mantén C|\(C\)|Espacio|\bE\b/;
async function toFennec(page) {
  await page.evaluate(() => { const g = window.__bk, z = g.park.zones.get('act.skateTutorial'); g.input.clear(); g.skater.teleport(z.pos.clone(), 0, 'walk'); g.rig.snapBehind(g.skater); });
  R.fixture('ANMI en la zona de la charla con Fennec (arriba del puente)', {}); await sleep(600);
}
const hintText = (page) => page.evaluate(() => { const h = document.getElementById('hint'), m = document.getElementById('gh-msg');
  return [h && !h.hidden && getComputedStyle(h).display !== 'none' ? h.textContent.trim() : '', m && m.offsetParent ? m.textContent.trim() : ''].filter(Boolean).join(' | ') || null; });
// IT3 (modo actividad): panel visible, viñeta activa, aguja (posición %) y si el panel tapa la cabeza o el pecho de ANMI en pantalla
const modo = (page) => page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, cam = g.rig.cam, hud = document.getElementById('grind-hud'), nd = document.getElementById('gh-needle');
  let head = null, chest = null; g.visual.root.traverse((o) => { if (o.isBone && /mixamorig.*Head$/.test(o.name)) head = o; if (o.isBone && /mixamorig.*Spine2$/.test(o.name)) chest = o; });
  const S = (o) => { const p = o.getWorldPosition(new T.Vector3()).project(cam); return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight]; };
  const r = hud && hud.offsetParent ? hud.getBoundingClientRect() : null, dentro = (q) => !!r && q[0] >= r.left && q[0] <= r.right && q[1] >= r.top && q[1] <= r.bottom;
  const hp = head ? S(head) : null, cp = chest ? S(chest) : null;
  return { panel: !!r, vineta: document.body.classList.contains('actividad') && +getComputedStyle(document.getElementById('act-vignette')).opacity > 0.5, aguja: nd ? parseFloat(nd.style.left) : null,
    tapaCabeza: hp ? dentro(hp) : null, tapaPecho: cp ? dentro(cp) : null, quedan: document.getElementById('gh-left')?.textContent ?? null }; });
await runTest(R, async () => {
  const b = await launch();
  try {
    // ---------------------------------------------------------------- TÁCTIL
    for (const [lay, vp] of [['vertical', VIEWPORTS.phone], ['horizontal', VIEWPORTS.phoneLand]]) {
      const page = await openGame(b, R, { viewport: vp, save: null }); await clickStart(page); await sleep(1500);
      const cdp = await page.target().createCDPSession();
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
      const center = (id) => page.evaluate((id) => { const e = document.getElementById(id); if (!e || e.hidden || e.offsetParent === null) return null; const r = e.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; }, id);
      const tap = async (id, n = 5) => { const c = await center(id); if (!c) return false; await touch('touchStart', [[c[0], c[1], n]]); await sleep(70); await touch('touchEnd', []); await sleep(200); return true; };
      await toFennec(page);
      let started = false, lines = 0;
      for (let i = 0; i < 12 && !started; i++) { const s = await nvState(page);
        if (s.dialog) { lines++; await tap('dialog-ok'); continue; }
        if (s.action && /EMPEZAR|REPETIR/.test(s.action)) { started = await tap('btn-action'); await sleep(300); break; }
        if (s.action && /HABLAR/.test(s.action)) { await tap('btn-action'); await sleep(450); continue; } await sleep(250); }
      // piloto táctil
      let held = null, crouched = false, leanSeen = false, maxLean = 0, lay0 = null; const modos = []; const helps = new Set(); const t0 = Date.now();
      const hold = async (id) => { if (held === id) return; if (held) await touch('touchEnd', []); held = null; if (id) { const c = await center(id); if (c) { await touch('touchStart', [[c[0], c[1], 3]]); held = id; } } };
      while (Date.now() - t0 < 40000) { const s = await nvState(page); const h = await hintText(page); if (h) helps.add(h); if (s.phase === 'ride' && modos.length < 400) modos.push(await modo(page));
        if (s.phase !== 'ride' && s.phase !== 'mount') { if (s.phase === 'exit') { await sleep(40); continue; } if (Date.now() - t0 > 1500) break; await sleep(60); continue; }
        if (await center('btn-lean-l')) { if (!leanSeen) lay0 = await page.evaluate(() => { const r = (id) => { const q = document.getElementById(id).getBoundingClientRect(); return [q.left, q.top, q.right, q.bottom]; };
          const R3 = { l: r('btn-lean-l'), r: r('btn-lean-r'), c: r('btn-crouch') }, ov = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
          const W = innerWidth, H = innerHeight, dentro = Object.values(R3).every((q) => q[0] >= 0 && q[1] >= 0 && q[2] <= W && q[3] <= H);
          return { ...R3, solape: Math.round(ov(R3.l, R3.r) + ov(R3.l, R3.c) + ov(R3.r, R3.c)), dentro, W, H }; }); leanSeen = true; }
        maxLean = Math.max(maxLean, Math.abs(s.lean ?? 0));
        const pred = (s.lean ?? 0) + (s.leanV ?? 0) * 0.18;
        await hold(pred > 0.03 ? 'btn-lean-l' : pred < -0.03 ? 'btn-lean-r' : null);
        if (s.warned && !crouched) { const was = held; await hold(null); crouched = await tap('btn-crouch', 4); await hold(was); }
        await sleep(25); }
      await hold(null);
      let s = await nvState(page); const t1 = Date.now(); while (Date.now() - t1 < 6000 && !s.dialog) { await sleep(150); s = await nvState(page); }
      const after = await page.evaluate(() => ({ leanVisible: document.getElementById('btn-lean-l').offsetParent !== null, owners: window.__bk.input.activeOwners, ok: window.__bk.activities.find((x) => x.id === 'skateTutorial').successes }));
      const row = { started, lines, leanSeen, crouched, ok: after.ok, fenecDice: s.dialog?.slice(0, 50) ?? null, helps: [...helps], leanVisibleAfter: after.leanVisible, owners: after.owners };
      R.measure(`tactil_${lay}`, { ...row, lay0 });
      R.check(started && lines >= 1, `táctil ${lay}: HABLAR con el botón de acción, «Vale» tocando el diálogo y EMPEZAR GRIND (${lines} frases)`, 'emulation', row);
      R.check(leanSeen && crouched && after.ok >= 1 && !!s.dialog, `táctil ${lay}: con ◀ ▶ y AGACHARSE el grind se completa y Fennec dice su frase final`, 'emulation', row);
      R.check(![...helps].some((t) => KEYS.test(t)), `táctil ${lay}: las ayudas no nombran teclas de teclado (${[...helps].length} textos)`, 'emulation', row.helps);
      R.check(!!lay0 && lay0.solape === 0 && lay0.dentro, `táctil ${lay}: durante el grind ◀, ▶ y AGACHARSE no se solapan y caben en pantalla (solape ${lay0?.solape} px²)`, 'emulation', lay0);
      const TAG = `táctil ${lay}`;
      { const ag = modos.map((m) => m.aguja).filter((v) => v !== null), M = { muestras: modos.length, panel: modos.filter((m) => m.panel).length, vineta: modos.filter((m) => m.vineta).length,
          agujaMin: Math.min(...ag), agujaMax: Math.max(...ag), tapaCabeza: modos.filter((m) => m.tapaCabeza).length, tapaPecho: modos.filter((m) => m.tapaPecho).length, quedan: modos.at(-1)?.quedan };
        R.measure(`modo_${TAG}`, M);
        R.check(M.muestras > 10 && M.panel === M.muestras && M.vineta === M.muestras && /Quedan \d+ m|Meta/.test(M.quedan ?? ''), `${TAG}: modo actividad durante el grind: viñeta y panel siempre visibles, con el circuito que queda («${M.quedan}»)`, 'emulation', M);
        R.check(M.agujaMax - M.agujaMin > 15, `${TAG}: la barra de equilibrio se mueve a izquierda y derecha (aguja ${M.agujaMin?.toFixed(0)}–${M.agujaMax?.toFixed(0)} %)`, 'emulation', M);
        R.check(M.tapaCabeza === 0 && M.tapaPecho === 0, `${TAG}: el panel no tapa la cabeza ni el pecho de ANMI (cabeza ${M.tapaCabeza}, pecho ${M.tapaPecho} de ${M.muestras})`, 'emulation', M); }
      R.check(!after.leanVisible && after.owners.length === 0, `táctil ${lay}: al terminar, ◀ ▶ ocultos y dedos liberados`, 'emulation', row);
      await page.close(); }
    // ---------------------------------------------------------------- MANDO
    { const page = await openGame(b, R, { save: null }); await clickStart(page); await sleep(1500);
      await page.evaluate(() => { const g = window.__bk; g.input.fakePad = { id: 'nv-controles', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; });
      const btn = (i, on) => page.evaluate((i, on) => { const p = window.__bk.input.fakePad; p.buttons[i].pressed = on; p.buttons[i].value = on ? 1 : 0; }, i, on);
      const press = async (i) => { await btn(i, true); await sleep(120); await btn(i, false); await sleep(250); };
      const axis = (x) => page.evaluate((x) => { window.__bk.input.fakePad.axes[0] = x; }, x);
      await toFennec(page);
      let started = false, lines = 0;
      for (let i = 0; i < 12 && !started; i++) { const s = await nvState(page);
        if (s.dialog) { lines++; await press(0); continue; }
        if (s.action && /EMPEZAR|REPETIR/.test(s.action)) { await press(3); started = true; await sleep(300); break; }
        if (s.action && /HABLAR/.test(s.action)) { await press(3); await sleep(400); continue; } await sleep(250); }
      let crouched = false; const helps = new Set(); const t0 = Date.now(); const modos = [];
      while (Date.now() - t0 < 40000) { const s = await nvState(page); const h = await hintText(page); if (h) helps.add(h); if (s.phase === 'ride' && modos.length < 400) modos.push(await modo(page));
        if (s.phase !== 'ride' && s.phase !== 'mount') { if (s.phase === 'exit') { await sleep(40); continue; } if (Date.now() - t0 > 1500) break; await sleep(60); continue; }
        const pred = (s.lean ?? 0) + (s.leanV ?? 0) * 0.18;
        await axis(pred > 0.03 ? -1 : pred < -0.03 ? 1 : 0);
        if (s.warned && !crouched) { crouched = true; await btn(1, true); }
        await sleep(25); }
      await axis(0); await btn(1, false);
      let s = await nvState(page); const t1 = Date.now(); while (Date.now() - t1 < 6000 && !s.dialog) { await sleep(150); s = await nvState(page); }
      const ok = await page.evaluate(() => window.__bk.activities.find((x) => x.id === 'skateTutorial').successes);
      const row = { started, lines, crouched, ok, fenecDice: s.dialog?.slice(0, 50) ?? null, helps: [...helps] };
      R.measure('mando', row);
      R.check(started && lines >= 1, `mando: HABLAR con Y, «Vale» con A y EMPEZAR GRIND con Y (${lines} frases)`, 'input', row);
      R.check(crouched && ok >= 1 && !!s.dialog, `mando: con el stick y B el grind se completa y Fennec dice su frase final`, 'input', row);
      R.check([...helps].some((t) => /stick|mantén B|\(B\)|\bB\b/i.test(t)) && ![...helps].some((t) => KEYS.test(t)), `mando: las ayudas del grind hablan del stick y de B, no de teclas`, 'input', row.helps);
      const TAG = 'mando';
      { const ag = modos.map((m) => m.aguja).filter((v) => v !== null), M = { muestras: modos.length, panel: modos.filter((m) => m.panel).length, vineta: modos.filter((m) => m.vineta).length,
          agujaMin: Math.min(...ag), agujaMax: Math.max(...ag), tapaCabeza: modos.filter((m) => m.tapaCabeza).length, tapaPecho: modos.filter((m) => m.tapaPecho).length, quedan: modos.at(-1)?.quedan };
        R.measure(`modo_${TAG}`, M);
        R.check(M.muestras > 10 && M.panel === M.muestras && M.vineta === M.muestras && /Quedan \d+ m|Meta/.test(M.quedan ?? ''), `${TAG}: modo actividad durante el grind: viñeta y panel siempre visibles, con el circuito que queda («${M.quedan}»)`, 'emulation', M);
        R.check(M.agujaMax - M.agujaMin > 15, `${TAG}: la barra de equilibrio se mueve a izquierda y derecha (aguja ${M.agujaMin?.toFixed(0)}–${M.agujaMax?.toFixed(0)} %)`, 'emulation', M);
        R.check(M.tapaCabeza === 0 && M.tapaPecho === 0, `${TAG}: el panel no tapa la cabeza ni el pecho de ANMI (cabeza ${M.tapaCabeza}, pecho ${M.tapaPecho} de ${M.muestras})`, 'emulation', M); }
      await page.evaluate(() => { window.__bk.input.fakePad = null; });
      await page.close(); }
    // ---------------------------------------------------------------- RATÓN (IT3: puntero libre y clic izquierdo/derecho para equilibrar)
    { const page = await openGame(b, R, { save: null }); await clickStart(page); await sleep(1500);
      await toFennec(page);
      let started = false;
      for (let i = 0; i < 12 && !started; i++) { const s = await nvState(page);
        if (s.dialog) { await page.click('#dialog-ok'); await sleep(250); continue; }
        if (s.action && /EMPEZAR|REPETIR/.test(s.action)) { await page.keyboard.press('KeyE'); started = true; await sleep(300); break; }
        if (s.action && /HABLAR/.test(s.action)) { await page.keyboard.press('KeyE'); await sleep(450); continue; } await sleep(250); }
      await page.mouse.move(640, 420);
      let held = null, crouched = false, libre = 0, muestras = 0; const helps = new Set(); const t0 = Date.now();
      const hold = async (btn) => { if (held === btn) return; if (held) await page.mouse.up({ button: held }); held = null; if (btn) { await page.mouse.down({ button: btn }); held = btn; } };
      while (Date.now() - t0 < 40000) { const s = await nvState(page); const h = await hintText(page); if (h) helps.add(h);
        if (s.phase !== 'ride' && s.phase !== 'mount') { if (s.phase === 'exit') { await sleep(40); continue; } if (Date.now() - t0 > 1500) break; await sleep(60); continue; }
        if (s.phase === 'ride') { muestras++; if (await page.evaluate(() => document.body.classList.contains('puntero-libre') && document.pointerLockElement === null && window.__bk.input.freePointer)) libre++; }
        const pred = (s.lean ?? 0) + (s.leanV ?? 0) * 0.18;
        await hold(pred > 0.03 ? 'left' : pred < -0.03 ? 'right' : null);
        if (s.warned && !crouched) { crouched = true; await page.keyboard.down('KeyC'); }
        await sleep(25); }
      await hold(null); if (crouched) await page.keyboard.up('KeyC');
      let s = await nvState(page); const t1 = Date.now(); while (Date.now() - t1 < 6000 && !s.dialog) { await sleep(150); s = await nvState(page); }
      const after = await page.evaluate(() => ({ ok: window.__bk.activities.find((x) => x.id === 'skateTutorial').successes, libre: window.__bk.input.freePointer }));
      const row = { started, muestras, libre, crouched, ok: after.ok, libreDespues: after.libre, helps: [...helps] };
      R.measure('raton', row);
      R.check(started && muestras > 10 && libre === muestras, `ratón: durante el grind el puntero queda libre (sin captura ni cámara de ratón) en ${libre}/${muestras} muestras`, 'input', row);
      R.check(after.ok >= 1 && !!s.dialog, 'ratón: con clic izquierdo/derecho (y C en la vuelta) el grind se completa', 'input', row);
      R.check(!after.libre && [...helps].some((t) => /Clic izquierdo\/derecho/.test(t)), 'ratón: la ayuda nombra el clic izquierdo/derecho y al terminar se recupera el modo normal', 'input', row);
      await page.close(); }
    R.pendingHuman('Grind de NOSVAMOSDEAQUÍ en el teléfono y con un mando físico');
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
