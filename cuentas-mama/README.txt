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
