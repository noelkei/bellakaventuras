# Pruebas R13 (17 oct)

Rojo → verde contra la build publicada congelada antes de R13 (`V8/baseline_V8_preR13/dist-v8`, servidor `bk-v8-preR13`, puerto 5237, alias
`pre13`) y la build nueva (`--url v8` = `dist-v8` en 5232, o `--url r11` = `dist-r11` en 5235 mientras se trabaja). Registro: `V8/evidencias/R13/REGISTRO_R13.md`.

| Prueba | Qué comprueba | Base | Nueva |
|---|---|---|---|
| `f17-rampa-flips` | W mantenida desde la carrerilla + SALTO en el aire de 3 quarter_bola, nmg_quarter y trick_kicker = frontflip; S = backflip | 10 rojas | 21/21 |
| `f18-baile-sitio` | Emula el juego publicado (borra `__bkRapier`).<br>· Estática: el juego no lee `window.__bk*`.<br>· No se baila en el túnel de FG ni agachada.<br>· Sí se baila junto a 10 rampas y escalones × 4 rumbos.<br>· La tabla del baile nunca flota en 40 bordes. | 5 rojas | 11/11 |
| `f19-guia-textos` | Las 20 patatas tienen un texto de «Falta:» propio, ≤ 70 caracteres, sin nombres internos, medidas ni «…» | 16 rojas | 42/42 |
| `f20-choques-sitio` | 500 choques contra La Pantera y 8 contra cada uno de los 38 colisores blandos: no se mueve ningún NPC ni ninguno de los 633 colisores fijos | verde (garantía) | 4/4 |
| `f21-graficos-perdidos` | Pérdida real del contexto WebGL (WEBGL_lose_context):<br>· aviso con foco en «Continuar»;<br>· partida congelada y guardada;<br>· Esc/P no lo cierran;<br>· «Continuar» recarga y sigue la partida. | 10 rojas | 10/10 |
| `touch-tasks-chivato` | **Sonda para el extra pendiente**: copia de `v5suite/touch-tasks` que avisa en consola si hay «Context Lost» o si aparece el aviso `#glost` | — | — |

```sh
node tools/v8/r13/f17-rampa-flips.mjs --url pre13 --task R13 --label base
node tools/v8/r13/f18-baile-sitio.mjs --url v8 --task R13 --label final        # la estática de la base: BK_SRC=../V8/backups/R13_pre/src
node tools/v8/r13/touch-tasks-chivato.mjs --url v8 --task R13 --label chiv     # extra pendiente
```

Ajustes de pruebas heredadas hechos en R13 (cada uno justificado en el registro; ninguna comprobación relajada):
- `tools/v8/tt-talks.mjs`: antes de una charla que precede a una recarga, espera a que el punto seguro del techo esté guardado (`cpRoof`).
- `tools/v4/final-v4.mjs`: B3 busca la 3.ª entrada con aterrizaje de `__bkFinalLog` en vez de solo la última.

Copias previas en `V8/backups/R13_pre/`.
