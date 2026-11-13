// V4-MAP-01 · Volcado medido del layout runtime (colliders con bounds orientados, props, patatas, cassettes, anclas, zonas)
// en coordenadas cartesianas y polares por sector. Sirve de «before/after» del repacking a rOuter 42 / corona 20 m.
// Solo lectura (static): no mueve al jugador ni cambia el estado.
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, launch, openGame, arg } from './lib.mjs';

const tag = arg('tag', 'actual');
const R = new Report('MAP-01', `map-dump-${tag}`);
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    const dump = await page.evaluate(() => {
      const g = window.__bk, T = window.__bkTHREE, P = g.park, W = window.__bkWORLD;
      const pol = (x, z) => { const r = Math.hypot(x, z); let th = Math.atan2(x, -z) * 180 / Math.PI; if (th < 0) th += 360; return { r: +r.toFixed(2), th: +th.toFixed(1) }; };
      const cols = [];
      g.world.forEachCollider((c) => {
        const t = c.translation(), sh = c.shape; const type = c.shapeType();
        const aabb = (() => { try { const b = c.computeAabb?.(); return b ? { min: b.mins, max: b.maxs } : null; } catch { return null; } })();
        cols.push({ h: c.handle, name: P.colliderName(c.handle) || (g.npcColliders.has(c.handle) ? 'npc' : ''), type, enabled: c.isEnabled(), sensor: c.isSensor(),
          x: +t.x.toFixed(2), y: +t.y.toFixed(2), z: +t.z.toFixed(2), ...pol(t.x, t.z), half: sh.halfExtents ? { x: +sh.halfExtents.x.toFixed(2), y: +sh.halfExtents.y.toFixed(2), z: +sh.halfExtents.z.toFixed(2) } : undefined,
          radius: sh.radius !== undefined ? +sh.radius.toFixed(2) : undefined, aabb });
      });
      const zoneAt = (x, z) => { const { r, th } = pol(x, z); if (r < 22) return 'centro'; let best = null, bd = 999; for (const s of [['no_me_guillo', 36], ['nosvamosdeaqui', 324], ['yinyang', 252], ['tratratra', 180], ['fashion_girl', 108]]) { const d = Math.abs(((th - s[1] + 540) % 360) - 180); if (d < bd) { bd = d; best = s[0]; } } return best; };
      for (const c of cols) c.sector = zoneAt(c.x, c.z);
      const props = P.propSlots.map((s) => ({ kind: s.kind, x: +s.x.toFixed(2), z: +s.z.toFixed(2), y: s.y, h: s.h, ...pol(s.x, s.z), sector: zoneAt(s.x, s.z) }));
      const fries = g.manifest.fries.map((f) => ({ id: f.id, x: +f.pos.x.toFixed(2), y: +f.pos.y.toFixed(2), z: +f.pos.z.toFixed(2), ...pol(f.pos.x, f.pos.z), access: f.access }));
      const cassettes = g.manifest.cassettes.map((c) => ({ zone: c.zone, x: +c.pos.x.toFixed(2), z: +c.pos.z.toFixed(2), ...pol(c.pos.x, c.pos.z) }));
      const anchors = [...g.manifest.anchors.entries()].map(([id, a]) => ({ id, x: +a.pos.x.toFixed(2), y: +a.pos.y.toFixed(2), z: +a.pos.z.toFixed(2), ...pol(a.pos.x, a.pos.z) }));
      const zones = [...P.zones.entries()].map(([id, z]) => ({ id, x: +z.pos.x.toFixed(2), z: +z.pos.z.toFixed(2), r: z.r, ...pol(z.pos.x, z.pos.z) }));
      return { world: W ?? null, colliders: cols, props, fries, cassettes, anchors, zones, spawn: { ...g.manifest.spawn.pos }, validate: g.manifest.validate() };
    });
    const dir = path.join(path.resolve(R.dir), '..', '..', '..', '..', 'V4', 'evidencias', 'MAP-01');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `layout_${tag}.json`), JSON.stringify(dump, null, 1));
    R.nonEmpty(dump.colliders, 'colliders del mundo');
    R.check(dump.fries.length === 20 && dump.cassettes.length === 6, '20 patatas y 6 cassettes en el manifiesto', 'static', { fries: dump.fries.length, cassettes: dump.cassettes.length, validate: dump.validate });
    // ocupación por banda radial y sector (colliders sólidos no-suelo)
    const solids = dump.colliders.filter((c) => c.name && !/^(ground|bound)$/.test(c.name));
    const bands = {}; for (const c of solids) { const k = `${c.sector}|${c.r < 25 ? '22-25' : c.r < 38 ? '25-38' : c.r < 42 ? '38-42' : c.r < 46 ? '42-46' : '46+'}`; bands[k] = (bands[k] ?? 0) + 1; }
    R.note({ bandas_colliders: bands });
    const out = [...dump.props, ...solids].filter((o) => o.sector !== 'centro' && o.r > 38 && o.r < 46.5);
    R.note({ objetos_entre_r38_y_46: out.length });
    R.check(true, `volcado guardado en V4/evidencias/MAP-01/layout_${tag}.json`, 'static', { colliders: dump.colliders.length, props: dump.props.length, r38_46: out.length });
  } finally { await browser.close(); }
});
