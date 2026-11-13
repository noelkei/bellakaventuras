// V10.3 R4 · guardián de la vegetación (V-01, V-02, V-04, W-D27, W-D28):
//  · ninguna planta de escenario (palmeras, árboles, matas del juego) a r > 42 (las 19 de fuera se quitaron);
//  · cada planta de dentro está sobre una isla (a ≤ 1,1 m del centro de una isla `bed`);
//  · ninguna isla pisa los paseos rosas (r 22–25 y 38–42) ni se mete en una colisión (salvo el tronco de su palmera o árbol);
//  · las islas y plantas de SECRETNOVIO están ocultas antes de 20 y a la vista (y a ras de suelo) con el reto abierto.
import { Report, runTest, launch, openGame, clickStart, sleep, SAVE_20 } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
const R = new Report('plantas-sitio');
const read = (page) => page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier;
  for (let i = 0; i < 100 && !g.park.nmgKit?.ok; i++) await new Promise((r) => setTimeout(r, 100));
  const beds = []; const m = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
  g.scene.traverse((o) => { if (o.isInstancedMesh && /^nmg_bed_(islas|sn)$/.test(o.name)) { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.premultiply(o.matrixWorld).decompose(p, q, s);
      if (!beds.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < 0.05)) beds.push({ x: p.x, z: p.z, y: p.y, yaw: new T.Euler().setFromQuaternion(q, 'YXZ').y, sn: o.name === 'nmg_bed_sn', vis: o.visible }); } } });
  const plants = g.park.propSlots.filter((s) => /palm|tree|shrub|plant/.test(s.kind)).map((s) => ({ kind: s.kind, x: s.x, z: s.z, r: Math.hypot(s.x, s.z), group: s.group ?? '' }));
  const F = RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC, hits = [];
  for (const b of beds) { if (b.sn && !b.vis) continue; const qq = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), b.yaw);
    g.world.intersectionsWithShape({ x: b.x, y: 1.1, z: b.z }, { x: qq.x, y: qq.y, z: qq.z, w: qq.w }, new RA.Cuboid(0.95, 1.0, 0.95), (c) => { const n = g.park.colliderNames.get(c.handle) ?? '?'; if (!/trunk/.test(n)) hits.push({ bed: [+b.x.toFixed(1), +b.z.toFixed(1)], n }); return true; }, F); }
  const snProps = []; g.scene.traverse((o) => { if (o.isInstancedMesh && /^PROP_.*_sn$/.test(o.name)) snProps.push({ n: o.name, vis: o.visible, y: +o.position.y.toFixed(2) }); });
  return { beds, plants, hits, snProps, ok: g.park.nmgKit?.ok }; });
await runTest(R, async () => {
  const b = await launch();
  try {
    { const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(1500);
      const d = await read(page); R.measure('islas', { n: d.beds.length, sn: d.beds.filter((x) => x.sn).length, plantas: d.plants.length, kit: d.ok });
      const far = d.plants.filter((p) => p.r > 42); R.check(far.length === 0, `ninguna planta de escenario a r > 42 (${far.length})`, 'input', far.slice(0, 6));
      const loose = d.plants.filter((p) => p.r <= 42 && !d.beds.some((bb) => Math.hypot(bb.x - p.x, bb.z - p.z) <= 1.1));
      R.check(d.beds.length >= 20 && loose.length === 0, `cada planta de dentro está en una isla (${d.plants.length} plantas, ${d.beds.length} islas; sueltas ${loose.length})`, 'input', loose.slice(0, 8));
      const onPath = d.beds.filter((bb) => { const r = Math.hypot(bb.x, bb.z); return (r + 0.95 > 22 && r - 0.95 < 25) || (r + 0.95 > 38 && r - 0.95 < 42); });
      R.check(onPath.length === 0, `ninguna isla pisa los paseos rosas (${onPath.length})`, 'input', onPath);
      R.check(d.hits.length === 0, `ninguna isla se mete en una colisión (salvo su tronco) (${d.hits.length})`, 'input', d.hits.slice(0, 8));
      R.check(d.snProps.length > 0 && d.snProps.every((x) => x.vis && Math.abs(x.y) < 0.01) && d.beds.filter((x) => x.sn).every((x) => x.vis && Math.abs(x.y - d.beds.find((q) => !q.sn).y) < 0.01), 'con el reto abierto las islas y plantas de SN se ven a ras de suelo (a la altura de las demás islas)', 'input', { props: d.snProps, beds: d.beds.filter((x) => x.sn) });
      await page.close(); }
    { const page = await openGame(b, R, { save: FRESH }); await clickStart(page); await sleep(1500);
      const d = await read(page); const sn = d.beds.filter((x) => x.sn);
      R.check(sn.length >= 3 && sn.every((x) => !x.vis) && d.snProps.length > 0 && d.snProps.every((x) => !x.vis), `antes de 20 las islas y plantas de SN están ocultas (${sn.length} islas)`, 'input', { sn, props: d.snProps });
      await page.close(); }
  } finally { await b.close(); }
}, { timeoutMs: 300000 });
