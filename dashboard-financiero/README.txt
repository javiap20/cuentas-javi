
Gist y backup JSON:
- Token de GitHub persistente en localStorage.
- El token queda guardado solo en el mismo navegador/dispositivo/origen.
- C:\ y GitHub Pages son contextos distintos: hay que introducirlo una vez desde la URL real de GitHub Pages.
- El token NO se incluye en el JSON ni en el Gist.
- "Descargar JSON" exporta casos de préstamos/hipoteca, proyección, nómina y nóminas guardadas.
- "Importar JSON" restaura el backup localmente.
- Importar no sincroniza automáticamente: pulsa "Sincronizar ahora" si quieres subir luego ese backup al Gist.
- Service worker actualizado a v2.

PAQUETE GITHUB COMPLETO
=======================
Dentro de /dashboard-financiero/ deben quedar:
- index.html
- manifest.webmanifest
- service-worker.js
- icons/icon-180.png
- icons/icon-192.png
- icons/icon-512.png

Sube/sustituye TODOS estos archivos en GitHub Pages.
