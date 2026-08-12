
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

SINCRONIZACION GIST SEGURA
==========================
Flujo recomendado en un navegador/dispositivo nuevo:
1. Abrir el Dashboard desde GitHub Pages.
2. Abrir GitHub Gist.
3. Introducir el token.
4. Pulsar "Conectar / cargar Gist".
5. Los datos remotos se cargan en ese navegador.
6. A partir de ahí los cambios locales pueden guardarse/autosincronizarse.

Protección contra sobrescrituras:
- "Guardar en Gist" NO puede sobrescribir un Gist existente si este navegador no lo ha cargado antes.
- Si el Gist cambió desde otro navegador después de la última carga/sincronización, el guardado se bloquea y pide cargar primero la versión remota.
- El JSON queda como copia de seguridad, no como método normal de sincronización.
- El token sigue siendo local a cada navegador/dispositivo.
- Service worker actualizado a v3.
