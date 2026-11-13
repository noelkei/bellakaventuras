// IT8 · D1 · guardián: cada mecánica produce su efecto con cada entrada (teclado, mando, dedo). Las órdenes se escriben en teclas y, con
// mando o dedo, `wrapInput` (lib8) las traduce a lo que haría el jugador (stick, joystick, SALTO, TABLA, AGACHARSE, A/B/X/LB…). Lugar:
// paseo exterior (r = 40, rumbo tangente), recolocada antes de cada mecánica. Para los trucos, ANMI se pone en el aire en tabla (fixture
// declarada: 4–6 m sobre el suelo) y se pulsa la entrada del truco.
// Mecánicas y criterio: andar (> 1,5 m en 1,5 s), correr (≥ 3,5 m/s), girar (> 30°), retroceder (> 0,3 m hacia atrás), subir/bajar de la tabla
// parada, empujar (≥ 2,5 m/s), rodar al soltar (> 0,8 m/s al segundo), frenar (velocidad −50 % en 1,5 s), bajar a > 5 m/s (a pie en ≤ 3 s, sin
// caída), Q en el aire (sin caída), subir en la pendiente del bank de NMG, ollie (> 0,25 m), saltito (> 0,12 m), 4 trucos por dirección y sin
// dirección, combo de 2, agacharse, scoot, manual / 180 / 360 / grab (teclado y mando; en táctil no hay EXTRA desde V10.1 P03: no aplica).
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { open8, start8, dev, S20, wrapInput, saveJson } from './lib8.mjs';
const R = new Report('it8-mecanicas', { task: arg('task', 'IT8') });
const VIAS = (arg('vias') ?? 'teclado,mando,tactil').split(','), SOLO = arg('solo') ? arg('solo').split(',') : null;
const S = (page) => page.evaluate(() => { const s = window.__bk.skater, v = s.vel; return { loco: s.loco, state: s.state, y: +s.footPos.y.toFixed(3), x: s.footPos.x, z: s.footPos.z, h: s.heading, v: Math.hypot(v.x, v.z), vf: v.x * Math.sin(s.heading) + v.z * Math.cos(s.heading), crouch: !!s.isCrouched, tricks: s.trickLog.length, last: s.trickLog.at(-1)?.kind ?? null, grab: s.grab ?? 0, bails: s.bails ?? 0 }; });
const lugar = (page, loco = 'walk', { dy = 0, v = 0 } = {}) => page.evaluate((loco, dy, v) => { const g = window.__bk, T = window.__bkTHREE, s = g.skater; g.input.clear(); if (g.paused) g.setPaused(false);
  const h = Math.PI / 2; s.teleport(new T.Vector3(0, 0.05 + dy, -40), h, loco); s.vel.set(Math.sin(h) * v, 0, Math.cos(h) * v); g.rig.snapBehind(s); }, loco, dy, v);
/** Muestrea el estado mientras se mantiene `keys` `ms` milisegundos. */
async function hold(P, page, keys, ms, every = 80) { const out = []; for (const k of keys) await P.keyboard.down(k); const t0 = Date.now(); while (Date.now() - t0 < ms) { out.push(await S(page)); await sleep(every); } for (const k of keys) await P.keyboard.up(k); out.push(await S(page)); return out; }
async function watch(page, ms, every = 60) { const out = []; const t0 = Date.now(); while (Date.now() - t0 < ms) { out.push(await S(page)); await sleep(every); } return out; }
const M = {
  andar: async (P, page) => { await lugar(page); await sleep(500); const a = await S(page); const s = await hold(P, page, ['KeyW'], 1500); const b = s.at(-1); const d = Math.hypot(b.x - a.x, b.z - a.z); return { ok: d > 1.5, d }; },
  correr: async (P, page) => { await lugar(page); await sleep(500); const s = await hold(P, page, ['KeyW'], 3000); const vmax = Math.max(...s.map((q) => q.v)); return { ok: vmax >= 3.5, vmax }; },
  girar: async (P, page) => { await lugar(page); await sleep(500); const a = await S(page); await hold(P, page, ['KeyA'], 900); const b = await S(page); const dh = Math.abs(Math.atan2(Math.sin(b.h - a.h), Math.cos(b.h - a.h))) * 180 / Math.PI; return { ok: dh > 30, dh }; },
  retroceder: async (P, page) => { await lugar(page); await sleep(500); const a = await S(page); await hold(P, page, ['KeyS'], 1300); const b = await S(page); const back = -((b.x - a.x) * Math.sin(a.h) + (b.z - a.z) * Math.cos(a.h)); return { ok: back > 0.3, back }; },
  subirParada: async (P, page) => { await lugar(page); await sleep(500); await P.keyboard.press('KeyQ'); const s = await watch(page, 1500); return { ok: s.at(-1).loco === 'ride', fin: s.at(-1).loco }; },
  bajarParada: async (P, page) => { await lugar(page, 'ride'); await sleep(500); await P.keyboard.press('KeyQ'); const s = await watch(page, 1500); return { ok: s.at(-1).loco === 'walk', fin: s.at(-1).loco }; },
  empujar: async (P, page) => { await lugar(page, 'ride'); await sleep(400); const s = await hold(P, page, ['KeyW'], 2200); const vmax = Math.max(...s.map((q) => q.v)); return { ok: vmax >= 2.5, vmax }; },
  rodar: async (P, page) => { await lugar(page, 'ride'); await sleep(400); await hold(P, page, ['KeyW'], 1800); await sleep(1000); const b = await S(page); return { ok: b.v > 0.8, v: b.v }; },
  frenar: async (P, page) => { await lugar(page, 'ride', { v: 5 }); await sleep(250); const a = await S(page); await hold(P, page, ['KeyS'], 1500); const b = await S(page); return { ok: b.v < a.v * 0.5, a: a.v, b: b.v }; },
  bajarRapido: async (P, page) => { await lugar(page, 'ride', { v: 6.5 }); await sleep(150); const a = await S(page); await P.keyboard.press('KeyQ'); await sleep(500);
    const neg = await page.evaluate(() => ({ loco: window.__bk.skater.loco, aviso: document.getElementById('toast')?.hidden === false ? document.getElementById('toast').textContent : '' }));
    await hold(P, page, ['KeyS'], 1600); await P.keyboard.press('KeyQ'); const s = await watch(page, 2500); const bail = s.some((q) => q.loco === 'bail' || q.loco === 'impact');
    // diseño (ayuda: «hasta 5 m/s; más rápido, frena un poco antes»): a > 5 m/s se niega con aviso; tras frenar, baja
    return { ok: a.v > 5 && neg.loco === 'ride' && !!neg.aviso && s.at(-1).loco === 'walk' && !bail, v0: a.v, negado: neg, fin: s.at(-1).loco, bail }; },
  qEnElAire: async (P, page) => { await lugar(page, 'ride', { v: 3 }); await sleep(300); await P.keyboard.press('Space'); await sleep(180); await P.keyboard.press('KeyQ'); const s = await watch(page, 2200); const bail = s.some((q) => q.loco === 'bail' || q.loco === 'impact'); return { ok: !bail && ['walk', 'ride'].includes(s.at(-1).loco), fin: s.at(-1).loco, bail }; },
  subirPendiente: async (P, page) => { await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, a = g.manifest.get('nmg.bank.foot'), s = g.skater, d = new T.Vector3(Math.sin(a.heading), 0, Math.cos(a.heading)); const p = a.pos.clone().addScaledVector(d, 1.2); const RA = window.__bkRapier, h = g.world.castRay(new RA.Ray({ x: p.x, y: 5, z: p.z }, { x: 0, y: -1, z: 0 }), 8, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider); p.y = h ? 5 - h.timeOfImpact + 0.03 : 0.05; g.input.clear(); s.teleport(p, a.heading, 'walk'); g.rig.snapBehind(s); });
    await sleep(500); const a = await S(page); await P.keyboard.press('KeyQ'); const s = await watch(page, 2000); const bail = s.some((q) => q.loco === 'bail' || q.loco === 'impact'); return { ok: s.at(-1).loco === 'ride' && !bail, y0: a.y, fin: s.at(-1).loco, bail }; },
  ollie: async (P, page) => { await lugar(page, 'ride', { v: 3 }); await sleep(300); const a = await S(page); await P.keyboard.press('Space'); const s = await watch(page, 1200); const up = Math.max(...s.map((q) => q.y)) - a.y; return { ok: up > 0.25, up }; },
  saltito: async (P, page) => { await lugar(page); await sleep(500); const a = await S(page); await P.keyboard.press('Space'); const s = await watch(page, 900); const up = Math.max(...s.map((q) => q.y)) - a.y; return { ok: up > 0.12, up }; },
  trucos: async (P, page, via) => { const r = {}; const DY = via === 'tactil' ? 10 : 6;   // con el dedo, arrastrar el joystick y tocar SALTO lleva más tiempo
    // en llano (aire sin rampa): kickflip (←/sin dirección) y heelflip (→) salen; frontflip/backflip se NIEGAN con aviso de rampa (diseño v3,
    // R11 MOV-01; con rampa los mide r11/f8-trucos y la campaña)
    for (const [dir, want] of [['ArrowLeft', 'kickflip'], ['ArrowRight', 'heelflip'], [null, 'kickflip'], ['ArrowUp', 'rampa'], ['ArrowDown', 'rampa']]) {
      await lugar(page, 'ride', { dy: DY, v: 3 }); await sleep(200); const a = await S(page); if (dir) await P.keyboard.down(dir); await sleep(120); await P.keyboard.press('Space'); await sleep(150); if (dir) await P.keyboard.up(dir);
      const t0 = Date.now(); let aviso = ''; while (Date.now() - t0 < 1500) { const t = await page.evaluate(() => { const e = document.getElementById('toast'); return e && !e.hidden ? e.textContent : ''; }); if (t) aviso = t; await sleep(80); }
      const b = await S(page); r[dir ?? 'sin'] = { quiere: want, hecho: b.tricks > a.tricks ? b.last : null, aviso: aviso.slice(0, 60) }; }
    const ok = Object.values(r).every((x) => (x.quiere === 'rampa' ? !x.hecho && /rampa/i.test(x.aviso) : x.hecho === x.quiere));
    return { ok, r }; },
  combo: async (P, page) => { await lugar(page, 'ride', { dy: 10, v: 3 }); await sleep(350); const a = await S(page); await P.keyboard.down('ArrowLeft'); await sleep(120); await P.keyboard.press('Space'); await P.keyboard.up('ArrowLeft'); await sleep(250); await P.keyboard.down('ArrowRight'); await sleep(120); await P.keyboard.press('Space'); await P.keyboard.up('ArrowRight');   // el 2.º SALTO durante el 1.º encadena (V10.1 P22)
    const s = await watch(page, 2600); const n = s.at(-1).tricks - a.tricks; return { medida: true, n }; },   // medida: los encadenados reales (rampa) los miden sn-cinco y sn-reto
  agacharse: async (P, page) => { await lugar(page, 'ride'); await sleep(300); await P.keyboard.down('KeyC'); await sleep(500); const a = await S(page); await P.keyboard.up('KeyC'); await sleep(400); const b = await S(page); return { ok: a.crouch && !b.crouch, durante: a.crouch, despues: b.crouch }; },
  scoot: async (P, page) => { await lugar(page, 'ride', { v: 0.8 }); await sleep(250); await P.keyboard.down('KeyC'); await sleep(250); const s = await hold(P, page, ['KeyW'], 1600); await P.keyboard.up('KeyC'); return { ok: s.some((q) => q.state === 'scoot'), estados: [...new Set(s.map((q) => q.state))] }; },
  manual: async (P, page, via) => { if (via === 'tactil') return { na: true }; await lugar(page, 'ride', { v: 3 }); await sleep(300); await P.keyboard.down('KeyF'); const s = await watch(page, 1100); await P.keyboard.up('KeyF'); return { ok: s.some((q) => q.loco === 'manual'), locos: [...new Set(s.map((q) => q.loco))] }; },
  extraAire: async (P, page, via) => { if (via === 'tactil') return { na: true }; const r = {};
    for (const [dir, want] of [['ArrowLeft', 'spin180'], ['ArrowRight', 'spin360'], [null, 'grab']]) { await lugar(page, 'ride', { dy: 7, v: 3 }); await sleep(350); const a = await S(page);
      const g0 = await page.evaluate(() => window.__bk.skater.grabT ?? 0);
      if (dir) { await P.keyboard.down(dir); await sleep(120); await P.keyboard.press('KeyF'); await sleep(100); await P.keyboard.up(dir); } else { await P.keyboard.down('KeyF'); await sleep(700); }
      const s = await watch(page, 1400); if (!dir) await P.keyboard.up('KeyF'); const b = s.at(-1); const g1 = await page.evaluate(() => window.__bk.skater.grabT ?? 0);
      r[want] = { hecho: b.tricks > a.tricks ? b.last : null, grabT: +(g1 - g0).toFixed(2) }; }
    // 180 por la izquierda es el contrato; el 360 y el grab se anotan (medida): sus condiciones de aire las mide r11/f8-trucos
    return { ok: r.spin180.hecho === 'spin180', r }; },
};
await runTest(R, async () => {
  const b = await launch(); const out = {};
  try {
    for (const via of VIAS) {
      const d = via === 'tactil' ? dev('ip14') : dev('pc720'), o = 'h', touch = via === 'tactil';
      const raw = await open8(b, R, d, o, { save: S20 }); await start8(raw, touch); await sleep(1500);
      const P = via === 'teclado' ? raw : wrapInput(raw, via, { log: [] });
      if (via === 'mando') { await raw.evaluate(() => { const I = window.__bk.input; I.fakePad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), id: 'prueba', connected: true }; }); }
      out[via] = {};
      for (const [k, f] of Object.entries(M)) { if (SOLO && !SOLO.includes(k)) continue;
        let r; try { r = await f(P, raw, via); } catch (e) { r = { ok: false, err: String(e.message).slice(0, 200) }; }
        await P.keyboard.up?.('KeyW'); out[via][k] = r;
        if (r.na) { R.note(`${via} · ${k}: no aplica (sin botón EXTRA en táctil, V10.1 P03)`); continue; }
        if (r.medida) { R.note(`${via} · ${k} (medida): ${JSON.stringify(r)}`); continue; }
        R.check(!!r.ok, `${via} · ${k}`, 'input', r);
      }
      if (P.__inputLog?.length) R.note({ [`${via}_sinEquivalente`]: P.__inputLog.slice(0, 20) });
      await raw.close();
    }
    saveJson('D1-mecanicas/resultado.json', out);
  } finally { await b.close(); }
}, { timeoutMs: 1800000 });
