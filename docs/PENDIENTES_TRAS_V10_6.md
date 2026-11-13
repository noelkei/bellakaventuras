# Pendientes tras la V10.6 y el lanzamiento (24 oct 2026, 17:40)

Lista única de lo que queda: tus tareas, el juego (lo que quedó de la auditoría IT8 y de la V10.6) y el servidor.
De dónde sale cada cosa:
- `V10/IT9/INFORME_V10_6.md` y `V10/IT8/HALLAZGOS.md` (tabla «Estado tras la V10.6»);
- `alojamiento de juego/ionos-2026-10/03_ESTADO_Y_USO.md` y `BUNNY.md`.

## A. Tus tareas (por urgencia)

| # | Qué | Por qué | Cuándo |
|---|---|---|---|
| 1 | **Poner un método de pago en Bunny** y activar sus avisos de facturación por correo | Si se acaba la prueba gratuita (normalmente 14 días, hacia el **7 nov**) o los 20 $, Bunny deja de servir y la web cae hasta volver a IONOS. ntfy avisa al 50 % y al 90 % del gasto, pero **no de la fecha de fin de la prueba** | Antes del 7 nov |
| 2 | **HetrixTools:** comprobar que ntfy está en la lista «Default Contact» | Para que los dos monitores (servidor y www por Bunny) te avisen al móvil | Ya |
| 3 | **Guardar la contraseña inicial de root** (panel de IONOS → Servidores → My VPS → Datos de acceso) en Contraseñas | Entrada de emergencia por la consola de IONOS si la llave SSH falla | Esta semana |
| 4 | **Apuntar la frase de la llave SSH y copiar la llave a un pendrive** (`~/.ssh/bellakaventuras_ionos_2` y `.pub`) | Ahora solo existe en este Mac | Esta semana |
| 5 | **2FA en IONOS y en tu correo** (app de códigos, no SMS) | Protege las cuentas si te roban la contraseña | Esta semana |
| 6 | **Preguntar a IONOS** si pueden activar la «API de DNS» con tu contrato (salió «Este artículo no es compatible con su contrato») | Con ella, la vuelta a IONOS si Bunny cae sería automática (ya está programada: `bk-dns-www`) | Cuando puedas |
| 7 | **Probar en un iPhone real:** pulgar en el joystick al cerrar una charla (H8-16), JUGAR con la pantalla girada, girar el móvil en una actividad, pausa en un diálogo 2D | La emulación no lo puede comprobar | Cuando puedas |
| 8 | **Cortafuegos del Mac** (Ajustes → Red → Cortafuegos; «Permitir» a node si lo pregunta) | Higiene del ordenador que guarda la llave del servidor | Cuando puedas |
| 9 | **Decidir el VPS:** se renueva solo cada mes (~14,52 €/mes). El dominio, cada año | Que no sea una sorpresa; cancelar o seguir | Antes del ~23 nov |
| 10 | **Renovación automática del dominio:** decidir si la quitas | El dominio es tuyo hasta oct 2027 | Sin prisa |
| 11 | **Borrar la llave SSH vieja** (`~/.ssh/archivo/`) | Ya no abre nada | En unos días |
| 12 | **Usar enlaces con etiqueta:** `www.bellakaventuras.com/?o=ig`, `?o=tiktok`, `?o=wa`… | Para saber qué canal trae gente (sale en las métricas) | Siempre |

## B. Juego (próxima versión, V10.7)

**Publicada la V10.6.1 (25 oct, 16:00):** cronómetro de speedrun + top 3 automático. Estado, manejo del récord y lo que falta: `V10/IT10/ESTADO_CRONOMETRO.md`.

| Qué | Origen | Prueba que lo vigila |
|---|---|---|
| **H8-01** · solo con mando no se pinta el grafiti de YINYANG (impide acabar con mando) | IT8, bloque 4 | `it8/grafiti-mando` rojo |
| **H8-09** · con mando, A en el lienzo sale del grafiti | IT8, bloque 4 | CE-07 de `it8/entradas-cortes` rojo |
| **H8-16** · confirmar en un iPhone real (en el código ya está arreglado) | IT8 | CE-11 (no medible en emulación) |
| **H8-04** · al levantarse tras un golpe, el cuerpo se mete ~9 cm en el suelo | IT8, bloque 7 | `v4/impact-seq` rojo |
| **H8-05** · pie de apoyo que patina agachada | IT8, bloque 7 | — |
| **H8-06** · cámara que se acerca demasiado a toda velocidad | IT8, bloque 7 | `v5/cam-orbit` rojo |
| **H8-07** · en el atropello, ANMI sale del encuadre en móvil | IT8, bloque 7 | `v5/cam-cases` rojo |
| H8-18 / H8-19 · huecos de geometría (no se llega jugando) | IT8, bloque 8 | — |
| 1.8 · detalles de móviles estrechos; bloque 9 · textos y animaciones propuestas | Alcance de la V10.6 (no entraron) | — |
| **Sonido que no arranca** (E06, ~100 veces el primer día; casi seguro Instagram en iPhone): pedir un toque para activar el audio o avisar | Métricas reales | analítica, «Errores» |
| Móviles sin 3D (E01, 19) y 3D perdido por memoria (E02, 19): mensaje más claro o calidad más baja automática | Métricas reales | analítica |
| `canonical` y `og:url` a `https://www.bellakaventuras.com/` (ahora apuntan a la raíz, que redirige) | Opción A de Bunny | `v10_6/compartir` |
| Grind de Bellakat: 7 intentos de mediana para completarlo; valorar si es demasiado difícil | Métricas reales | analítica, «Actividades» |
| Métricas: añadir la orientación (vertical/horizontal) y el aparato a los avisos de hitos (patatas, SECRETNOVIO, final) para saber cuántos se pasan el juego en cada orientación. Hoy solo se sabe al empezar y el primer cambio, y los avisos no se pueden unir entre sí a propósito (sin identificadores) | Pregunta del usuario (24 oct) | `v10_6/avisos` |
| Modo «Plus Ultra» (más calidad visual) | Descartado el día del lanzamiento | — |
| Prueba de campaña automática intermitente (piloto automático, no el juego) | V10.2 R6 / V10.6 | `v8/campaign-v8` |
| Pasar la suite R11 (física del skate) sobre la V10.6: se cortó por prioridad el día del lanzamiento (el juego no la toca) | Batería V10.6 | `tools/v8/r11/suite-r11.sh` |
| Safari automático a 1440×900 y 900×600: la automatización no llegó a cargar a tiempo | Navegadores V10.6 | `v10_6/cascos-navegadores` |
| Copias de reserva con la r3: el ZIP para amigos (`paquetes/Bellakaventuras.zip`) y workers.dev (`d2aa4857`). Regenerar con la V10.6 si se usan | `paquete-local`, alojamiento | — |

## C. Servidor y Bunny

| Qué | Nota |
|---|---|
| Redirección de la raíz a www: pasar de 302 a 301 cuando sea definitiva | Mejor para Google; hoy es temporal para poder deshacer |
| Vuelta automática a IONOS si Bunny cae | Programada; solo falta la clave de la API de DNS de IONOS (tarea A6). Hoy es semiautomática: aviso ntfy urgente con los pasos |
| Certificado de www en el servidor detrás de Bunny | El vigía avisa si le quedan < 20 días (Caddy podría no renovarlo solo). Revisar hacia el 1 ene 2027 |
| En cambios de DNS futuros, hacerlos de madrugada | El hueco de borrar y crear hizo que alguien viera «no se puede encontrar» unos minutos (el DNS guarda «no existe» hasta 10 min) |
| Registros de Bunny (países, bytes): `bunny.sh registros` los baja, pero no está automatizado (Bunny los guarda 3 días) | Opcional: las métricas del juego no los necesitan |
| Tras reconstruir el servidor desde cero (`montar_servidor.sh`) | Después, `herramientas/bunny/servidor_cdn.sh --aplicar`, los timers de `bk-analitica-diaria` y `bk-datos` (con `/usr/local/bin/bk-datos`) y P0 `--abierta`. El archivo de datos en bruto se recupera del Mac (`datos/bellakaventuras.sqlite`) |
| Datos en bruto: el archivo crece (~95 MB el día del lanzamiento, sobre todo por Bunny) | Vigilar el tamaño de vez en cuando (`ssh bellaka bk-datos --resumen`); el disco tiene 109 GB libres |
| Si se cambia la clave de Bunny | Volver a copiarla al servidor (`servidor_cdn.sh --aplicar`) para los avisos de gasto |
