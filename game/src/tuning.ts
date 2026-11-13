// Configuración tipada central del control (V3 doc. 13 → V4 cap. 03: semillas de calibración, NO medidas aprobadas).
// Un solo sitio para los números de juego: Blender/tests/TS leen de aquí o de clips.json, sin copias divergentes.
// V4: conducción local (A/D = solo giro, W/S = propulsión/freno/reversa respecto al frente de ANMI, cámara independiente),
// tabla con botón explícito (sin automontaje), apoyo real (sonda corta). Cada cambio se registra con antes→después en
// V4/evidencias/CTRL-03 (calibración) y en el tracker.

export const TUNING = {
  // ---------------------------------------------------------------- cápsula (cuerpo principal)
  radius: 0.3, standHalf: 0.6, crouchHalf: 0.25,   // de pie 1,80 m; agachado 1,10 m
  gravity: 21,
  maxSlope: 52, autostep: 0.18, snap: 0.32,               // V5 T5-05 (DT-04, sonda S2b): 0,22 → 0,18; con 0,22 el hemisferio de la
                                                     // cápsula trepaba 0,28–0,30 m en ~1 s (escalada lenta); 0,18 sube ≤0,25 al instante
  stepMax: 0.26,                                     // V5 T5-05: asistente de escalón (D4): caras con techo plano ≤ 0,26 m sobre el pie se
                                                     // suben en un paso si hay hueco; por encima, la cápsula no trepa (anti-creep)
  kccOffset: 0.03,                                   // separación que mantiene el KCC: la presentación la resta (ID7, flotación)
  supportDist: 0.08,                                 // V4 FIS-02: suelo bajo la sonda central a ≤8 cm del pie = apoyo real
                                                     // (V3 aceptaba cualquier impacto de una sonda de 1,2 m → falso suelo HUM-A4-001)

  // ---------------------------------------------------------------- a pie con la tabla en la mano (D04 → V4 HUM-A4-002/003)
  walkMax: 2.5,                                      // V3 2,2 → V4 3,0 → V10.1 P02 (D02, usuario): andar hasta 2,5; correr hasta runMax
  footJumpMax: 3.0,   // V10.1 R5c: velocidad horizontal máxima al saltar a pie (la de andar en V10): correr no alarga los saltos de V10
  runMax: 5.0, runHold: 0.8, runAccel: 1.8, runDecel: 4.5, runSteer: 0.5,   // V10.1 P02: correr = adelante ≥ 90 % durante 0,8 s con poco giro; 2,5→5 en ≈ 1,4 s; girar fuerte baja hacia andar
  walkBackMax: 1.2,                                  // marcha atrás a pie (frente conservado)
  walkAccel: 7, walkDecel: 10, crouchWalkMax: 1.0,
  walkTurnRate: 3.4,                                 // rad/s con A/D a fondo
  // R8 · modo ratón (escritorio con puntero capturado): marcha respecto a la vista y tabla que gira hacia ella
  mouseStrafe: 0.8,                                  // paso lateral (A/D) = 0,8 × walkMax
  mouseBackMax: 1.6,                                 // marcha atrás respecto a la vista (S), m/s
  mouseFaceRate: 14,                                 // rad/s máx. con que ANMI se orienta a la vista al moverse
  mouseSteerGain: 2.5,                               // tabla: giro pedido = error de rumbo (rad) × 2,5 (saturado a ±1, ≈ 23°)
  footReach: 0.72,                                   // V5 T5-30: altura de apoyo alcanzable a pie con el salto doble (T5-08: 0,7 sí; 0,85/0,9 no)
  walkTurnStep: 0.4,                                 // V5 T5-16 (HUM-A5-007): con solo giro (A/D o stick lateral) a pie se avanza a pasos
                                                     // cortos (m/s a fondo, proporcional al giro): nunca a velocidad plena
  hopVel: 4.66,                                      // V5 T5-08 (D5): semilla 3,24·√2 = 4,58 daba ×1,935 (paso discreto); 4,66 → ×2 (V4 ≈ 0,28 m → ≈ 0,55 m); un único salto
  dismountSpeed: 5.0,                                // V10.1 P02 (D02): se baja hasta 5 m/s (antes 0,8); entre andar y 5 baja corriendo
  mountMaxSpeed: 5.0,                                // V10.1 P02 (P-2): se sube corriendo hasta 5 m/s, saliendo con esa velocidad
  mountDur: 0.43, dismountDur: 0.40,                 // transiciones cortas (la física no se desplaza por root motion)
  // entrada (cap. 03): zonas muertas axiales; el eje X nunca aporta propulsión
  steerDead: 0.12, throttleDead: 0.18,

  // ---------------------------------------------------------------- skate
  cruiseMin: 3.0, cruiseMax: 9.0, maxSpeed: 20,      // V3 crucero 7,4 → V4 9,0; V5 T5-07 (D3): tope 12 → 20 sobre la magnitud HORIZONTAL
  // V5 T5-07 (D3, DT-08): 20 m/s reales sin cambiar la sensación de 0 a 9 m/s (V4). Por encima de `fastFrom`: empuje propio,
  // arrastre reducido y giro propio. Crucero analógico: el pulgar hasta `cruiseTopFrom` conserva el V4 (lerp 3→9); el último
  // tramo lleva a 20 (W o pulgar a fondo).
  fastFrom: 9.0, topSpeed: 20.0, cruiseTopFrom: 0.8,
  pushAccelFast: 14.0,                               // m/s² en el contacto del pie por encima de fastFrom (V4: 9)
  dragFast: 0.003,                                   // coeficiente de v² por encima de fastFrom (V4: 0,011 en todo el rango)
  turnTop: 1.1,                                      // rad/s a fondo a 20 m/s (radio ≈ 18 m); 0–9 m/s = V4 (3,6 → 1,8)
  pushAccel: 9.0, pushCycle: 0.85, pushContact: [0.31, 0.69] as [number, number],
  pushBand: 0.4,                                     // V3 1,0 → 0,4: W sostenida sigue empujando hasta crucero
  pushMaxSlope: 0.15,                                // V4 ESC-02: solo se empuja casi en llano (tangente ≤ 0,15 ≈ 8,6°); V3 permitía
                                                     // empujar cuesta arriba sin límite y la tabla trepaba escaleras de 34° desde parado
  rollFriction: 0.32, drag: 0.011,
  brakeDecel: 11, coastDecel: 0.6,                   // V3 coast 4,0 → 0,6: soltar rueda (V3 se paraba en ~6,8 m)
  reverseMax: 2.0, reverseAccel: 2.4,                // reversa de baja velocidad tras parar (semilla 1,5–2,5)
  zeroEps: 0.15, reverseIntent: 0.15,                // zona neutra y tiempo de intención estable antes de invertir marcha
  turnSlow: 3.6, turnFast: 1.8, airTurn: 1.3,        // V3 4,4/2,0 con giro relativo a cámara → giro local por A/D
  pivotSpeed: 0.7, pivotRate: 3.0,                   // quieto: pivota en el sitio (kickturn) con A/D
  grip: 9.0, gripBrake: 2.5,
  crouchTurn: 0.7,
  scootAccel: 2.6, scootMax: 2.4, scootCycle: 0.7,   // impulso bajo agachado (CTRL-04): apoyo lateral corto
  slopeGain: 1.0,

  // ---------------------------------------------------------------- salto
  ollieVel: 7.0, popDelay: 0.033,                    // ≈1,17 m; despegue 2 pasos de 60 Hz tras pulsar
  rampLaunch: 0.9,                                   // fracción de la velocidad vertical de la tangente de rampa que se conserva al despegar (antes 0,6)
  jumpMinSpeed: 4.6,
  coyote: 0.08, jumpBuffer: 0.12,                    // segundos de simulación

  // ---------------------------------------------------------------- trucos (D06/D07)
  trickArm: 0.10,                                    // aire mínimo tras despegar para aceptar truco
  boardFlipDur: 0.42, boardFlipMin: 0.30,            // kickflip / heelflip
  bodyFlipDur: 0.78, bodyFlipMin: 0.58,              // frontflip / backflip libres
  spin180Dur: 0.40, spin360Dur: 0.62, spinMin: 0.30,
  landTolFlip: 0.45,                                 // rad de error aceptado al aterrizar (ayuda ligera)
  landTolSpin: 0.55,
  dirThreshold: 0.45,                                // umbral de eje dominante para la dirección del truco
  manualMinSpeed: 1.6, manualBalanceRate: 1.4, manualMaxTime: 4.5,
  revertSpeed: 3.2, revertDur: 0.34, doubleTap: 0.26,
  grabMin: 0.22,

  // ---------------------------------------------------------------- grind (EXT-02)
  grindCatchUp: 0.32, grindCatchDown: 0.22, grindCatchLat: 0.32, grindAlign: 0.62, grindMinSpeed: 2.0,
  grindLoss: 0.45,

  // ---------------------------------------------------------------- caídas suaves (EXT-03) e impacto arcade (V4 IMPACT)
  bailDur: 1.15, bailWallSpeed: 8.5, bailAlign: 0.55,  // bailWallSpeed: velocidad NORMAL de cierre contra pared (no |v|)
  impact: {
    minH: 2.5, maxH: 7.0,                             // velocidad horizontal de salida acotada (arcade, sin impulso infinito)
    minUp: 3.2, maxUp: 6.0,                           // componente vertical acotada (≈0,25–0,85 m de vuelo)
    airDrag: 0.25, landKeep: 0.45, slideDecel: 9,     // al tocar suelo conserva parte y se arrastra hasta parar
    lieDur: 0.55, getupDur: 1.05, maxAir: 3.0,        // tumbada breve + levantarse; red de seguridad de vuelo
    protect: 1.4,                                     // s sin nuevo impacto tras levantarse (fin definido, no inmunidad)
    carClosing: 3.0, carGain: 0.55, carCarry: 0.35,   // coche: umbral de velocidad normal relativa; semillas a calibrar
    // V5 T5-09 (D6, DT-11, N5-03): envolvente ordinaria CONGELADA en el cierre normal máximo MEDIDO en impactos reales de V4
    // (T5-00: 8,93 m/s con |v| 9,11 en la cara; la semilla 9,30 era la |v| máxima, no un cierre, y daba ápices +4–5 % sobre
    // los de V4 a 12–20 m/s): por encima, la altura y la caída son las de C_ref (a 20 m/s no se vuela más que en V4)
    cRef: 8.93,
    bumpMin: 4.5, bumpDur: 0.3, bumpCool: 0.4,       // contacto intermedio (4,5–8,5): reacción de presentación, sin cambio físico
    softFall: 6.5,                                    // R11 (NPC-03, MOV-13): contra un NPC o un prop pequeño (sin estrella) caída suave desde este cierre
    // V5 T5-10 (D7/HUM-A5-016): SOLO el coche lanza 2,5× más alto que el impacto V4 comparable. vy_coche = vy_V4·carUpGain
    // (vy_V4 con su mismo clamp 3,2–6,0); 1,56 = √2,5 corregido por el paso fijo (ápice discreto). Horizontal y umbral intactos.
    carUpGain: 1.56,
    carSide: 8.0, carMaxH: 16.5, carAhead: 1.35,   // V10.3 (U-14): coches a 10,5 m/s → 1,35·10,5 = 14,2 por delante + 8,0 de lado = 16,3 ≤ tope 16,5     // delante del coche: sale a ≥ 1,15× su velocidad (no la alcanza en el aire)                      // V5 T5-10 (DT-13 revisada con datos): salida lateral mínima del recorrido del coche
                                                     // (con el vuelo 2,5× más largo el coche, a 8,75 m/s, alcanzaba a ANMI en el aire)
    carSlide: 4.5, carSlideMax: 1.0,                  // tumbada en la pista: se desliza fuera de la banda (m/s, s máx.) en vez del salto de 2 m
  },

  // ---------------------------------------------------------------- final de SECRETNOVIO (FIN-01/02; semilla del doc. 11)
  // R2-G8 (usuario, 12 oct): sonido de La Pantera en NMG. Pleno (= nivel de la canción) hasta `near` m de La Pantera (el
  // recuadro de charla llega a ~4 m); cae con curva cuadrática hasta 0 en el borde real del sector en la dirección del
  // jugador (game.ts). `gain` calibrado con tools/v5/pantera-audio.mjs (RMS de las voces = RMS de la música).
  // gain: calibrado 3,2 (= canción; pantera-audio_a3/a4) → R4 (usuario: «sube un poco») 4,2 (+2,4 dB), con limitador en el emisor.
  // talkDuck: la canción baja a este factor dentro del recuadro de charla (R4, usuario), con transición de `duckRamp` m
  panteraSound: { gain: 4.2, near: 4.0, talkDuck: 0.55, duckRamp: 1.5 },
  final: {
    kickStartX: -13.8, lipX: -7.8, lipY: 2.8, lipAngleDeg: 50,
    launchVX: 7.0, launchVY: 9.6, flightGravity: 8.0,      // calibrado (13): con vX 8 la recepción invadía el anillo de coches r 17,5
    landX0: 6.8, landX1: 11.2, landY: 2.8, bankEndX: 15.0, width: 6.0,
    approachX: -19.6,
    retryX: -22.3,                                    // R11 (CEN-02): ancla de reintento/checkpoint del centro FUERA del barrido de coches (r ≥ 21,6, regla safeOk)
    minEntrySpeed: 4.4, armWindow: 2.6,               // metros antes del labio donde SALTO arma el triple (mínimo)
    armTime: 0.48,                                    // V5 T5-29: ventana TEMPORAL = la real de A (medida 0,48 s; el 0,32 del plan era un cálculo)
    assistSpeed: 8.2,                                 // velocidad mantenida al subir el kicker armado
    tuckIn: 0.15, openOut: 0.35, turns: 3,
    landTol: 0.6,                                     // rad de error del triple aceptado al tocar
  },
};

export type Tuning = typeof TUNING;
