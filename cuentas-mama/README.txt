Cuentas Mamá · versión app instalable

Cambios realizados:
- Título del navegador/app: Cuentas Mamá.
- manifest.webmanifest.
- Iconos 180, 192 y 512 px.
- Modo standalone.
- service-worker.js con estrategia network-first para los archivos propios.
- No se ha modificado la lógica de cálculos.
- No se ha modificado Gist, localStorage, cierre/reapertura de meses, años, comparativas ni simulador.
- ExcelJS sigue cargándose desde su CDN exactamente como antes.

Para GitHub Pages:
- Sube esta carpeta completa como /cuentas-mama/
- Deben ir juntos index.html, manifest.webmanifest, service-worker.js e icons/

ICONO UNIFICADO · SAFARI + IPHONE/IPAD
=====================================
Problema encontrado:
- Los archivos reales eran icon-mama-180.png / 192 / 512.
- index.html, manifest.webmanifest y service-worker.js apuntaban a icon-180.png / 192 / 512, que no existían.
- Safari podía terminar mostrando un favicon antiguo o un fallback almacenado en caché.

Corrección:
- Mismo icono corazón rosa + € para Apple touch icon, favicon, manifest y PWA.
- Nombres nuevos v3 para forzar a Safari a descargar los iconos otra vez.
- favicon.ico añadido en la raíz.
- favicon PNG 32x32 añadido.
- service worker actualizado a cuentas-mama-v3.
