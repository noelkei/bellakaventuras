// R13 · punto 3 · textos de «Falta:» (guía tras 45 s sin encontrar patata, R11 GUIA-01) en palabras del jugador.
// R11 los sacaba de la nota de diseño del manifiesto: «spawn», «escalera E1», «fondo N1», «cajón de 0,9 m», «plataforma de 0,7 m» y uno
// cortado a 78 caracteres («…con la boca de espaldas a la llegada (mira bien…»).
//  Para cada una de las 20 patatas (ANMI junto a ella, la de actividad con la actividad hecha): el texto de `missingFry` existe, no está
//  cortado (sin «…»), cabe (≤ 70), no usa nombres internos (spawn, E1, N1, N2, P1, T1, «lóbulo») ni medidas («0,9 m», «1,30 m») y es
//  distinto para cada patata de la zona.
//   node tools/v8/r13/f19-guia-textos.mjs --url pre13 --task R13 --label base
import { Report, runTest } from '../lib.mjs';
import { launch, abrir } from '../r11/f5-lib.mjs';
import { SAVE_NUEVA } from '../r11/lib-r11.mjs';
const R = new Report('r13-f19-guia-textos');
const MAL = /spawn|\b[ENPT]\d\b|l[óo]bulo|\d+(,\d+)?\s?m\b|…/i;
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await abrir(b, R, { save: SAVE_NUEVA });
    for (let k = 1; k <= 2; k++) {
      const out = await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE, s = g.skater, st = g.state, res = [];
        for (const f of g.park.manifest.fries) { const act = { ...st.p.activities }; for (const a of Object.keys(st.p.activities)) st.p.activities[a] = true;   // actividades hechas: su patata también se lista
          const col = [...st.p.collected]; st.p.collected = g.park.manifest.fries.filter((o) => o.zone === f.zone && o.id !== f.id).map((o) => o.id);   // solo falta esta
          s.teleport(new T.Vector3(f.pos.x, f.pos.y + 0.6, f.pos.z), 0, 'walk');
          const txt = g.missingFry(f.zone); st.p.activities = act; st.p.collected = col; res.push({ id: f.id, zone: f.zone, txt }); }
        return res; });
      for (const o of out) R.check(!!o.txt && o.txt.length <= 70 && !MAL.test(o.txt), `#${k} ${o.id}: «Falta: ${o.txt}»`, 'unit', o);
      const porZona = {}; for (const o of out) (porZona[o.zone] ??= new Set()).add(o.txt);
      R.check(Object.entries(porZona).every(([z, set]) => set.size === out.filter((o) => o.zone === z).length), `#${k} cada patata de una zona tiene su propio texto`, 'unit', Object.fromEntries(Object.entries(porZona).map(([z, s]) => [z, s.size])));
    }
  } finally { await b.close(); }
}, { timeoutMs: 300000 });
