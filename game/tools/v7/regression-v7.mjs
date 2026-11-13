// V7 T7-13 · Regresión fuera de TRA TRA TRA (adaptación de tools/v6/regression-nmg.mjs, que comparaba V5↔V6 con FG como
// excepción): compara la base V6 FINAL R7 (copia de dist-v6 servida en 5223) con V7 (--url) en TODO lo que no es TT: colliders
// (nombre, tipo, forma, posición, rotación), piezas visuales del Builder (trozo, material, caja), anclas, patatas, cassettes,
// checkpoints y props. La excepción pasa de FG a TT (sector 144–216° de la corona, r 22–42): FASHION GIRL y NO ME GUILLO
// finales quedan DENTRO de lo que debe ser idéntico. Lo de TT se lista aparte.
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';
const R = new Report('regression-v7');
const BASE = 'http://127.0.0.1:5223/';
const dump = (page) => page.evaluate(() => {
  const g = window.__bk, P = g.park, r3 = (v) => Math.round(v * 1000) / 1000;
  const th = (x, z) => ((Math.atan2(x, -z) * 180 / Math.PI) + 360) % 360, rr = (x, z) => Math.hypot(x, z);
  const isFG = (x, z) => { const t = th(x, z), r = rr(x, z); return t > 143.9 && t < 216.1 && r > 21.9 && r < 42.1; };   // V7: «fg» = excepción = TT
  const cols = []; g.world.forEachCollider((c) => { const t = c.translation(), q = c.rotation(), sh = c.shape; const he = sh.halfExtents ? [r3(sh.halfExtents.x), r3(sh.halfExtents.y), r3(sh.halfExtents.z)] : sh.radius !== undefined ? [r3(sh.radius), r3(sh.halfHeight ?? 0)] : [];
    const n = P.colliderName(c.handle); cols.push({ n, type: sh.type, he, p: [r3(t.x), r3(t.y), r3(t.z)], q: [r3(q.x), r3(q.y), r3(q.z), r3(q.w)], fg: isFG(t.x, t.z) || /^(tt_|limo)/.test(n) }); });   // trimesh/hull FG: vértices en mundo, traslación 0
  const pieces = P.b.pieces.map((p) => ({ ...p, fg: p.chunk === 'tratratra' || p.chunk === 'proxy_limo' || p.chunk === 'ground' || p.chunk === 'signs' && /tt_lettering/.test(p.name) || isFG((p.min[0] + p.max[0]) / 2, (p.min[2] + p.max[2]) / 2) }));
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
    R.measure('colliders_no_TT', { base: A.cols.filter(nf).length, v7: B.cols.filter(nf).length, soloBase: goneA.slice(0, 20), soloV7: newB.slice(0, 20) });
    R.check(goneA.length === 0 && newB.length === 0, 'colliders fuera de TT idénticos, incluidos FG y NMG (salvo losas de suelo)', 'static', { soloBase: goneA.length, soloV7: newB.length });
    // suelo: mismas losas (V7 no abre huecos en la plaza: H es un hueco de la losa elevada) y franjas de NMG idénticas
    const gA = A.cols.filter((c) => c.n === 'ground'), gB = B.cols.filter((c) => c.n === 'ground');
    R.measure('losas_suelo', { base: gA.length, v7: gB.length });
    R.check(key(gA.map((c) => [c.p, c.he, c.q]).sort()) === key(gB.map((c) => [c.p, c.he, c.q]).sort()), 'losas de colisión del suelo idénticas en todo el parque (TT no recorta la plaza)', 'static', { n: gB.length });
    const nmgStrips = (arr) => arr.filter((c) => { const t = ((Math.atan2(c.p[0], -c.p[2]) * 180 / Math.PI) + 360) % 360; return t < 72 && Math.hypot(c.p[0], c.p[2]) < 45 && c.q[1] !== 0; });
    R.check(key(nmgStrips(gA)) === key(nmgStrips(gB)), 'franjas del hoyo de la U de NMG idénticas', 'static', { n: nmgStrips(gA).length });
    const pz = (arr) => arr.filter((p) => !p.fg);
    const pg = diff(pz(A.pieces), pz(B.pieces)), pn = diff(pz(B.pieces), pz(A.pieces));
    R.check(pg.length === 0 && pn.length === 0, 'piezas visuales fuera de TT idénticas, incluidas las de FG y NMG (trozo, material, caja)', 'static', { soloBase: pg.slice(0, 8), soloV7: pn.slice(0, 8) });
    const notFGa = (a) => !/^(tt\.|bridge\.|cam\.bridge|npc\.(aissa|juseph))/.test(a.k);
    R.check(diff(A.anchors.filter(notFGa), B.anchors.filter(notFGa)).length === 0, 'anclas ajenas a TT idénticas (FG, NMG, NV, YY, centro)', 'static');
    const fz = (f) => !f.id.startsWith('tratratra.');
    R.check(key(A.fries.filter(fz)) === key(B.fries.filter(fz)) && B.fries.length === 20, '20 patatas; las 16 ajenas a TT idénticas', 'static', { n: B.fries.length });
    R.check(B.cass.length === 6 && key(A.cass.filter((c) => c.z !== 'tratratra')) === key(B.cass.filter((c) => c.z !== 'tratratra')), '6 cassettes; los 5 ajenos a TT idénticos', 'static');
    const cz = (c) => c.id !== 'cp.tratratra';
    R.check(key(A.cps.filter(cz)) === key(B.cps.filter(cz)) && key(A.spawn) === key(B.spawn) && B.cps.some((c) => c.id === 'cp.tratratra'), 'checkpoints ajenos a TT y punto de partida idénticos', 'static');
    const inFG = (s) => { const [x, z] = s.split('@')[1].split(',').map(Number); const t = ((Math.atan2(x, -z) * 180 / Math.PI) + 360) % 360; return t > 143.9 && t < 216.1 && Math.hypot(x, z) < 42.1; };
    const npA = A.props.filter((s) => !inFG(s)), npB = B.props.filter((s) => !inFG(s));
    R.check(key(npA) === key(npB), 'props (vegetación/mobiliario de NMG, FG y resto) idénticos salvo los de TT', 'static', { a: npA.length, b: npB.length });
    R.measure('props_cambiados', { soloBase: A.props.filter((s) => !B.props.includes(s)), soloV7: B.props.filter((s) => !A.props.includes(s)) });
    // V7: contratos que consumen las pruebas heredadas por índice/nombre
    const extra = await pb.evaluate(() => { const g = window.__bk; return { acts: g.activities.map((a) => a.id), fgLadder: g.manifest.ladders.find((l) => l.id === 'fg'), zones: ['act.ladderFoot', 'act.ladderTop', 'act.bridgeTalk', 'act.danceCombo', 'act.pantherTalk'].map((z) => g.park.zones.has(z)) }; });
    const extraA = await pa.evaluate(() => window.__bk.activities.map((a) => a.id));
    R.check(key(extra.acts) === key(extraA), 'actividades en el mismo orden e ids que la base (pruebas por índice)', 'static', extra.acts);
    R.check(!!extra.fgLadder && extra.fgLadder.bottom === 0 && extra.fgLadder.footZone === 'act.ladderFoot' && extra.zones.every(Boolean), 'la escalera de FG es la instancia `fg` (base 0) con sus zonas de siempre', 'static', { bottom: extra.fgLadder?.bottom, top: extra.fgLadder?.top });
  } finally { await b.close(); }
});
