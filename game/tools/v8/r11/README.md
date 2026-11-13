# R11 · pruebas rojo → verde de los arreglos

Cada prueba describe el comportamiento CORRECTO tras el arreglo, con el ID del hallazgo en el texto del check. Contra la línea base
(`--url pre`, http://127.0.0.1:5234/) los checks de fallos reales salen ROJOS. Los checks «no empeorar» salen VERDES ya en la base.

Se ejecutan desde `game/`:

```
node tools/v8/r11/<fichero>.mjs --url pre --task R11 --label pre
node tools/v8/r11/<fichero>.mjs --url v8  --task R11 --label v8
```

## F5–F8 · física (vaso YY, apoyo falso, rampas e impactos, trucos)

Autor: agente NMG, 16 oct 2026.

**Cómo están hechas.** Simulación determinista con el paso fijo del juego (`g.autoMode = true; g.simulate`). Las teclas reales se
despachan en el paso exacto (keydown/keyup en `window`); el mando se emula con `input.fakePad`. La colocación inicial (teletransporte y
velocidad) es fixture.
- Excepción: `f8-fps` corre en el BUCLE REAL con el rAF limitado a 8 Hz.
- Cada prueba hace 2 repeticiones (3 intentos por caso en `f8-fps`).
- Duración por fichero en esta máquina: entre 8 y 40 s.
- Utilidades comunes en `f5-lib.mjs`: `abrir`, `run`, `paredes`, `salida` y `racha`. Las usan también los ficheros de F6, F7 y F8.

**Resultado en la base** (16 oct, 20:35 CEST, runs en `V8/evidencias/R11/runs/r11-f*_pre_*.json`): todos los checks de fallo salen ROJOS y
todos los de «no empeorar» salen VERDES, con 0 inválidos y 0 errores.

| Fichero | IDs cubiertos | Base: rojos (fallos reales) | Base: verdes (no empeorar) |
|---|---|---|---|
| `f5-pared.mjs` | YY-02, YY-01, YY-03/TRK-02, YY-04, YY-14, YY-10, YY-18 | 36/36 | 12/12 |
| `f5-npc-camara.mjs` | YY-20 (= NPC-02: Aissa, Juseph y la rana), YY-07, YY-16 | 14/14 | 8/8 |
| `f6-cresta.mjs` | YY-21 (= YY-11) | 12/12 | 12/12 |
| `f6-arista.mjs` | YY-05 (acotado al vaso), YY-09, NMG-15, MOV-04, NMG-08 | 12/12 | 6/6 |
| `f6-varios.mjs` | MOV-11, MOV-12, MOV-05 | 10/10 | 4/4 |
| `f7-rampas.mjs` | RAMP-02 / NMG-23 (4 quarters × 6–12 m/s), RAMP-05, RAMP-04 | 42/42 | 22/22 |
| `f7-impactos.mjs` | NPC-03, MOV-13, NMG-19, RAMP-01 | 10/10 | 6/6 |
| `f8-trucos.mjs` | MOV-01, MOV-06, TRK-01, MOV-07, TRK-03, TRK-04, SIS-20 | 24/24 | 8/8 |
| `f8-fps.mjs` | FPS-04 | 6/6 | 3/3 |

### Qué comprueba cada fichero (umbrales)

**`f5-pared.mjs`**
- YY-02: con W o el stick al 100 % mantenido desde antes del enganche no se sale del vaso. Se comprueba en #540, #645 y #840.
- YY-01: en fakie, el rumbo no salta más de 20° por paso tras reengancharse.
- YY-03/TRK-02: F en el aire de pared hace grab, y F+A hace 180.
- YY-04: Q en la pared o en su aire cuenta como denegación o suena «deny».
- YY-14: en manual hasta la pared, engancha sin impacto (6,5 y 9 m/s).
- YY-10: tallando hacia E1, la velocidad a lo largo de la pared no se invierte y el giro es ≤ 15° por paso.
- YY-18: en #130 −30° a 7 y 10 m/s y en #340 −30°, al salir por arriba no se cae.
- No empeorar:
  - ↑ pulsado en el aire sale al deck;
  - sin tocar nada engancha, sale al aire y vuelve;
  - a 4,5 m/s no engancha;
  - el kickflip en la pared sale.

**`f5-npc-camara.mjs`**
- YY-20/NPC-02: mientras el NPC está a > 0,3 m de su sitio, su colisor no sigue activo en el sitio de reposo (< 0,2 m). Es igual si el arreglo desactiva el colisor o lo mueve.
- YY-07: al entrar enganchada (#384 a 3 y 5 m/s; #432 a 8 m/s y −45°), la cámara queda a ≥ 0,4 m del pecho y fuera de sólidos.
- YY-16: la pista de la pared no se solapa con el chip «En tabla · Q para bajar» (1280×800).
- No empeorar:
  - los NPC quietos tienen su colisor (≤ 0,45 m);
  - la cámara de #540 de frente está bien.

**`f6-cresta.mjs`**
- YY-21/YY-11: tras la cresta, como mucho 0,3 s seguidos con `grounded && !kccGrounded` y el pie > 5 cm sobre suelo llano. Casos: E1 del vaso a 5, 6 y 9 m/s; cresta de TT E2; TT E1 bajando; escenario de FG.
- No empeorar:
  - ollie en llano igual que en la base: 1,108 m desde el primer paso de aire y 40 pasos;
  - ollie tras las crestas de TT E2 y FG con altura ≥ 1,15 m y ≥ 38 pasos de aire;
  - cota final igual entre repeticiones.

**`f6-arista.mjs`** («colgada» = `grounded` con `supportGap` > 0,15 m; el umbral es ≤ 0,3 s seguidos)
- YY-05: casos (a) y (b) de la ficha, dentro del vaso.
- YY-09: tras saltar junto a la rana, como mucho 0,3 s a > 0,3 m con |vy| < 1.
- NMG-15: ollie tardío contra la plataforma 0,7.
- MOV-04: colocada en la ranura de la barandilla E2, cae ≥ 0,5 m en 2 s.
- NMG-08: `bail()` provocado estando colgada de la arista (fixture), y debe caer.
- No empeorar:
  - entrar al vaso por #840 acaba dentro;
  - subir a la plataforma con el ollie a tiempo;
  - la rana es sólida de frente.

**`f6-varios.mjs`**
- MOV-11: quieta 2,2 s encima de la barandilla E2 (2 puntos) o de un poste, el punto seguro (fijado antes como fixture) NO pasa ahí.
- MOV-12: manual al vacío desde el techo del túnel del circuito: en el aire no está en manual y el 2.º SALTO da truco o aviso.
- MOV-05: subiendo la rampa de FG junto al bordillo a 6,45 m/s, el suelo bajo el pie queda ≤ 6 cm por encima del pie.
- No empeorar:
  - en el llano de NMG el punto seguro sí se actualiza;
  - el manual en llano funciona.

**`f7-rampas.mjs`** (eje de cada pieza por ajuste de plano)
- RAMP-02/NMG-23: los 4 quarters de frente a 6, 8, 10 y 12 m/s no salen por detrás (más allá del borde trasero + 0,3 m) y no hay estrella. Es el criterio mínimo de la v2 del plan: «vuelve por la cara o al menos no sale despedida por detrás».
- RAMP-05: U de FG hacia el deck a 10, 12, 14 y 16 m/s sin estrella.
- RAMP-04: cuñas de FG sin ollie a 9 m/s sin estrella.
- No empeorar:
  - quarters a 4 m/s suben y vuelven;
  - `tut_kicker`, `trick_kicker` y los 2 banks de esquina siguen lanzando > 2 m tras el borde a 10 m/s;
  - la U de FG a 6 y 8 m/s sube y vuelve;
  - las cuñas a 7 m/s, sin estrella.

**`f7-impactos.mjs`** («golpe» = sacudida de cámara, evento `bump` o sonido de golpe)
- NPC-03: contra La Pantera a 8 m/s, sin estrella, con golpe y con caída suave (`bail`).
- MOV-13: contra `fg_rack` a 12 m/s, lo mismo.
- NMG-19: contra el cono del paso 2 a 7 y 9 m/s, golpe o caída.
- RAMP-01: en el raíl de esquina a 11 m/s con F, engancha en ≥ 3 de 6 distancias de ollie (0,8–3,2 m) y sin estrella.
- No empeorar:
  - contra La Pantera a 2 m/s no hay caída;
  - el raíl a 8 m/s engancha en ≥ 3 de 6 distancias;
  - sin F no hay grind.

**`f8-trucos.mjs`**
- MOV-01:
  - con W o S mantenida desde el suelo, Espacio y Espacio dan kickflip;
  - con ↑ como flanco en llano, el aviso contiene «rampa».
- MOV-06: tras un heelflip, W+A con el 2.º SALTO da kickflip.
- TRK-01: frontflip sobre R1 y sobre el agujero H de TT, sin caída.
- MOV-07: revert (doble toque de F) en fakie a 6 y 10 m/s.
- TRK-03: el revert y el grab dan sonido o mensaje.
- TRK-04: en grind, el pie ≥ techo del raíl − 1,5 cm.
- SIS-20: el aviso de Q en el aire no habla de «truco».
- No empeorar:
  - kickflip sin dirección;
  - heelflip con D;
  - revert a 2 m/s;
  - grab con F.

**`f8-fps.mjs`**
- FPS-04: con el rAF a 8 Hz, dos SALTOS a 60 y 90 ms caídos entre los mismos dos fotogramas dan ollie + truco. Si las pulsaciones no caen entre los mismos fotogramas, el intento se marca inválido.
- No empeorar: a ritmo normal, la doble pulsación de 90 ms da truco.

### No cubiertos (y por qué)

- **YY-08**: fuera del plan (v2 §0.3).
- **YY-13** (cámara contra el muro perimetral): solo sale con un caso concreto del fuzz.
- **YY-17** (farola tapando): necesita análisis de imagen.
- **YY-19** (modo ratón): Chrome sin interfaz no concede Pointer Lock.
- **NMG-14**: mismo mecanismo que NMG-15; con este método determinista no se reproduce en la base, porque la tabla choca antes por el barrido de nariz. Lo cubre NMG-15.
- **MOV-05 a 1,45 y 4,45 m/s**: la medida no reproduce el hundimiento en la base; solo se comprueba 6,45 m/s.
- **RAMP-01 a 3 m/s**: no se consiguió un enganche estable con este método, así que no se usa como «no empeorar»; se usa 8 m/s.
- **RAMP-04 a 10 y 11,5 m/s**: aquí no reproduce el choque; se comprueba 9 m/s.

## R13 (17 oct)
Pruebas nuevas y ajustes de pruebas heredadas de la revisión de regresiones: `../r13/README.md`.
