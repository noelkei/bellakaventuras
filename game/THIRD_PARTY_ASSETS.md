# Procedencia de recursos y código del remake

Registro de lo que **se publica** en `dist/` y de dónde sale. Fuentes, ZIP, Blender, WAV y conceptos PNG no se publican. Actualizado el 8 de octubre de 2026.

## Meshy (aclarado el 24 de octubre de 2026)

El usuario confirma que **todos los modelos Meshy del proyecto se generaron con un plan de pago**. Según la ayuda de Meshy, en los planes de pago el resultado es del usuario (licencia privada), con uso comercial y sin obligación de citar a Meshy. Esto sustituye las notas «condiciones de Meshy no verificadas» / «pendiente» de las tablas de abajo. El permiso de las personas reales representadas en los NPC (La Pantera, Aissa, Juseph) es aparte y sigue en `V4/evidencias/EXT/MATRIZ_DERECHOS_V4.md`.

## Recursos publicados

| Publicado (`dist/`) | Fuente | Procedencia / licencia | Derivación reproducible |
|---|---|---|---|
| `assets/character/anmi.glb` (+ `anmi.clips.json`) | `assets/source/character/Meshy_AI_Urban_Skater_Kid_biped.zip`, `dance/*.glb` | Modelos Meshy aportados por el usuario (condiciones de su plan Meshy no verificadas en este proyecto) | `tools/build_character.py` (rig, tabla como hueso, 18 clips de skate propios con IK, 6 bailes, proxy de sombra) → `npm run assets` |
| `assets/npcs/la_pantera.glb`, `aissa.glb`, `juseph.glb`, `bella.glb` | `assets/source/npcs/*/…_biped.zip` | Modelos Meshy aportados por el usuario (Masked Streetwear, Pink Cap Worker, Fresh Kicks, Bella Vibes) | `tools/build_npcs.py -- build` (malla del ZIP diezmada, rig propio conservado, clips elegidos) |
| `assets/props/boombox.glb` | `environments/assets_derived/boombox/BOOMBOX_LOD0.glb` ← `assets/source/boombox/` | Meshy, aportado por el usuario | Derivado previo + `npm run assets` |
| `assets/props/fry.glb` | `environments/assets_derived/fry/FRY_GAME.glb` | Derivado propio del proyecto (entrega de entornos anterior) | `npm run assets` |
| `assets/tex/T_*`, `G_*` (de `environments/textures/`) | Texturas propias generadas en la entrega de entornos | Propias (`environments/tools/make_textures.py`) | `npm run assets` (WebP) |
| `assets/tex/T_dirt`, `T_bola_*`, `T_asphalt`, `T_grass`, `T_graffiti_wall`, `T_concrete_light` | Generadas por código | Propias (ruido procedural; el grafiti no reproduce piezas reales) | `tools/make_remake_textures.py` |
| `assets/tex/T_yy_final/stencil/mask` | Símbolo yin-yang dibujado por código + `assets/source/branding/ANMI_logo_referencia.jpeg` | Logo ANMI aportado por el usuario: trazos umbralizados sin redibujar, 60 % del ancho del símbolo | `tools/make_remake_textures.py` |
| `audio/*-test-v1.m4a` | `canciones/*.wav` | Canciones del artista aportadas por el usuario; cortes provisionales autorizados | `assets/derived/remake/audio/build_test_cuts.py` |
| `assets/fonts/Bungee-Regular.ttf`, `LuckiestGuy-Regular.ttf` | `environments/third_party/fonts/` | SIL OFL 1.1 / Apache 2.0 (licencias junto a las fuentes) | Copia |
| `assets/props/{palm_straight,palm_lean,tree_compact,tree_open,shrub,lamp_double}.glb` | Masters Meshy entregados por el usuario (`assets/source/environment/…`, SHA en `assets/derived/v3/props/report.json`) | Generados con Meshy por el usuario; **condiciones de licencia de Meshy no verificadas aquí** (no se afirma licencia comercial) | Derivados ligeros en Blender (`assets/derived/v3/props/derive_props.py`, `native_props.py`): reducción, escala, solo color base |
| `assets/props/speaker.glb` | Reconstrucción nativa Blender del benchmark `investigacion-blender-2026-10-08/…/speaker-iteration-5.glb` (sobre la referencia Meshy) | Propio (modelado nativo) | Escalado a 1,7 m |
| `assets/props/planter_rect.glb` | Reconstrucción nativa con proporciones del master Meshy | Propio (geometría y ladrillo procedural) | `native_props.py` |
| `assets/props/limo.glb`, `car.glb` | Masters Meshy de limusina y coche (`assets/source/vehicles/…`) + rótulo SECRENOVIO nuevo con Bungee (SIL OFL 1.1) | Meshy: condiciones no verificadas aquí; rótulo propio | `assets/derived/v3/vehicles/derive_vehicles.py` (limo reducida con textura; coche con color plano, rótulo/franja del master eliminados, 4 ruedas separadas) |
| `assets/tex/T_nmg_heart_front`, `T_nmg_ledge_front` | Recortes de `referencias/escenarios/NO ME GUILLO/pieza-01-corazon-v1/01-frente.png` (referencia generada con image_gen para el proyecto) | Material de referencia del proyecto (ver su README/prompts) | `assets/derived/v3/nmg/make_textures.py` |
| `assets/tex/T_nmg_plat_side` | Procedural (semilla fija) | Propia | `make_textures.py` |
| Rampas, puente, mural, piezas de NMG, proxies de props y del coche | Código (`src/world/*.ts`, `src/vehicles.ts`) | Propios | — (los proxies se ven solo si falla la carga del GLB derivado) |

No se ha incorporado ningún recurso de juegos comerciales. De packs de terceros solo entran curvas numéricas CC0 (Quaternius, abajo). No se compraron recursos.

## Cambios V4 (11 de octubre de 2026)

| Publicado | Fuente | Procedencia / licencia | Derivación reproducible |
|---|---|---|---|
| `audio/*-v4.m4a` (6 cortes) | `canciones/*.wav` (masters del artista) | Canciones del artista; cortes exactos HUM-A4-014 decididos por el usuario. Permiso de colaboradores/productores: pendiente externo (`V4/evidencias/EXT/MATRIZ_DERECHOS_V4.md`) | `assets/derived/v4/audio/build_cuts_v4.py` + `cuts_v4.json` (SHA) |
| `assets/nmg/nmg_kit.glb`, `assets/props/nmg_*.glb`, `assets/tex/T_nmg_floor*` | Contrato `src/world/nmg_kit.json` y recetas propias | Propios (Blender nativo y texturas por código) | `assets/derived/v4/nmg/build_nmg_kit.py`, `build_nmg_veg.py`, `make_nmg_textures.py` |
| `assets/tex/T_nmg_heart_front`, `T_nmg_ledge_front` | V4: `assets/derived/v4/nmg/tex/*_v4.png` (código propio) | Propios; **sustituyen** los recortes V3 de la referencia generada con IA | `make_nmg_textures.py` |
| `assets/props/car.glb`, `limo.glb` | Masters Meshy (sin modificar) | Meshy: condiciones pendientes de comprobante; ruedas nativas y rótulo Bungee (OFL) propios | `assets/derived/v4/vehicles/derive_vehicles_v4.py` + `report.json` |
| `assets/npcs/la_pantera.glb` (SitIdle/SitTalk) | ZIP biped de La Pantera + Quaternius UAL `Sitting_Idle_Loop`/`Sitting_Talking_Loop` (CC0 1.0) | Meshy (pendiente) + CC0 | `tools/build_npcs.py` (sit_fit/hand_rest_fit, IK nativa horneada) |
| `assets/character/anmi.glb` (SK_ImpactStar/Land/GetUp, marcha anclada) | Rig ANMI propio | Clips de impacto: autoría propia con el sistema de poses (sin donantes) | `tools/build_character_v3.py` |

## Donantes de animación

| Donante | Origen | Uso | Resultado |
|---|---|---|---|
| `Run_and_Jump` (mortal agrupado) | ZIP biped de ANMI (mismo esqueleto) | Rotaciones locales de brazos en `SK_FlipTuck` (backflip final y frontflip) | **Integrado**: transferencia directa (mismo rig); piernas y tabla siguen por IK |
| `Vault_and_Land` (absorción) | ZIP biped de ANMI | Brazos en `SK_LandHard` (V2) | Descartado en V3: los brazos de `SK_LandHard` son poses autoradas con mejor continuidad |
| `slide_right`, `Unarmed_Vault` | ZIP biped de ANMI | Revisados (`tools/probe_rig.py`) | Descartados: caída/salto a pie, no aportan a skate |
| Quaternius — Universal Animation Library [Standard], `Crouch_Fwd_Loop` (CC0 1.0, https://quaternius.itch.io/universal-animation-library) | Pack descargado el 8 oct 2026 con permiso (`Auditoría 3/donantes/quaternius_ual/`) | Trayectorias numéricas (cadera, torso, cabeza, mano libre, pies) de `SK_CrouchWalk`: `assets/derived/v3/anmi_donors/crouch_fwd_curves.json` | **Integrado como curvas** resueltas con el IK de ANMI (no se publica ninguna malla ni clip del pack). Crédito: Quaternius |
| Quaternius — Universal Animation Library [Standard], `Idle_Loop` e `Idle_Talking_Loop` (CC0 1.0) | Mismo pack | Reposo de La Pantera, Aissa y Juseph; «hablar» de Aissa y Juseph (`game/tools/build_npcs.py`, `retarget_ual`) | **Integrado como animación retargeteada** a cada rig propio (rotaciones con corrección de reposo; sin malla del pack). Crédito: Quaternius |
| Quaternius UAL (resto de clips), Kenney Mini Skate (CC0) | Webs oficiales | Comparativa en ANMI real (`assets/derived/v3/anmi_donors/README.md`) | Descartados con motivo por función; Kenney (7 huesos) solo como referencia de ritmo |

## Código de terceros (dependencias npm)

| Componente | Licencia | Uso |
|---|---|---|
| three.js | MIT | Render, GLTFLoader, SkeletonUtils, BufferGeometryUtils |
| @dimforge/rapier3d-compat | Apache-2.0 | Colisión y controlador cinemático |
| Vite, TypeScript | MIT, Apache-2.0 | Desarrollo y build |
| @gltf-transform, meshoptimizer, sharp | MIT, MIT, Apache-2.0 | Compresión de recursos (desarrollo) |
| puppeteer-core | Apache-2.0 | Pruebas (desarrollo) |

No se ha copiado código de los repositorios del catálogo (skate3clone, GodotSkate, etc.); sus ideas se reimplementaron como comportamiento propio (velocidad longitudinal/lateral con agarre, fases de push/pop, calidad de aterrizaje como asistencia).
