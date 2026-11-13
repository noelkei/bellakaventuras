# Bellakaventuras

Juego web 3D de skate (three.js + Rapier + Vite) por el parque de ANMI: cinco escenarios con su canción, 20 patatas que encontrar y el reto final de SECRETNOVIO, con cronómetro de speedrun y top 3.

Estuvo publicado en www.bellakaventuras.com del 24 de octubre al 7 de noviembre de 2026. Este repositorio tiene lo mínimo para volver a construirlo y relanzarlo: el código de la última versión publicada (**V10.6.2**), sus recursos y los scripts del servidor.

## Qué hay

| Carpeta | Qué es |
|---|---|
| `game/` | El juego: código (`src/`), recursos ya convertidos (`public/`: modelos, texturas, cortes de canción, iconos) y pruebas (`tools/`) |
| `servidor/` | Cómo se servía: scripts para montar el servidor (Ubuntu + Caddy), publicar, volver atrás, vigilancia, CDN Bunny, métricas anónimas y récord del cronómetro. Guía: `servidor/03_ESTADO_Y_USO.md` y `servidor/BUNNY.md` |
| `docs/` | Estado de la versión publicada y lo que quedó pendiente |

## Jugar en tu ordenador

Hace falta Node 20 o más nuevo.

```bash
cd game
npm ci
npm run dev
```

Abre la dirección que sale en pantalla (por ejemplo http://localhost:5173/).

## Construir la versión para publicar

```bash
cd game
npm ci
npm run build
```

Sale en `game/dist/`: una web estática que se puede servir desde cualquier hosting (rutas relativas). Comprobado el 13 nov 2026: esta build coincide archivo por archivo con la publicada (`build/index-D802oi18.js`).

Para relanzarlo con el mismo montaje de antes (VPS + Caddy + Bunny), ver `servidor/03_ESTADO_Y_USO.md` y `servidor/herramientas/montar_servidor.sh`. Ese script necesita una copia privada del servidor (certificados y configuración) que **no** está aquí; con un servidor nuevo basta con su propio certificado.

## Lo que no está aquí (a propósito)

- Claves, contraseñas y avisos privados del servidor y de la CDN.
- Datos de jugadores y registros del servidor.
- Canciones completas, material original del artista y modelos de origen (solo van los ya convertidos que usaba la web).
- Historial de trabajo, capturas y vídeos de pruebas.

Las IP que aparecen en los scripts son de ejemplo (`203.0.113.10` = servidor, `198.51.100.20` = casa) y las rutas usan `/Users/TU_USUARIO`.

## Licencia

Código: MIT. Música, personajes, logos y arte: todos los derechos reservados. Detalle en `LICENSE` y en `game/THIRD_PARTY_ASSETS.md`.
