// V10.2 · Q13 (D-13; usuario: «una animación mejor, más exagerada, que mueva la mano de arriba abajo y de izquierda a derecha, como un zigzag,
// empieza izquierda, luego derecha, luego izquierda y acaba en derecha, que doble y rote hacia fuera las rodillas, como esforzándose, que use
// el asset 3d de lata… partículas rosas… y que la mano coja de forma bien animada la lata»). En pared y en suelo:
// · dura ~3 s (2,7–3,3); la lata (`ANMI_SPRAY_CAN`, la del usuario) va en la mano derecha todo el espray y su boquilla apunta al dibujo;
// · la boquilla (donde apunta) hace zigzag en el plano del dibujo: izquierda → derecha → izquierda → derecha (4 extremos), amplio (≥ 50 % del
//   ancho del dibujo) y bajando; la mano casi no entra ni sale de la pared;
// · rodillas dobladas (≤ 160°) y hacia fuera (rodillas más separadas que los tobillos + 6 cm); la suela no se hunde ni flota (± 4 mm);
// · partículas rosas (`SPRAY_FX`) mientras pinta (no con «reducir movimiento»); el dibujo se revela con una máscara (no por opacidad);
// · al acabar: lata guardada y el brazo vuelve a su pose.
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, SAVE_20 } from '../v8/lib.mjs';
const R = new Report('grafitear');
const REC = () => { window.__t102g = []; const g = window.__bk, T = window.__bkTHREE, V = g.visual, f = g.activities.find((a) => a.id === 'freeDance');
  const bone = (n) => { let b = null; V.root.traverse((o) => { if (!b && o.isBone && o.name.endsWith(n)) b = o; }); return b; };
  const B = Object.fromEntries(['RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot', 'Hips'].map((n) => [n, bone(n)]));
  const W = (o) => o.getWorldPosition(new T.Vector3()).toArray();
  const loop = () => { const P = f.painting; let can = null, noz = null, fx = null;
    V.root.traverse((o) => { if (o.name === 'ANMI_SPRAY_CAN') can = o; if (o.name === 'ANMI_SPRAY_NOZZLE') noz = o; }); g.scene.traverse((o) => { if (o.name === 'SPRAY_FX') fx = o; });
    let sole = Infinity; if (V.body && V.soleIdx?.length) { V.body.skeleton.update(); const v = new T.Vector3(); for (const i of V.soleIdx) { V.body.getVertexPosition(i, v).applyMatrix4(V.body.matrixWorld); sole = Math.min(sole, v.y); } }
    const nd = noz ? new T.Vector3(0, 0, 1).transformDirection(noz.matrixWorld).toArray() : null;
    window.__t102g.push({ t: performance.now(), p: !!P, k: P ? P.t : null, hand: W(B.RightHand), bones: Object.fromEntries(Object.entries(B).map(([k, b]) => [k, b ? W(b) : null])), can: can ? { vis: can.visible && (() => { let v = true; can.traverseAncestors((a) => { if (!a.visible) v = false; }); return v; })(), p: W(can) } : null,
      noz: noz ? { p: W(noz), d: nd } : null, fx: fx ? { vis: fx.visible, n: fx.userData.live ?? 0, col: fx.material?.color?.toArray?.() ?? null } : null, sole, alphaMap: !!P?.mat?.alphaMap, op: P?.mat?.opacity ?? null, entry: P ? P.entry : null });
    if (window.__t102g.length < 4000) requestAnimationFrame(loop); }; requestAnimationFrame(loop); };
const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), len = (a) => Math.hypot(...a), cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = len(a) || 1; return a.map((v) => v / l); };
const angle = (a, b, c) => { const u = norm(sub(a, b)), v = norm(sub(c, b)); return Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180 / Math.PI; };
function extrema(xs, prom) { const out = []; let dir = 0, last = xs[0], lastI = 0;   // extremos alternos con prominencia ≥ prom; el punto de salida cuenta como extremo
  { let j = 1; while (j < xs.length && Math.abs(xs[j] - xs[0]) < prom) j++; if (j < xs.length) out.push({ i: 0, v: xs[0], kind: xs[j] > xs[0] ? 'min' : 'max' }); }
  for (let i = 1; i < xs.length; i++) { const x = xs[i];
    if (dir >= 0 && x > last) { last = x; lastI = i; dir = 1; } else if (dir <= 0 && x < last) { last = x; lastI = i; dir = -1; }
    else if (dir === 1 && last - x >= prom) { out.push({ i: lastI, v: last, kind: 'max' }); dir = -1; last = x; lastI = i; }
    else if (dir === -1 && x - last >= prom) { out.push({ i: lastI, v: last, kind: 'min' }); dir = 1; last = x; lastI = i; } }
  out.push({ i: lastI, v: last, kind: dir === 1 ? 'max' : 'min' }); return out; }
async function paintCase(b, where, reduced) {
  const page = await openGame(b, R, { save: { ...SAVE_20, settings: reduced ? { reducedMotion: true, reducedMotionSet: true } : {} } }); await clickStart(page); await sleep(1500);
  if (where === 'pared') await fixture(page, R, 'ANMI a 1,3 m de una pared lisa (lateral oeste de A de SN)', () => { const g = window.__bk, T = window.__bkTHREE, th = g.park.sn.group.rotation.y, P0 = new T.Vector3(-5.8, 0, -12.8).applyAxisAngle(new T.Vector3(0, 1, 0), th); g.skater.teleport(P0, Math.PI / 2 + th, 'walk'); g.rig.snapBehind(g.skater); });
  else await fixture(page, R, 'ANMI en la plaza de salida mirando a suelo libre', () => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(40, 0, -40), -Math.PI / 4, 'walk'); g.rig.snapBehind(g.skater); });
  await sleep(900); await page.evaluate(REC); await sleep(300);
  await page.keyboard.press('Digit5'); await sleep(4200);
  const L = await page.evaluate(() => window.__t102g); const tag = `${where}${reduced ? ' (reducido)' : ''}`;
  const P = L.filter((x) => x.p), pre = L.filter((x) => !x.p && x.t < (P[0]?.t ?? 0)), post = L.filter((x) => !x.p && x.t > (P.at(-1)?.t ?? 0) + 600);
  if (P.length < 20) { R.check(false, `${tag}: pinta (${P.length} fotogramas pintando)`, 'input'); await page.close(); return; }
  const dur = (P.at(-1).t - P[0].t) / 1000, e = P[0].entry, n = norm(e.n), u = norm(e.u), r = norm(cross(u, n)), A = [0.6855, 1.0354, 0.8809, 2.3011][e.i], wDraw = e.s * A;
  R.check(dur >= 2.7 && dur <= 3.3, `${tag}: grafitear dura ${dur.toFixed(2)} s (≈ 3 s)`, 'input');
  const mid = P.filter((x) => x.k > 0.45 && x.k < dur - 0.35);   // el espray (sin coger ni guardar la lata)
  const canIn = mid.filter((x) => x.can?.vis && len(sub(x.can.p, x.hand)) < 0.15).length;
  R.check(canIn === mid.length && mid.length > 10, `${tag}: la lata va en la mano derecha todo el espray (${canIn}/${mid.length} fotogramas a < 15 cm de la mano)`, 'vision');
  // dónde apunta la boquilla: corte de su dirección con el plano del dibujo
  const aim = mid.filter((x) => x.noz).map((x) => { const o = x.noz.p, d = x.noz.d, den = dot(d, n); if (den > -0.2) return null; const tt = dot(sub(e.p, o), n) / den; const hit = o.map((v, i) => v + d[i] * tt); const q = sub(hit, e.p); return [dot(q, r), dot(q, u), -den]; }).filter(Boolean);
  R.check(aim.length >= mid.length * 0.9 && aim.every((a) => a[2] > 0.5), `${tag}: la boquilla apunta al dibujo (${aim.length}/${mid.length}; coseno mín ${aim.length ? Math.min(...aim.map((a) => a[2])).toFixed(2) : '—'})`, 'vision');
  if (aim.length > 10) {
    const xs = aim.map((a) => a[0]), ys = aim.map((a) => a[1]), span = Math.max(...xs) - Math.min(...xs), ex = extrema(xs, Math.max(0.04, 0.15 * span));
    const seq = ex.map((x) => (x.kind === 'min' ? 'I' : 'D')).join('');
    R.check(seq === 'IDID',
      `${tag}: zigzag izquierda → derecha → izquierda → derecha (extremos ${seq}, I = izquierda)`, 'vision', ex.map((x) => +x.v.toFixed(2)));
    R.check(span >= (reduced ? 0.25 : 0.5) * wDraw, `${tag}: zigzag amplio: ${span.toFixed(2)} m de ${wDraw.toFixed(2)} m de ancho (≥ ${reduced ? 25 : 50} %)`, 'vision');
    const q = Math.max(1, Math.floor(ys.length / 4)), y0 = ys.slice(0, q).reduce((s, v) => s + v, 0) / q, y1 = ys.slice(-q).reduce((s, v) => s + v, 0) / q;
    R.check(y1 < y0 - 0.1 * e.s, `${tag}: el zigzag baja (de ${y0.toFixed(2)} a ${y1.toFixed(2)} m)`, 'vision');
  }
  // rodillas: dobladas y hacia fuera; suela
  const kn = mid.map((x) => { const B = x.bones; const aL = angle(B.LeftUpLeg, B.LeftLeg, B.LeftFoot), aR = angle(B.RightUpLeg, B.RightLeg, B.RightFoot);
    const side = norm(sub(B.RightUpLeg, B.LeftUpLeg)), kS = Math.abs(dot(sub(B.RightLeg, B.LeftLeg), side)), fS = Math.abs(dot(sub(B.RightFoot, B.LeftFoot), side)); return { aL, aR, out: kS - fS }; });
  const kMax = Math.max(...kn.map((k) => Math.max(k.aL, k.aR))), outMin = Math.min(...kn.map((k) => k.out));
  R.check(kMax <= 160 && outMin >= 0.06, `${tag}: rodillas dobladas (ángulo máx ${kMax.toFixed(0)}°, ≤ 160°) y hacia fuera (rodillas ${(outMin * 100).toFixed(0)} cm más abiertas que los tobillos, ≥ 6)`, 'vision');
  const s0 = pre.length ? Math.min(...pre.slice(-10).map((x) => x.sole)) : null, sd = P.map((x) => x.sole - s0);
  R.measure(`suela_${tag}`, P.filter((_, i) => i % 4 === 0).map((x) => [+x.k.toFixed(2), +((x.sole - s0) * 1000).toFixed(1)]));
  R.check(s0 !== null && sd.every((d) => Math.abs(d) <= 0.004), `${tag}: la suela no se hunde ni flota (${(Math.min(...sd) * 1000).toFixed(1)}…${(Math.max(...sd) * 1000).toFixed(1)} mm, ± 4)`, 'vision');
  // partículas y revelado
  const fxN = Math.max(0, ...mid.map((x) => x.fx?.vis ? x.fx.n : 0)), col = mid.find((x) => x.fx?.col)?.fx.col;
  if (!reduced) R.check(fxN >= 10 && col && col[0] > col[2] * 0.9 && col[0] > col[1] * 1.2, `${tag}: partículas rosas mientras pinta (${fxN} vivas, color ${col?.map((v) => v.toFixed(2))})`, 'vision');
  else R.check(fxN === 0, `${tag}: sin partículas con «reducir movimiento» (${fxN})`, 'emulation');
  const half = P[Math.floor(P.length / 2)];
  R.check(half.alphaMap && half.op >= 0.99, `${tag}: el dibujo se revela con una máscara a mitad (alphaMap ${half.alphaMap}, opacidad ${half.op})`, 'vision');
  // al acabar
  const last = post.at(-1) ?? L.at(-1), base = pre.at(-1);
  R.check(last && !last.can?.vis && len(sub(last.hand, base.hand)) < 0.08, `${tag}: al acabar la lata se guarda y la mano vuelve (${last ? (len(sub(last.hand, base.hand)) * 100).toFixed(1) : '—'} cm de su sitio)`, 'vision');
  await R.shot(page, `fin_${where}${reduced ? '_reducido' : ''}`);
  await page.close();
}
await runTest(R, async () => {
  const b = await launch();
  await paintCase(b, 'pared', false); await paintCase(b, 'suelo', false); await paintCase(b, 'pared', true);
  await b.close();
}, { timeoutMs: 600000 });
