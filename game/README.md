# Bellakaventuras — V3 (parque abierto)

ANMI patina por un único parque: una corona de **cinco escenarios iguales** (72° cada uno) alrededor de **SECRENOVIO**, en el disco central. Cada exterior tiene su canción en un cassette y **cuatro patatas** (tres de exploración y una de actividad): **20 en total**. Con 20/20 se abre el centro y emerge la superrampa: el **triple backflip** (vuelo físico real, dos coches de drifting girando alrededor) desbloquea el preview limpio de SECRENOVIO, repetible y cerrable.

Recorrido recomendado (antihorario visto desde arriba, sin puertas): **NO ME GUILLO** (llegada, La Pantera) → **NOSVAMOSDEAQUI** (circuito tutorial) → **YINYANG** (mural) → **TRATRATRA** (ascenso al puente) → **FASHION GIRL** (baile) → **SECRENOVIO**. Los cinco exteriores están abiertos desde el inicio. NO ME GUILLO es el escenario con acabado artístico completo de V3; el resto recibe correcciones funcionales y props comunes (su remake artístico es V4).

Plan, decisiones y estado: `../Auditoría 3/plan-v3/` (registro único: `ESTADO_EJECUCION.md`). Versiones anteriores: V2 en `../baselines/v2_2026-10-09/`, plantas en `../baseline_plantas_2026-10-07/`.

## Arrancar

Requisitos: Node 20+ (probado con 25.8). Blender 5.2 para regenerar personajes y derivados. Google Chrome para las pruebas.

```bash
npm install
```

```bash
npm run dev -- --port 5190 --strictPort
```

Abre http://127.0.0.1:5190/ (el puerto 4173/5173 puede estar ocupado por otras apps; las pruebas usan 5190 por defecto, `--url` lo cambia). `?debug=1` muestra diagnóstico.

```bash
npm run build
```

`dist/` es estática, con rutas relativas. **No se ha desplegado V3.**

## Controles

| Acción | Móvil | Ordenador | Mando |
|---|---|---|---|
| Mover / impulsar / girar | Joystick dinámico (mitad izquierda) | WASD o flechas | Stick izquierdo |
| Subir/bajar de la tabla | Automático por velocidad (ajuste) | Q alterna «seguir a pie» | — |
| Frenar | Joystick atrás | S | Stick atrás |
| Saltar (ollie) | SALTO | Espacio | A |
| Trucos | SALTO en el aire + dirección | Espacio en el aire + dirección (kickflip/heelflip/180/360/frontflip/backflip) | A + stick |
| Extra (manual, grab, grind) | EXTRA (ajuste) | F | X |
| Agacharse | AGACHARSE (alterna) | Mantener C | B |
| Cámara | Arrastrar zona libre; ◎ recentra | Ratón; J/L/I/K; R recentra | Stick derecho; R3 |
| Hablar / acciones | Botón contextual | E o Intro | Y |
| Pausa | II | Esc o P | Start |

Cada dedo tiene un propietario (joystick, cámara o botón). Durante grafiti, baile, charla, revelación y preview los controles del mundo se desactivan. La pausa (también al pasar a segundo plano) congela simulación, animación, audio y temporizadores.

## Cómo está hecho

| Parte | Archivo | Notas |
|---|---|---|
| Arranque, modales, pausa | `src/main.ts` → `src/bootstrap.ts`, `src/ui.ts` | Foco atrapado por capa y devuelto a quien la abrió; «Activar sonido» distinto de silenciar |
| Orquestación | `src/game.ts`, `src/sim.ts` | Paso fijo 60 Hz + presentación interpolada; tokens cancelables; música por sector |
| Mundo | `src/world/manifest.ts`, `park.ts`, `geo.ts`, `shapes.ts`, `props.ts` | Geometría con colisión Rapier de la misma forma; props con derivado GLB instanciado y proxy procedural si falla la carga (`PROP_SLOTS`, `Park.loadProps`) |
| Skate | `src/skater.ts`, `src/tuning.ts` | Único responsable del movimiento; cápsula variable (de pie/agachado); trucos por dirección, grind, manual, grab; triple final |
| ANMI | `src/anmi.ts` + `tools/build_character_v3.py` | Árbol de mezcla, capa de tabla/flips, bailes con apoyo de suela |
| Cámara | `src/camera.ts` | Órbita manual, recentrado, seguimiento tras 1,6 s de tiempo de presentación sin tocarla; barrido esférico contra geometría (sube/abre de lado en huecos estrechos; postes y vallas de barrotes no la empujan); encuadre por volúmenes en charlas/baile |
| Actividades | `src/activities.ts` | Pantera, tutorial, grafiti, puente, baile, triple final |
| NPCs | `src/npc.ts` + `tools/build_npcs.py` | La Pantera, Aissa, Juseph, tres variantes de Bella |
| Coches | `src/vehicles.ts` | Dos coches derivados (geometría compartida, ruedas con pivote) |
| Audio | `src/audio.ts`, `src/music.ts` | Sesión multimedia en el gesto; máx. 2 voces con colas; 5 estados de radio; recortes de nivel por tema; bucles sin costura; SFX por eventos con registro `audio.sfxLog` |
| Guardado | `src/state.ts` | v4 con migración desde v3; parciales por actividad; aviso honesto si no se puede guardar |

## Recursos (`npm run assets`)

`tools/sync-assets.mjs` publica en `public/assets/` solo una lista blanca de derivados (ANMI, NPCs, cassette, patata, props y vehículos de `../assets/derived/v3/`, texturas WebP, cortes M4A). Masters Meshy, ZIP, Blender, WAV y conceptos quedan fuera; si falta un derivado seleccionado, el script falla. Catálogo de derivados: `../assets/derived/v3/CATALOGO.md`.

```bash
/opt/homebrew/bin/blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python game/tools/build_character_v3.py
```

```bash
/opt/homebrew/bin/blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python assets/derived/v3/props/derive_props.py
```

```bash
/opt/homebrew/bin/blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python assets/derived/v3/props/native_props.py
```

```bash
/opt/homebrew/bin/blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python assets/derived/v3/vehicles/derive_vehicles.py
```

```bash
python3 assets/derived/v3/nmg/make_textures.py
```

```bash
npm run assets
```

(Los cuatro primeros y el de texturas se lanzan desde la raíz del proyecto; `npm run assets` desde `game/`.)

## Configuración sin recompilar: `public/game-config.json`

- `audio.tracks`, `audio.trims` / `trimsPre` (nivel por tema, medido con `tools/v3/audio-levels.mjs`), `audio.loops` (puntos de bucle, `tools/v3/audio-loops.mjs`), `audio.radio`.
- `preview.visual` / `visualLabel` / `label`: visual oficial pendiente (hoy «Preview de prueba»).
- `cta.enabled` / `cta.url`: el botón solo aparece con una URL real.

## Pruebas (`tools/v3/`)

Con el juego servido en 5190. Todas son **Chrome sin interfaz**; móvil = **emulación** (no Safari ni teléfono físico). Las entradas son eventos reales del navegador (teclado, ratón, toques CDP); las posiciones de salida y guardados se declaran como *fixtures* en cada informe (`captures/v3/…/*.json`).

| Comando | Qué comprueba |
|---|---|
| `node tools/v3/baseline-route.mjs --tag v3`, `p0-time.mjs` | Ruta base, pausa/cancelación/guardado/migración |
| `p1-control.mjs`, `p1-interp.mjs` | Control, agachado/techo, rampas; interpolación de presentación |
| `anmi-contact.mjs`, `anim-blends.mjs`, `clip-continuity.mjs`, `dance.mjs` | Contacto suela/tabla, mezclas, continuidad de clips, bailes |
| `npc-talk.mjs`, `npc-sheet.mjs`, `bella-faces.mjs` | NPCs |
| `tricks.mjs`, `grind.mjs`, `ext03.mjs`, `gamepad.mjs`, `final.mjs [--portrait]` | Trucos, grind, manual/grab/caídas, mando simulado, triple final |
| `potatoes.mjs`, `tutorial.mjs`, `tutorial-runs.mjs`, `act04.mjs`, `act05.mjs` | Las 20 patatas con retorno, tutorial, grafiti/puente, baile y recuperación |
| `ux01.mjs` … `ux05.mjs` | HUD táctil multi-dedo, cámara en recorridos, cámaras de actividad, guía/legibilidad, modales |
| `nmg.mjs` | NO ME GUILLO: piezas frente a fichas, lectura desde la llegada, rutas bank/escalera/quarter |
| `audio-levels.mjs`, `audio-loops.mjs`, `audio-runtime.mjs`, `audio-sfx.mjs` | Niveles, bucles, frontera/fase/sesión/preview, SFX |
| `close-checks.mjs` | Paso entre las chicas del baile; pausa a mitad de montar |

`tools/legacy-v2/` conserva las pruebas V2 (con aserciones vacías documentadas); no acreditan V3.

## Provisionales y pendientes

| Elemento | Estado |
|---|---|
| Cortes de audio | 0–30 s / 0–45 s autorizados; niveles y bucles medidos, **escucha/aprobación pendiente** |
| Visual final y CTA de SECRENOVIO | Pendientes de la pieza/URL oficial; CTA oculto |
| Texto de Aissa y Juseph | Provisional autorizado |
| iPhone/Android físicos, mando físico | No probados aquí (solo emulación) |
| Escenarios distintos de NMG | Correcciones funcionales V3; remake artístico V4 |

Procedencia y licencias: `THIRD_PARTY_ASSETS.md`.
