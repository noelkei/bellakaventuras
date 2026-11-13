// V4-ANIM-01 · Inventario de clips SERVIDOS (public/assets/character/anmi.glb + anmi.clips.json) cruzado con el mapeo
// estado→clip de src/anmi.ts (listas LOCO/AIR/FOOT, DRIVEN, LOOPS y los `case` de estado). Escribe
// V4/evidencias/ANIM-01/INVENTARIO_CLIPS.md y .json. Falla si un clip referenciado por el runtime no existe en el GLB.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Report, runTest, GAME, ROOT } from './lib.mjs';
const R = new Report('ANIM-01', 'anim-inventory');
await runTest(R, async () => {
  const glbP = path.join(GAME, 'public', 'assets', 'character', 'anmi.glb'); const buf = fs.readFileSync(glbP);
  const jl = buf.readUInt32LE(12); const J = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
  const bin = buf.subarray(20 + jl + 8);
  const acc = (i) => { const a = J.accessors[i]; return a; };
  const anims = (J.animations ?? []).map((a) => { let mx = 0; for (const s of a.samplers) { const ac = acc(s.input); if (ac.max) mx = Math.max(mx, ac.max[0]); } return { name: a.name, seconds: +mx.toFixed(3), channels: a.channels.length }; });
  const meta = JSON.parse(fs.readFileSync(path.join(GAME, 'public', 'assets', 'character', 'anmi.clips.json'), 'utf8')).clips;
  const src = fs.readFileSync(path.join(GAME, 'src', 'anmi.ts'), 'utf8');
  const list = (name) => { const m = src.match(new RegExp(`const ${name} = (?:new Set\\()?\\[([\\s\\S]*?)\\]`)); return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : []; };
  const LOCO = list('LOCO'), AIR = list('AIR'), FOOT = list('FOOT'), DRIVEN = new Set(list('DRIVEN')), LOOPS = new Set(list('LOOPS'));
  const used = [...new Set([...LOCO, ...AIR, ...FOOT])];
  const byState = {};
  for (const m of src.matchAll(/case ((?:'[a-z_]+'[:\s,]*(?:case )?)+)[^]*?(?=\n\s+case '|\n\s+default:)/g)) {
    const states = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]); const clips = [...new Set([...m[0].matchAll(/'(SK_[A-Za-z]+)'/g)].map((x) => x[1]))];
    for (const st of states) byState[st] = clips;
  }
  byState['ride/idle/push/brake/scoot/reverse (default)'] = ['SK_Idle', 'SK_Ride', 'SK_CarveL', 'SK_CarveR', 'SK_Push', 'SK_Brake', 'SK_CrouchRide', 'SK_Scoot'];
  const names = new Set(anims.map((a) => a.name));
  const missing = used.filter((n) => !names.has(n) && !['SK_Stand'].includes(n));
  const rows = anims.filter((a) => a.name.startsWith('SK_') || used.includes(a.name)).map((a) => ({ ...a, loop: LOOPS.has(a.name), driven: DRIVEN.has(a.name), runtime: used.includes(a.name), meta: meta[a.name] ?? null,
    states: Object.entries(byState).filter(([, c]) => c.includes(a.name)).map(([s]) => s) }));
  const md = ['# Inventario de clips de ANMI servidos (V4-ANIM-01)', '', `GLB: \`game/public/assets/character/anmi.glb\` · SHA-256 \`${crypto.createHash('sha256').update(buf).digest('hex')}\` · ${anims.length} animaciones · receta \`game/tools/build_character_v3.py\` (+ V4: impacto, anclaje de marcha).`, '',
    'Propiedad: el controlador (`skater.ts`) posee la traslación y el rumbo; la presentación (`anmi.ts`) pone yaw = rumbo visible + revert + giro de truco y elige clips por estado. Los clips «conducidos» avanzan por la fase de la física (no por reloj); los bucles por reloj con escala de tiempo.', '',
    '| Clip | s | Bucle | Conducido | Estados que lo usan | Metadatos |', '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.name} | ${r.seconds} | ${r.loop ? 'sí' : '—'} | ${r.driven ? 'sí' : '—'} | ${r.states.join(', ') || (r.runtime ? '(listas)' : 'no usado')} | ${r.meta ? Object.entries(r.meta).filter(([k]) => !['loop', 'frames', 'seconds'].includes(k)).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('; ').slice(0, 160) : ''} |`),
    '', 'Notas V4:', '- `SK_Stand` es bucle de reposo (fallback); NO prueba levantarse: la secuencia de impacto usa SK_ImpactStar → SK_ImpactLand → SK_GetUp (IMPACT-02).',
    '- Andar atrás = `SK_WalkBoard` con escala de tiempo NEGATIVA (Walking propio invertido, cadencia por velocidad real) — adaptación declarada, no el paso adelante.',
    '- Reversa en tabla = pose de rodar (SK_Ride) sin SK_Push; el yaw visible no suma π (CTRL-05).',
    '- `SK_WalkBoard`: anclaje al suelo por fotograma (V4) y `natural_speed` medida (1,315 m/s; V3 suponía 1,4).', ''];
  fs.writeFileSync(path.join(ROOT, 'V4', 'evidencias', 'ANIM-01', 'INVENTARIO_CLIPS.md'), md.join('\n'));
  fs.writeFileSync(path.join(ROOT, 'V4', 'evidencias', 'ANIM-01', 'inventario_clips.json'), JSON.stringify({ anims, byState, missing }, null, 1));
  R.check(anims.length > 20, 'GLB servido con animaciones', 'static', { n: anims.length });
  R.check(missing.length === 0, 'todo clip referenciado por el runtime existe en el GLB servido (salvo fallback SK_Stand declarado)', 'static', { missing });
  R.check(['walk', 'walk_back', 'impact', 'mount', 'dismount', 'air', 'land', 'pop'].every((s) => byState[s]?.length), 'cada estado del controlador tiene clip asignado', 'static', Object.keys(byState));
});
