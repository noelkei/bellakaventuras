// V6 T6-13 · Regresión fuera de FASHION GIRL: compara la base V5 (copia servida en 5213) con V6 (--url) en TODO lo que no es
// FG: colliders (nombre, tipo, forma, posición, rotación), piezas visuales del Builder (trozo, material, caja), anclas,
// patatas, cassettes, checkpoints, slots del kit NMG y props. Lo de FG (sector 72–144° de la corona) se lista aparte.
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';
const R = new Report('regression-nmg');
const BASE = 'http://127.0.0.1:5213/';
const dump = (page) => page.evaluate(() => {
  const g = window.__bk, P = g.park, r3 = (v) => Math.round(v * 1000) / 1000;
  const th = (x, z) => ((Math.atan2(x, -z) * 180 / Math.PI) + 360) % 360, rr = (x, z) => Math.hypot(x, z);
  const isFG = (x, z) => { const t = th(x, z), r = rr(x, z); return t > 71.9 && t < 144.1 && r > 21.9 && r < 42.1; };
  const cols = []; g.world.forEachCollider((c) => { const t = c.translation(), q = c.rotation(), sh = c.shape; const he = sh.halfExtents ? [r3(sh.halfExtents.x), r3(sh.halfExtents.y), r3(sh.halfExtents.z)] : sh.radius !== undefined ? [r3(sh.radius), r3(sh.halfHeight ?? 0)] : [];
    const n = P.colliderName(c.handle); cols.push({ n, type: sh.type, he, p: [r3(t.x), r3(t.y), r3(t.z)], q: [r3(q.x), r3(q.y), r3(q.z), r3(q.w)], fg: isFG(t.x, t.z) || n.startsWith('fg_') }); });   // trimesh/hull FG: vértices en mundo, traslación 0
  const pieces = P.b.pieces.map((p) => ({ ...p, fg: p.chunk === 'fashion_girl' || p.chunk.startsWith('proxy_fgprops') || p.chunk === 'ground' || isFG((p.min[0] + p.max[0]) / 2, (p.min[2] + p.max[2]) / 2) }));
  const anchors = [...P.manifest.anchors.entries()].map(([k, a]) => ({ k, p: a.pos.toArray().map(r3), h: r3(a.heading) }));
  const fries = P.manifest.fries.map((f) => ({ id: f.id, p: f.pos.toArray().map(r3), hover: f.hover }));
  const cass = P.manifest.cassettes.map((c) => ({ z: c.zone, p: c.pos.toArray().map(r3) }));
  return { cols, pieces, anchors, fries, cass, cps: P.manifest.checkpoints.map((c) => ({ id: c.id, p: c.pos.toArray().map(r3) })), spawn: P.manifest.spawn.pos.toArray().map(r3), props: P.propSlots.map((s) => `${s.kind}@${r3(s.x)},${r3(s.z)}`) };
});
const key = (o) => JSON.stringify(o);
await runTest(R, async () => {
  const b = await launch();
  try {
    const pa = await openGame(b, R, { url: BASE }); await clickStart(pa); await sleep(800); const A = await dump(pa);
    const pb = await openGame(b, R); await clickStart(pb); await sleep(800); const B = await dump(pb);
    const ms = (arr) => { const m = new Map(); for (const x of arr) { const k = key(x); m.set(k, (m.get(k) ?? 0) + 1); } return m; };
    const diff = (a, b) => { const ma = ms(a), mb = ms(b), only = []; for (const [k, n] of ma) if ((mb.get(k) ?? 0) < n) only.push(k); return only; };
    // colliders ajenos a FG (excluye suelo: la rejilla se recompone alrededor del nuevo hueco; se mide aparte)
    const nf = (c) => !c.fg && c.n !== 'ground';
    const goneA = diff(A.cols.filter(nf), B.cols.filter(nf)), newB = diff(B.cols.filter(nf), A.cols.filter(nf));
    R.measure('colliders_no_FG', { base: A.cols.filter(nf).length, v6: B.cols.filter(nf).length, soloBase: goneA.slice(0, 20), soloV6: newB.slice(0, 20) });
    R.check(goneA.length === 0 && newB.length === 0, 'colliders fuera de FG idénticos (salvo losas de suelo)', 'static', { soloBase: goneA.length, soloV6: newB.length });
    // suelo: las losas NMG y su hueco idénticos; cobertura del suelo sin huecos nuevos fuera del pozo FG (rayos)
    const gA = A.cols.filter((c) => c.n === 'ground'), gB = B.cols.filter((c) => c.n === 'ground');
    R.measure('losas_suelo', { base: gA.length, v6: gB.length });
    const nmgStrips = (arr) => arr.filter((c) => { const t = ((Math.atan2(c.p[0], -c.p[2]) * 180 / Math.PI) + 360) % 360; return t < 72 && Math.hypot(c.p[0], c.p[2]) < 45 && c.q[1] !== 0; });
    R.check(key(nmgStrips(gA)) === key(nmgStrips(gB)), 'franjas del hoyo de la U de NMG idénticas', 'static', { n: nmgStrips(gA).length });
    const pz = (arr) => arr.filter((p) => !p.fg);
    const pg = diff(pz(A.pieces), pz(B.pieces)), pn = diff(pz(B.pieces), pz(A.pieces));
    R.check(pg.length === 0 && pn.length === 0, 'piezas visuales fuera de FG idénticas (trozo, material, caja)', 'static', { soloBase: pg.slice(0, 8), soloV6: pn.slice(0, 8) });
    const notFGa = (a) => !/^(fg\.|girl\.|dance\.|board\.park|cam\.dance)/.test(a.k);
    R.check(diff(A.anchors.filter(notFGa), B.anchors.filter(notFGa)).length === 0, 'anclas ajenas a FG idénticas', 'static');
    const fz = (f) => !f.id.startsWith('fashion_girl.');
    R.check(key(A.fries.filter(fz)) === key(B.fries.filter(fz)) && B.fries.length === 20, '20 patatas; las 16 ajenas a FG idénticas', 'static', { n: B.fries.length });
    R.check(B.cass.length === 6 && key(A.cass.filter((c) => c.z !== 'fashion_girl')) === key(B.cass.filter((c) => c.z !== 'fashion_girl')), '6 cassettes; los 5 ajenos a FG idénticos', 'static');
    R.check(key(A.cps) === key(B.cps) && key(A.spawn) === key(B.spawn), 'checkpoints y punto de partida idénticos', 'static');
    const inFG = (s) => { const [x, z] = s.split('@')[1].split(',').map(Number); const t = ((Math.atan2(x, -z) * 180 / Math.PI) + 360) % 360; return t > 71.9 && t < 144.1 && Math.hypot(x, z) < 42.1; };
    const npA = A.props.filter((s) => !inFG(s)), npB = B.props.filter((s) => !inFG(s));
    R.check(key(npA) === key(npB), 'props (vegetación/mobiliario NMG y resto) idénticos salvo los de FG', 'static', { a: npA.length, b: npB.length });
    R.measure('props_cambiados', { soloBase: A.props.filter((s) => !B.props.includes(s)), soloV6: B.props.filter((s) => !A.props.includes(s)) });
  } finally { await b.close(); }
});
