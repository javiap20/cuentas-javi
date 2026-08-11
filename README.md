# Javi Apps

Repositorio unico para tus tres aplicaciones personales:

- `ingles/` - English Daily
- `cuentas/` - Cuentas Personales
- `valores/` - Cartera JaviAp

## Subida a GitHub

1. Crea un repositorio nuevo (por ejemplo `javi-apps`).
2. Descomprime `javi-apps.zip`.
3. Sube TODO el contenido de la carpeta `javi-apps` a la raiz del repositorio.
4. MUY IMPORTANTE: copia tu archivo actual `finanzas-master.xlsx` desde el repositorio antiguo a `cuentas/finanzas-master.xlsx`. No estaba adjunto en la conversacion y por eso no puede ir dentro de este ZIP.
5. En GitHub: Settings > Pages > Deploy from a branch > `main` > `/ (root)`.
6. Espera a que Pages publique el sitio y abre la URL principal.

## URLs

Con GitHub Pages, las rutas quedan asi:

- `/javi-apps/` - portada
- `/javi-apps/ingles/` - English Daily
- `/javi-apps/cuentas/` - Cuentas Personales
- `/javi-apps/valores/` - Cartera

## Gists

Los Gists actuales se conservan. No hace falta crearlos de nuevo. Las aplicaciones mantienen sus identificadores y nombres de fichero actuales.

## PWA

Cada aplicacion tiene su propio manifest, sus propios iconos y un service worker limitado a su carpeta. Los service workers de Cuentas y Cartera se han corregido para que solo limpien sus propias caches y nunca las de otra app del mismo dominio.

En iPhone/iPad abre cada aplicacion en Safari y usa Compartir > Anadir a pantalla de inicio.

## Migracion segura

No borres ni archives los repositorios antiguos hasta comprobar que las tres aplicaciones abren, sincronizan con sus Gists y que Cuentas lee correctamente `finanzas-master.xlsx` desde la nueva carpeta.
