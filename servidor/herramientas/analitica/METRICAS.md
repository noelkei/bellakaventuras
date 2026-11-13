# Métricas de Bellakaventuras (cómo verlas)

**Informe completo** (desde el Mac):
```bash
"/Users/TU_USUARIO/Desktop/Bellakaventuras/alojamiento de juego/ionos-2026-10/herramientas/analitica/analitica.sh" --horas
```
Se guarda en `informes/analitica-<fecha>.txt`. También basta con pedírselo a Claude: «dame las métricas».

**Qué trae (v3, 24 oct 2026):**
- **Resumen por sesiones (lo fiable):** sesiones → carga → JUGAR → tutorial → patatas 1/5/10/20 → SECRETNOVIO → animación final → último diálogo, con % sobre sesiones y sobre JUGAR, y minutos jugados.
- **Tiempos de las partidas nuevas** (reloj del juego, sin pausas): para cada paso (tutorial, patatas 1/5/10/15/20, SECRETNOVIO,
  animación final, último diálogo), el 10 % más rápido, el 25 %, la mediana, el 75 %, el 10 % más lento y el récord. Además:
  - cuánto dura cada partida, por tramos;
  - en qué minuto se descubre cada zona;
  - duración de cada actividad y en qué minuto se completa;
  - tiempos de carga (mediana y 90 %);
  - cuándo se pide la primera pista y cuándo se pulsa SALTAR.
- **Por día, por hora y por canal:** el canal sale de la etiqueta del enlace `?o=ig`, `?o=tiktok`, `?o=wa`…; si el enlace no lleva etiqueta, de la app (Instagram, TikTok, WhatsApp).
- **Dentro del juego:**
  - por partida nueva o guardada;
  - patatas una a una (cuántos llegan, dónde lo dejan, tiempos);
  - zonas y actividades (empiezan, completan, intentos, fallos);
  - errores con nombre;
  - control, orientación, sonido y fluidez;
  - todo por dispositivo y por app.
- **Bunny:** GB servidos, peticiones, % desde su caché y gasto estimado.
- **«Visitantes directos al servidor»** (arriba del todo): desde que Bunny sirve el juego, solo cuenta lo que llega directo. No usarlo para el total.

**Opciones:**
- `--desde AAAA-MM-DD`: solo desde ese día.
- `--horas`: añade el desglose por horas.
- `--historico`: lee los resúmenes diarios guardados, que no caducan.
- `--guardar`: guarda ya los resúmenes del día.

**Datos que no se pierden:**
- El registro del servidor se borra a los 30 días.
- Cada 6 h, el servidor guarda un resumen por día, sin IP, en `/var/lib/bk-analitica/dias/` (`bk-analitica-diaria.timer`).
- `analitica.sh` copia esos resúmenes al Mac, en `informes/diario/`, y también entran en la copia del servidor.

**Avisos al móvil:** `bk-contadores` (cada 100 sesiones; Bunny al 50 % y al 90 %). Consulta: `ssh bellaka bk-contadores --estado`.

**Datos en bruto** (todo lo de IONOS y Bunny en un único archivo SQLite que se va ampliando): `herramientas/datos/DATOS.md`.
