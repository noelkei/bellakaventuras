# Herramientas de prueba V2 (archivadas; NO acreditan V3)

Se conservan como histórico de la auditoría V2. No se usan como evidencia de V3 (BASE-04) porque contienen
aserciones o atajos que no prueban lo que dicen:

| Archivo | Problema detectado |
|---|---|
| `e2e.mjs:350` | `previewPlaying \|\| true`: la comprobación del preview nunca falla. |
| `e2e.mjs:646` (offline) | informe con `moving: true` fijo. |
| `e2e.mjs:316, 376–378, 513` | completa actividades/puente con `state.complete`/`setBridgeReached` antes de jugarlas y las cuenta en «partida completa». |
| `capture-tricks.mjs:44` | `debugCollectAll(20)` + centro abierto a mano para capturar el backflip V2. |
| `audit-complement.mjs:194` | marca el puente alcanzado antes de recorrerlo. |
| todas | usan el contrato V2 (`g.input.actionQueued`, `FinalBackflip`, guardado v3, pantalla sin pausa por Escape). |

Las comprobaciones vigentes están en `tools/v3/` (entrada real del navegador; fixtures de posición declarados en cada
informe). Si se reutiliza un caso de aquí, se reescribe allí con el contrato V3 y debe fallar al reintroducir el defecto.
