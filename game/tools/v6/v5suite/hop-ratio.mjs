// T5-00/T5-01/T5-08 · Salto a pie: altura H (ápice − y de despegue) por la traza a paso fijo, 3 repeticiones parado y 3
// andando a 3 m/s, en el mismo llano. Contrato V5 (D5, DT-09): H5/H4 ∈ [1,95; 2,05] y un único salto (Espacio repetido en
// el aire no da un segundo impulso). Control negativo: altura del ollie (≈1,17 m en V4) ±3 % y caída de bordillo intacta.
// En la build A guarda H4 y la altura del ollie como medidas A. Fixture: teleport al llano (-14,0,-2) rumbo 0. Entrada real.
import { Report, runTest, launch, openGame, clickStart, sleep, place, traceRead, median, r3, baselineGet, baselineSet, isA, findFaces, fixture, snap } from '../lib.mjs';

const R = new Report('hop-ratio');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page);
    const apex = async (moving) => {
      await place(page, R, [-14, 0, -2], 0, 'walk', moving ? 'andando' : 'parado');
      await sleep(400);
      if (moving) { await page.keyboard.down('KeyW'); await sleep(1300); }
      await traceRead(page, true); await sleep(150);
      await page.keyboard.press('Space');
      // segundo y tercer Espacio en el aire: no debe haber un segundo impulso
      await sleep(160); await page.keyboard.press('Space'); await sleep(120); await page.keyboard.press('Space');
      await sleep(900);
      if (moving) await page.keyboard.up('KeyW');
      const tr = await traceRead(page);
      const i0 = tr.findIndex((r) => r.g === 0);
      if (i0 < 1) return { invalid: 'sin despegue' };
      const y0 = tr[i0 - 1].y;
      let land = tr.findIndex((r, i) => i > i0 && r.g === 1);
      const air = land > 0 ? tr.slice(i0, land) : tr.slice(i0);
      const top = Math.max(...air.map((r) => r.y));
      // vy creciente dentro del vuelo = segundo impulso
      let reboost = 0; for (let i = 1; i < air.length; i++) if (air[i].vy > air[i - 1].vy + 0.5) reboost++;
      const hv = moving ? null : 0;
      return { y0, top, H: r3(top - y0), airSteps: air.length, reboost, hv };
    };
    const rows = { parado: [], andando: [] };
    for (const k of ['parado', 'andando']) for (let i = 0; i < 3; i++) {
      const r = await apex(k === 'andando');
      if (r.invalid) { R.invalid(`${k} rep ${i}`, r); continue; }
      rows[k].push(r);
    }
    R.measure('hop', rows);
    // ollie (control negativo): parado en tabla, Espacio
    const ollie = [];
    for (let i = 0; i < 3; i++) {
      await place(page, R, [-14, 0, -2], 0, 'ride', 'ollie');
      await sleep(400); await traceRead(page, true); await sleep(150);
      await page.keyboard.press('Space'); await sleep(1300);
      const tr = await traceRead(page); const i0 = tr.findIndex((r) => r.g === 0);
      if (i0 < 1) { R.invalid(`ollie rep ${i}`, 'sin despegue'); continue; }
      const land = tr.findIndex((r, j) => j > i0 && r.g === 1);
      ollie.push(r3(Math.max(...tr.slice(i0, land > 0 ? land : undefined).map((r) => r.y)) - tr[i0 - 1].y));
    }
    R.measure('ollie', ollie);
    const all = [...rows.parado, ...rows.andando].map((r) => r.H);
    if (!R.nonEmpty(all, 'saltos válidos') || !R.nonEmpty(ollie, 'ollies válidos')) return;
    const Hp = median(rows.parado.map((r) => r.H)), Ha = median(rows.andando.map((r) => r.H)), Ho = median(ollie);
    if (isA(R) && rows.parado.length === 3 && rows.andando.length === 3 && ollie.length === 3) { baselineSet(R, 'H4_parado', Hp, 'mediana de 3, traza a paso fijo'); baselineSet(R, 'H4_andando', Ha, 'mediana de 3 a 3 m/s'); baselineSet(R, 'ollieH', Ho, 'mediana de 3 parado'); }
    const H4p = baselineGet('H4_parado') ?? Hp, H4a = baselineGet('H4_andando') ?? Ha, Hol = baselineGet('ollieH') ?? Ho;
    const qp = Hp / H4p, qa = Ha / H4a;
    R.check(qp >= 1.95 && qp <= 2.05, `H5/H4 parado ∈ [1,95; 2,05] (D5)`, 'input', { H: Hp, H4: H4p, ratio: r3(qp), reps: rows.parado.map((r) => r.H) });
    R.check(qa >= 1.95 && qa <= 2.05, `H5/H4 andando ∈ [1,95; 2,05] (D5)`, 'input', { H: Ha, H4: H4a, ratio: r3(qa), reps: rows.andando.map((r) => r.H) });
    R.check([...rows.parado, ...rows.andando].every((r) => r.reboost === 0), 'un único salto: Espacio repetido en el aire no da otro impulso', 'input', [...rows.parado, ...rows.andando].map((r) => r.reboost));
    R.check(Math.abs(Ho / Hol - 1) <= 0.03, 'control negativo: ollie ±3 % de A', 'input', { H: Ho, A: Hol, reps: ollie });
    // ---------------------------------------------------------------- alcance andando (rutas a pie, T5-30): W real, SALTO a
    // 0,9 m de la cara; ¿queda encima? (D5: recoger a pie es válido). Medida, no contrato: informa a pistas y recogidas.
    const faces = await findFaces(page, ['nmg_ledge_long', 'nmg_platform', 'tut_platform', 'nmg_alcove', 'nmg_box_small', 'nmg_block'], { runway: 5, minWidth: 1.2, maxPer: 1 });
    const reach = [];
    for (const f of faces) {
      const st = [f.face[0] + f.n[0] * 4.6, f.face[1] + f.n[1] * 4.6];
      await fixture(page, R, `alcance a pie: ${f.name}@${f.top}`, (st, h) => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); g.skater.teleport(new T.Vector3(st[0], 0, st[1]), h, 'walk'); return {}; }, st, Math.atan2(-f.n[0], -f.n[1]));
      await sleep(400); await page.keyboard.down('KeyW');
      let jumped = false, tJ = 0, maxY = 0, stood = false, wUp = false; const t0 = Date.now();
      while (Date.now() - t0 < 3200) {
        const q = await snap(page); const dn = (q.x - f.face[0]) * f.n[0] + (q.z - f.face[1]) * f.n[1];
        if (!jumped && dn < 0.9) { await page.keyboard.press('Space'); jumped = true; tJ = Date.now(); }
        if (jumped && !wUp && Date.now() - tJ > 380) { await page.keyboard.up('KeyW'); wUp = true; }   // suelta W al caer: no seguir andando por encima
        if (jumped && q.grounded && q.y > f.top - 0.05) stood = true;
        maxY = Math.max(maxY, q.y); await sleep(16);
      }
      if (!wUp) await page.keyboard.up('KeyW');
      const q = await snap(page); reach.push({ obj: f.name, top: f.top, onTop: stood, maxY: r3(maxY), endY: q.y });
    }
    R.measure('alcance_a_pie', reach); console.log(JSON.stringify(reach));
  } finally { await b.close(); }
});
