// T5-00/T5-01/T5-05 · Desniveles (D4): ≈20 cm se suben solos a pie y en skate; ≥0,28 m bloquean limpio; nunca escalada
// lenta («levitar pegado a una cara»); escalera NMG: a pie se sube, en skate desde parado no, con impulso sí.
// Fase 1 (cajas TEMPORALES en memoria, fixture declarada; se retiran tras cada caso): alturas × ángulos × modo × arranque.
// Fase 2 (obstáculos reales del parque, localizados por nombre de collider): plinths 0,22/0,30, pallet, tt_under_floor,
// heart_ledge, ledge_long, bench, tut_bar. Fase 3: escalera NMG (pie parado; skate parado; skate con ~4,5 m/s).
// Clasificación por caso válido (la cara se alcanza): «inmediato» (cima ≤0,15 s tras contacto), «bloqueo» (Δy ≤ 0,01 m),
// «lento» (sube pero tarda >0,15 s, o gana >0,01 m sin coronar) = defecto. Intento que no llega a la cara = inválido.
// Uso: --phases cajas,reales,escalera (por defecto las tres).
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, traceRead, r3, arg } from '../lib.mjs';

const R = new Report('step-matrix');
const PH = (arg('phases', 'cajas,reales,escalera')).split(',');
const HEIGHTS = [0.10, 0.16, 0.20, 0.22, 0.24, 0.25, 0.26, 0.28, 0.30];
const ANGLES = [0, 30, 45];

/** Ejecuta un acercamiento: coloca, mantiene W `holdMs` y devuelve la traza a paso fijo + geometría de la cara. */
async function approach(page, R, spec, label) {
  const setup = await fixture(page, R, `acercamiento ${label}`, (sp) => {
    const g = window.__bk, s = g.skater, T = window.__bkTHREE;
    g.input.clear();
    const a = sp.angle * Math.PI / 180, n = sp.n; // n = normal exterior de la cara (horizontal)
    const ux = -(n[0] * Math.cos(a) - n[1] * Math.sin(a)), uz = -(n[0] * Math.sin(a) + n[1] * Math.cos(a)); // hacia la cara
    const k = (0.31 + sp.dist) / Math.cos(a);   // distancia PERPENDICULAR a la cara = 0,31 + dist (en diagonal no nace solapada)
    const st = [sp.face[0] - ux * k - n[0] * 0, sp.face[1] - uz * k];
    s.teleport(new T.Vector3(st[0], sp.y0 ?? 0, st[1]), Math.atan2(ux, uz), sp.loco); g.rig.snapBehind(s);
    s.trace.length = 0;
    return { start: st.map((v) => +v.toFixed(3)), heading: +Math.atan2(ux, uz).toFixed(3) };
  }, spec);
  await sleep(450);
  if (spec.preSpeed) {
    // impulso previo: arranca más lejos y empuja hasta la velocidad pedida antes de la cara (entrada real)
  }
  // obstáculos bajo un techo de paso agachado (tt_under_floor: hueco de 1,26 m) se prueban AGACHADA (C mantenida)
  if (spec.crouch) { await page.keyboard.down('KeyC'); await sleep(250); }
  await page.keyboard.down('KeyW'); await sleep(spec.holdMs ?? 2600); await page.keyboard.up('KeyW'); await sleep(150);
  if (spec.crouch) await page.keyboard.up('KeyC');
  const tr = await traceRead(page);
  return { setup, tr };
}

function classify(tr, spec) {
  const n = spec.n, f = spec.face;
  const dn = (r) => (r.x - f[0]) * n[0] + (r.z - f[1]) * n[1];
  const y0 = tr[0]?.y ?? 0;
  // contacto = ya en la cara Y en marcha (en un arranque «parado» el pie está en la cara antes de pulsar W)
  const iMove = tr.findIndex((r) => Math.abs(r.vl) > 0.05);
  // en skate el rayo nose/tail (a autostep+0,05 m) retiene a 0,42 m de una cara alta: eso también es «llegar a la cara»
  const reach = spec.loco === 'ride' && spec.top > 0.27 ? 0.45 : 0.37;
  const iC0 = tr.findIndex((r) => dn(r) <= reach);
  const iC = iC0 < 0 || iMove < 0 ? -1 : Math.max(iC0, iMove);
  if (iC < 0) return { valid: false, why: 'no llega a la cara', minDn: r3(Math.min(...tr.map(dn))) };
  // solo cuenta lo que pasa DELANTE de la cara (fuera de sus extremos la cápsula roza la arista lateral: no es la cara)
  const tx = -n[1], tz = n[0], halfW = (spec.width ?? 4) / 2 - 0.35;
  const inFront = (r) => Math.abs((r.x - f[0]) * tx + (r.z - f[1]) * tz) <= halfW;
  const topY = spec.top + 0.01;
  const iUp = tr.findIndex((r, i) => i >= iC && r.y >= topY && inFront(r));
  const after = tr.slice(iC).filter(inFront);
  const yMax = after.length ? Math.max(...after.map((r) => r.y)) : 0;
  const vAtFace = r3(Math.abs(tr[iC].vl));
  if (iUp >= 0) {
    // duración de la SUBIDA: del último paso aún a ras del suelo (≤ y0 + 0,01) a la cima. El autostep sube en ~0,1 s;
    // la escalada lenta (hemisferio de la cápsula sobre la arista) tarda ≥0,3 s. Desde parado, el tiempo previo a la
    // subida es el avance físico de ~0,3 m hasta la arista, no escalada.
    let iLow = iUp; while (iLow > 0 && tr[iLow - 1].y > Math.min(y0, tr[iC].y) + 0.01) iLow--;
    const rise = r3(tr[iUp].t - tr[Math.max(0, iLow - 1)].t);
    return { valid: true, cls: rise <= 0.15 ? 'inmediato' : 'lento', rise, tContactToTop: r3(tr[iUp].t - tr[iC].t), yMax: r3(yMax), vAtFace };
  }
  const gain = yMax - Math.max(y0, tr[iC].y);
  return { valid: true, cls: gain <= 0.01 ? 'bloqueo' : 'lento', gain: r3(gain), yMax: r3(yMax), vAtFace };
}

await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page);
    const rows = [];
    // ---------------------------------------------------------------- fase 1: cajas temporales
    if (PH.includes('cajas')) {
      for (const loco of ['walk', 'ride']) for (const h of HEIGHTS) for (const angle of ANGLES) for (const dist of [0.05, 1.5]) {
        if (angle === 30 && ![0.20, 0.22, 0.25, 0.28].includes(h)) continue;
        await page.evaluate((h) => { const g = window.__bk, RA = window.__bkRapier; window.__box5 = g.world.createCollider(RA.ColliderDesc.cuboid(2.0, h / 2, 0.6).setTranslation(-10, h / 2, -3.0)); }, h);
        const spec = { loco, angle, dist, n: [0, -1], face: [-10, -3.6], top: h, width: 4 };
        const { tr } = await approach(page, R, spec, `caja h${h} ${angle}° ${loco} d${dist}`);
        await page.evaluate(() => { window.__bk.world.removeCollider(window.__box5, true); });
        const c = classify(tr, spec);
        const row = { phase: 'cajas', obj: `caja_${h.toFixed(2)}`, h, angle, loco, start: dist === 0.05 ? 'parado' : 'lanzado', ...c };
        if (!c.valid) R.invalid(`${row.obj} ${angle}° ${loco} ${row.start}`, c); else rows.push(row);
        console.log(JSON.stringify(row));
      }
    }
    // ---------------------------------------------------------------- fase 2: obstáculos reales
    if (PH.includes('reales')) {
      const real = await page.evaluate(() => {
        const g = window.__bk, P = g.park, RA = window.__bkRapier, out = [];
        const want = { plinth: 4, plinth_center: 1, pallet: 1, tt_under_floor: 1, nmg_heart_ledge: 1, nmg_ledge_long: 1, bench: 2, tut_bar: 1 };
        const cnt = {};
        g.world.forEachCollider((c) => {
          if (c.isSensor()) return; const nm = P.colliderName(c.handle); if (!(nm in want) || !c.shape.halfExtents) return;
          if ((cnt[nm] = (cnt[nm] || 0) + 1) > want[nm]) return;
          const t = c.translation(), q = c.rotation(), h = c.shape.halfExtents, yaw = 2 * Math.atan2(q.y, q.w);
          const top = t.y + h.y;
          // caras laterales: normal local ±x/±z → mundo; elegir la primera con suelo llano libre delante
          const faces = [[1, 0, h.x], [-1, 0, h.x], [0, 1, h.z], [0, -1, h.z]].map(([lx, lz, d]) => {
            const nx = lx * Math.cos(yaw) + lz * Math.sin(yaw), nz = -lx * Math.sin(yaw) + lz * Math.cos(yaw);
            return { n: [nx, nz], face: [t.x + nx * d, t.z + nz * d], width: 2 * (lx ? h.z : h.x) };
          });
          for (const f of faces) {
            let ok = f.width >= 0.8;
            for (const k of [0.6, 1.2, 2.0]) {
              const x = f.face[0] + f.n[0] * k, z = f.face[1] + f.n[1] * k;
              const hit = g.world.castRay(new RA.Ray({ x, y: 2, z }, { x: 0, y: -1, z: 0 }), 3, true, RA.QueryFilterFlags.EXCLUDE_SENSORS);
              if (!hit || Math.abs(2 - hit.timeOfImpact) > 0.03) ok = false;
              if (g.world.intersectionWithShape({ x, y: 0.98, z }, { x: 0, y: 0, z: 0, w: 1 }, new RA.Capsule(0.6, 0.32), RA.QueryFilterFlags.EXCLUDE_SENSORS)) ok = false;
            }
            // V5 (T5-19, reg1): la CIMA donde se apoya el pie no puede estar ocupada por un objeto apoyado en ella (el
            // radiocasete con collider de T5-14 ocupa parte del zócalo; ANMI se paraba contra él → «lento»). Caja baja de
            // +0,05 a +0,55 m sobre la cima (no detecta techos: el de tt_under_floor está a 1,26 m). Si esta cara no vale, la siguiente.
            if (ok) { const x = f.face[0] - f.n[0] * 0.4, z = f.face[1] - f.n[1] * 0.4; let occ = null;
              g.world.intersectionsWithShape({ x, y: top + 0.3, z }, { x: 0, y: 0, z: 0, w: 1 }, new RA.Cuboid(0.22, 0.25, 0.22), (o) => { if (o.handle !== c.handle && !o.isSensor()) { occ = P.colliderName(o.handle) || `h${o.handle}`; return false; } return true; });
              if (occ) { f.occupied = occ; ok = false; } }
            if (ok) { out.push({ name: nm, top: +top.toFixed(3), n: f.n, face: f.face, width: f.width }); return; }
          }
          const occ = faces.find((f) => f.occupied);
          out.push(occ ? { name: nm, top: +top.toFixed(3), occupied: occ.occupied } : { name: nm, top: +top.toFixed(3), noFace: true });
        });
        return out;
      });
      R.measure('obstaculos_reales', real);
      const NA = [];
      for (const o of real) {
        if (o.noFace) { R.invalid(`${o.name}@${o.top}: sin cara libre para acercarse`); continue; }
        // V6 (contrato de pruebas, 09): un plinto con un radiocasete encima no es un escalón libre → «no aplica» (no inválido)
        if (o.occupied) { NA.push(`${o.name}@${o.top}: cima ocupada por «${o.occupied}»`); continue; }
        for (const loco of ['walk', 'ride']) for (const dist of [0.05, 1.5]) {
          // en tabla DESDE PARADO no se alcanza la cara en la ventana de la prueba (el arranque en tabla es con empujón): no
          // aplica; el escalón en tabla se mide lanzado (y en la fase 1 con cajas)
          if (loco === 'ride' && dist === 0.05) { NA.push(`${o.name} ride parado`); continue; }
          const spec = { loco, angle: 0, dist, n: o.n, face: o.face, top: o.top, width: o.width ?? 1.2, crouch: o.name === 'tt_under_floor' };
          const { tr } = await approach(page, R, spec, `${o.name}@${o.top} ${loco} d${dist}`);
          const c = classify(tr, spec);
          const row = { phase: 'reales', obj: o.name, h: o.top, angle: 0, loco, start: dist === 0.05 ? 'parado' : 'lanzado', ...c };
          if (!c.valid) R.invalid(`${o.name} ${loco} ${row.start}`, c); else rows.push(row);
          console.log(JSON.stringify(row));
        }
      }
      if (NA.length) R.note(`no aplica (contrato 09): ${NA.join(' · ')}`);
    }
    // ---------------------------------------------------------------- fase 3: escalera NMG
    const stairs = [];
    if (PH.includes('escalera')) {
      // marco NMG (nmg_kit.json): origen r 33,4 θ 33°; plataforma en (0,0), escalera hacia +Z local (2 peldaños de 0,2 × 0,7)
      const th = (33 + 9) * Math.PI / 180 /* V10 (preparación): marco NMG con el giro de corona, como world/nmg.ts */, O = [33.4 * Math.sin(th), -33.4 * Math.cos(th)];
      const Z = [-Math.sin(th), Math.cos(th)];
      const foot = [O[0] + Z[0] * (2.1 + 1.4), O[1] + Z[1] * (2.1 + 1.4)]; // borde exterior del peldaño bajo
      for (const [loco, dist, holdMs, tag] of [['walk', 0.3, 3000, 'pie parado'], ['ride', 0.3, 3500, 'skate parado'], ['ride', 6.0, 3500, 'skate con impulso']]) {
        for (let rep = 0; rep < 2; rep++) {
          const spec = { loco, angle: 0, dist, n: Z, face: foot, top: 0.6, holdMs };
          const { tr } = await approach(page, R, spec, `escalera NMG ${tag}`);
          const dn = (r) => (r.x - foot[0]) * Z[0] + (r.z - foot[1]) * Z[1];
          const iC = tr.findIndex((r) => dn(r) <= 0.37);
          const yMax = Math.max(...tr.map((r) => r.y));
          const row = { tag, rep, reachedFoot: iC >= 0, vAtFoot: iC >= 0 ? r3(Math.abs(tr[iC].vl)) : null, yMax: r3(yMax), onTop: yMax >= 0.6, firstStepOnly: yMax >= 0.2 && yMax < 0.4 };
          if (iC < 0) R.invalid(`escalera ${tag} rep ${rep}: no llega al pie`, row); else stairs.push(row);
          console.log(JSON.stringify(row));
        }
      }
    }
    R.measure('casos', rows); R.measure('escalera', stairs);
    // ---------------------------------------------------------------- contrato
    const lento = rows.filter((r) => r.cls === 'lento');
    const low = rows.filter((r) => r.h <= 0.22 && r.h >= 0.05);
    const high = rows.filter((r) => r.h >= 0.28 && r.h < 0.5);
    if (rows.length) {
      R.check(lento.length === 0, `nunca escalada lenta (0 casos «lento» de ${rows.length})`, 'input', lento.map((r) => `${r.obj} ${r.angle}° ${r.loco} ${r.start} ${r.rise ?? r.gain}`));
      R.check(low.every((r) => r.cls === 'inmediato'), `≤0,22 m: subida inmediata a pie y en skate (${low.filter((r) => r.cls === 'inmediato').length}/${low.length})`, 'input', low.filter((r) => r.cls !== 'inmediato').map((r) => `${r.obj} ${r.angle}° ${r.loco} ${r.start} ${r.cls}`));
      R.check(high.every((r) => r.cls === 'bloqueo'), `≥0,28 m: bloqueo limpio (${high.filter((r) => r.cls === 'bloqueo').length}/${high.length})`, 'input', high.filter((r) => r.cls !== 'bloqueo').map((r) => `${r.obj} ${r.angle}° ${r.loco} ${r.start} ${r.cls}`));
    }
    if (stairs.length) {
      const w = stairs.filter((s) => s.tag === 'pie parado'), sp = stairs.filter((s) => s.tag === 'skate parado'), si = stairs.filter((s) => s.tag === 'skate con impulso');
      R.check(w.length && w.every((s) => s.onTop), 'escalera NMG a pie: se sube andando', 'input', w);
      R.check(sp.length && sp.every((s) => !s.onTop), 'escalera NMG en skate desde parado: NO sube a la plataforma (D4: pide impulso)', 'input', sp);
      R.check(si.length && si.every((s) => s.onTop), 'escalera NMG en skate con impulso: sube', 'input', si);
    }
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
