// V4-ANIM-01/02 · Continuidad y contacto con ENTRADA REAL (teclado) y el rig servido (anmi.glb). Grabador por fotograma
// enganchado a Game.render: estado del controlador, vLong, pesos de clip y posición mundial de los huesos de pie/punta.
// Segmentos: andar (W), andar atrás (S), montar (Q), empujar (W), rodar (soltar), frenar (S), reversa (S mantenido).
// Medidas: deslizamiento horizontal del pie APOYADO en el suelo (vértice de suela < 1,5 cm del suelo por raycast) frente a la velocidad del
// cuerpo; clip dominante por estado; ausencia de SK_Push en reversa/frenada; yaw visible = rumbo (sin π en reversa).
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, launch, openGame, clickStart, sleep, GAME } from './lib.mjs';
const R = new Report('ANIM-02', 'anim-v4');
// PASOS FIJOS (Game.simulate: simulación + presentación a 1/60 s; el bucle real solo dibuja): la medida no depende del
// ritmo de fotogramas del navegador (en tiempo real la fracción de apoyo quieto oscilaba 0,265–0,297 entre pasadas)
const seg = async (page, name, keys, ms) => {
  await page.evaluate((n) => { window.__animSeg = n; }, name);
  for (const k of keys) await page.keyboard.down(k);
  await page.evaluate((sec) => window.__bk.simulate(sec, () => window.__animRecord()), ms / 1000);
  for (const k of keys) await page.keyboard.up(k);
};
const idle = (page, ms) => page.evaluate((sec) => window.__bk.simulate(sec, () => window.__animRecord()), ms / 1000);
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    await clickStart(page); await sleep(800);
    // V5 (T5-19): --start x,y,z,rumbo opcional; con 20 m/s (D3) el empuje de 3,5 s recorre más que en V4 y desde el centro
    // del parque chocaba durante «rodar» (intento inválido). Por defecto, la explanada V4 de siempre.
    const START = (process.argv.find((a, i) => process.argv[i - 1] === '--start') ?? '-6,0,6,1.5707963').split(',').map(Number);
    await page.evaluate((START) => {
      const g = window.__bk, T = window.__bkTHREE, v = g.visual;
      document.getElementById('hint').hidden = true;
      // explanada libre: ANMI al centro del parque (vacío antes de 20) mirando a +X
      g.skater.teleport(new T.Vector3(START[0], START[1], START[2]), START[3], 'walk'); g.input.clear();
      const bones = {}; v.model.traverse((o) => { for (const k of ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase']) if (o.isBone && new RegExp(k + '$').test(o.name)) bones[k] = o; });
      window.__animRec = []; window.__animSeg = 'pre';
      const tmp = new T.Vector3(); g.autoMode = true;
      window.__animRecord = () => {
        const s = g.skater; if (!s) return;
        const fp = s.footPos, rec = { t: g.clock, seg: window.__animSeg, st: s.state, loco: s.loco, v: s.vLong, hv: Math.hypot(s.vel.x, s.vel.z), y0: fp.y, head: s.heading, yaw: v.root.rotation.y, feet: {} };
        for (const [k, b] of Object.entries(bones)) { b.getWorldPosition(tmp); rec.feet[k] = [tmp.x, tmp.y, tmp.z]; }
        // suela real: vértice deformado más bajo de cada pie (índices de suela del visual), y suelo por raycast
        v.model.updateMatrixWorld(true); v.body.skeleton.update();
        // pie de cada vértice de suela por su lado en la POSE DE REPOSO (estable; el signo lateral en mundo saltaba entre pies)
        const lo = { L: null, R: null }, bindX = v.body.geometry.attributes.position;
        for (const i of v.soleIdx) { v.body.getVertexPosition(i, tmp).applyMatrix4(v.body.matrixWorld); const side = bindX.getX(i) > 0 ? 'L' : 'R'; if (!lo[side] || tmp.y < lo[side][1]) lo[side] = [tmp.x, tmp.y, tmp.z]; }
        rec.sole = lo;
        // posiciones de TODOS los vértices de suela (para el deslizamiento por vértice en contacto)
        const arr = new Float32Array(v.soleIdx.length * 3); let k = 0;
        for (const i of v.soleIdx) { v.body.getVertexPosition(i, tmp).applyMatrix4(v.body.matrixWorld); arr[k++] = tmp.x; arr[k++] = tmp.y; arr[k++] = tmp.z; }
        (window.__animSole ??= []).push(arr); if (window.__animSole.length > 4000) window.__animSole.shift();
        const RA = window.__bkRapier, hit = g.world.castRay(new RA.Ray({ x: fp.x, y: fp.y + 0.5, z: fp.z }, { x: 0, y: -1, z: 0 }), 2, true, RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC, undefined, s.collider);
        rec.gy = hit ? fp.y + 0.5 - hit.timeOfImpact : null;
        const w = {}; for (const n of ['SK_WalkBoard', 'SK_IdleBoard', 'SK_Push', 'SK_Ride', 'SK_Idle', 'SK_Brake', 'SK_CarveL', 'SK_CarveR']) { const a = v.actions?.get(n); if (a) w[n] = +a.getEffectiveWeight().toFixed(3); } rec.w = w;
        rec.ts = v.actions?.get('SK_WalkBoard')?.timeScale ?? null;
        window.__animRec.push(rec); if (window.__animRec.length > 4000) window.__animRec.shift();
      };
      return Object.keys(bones);
    }, START);
    await sleep(300);
    await seg(page, 'andar', ['KeyW'], 3000); await idle(page, 300);
    await seg(page, 'andar_atras', ['KeyS'], 3000); await idle(page, 400);
    await seg(page, 'montar', ['KeyQ'], 120); await idle(page, 900);
    await seg(page, 'empujar', ['KeyW'], 3500);
    await seg(page, 'rodar', [], 1800);
    await seg(page, 'frenar', ['KeyS'], 1600);
    await seg(page, 'reversa', ['KeyS'], 2500);
    // deslizamiento por VÉRTICE: vértices de la zona de apoyo (a < 1 cm del punto más bajo del fotograma, en el suelo) seguidos
    // en dos fotogramas; por par se toma la mediana de su velocidad horizontal (rodar talón→punta no cuenta como patinar)
    const slideV = await page.evaluate((PLANT) => {
      const R = window.__animRec, S = window.__animSole, off = R.length - S.length, out = {};
      for (let f = 1; f < S.length; f++) {
        const a = R[f - 1 + off], b = R[f + off]; if (!a || !b || a.seg !== b.seg || a.st !== b.st || a.gy == null || b.gy == null) continue;
        const dt = b.t - a.t; if (dt <= 0 || dt > 0.05) continue;
        const A = S[f - 1], B = S[f]; const sp = [];
        // apoyo = zona de suela a < 1 cm del punto más bajo del fotograma (pertenece al pie que apoya) y en el suelo
        let lowA = Infinity; for (let i = 1; i < A.length; i += 3) lowA = Math.min(lowA, A[i]);
        if (lowA - a.gy > PLANT) continue;
        for (let i = 0; i < A.length; i += 3) if (A[i + 1] < lowA + 0.01 && B[i + 1] - b.gy < PLANT + 0.01) sp.push(Math.hypot(B[i] - A[i], B[i + 2] - A[i + 2]) / dt);
        if (sp.length < 4) continue; sp.sort((x, y) => x - y);
        const key = a.seg + '|' + a.st; (out[key] ??= { v: [], body: [] }).v.push(sp[sp.length >> 1]); out[key].body.push((a.hv + b.hv) / 2);
      }
      const res = {}; for (const [k, o] of Object.entries(out)) { const v = o.v.slice().sort((x, y) => x - y); res[k] = { n: v.length, median: +v[v.length >> 1].toFixed(3), p90: +v[Math.floor(0.9 * (v.length - 1))].toFixed(3), body: +(o.body.reduce((x, y) => x + y, 0) / o.body.length).toFixed(3), quieto: +(o.v.filter((x) => x < 0.6).length / Math.max(1, o.v.length)).toFixed(3) }; }
      return res;
    }, 0.015);
    const rec = await page.evaluate(() => window.__animRec);
    R.check(rec.length > 400, 'grabador por fotograma con datos', 'unit', { frames: rec.length });
    const by = (n) => rec.filter((r) => r.seg === n);
    // deslizamiento del pie apoyado EN EL SUELO: vértice de suela deformado más bajo de cada pie a < 1,5 cm del suelo medido
    // por raycast (las articulaciones tobillo/punta no sirven: su altura cambia con el ángulo del pie). El pie sobre la tabla
    // queda a ~10 cm del suelo y no cuenta.
    const PLANT = 0.015;   // (también en el cálculo por vértice)
    const slide = (rows, onlyState) => {
      const out = []; const ps = [];
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1], b = rows[i]; if (onlyState && (a.st !== onlyState || b.st !== onlyState)) continue;
        const dt = b.t - a.t; if (dt <= 0 || dt > 0.1) continue;
        for (const side of ['L', 'R']) {
          const pa = a.sole?.[side], pb = b.sole?.[side]; if (!pa || !pb || a.gy == null || b.gy == null) continue;
          const ha = pa[1] - a.gy, hb = pb[1] - b.gy;
          if (ha < PLANT && hb < PLANT) { out.push(Math.hypot(pb[0] - pa[0], pb[2] - pa[2]) / dt); ps.push((a.hv + b.hv) / 2); }
        }
      }
      out.sort((x, y) => x - y); const q = (p) => out.length ? +out[Math.floor(p * (out.length - 1))].toFixed(3) : null;
      const body = ps.length ? +(ps.reduce((x, y) => x + y, 0) / ps.length).toFixed(3) : null;
      return { n: out.length, median: q(0.5), p90: q(0.9), body };
    };
    const W = slideV['andar|walk'] ?? { n: 0 }, B = slideV['andar_atras|walk_back'] ?? { n: 0 };
    const P = slideV['empujar|push'] ?? { n: 0 };
    R.note({ deslizamiento_por_vertice: slideV, deslizamiento_punto_mas_bajo_diag: { andar: slide(by('andar'), 'walk'), andar_atras: slide(by('andar_atras'), 'walk_back') } });
    const soleH = (rows, st) => { const h = []; for (const r of rows) if (r.st === st && r.gy != null && r.sole?.L && r.sole?.R) h.push(Math.min(r.sole.L[1], r.sole.R[1]) - r.gy); h.sort((x, y) => x - y); const q = (p) => h.length ? +h[Math.floor(p * (h.length - 1))].toFixed(3) : null; return { n: h.length, p05: q(0.05), p50: q(0.5), p95: q(0.95) }; };
    const H = { quieta: soleH(by('andar_atras').concat(by('andar')), 'walk_idle'), andar: soleH(by('andar'), 'walk'), andar_atras: soleH(by('andar_atras'), 'walk_back') };
    R.note({ altura_suela_mas_baja_m: H });
    R.check(['andar', 'andar_atras'].every((k) => H[k].n > 30 && H[k].p50 > -0.02 && H[k].p50 < 0.02), 'andando (adelante y atrás) el pie más bajo toca el suelo: mediana de la suela más baja dentro de ±2 cm', 'vision', H);
    R.note({ deslizamiento: { andar: W, andar_atras: B, empujar_pie_en_suelo: P } });
    // criterio fijado tras la medida base (11 oct): en el clip cada pie apoya el 46–54 % del ciclo (walk_clip_metrics.py en
    // el GLB servido). En juego, la zona de apoyo debe estar casi quieta en el mundo (< 0,6 m/s) en al menos el 35 % de los
    // fotogramas (≈70 % del apoyo; el resto es doble apoyo y rodadura talón→punta, donde el punto más bajo se mueve).
    // La mediana global NO es criterio: mezcla apoyo y rodadura (se informa como diagnóstico).
    // Referencia del CLIP con la misma métrica y cadencia (V4/evidencias/ANIM-02/walk_clip_metrics.json, Blender sobre el GLB
    // servido): el runtime no debe añadir patinaje (juego ≥ clip − 0,05). La fracción del propio clip (33–42 %) es calidad
    // del Walking fuente y queda como residual documentado.
    const ref = JSON.parse(fs.readFileSync(path.join(GAME, '..', 'V4', 'evidencias', 'ANIM-02', 'walk_clip_metrics.json'), 'utf8'));
    const refAt = (ts) => ref.stationary.find((x) => Math.abs(x.ts - ts) < 0.05)?.quieto;
    const rW = refAt(2.2), rB = refAt(-0.91);
    R.check(W.n > 60 && rW != null && W.quieto >= rW - 0.05, `andar a 3 m/s: el runtime no añade patinaje (fotogramas con apoyo quieto ${W.quieto} ≥ clip ${rW} − 0,05)`, 'vision', { juego: W, clip: rW });
    R.check(B.n > 60 && rB != null && B.quieto >= rB - 0.05, `andar atrás: el runtime no añade patinaje (${B.quieto} ≥ clip ${rB} − 0,05)`, 'vision', { juego: B, clip: rB });
    R.note({ empujar_diagnostico: P, nota: 'SK_Push conducido por la fase de la física: la planta del pie de empuje se mide aparte (pendiente ANIM-03)' });
    // clip por estado y signos
    const wb = by('andar_atras').filter((r) => r.st === 'walk_back');
    R.check(wb.length > 30 && wb.every((r) => r.ts < 0), 'andar atrás reproduce SK_WalkBoard con escala de tiempo NEGATIVA (no el paso adelante)', 'unit', { n: wb.length, ts: wb.slice(-1)[0]?.ts });
    const wrapPi = (a) => Math.abs(((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
    const yawErr = Math.max(...rec.filter((r) => ['walk_back', 'reverse', 'walk', 'ride'].includes(r.st)).map((r) => wrapPi(r.yaw - r.head)));
    R.check(yawErr < 0.35, 'el cuerpo visible mira al rumbo también al ir hacia atrás (sin π añadido)', 'unit', { maxYawErr: +yawErr.toFixed(3) });
    const rev = by('reversa').filter((r) => r.st === 'reverse');
    R.check(rev.length > 20 && rev.every((r) => (r.w.SK_Push ?? 0) < 0.05) && Math.min(...rev.map((r) => r.v)) < -0.5, 'reversa: rueda hacia atrás sin SK_Push (pose de rodar, sin empujar adelante)', 'unit', { n: rev.length, vmin: Math.min(...rev.map((r) => r.v)) });
    const br = by('frenar').filter((r) => r.st === 'brake');
    R.check(br.length > 10 && br.every((r) => (r.w.SK_Push ?? 0) < 0.05) && br.some((r) => (r.w.SK_Brake ?? 0) > 0.5), 'frenar: clip SK_Brake dominante y sin empuje', 'unit', { n: br.length });
    const cs = by('rodar').filter((r) => r.st === 'ride').slice(10);
    R.check(cs.length > 10 && cs.every((r) => (r.w.SK_Push ?? 0) < 0.1), 'soltar W: el empuje se funde y queda la pose de rodar (sin esfuerzo constante)', 'unit', { n: cs.length, pushMax: Math.max(...cs.map((r) => r.w.SK_Push ?? 0)) });
    const pu = by('empujar');
    R.check(pu.some((r) => r.st === 'push' && (r.w.SK_Push ?? 0) > 0.6), 'empujar: SK_Push activo mientras se mantiene W', 'unit', {});
    R.data.rec = rec.filter((_, i) => i % 3 === 0);
    R.pendingHuman('Sensación de peso y lectura de push/coast/freno por el usuario (vídeo humano)');
  } finally { await browser.close(); }
});
