# Setas Campo de Gibraltar: cómo ponerla en tu móvil

La app es una **web instalable (PWA)**: el mismo código funciona en el navegador, en **Android** y en **iPhone**, y se puede subir a las tiendas.

## 1. Publicarla en internet (gratis, 2 minutos)
**Netlify Drop**
1. Entra en https://app.netlify.com/drop desde el ordenador.
2. Arrastra la carpeta `setas-app` entera.
3. Te da una dirección tipo `https://algo.netlify.app`. Esa es tu app.

(También vale GitHub Pages o Cloudflare Pages.)

## 2. Instalarla en el móvil
- **Android (Chrome):** abre la dirección → menú ⋮ → "Instalar aplicación" / "Añadir a pantalla de inicio".
- **iPhone (Safari):** abre la dirección → botón Compartir → "Añadir a pantalla de inicio". Para los avisos hace falta iOS 16.4 o más.

Una vez abierta, funciona sin cobertura (guarda el último tiempo descargado).

## 3. Subirla a Google Play y App Store
1. Con la app ya publicada (paso 1), entra en https://www.pwabuilder.com y pega tu dirección.
2. Pulsa "Package for stores":
   - **Android / Google Play:** genera el paquete listo. Cuenta de desarrollador de Google: pago único de 25 $.
   - **iOS / App Store:** genera un proyecto de Xcode. Necesitas un Mac y la cuenta de desarrollador de Apple (99 $/año). Apple a veces rechaza apps que son "solo una web", así que el diario y los avisos ayudan.

## Archivos
- `index.html`: toda la app (pantallas, fichas de setas, modo campo, diario).
- `map3d.js`: el mapa 3D con relieve (usa MapLibre, que se descarga y se guarda la primera vez).
- `minimap.js`: mapa 2D de respaldo si el móvil no puede con el 3D.
- `score.js`: el cálculo del índice y de cada especie (lo usan la app y los avisos).
- `sw.js`: funciona sin cobertura y revisa el tiempo en segundo plano para los avisos (Android, app instalada).
- `manifest.webmanifest`, `icon-*.png`: lo necesario para instalarla.

## Actualizar la app
Si te paso una versión nueva, vuelve a subir el .zip al mismo proyecto de Vercel (o arrástralo en Netlify). La app instalada se actualiza sola al abrirla con conexión.

## El índice "¿cuándo salir?"
Usa el tiempo de Open-Meteo (gratis, sin clave) de los últimos 30 días y de los próximos 7:
- lluvia ponderada según lo que tardan en salir (más peso a la caída hace 7–16 días),
- temperatura media (ideal 10–20 °C), heladas,
- días de levante fuerte y evaporación,
- época del año.

Para ajustarlo a tus sitios, cambia `lagCurve`, `tempFactor`, `SEASON` y `RULES` en `score.js` comparando con lo que apuntes en el Diario.

**Aviso:** la app ayuda a planificar y aprender, pero no sustituye a un experto. No comas ninguna seta sin que la haya identificado con seguridad alguien que sepa.
