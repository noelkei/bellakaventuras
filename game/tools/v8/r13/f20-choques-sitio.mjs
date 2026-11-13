// R13 · punto 5 · los choques con NPC y objetos (R11 F7: golpe y caída suave de ANMI desde 6,5 m/s) no cambian el mapa.
// Petición del usuario: aunque ANMI se estampe 500 veces contra La Pantera, ni ella ni nada se mueve de su sitio ni sale del mapa.
//  N  500 choques contra La Pantera (ángulos y velocidades 7–12 m/s variados): su posición, su rumbo y su colisor no cambian (≤ 1 cm,
//     ≤ 1°) y sigue en su asiento.
//  O  8 choques contra cada uno del resto de NPC y objetos «blandos» (props pequeños y conos): ningún NPC ni colisor cambia de sitio.
//  M  al final, TODOS los colisores fijos del mapa y todos los NPC siguen donde estaban (comparación completa antes/después).
//   node tools/v8/r13/f20-choques-sitio.mjs --url pre13 --task R13 --label base
import { Report, runTest } from '../lib.mjs';
import { launch, abrir } from '../r11/f5-lib.mjs';
const R = new Report('r13-f20-choques-sitio');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await abrir(b, R);
    await page.evaluate(() => {
      const g = window.__bk, T = window.__bkTHREE, s = g.skater;
      const npcs = () => { const out = []; for (const [id, list] of g.npcs) list.forEach((n, i) => out.push({ k: `${id}#${i}`, p: n.root.position.clone(), y: n.root.rotation.y })); return out; };
      const cols = () => { const out = new Map(); g.world.forEachCollider((c) => { if (c.handle === s.collider.handle) return; const pb = c.parent();   // con cuerpo no fijo (coches, NPC que andan): se comparan aparte (NPC por su raíz)
        const t = c.translation(); out.set(c.handle, { n: g.park.colliderName(c.handle) ?? '', p: [t.x, t.y, t.z], mov: !!pb && !pb.isFixed() }); }); return out; };
      window.__r13c = {
        foto() { return { npcs: npcs(), cols: cols() }; },
        dif(a, b) { const out = { npcs: [], cols: [] };
          for (const n of a.npcs) { const m = b.npcs.find((q) => q.k === n.k); if (!m) { out.npcs.push([n.k, 'desaparece']); continue; } const d = n.p.distanceTo(m.p), dy = Math.abs(n.y - m.y) * 180 / Math.PI; if (d > 0.01 || dy > 1) out.npcs.push([n.k, +d.toFixed(3), +dy.toFixed(1)]); }
          for (const [h, c] of a.cols) { if (c.mov) continue; const m = b.cols.get(h); if (!m) { out.cols.push([c.n || h, 'desaparece']); continue; } const d = Math.hypot(c.p[0] - m.p[0], c.p[1] - m.p[1], c.p[2] - m.p[2]); if (d > 0.01) out.cols.push([c.n || h, +d.toFixed(3)]); }
          return out; },
        /** choque: ANMI en tabla a `dist` m del centro `c` del objetivo, rumbo hacia él (desvío `off` rad), a `v` m/s; simula `sec`. */
        async choque(c, ang, off, v, dist = 1.8, sec = 0.6) { const x = c.x - Math.sin(ang) * dist, z = c.z - Math.cos(ang) * dist;
          const fy = g.world.castRay(new window.__bkRapier.Ray({ x, y: c.y + 2.5, z }, { x: 0, y: -1, z: 0 }), 6, true, window.__bkRapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider);
          const y = fy ? c.y + 2.5 - fy.timeOfImpact : c.y; const h = ang + off;
          s.teleport(new T.Vector3(x, y + 0.03, z), h, 'ride'); s.vel.set(Math.sin(h) * v, 0, Math.cos(h) * v); const sh0 = s.softHits, b0 = s.bails;
          await g.simulate(sec); return { golpe: s.softHits > sh0 || s.bails > b0 }; },
      };
      g.autoMode = true;
    });
    // los NPC de TT, FG y YY se cargan en segundo plano: se espera a todos antes de la foto inicial
    await page.waitForFunction(() => ['la_pantera', 'aissa', 'juseph', 'bella', 'rana'].every((k) => window.__bk.npcs.get(k)?.length), { timeout: 120000, polling: 250 });
    R.fixture(`NPC cargados: ${await page.evaluate(() => [...window.__bk.npcs].map(([k, l]) => `${k}×${l.length}`).join(', '))}`);
    const antes = await page.evaluateHandle(() => window.__r13c.foto());
    // objetivos: La Pantera y el resto de colisores «blandos» (NPC, props pequeños, conos)
    const obj = await page.evaluate(() => { const g = window.__bk, s = g.skater, out = [];
      for (const [set, tipo] of [[s.softBail, 'npc'], [s.noImpact, 'prop']]) for (const h of set ?? []) { const c = g.world.getCollider(h); if (!c || !c.isEnabled()) continue; const t = c.translation();
        out.push({ h, tipo: s.cones?.has(h) ? 'cono' : tipo, n: g.park.colliderName(h) ?? `h${h}`, c: { x: t.x, y: t.y, z: t.z } }); }
      const pan = g.npcs.get('la_pantera')?.[0]; return { lista: out, pan: pan ? { x: pan.root.position.x, y: pan.root.position.y, z: pan.root.position.z } : null }; });
    R.check(!!obj.pan && obj.lista.length > 0, `objetivos: La Pantera y ${obj.lista.length} colisores blandos (${[...new Set(obj.lista.map((o) => o.tipo))].join(', ')})`, 'fixture', { n: obj.lista.length });
    // ---------------------------------------------------------------- N: 500 choques contra La Pantera
    { const pc = obj.lista.filter((o) => o.tipo === 'npc').sort((a, b) => Math.hypot(a.c.x - obj.pan.x, a.c.z - obj.pan.z) - Math.hypot(b.c.x - obj.pan.x, b.c.z - obj.pan.z))[0]?.c ?? obj.pan;
      const r = await page.evaluate(async (pc) => { const g = window.__bk, pan = g.npcs.get('la_pantera')[0], p0 = pan.root.position.clone(), y0 = pan.root.rotation.y; let golpes = 0, maxD = 0;
        let st = 99; const rnd = () => { st = (st * 1103515245 + 12345) % 2147483648; return st / 2147483648; };
        for (let i = 0; i < 500; i++) { const r = await window.__r13c.choque(pc, rnd() * 6.283, (rnd() - 0.5) * 0.4, 7 + rnd() * 5); if (r.golpe) golpes++; maxD = Math.max(maxD, pan.root.position.distanceTo(p0)); }
        return { golpes, maxD: +maxD.toFixed(3), d: +pan.root.position.distanceTo(p0).toFixed(3), dYaw: +(Math.abs(pan.root.rotation.y - y0) * 180 / Math.PI).toFixed(1) }; }, pc);
      R.check(r.golpes >= 300 && r.maxD <= 0.01 && r.dYaw <= 1, `N 500 choques contra La Pantera (${r.golpes} con golpe): no se mueve (máx. ${r.maxD} m en todo momento, giro ${r.dYaw}°)`, 'input', r); }
    // ---------------------------------------------------------------- O: 8 choques contra cada NPC y objeto blando
    { const res = []; for (const o of obj.lista) { let golpes = 0; for (let i = 0; i < 8; i++) { const r = await page.evaluate((c, i) => window.__r13c.choque(c, i * Math.PI / 4, 0, 10), o.c, i); if (r.golpe) golpes++; } res.push({ n: o.n, tipo: o.tipo, golpes }); }
      const d = await page.evaluate((a) => window.__r13c.dif(a, window.__r13c.foto()), antes);
      R.check(res.filter((q) => q.golpes > 0).length >= Math.min(10, obj.lista.length) && d.npcs.length === 0 && d.cols.length === 0,
        `O ${res.length} objetivos × 8 choques (${res.filter((q) => q.golpes > 0).length} con golpe): ningún NPC ni colisor cambia de sitio (NPC movidos ${d.npcs.length}, colisores ${d.cols.length})`, 'input', { d, sinGolpe: res.filter((q) => !q.golpes).map((q) => q.n) }); }
    // ---------------------------------------------------------------- M: comparación completa del mapa
    { const d = await page.evaluate((a) => ({ ...window.__r13c.dif(a, window.__r13c.foto()), n: a.cols.size, nNpcs: a.npcs.length }), antes);
      R.check(d.npcs.length === 0 && d.cols.length === 0, `M tras todos los choques: los ${d.n} colisores fijos y los ${d.nNpcs} NPC siguen en su sitio (cambios: NPC ${d.npcs.length}, colisores ${d.cols.length})`, 'input', d); }
  } finally { await b.close(); }
}, { timeoutMs: 1200000 });
