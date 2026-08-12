
Corrección de Proyección semestral:
- La base inicial pasa a ser Ahorro + Capital inicial de los préstamos.
- El capital de los préstamos se suma una sola vez al comienzo de la proyección.
- En los semestres posteriores no se vuelve a sumar el capital de los préstamos.
- Cada semestre añade únicamente el ahorro mensual efectivo de sus meses y resta las cuotas ordinarias.
- La métrica se renombra a "Ahorro + capital préstamos".
- Ejemplo: 20.000 € de ahorro + 50.000 € de préstamos - 3.372 € de cuotas = 66.628 €.

Navegación:
- Nuevo orden de pestañas: Préstamo personal, Hipoteca, Nómina.
- Préstamo personal pasa a ser la pestaña inicial por defecto.
- Se añade la tercera pestaña Nómina.
- Nómina dispone por ahora de un espacio independiente preparado para la futura calculadora de salario neto de España (12, 14 y 15 pagas).
- La pestaña Nómina no reutiliza ni modifica accidentalmente los campos/estados de préstamos e hipotecas.

Calculadora Nómina 2026:
- Calculadora completa de salario neto para trabajador por cuenta ajena del Régimen General.
- Bruto anual y selector de 12, 14 o 15 pagas.
- Contrato indefinido, temporal >= 1 año o temporal < 1 año.
- Estimación automática de retención IRPF 2026 siguiendo las reglas principales del algoritmo oficial de la AEAT.
- Situación familiar del Modelo 145, descendientes, menores de 3 años, cómputo compartido/entero, edad y discapacidad del trabajador.
- Ajustes avanzados: grupo de cotización, movilidad geográfica, ascendientes, pensión compensatoria, anualidades por alimentos y minoración por vivienda habitual.
- Campo opcional de IRPF manual para reproducir una retención real conocida.
- Seguridad Social 2026: contingencias comunes 4,70%, desempleo 1,55% indefinido / 1,60% temporal, formación 0,10%, MEI trabajador 0,15%.
- Base máxima mensual 2026: 5.101,20 €.
- Se incluye cotización adicional de solidaridad 2026 por encima de la base máxima con tipos del trabajador 0,19%, 0,21% y 0,24% según tramo.
- Para 14 y 15 pagas, la Seguridad Social se distribuye en las 12 nóminas ordinarias porque las extras se prorratean en la base de cotización.
- Resultados: neto anual, neto ordinario, neto extra, IRPF, Seguridad Social, bruto por paga y desglose anual.
- Los ajustes de Nómina se guardan automáticamente en localStorage y forman parte del Gist global.
- La calculadora es una estimación y no sustituye una nómina o regularización de retenciones emitida por la empresa/AEAT.

Ajuste visual de Nómina:
- La tabla "Cómo queda cada paga" deja de usar scroll horizontal.
- La tabla ocupa todo el ancho disponible con table-layout fijo.
- Las celdas pueden partir texto cuando sea necesario.
- En pantallas pequeñas se reduce ligeramente tipografía y padding en lugar de mostrar barra de scroll.

Ajuste adicional de la tabla de Nómina:
- Todas las cabeceras y celdas quedan centradas, incluida la columna Tipo.
- El ancho de las seis columnas suma exactamente el 100% del bloque.
- Se fuerza max-width:100%, box-sizing:border-box y overflow:hidden en el contenedor para impedir que las filas sobresalgan.
- La tabla conserva diseño responsive sin scroll horizontal.

Unificación visual de calculadoras:
- Hipoteca y Préstamo personal adoptan la misma estructura de cabecera que Nómina.
- "Calculadora activa", título y subtítulo pasan a ocupar todo el ancho por encima de la zona de edición/resultados.
- El editor izquierdo y los resultados comienzan en la misma línea horizontal, como en Nómina.
- El ancho del editor de préstamos/hipotecas pasa a 350 px y el gap a 16 px, iguales al layout de Nómina.
- El padding del editor izquierdo pasa a 18 px, igual que el panel de datos de Nómina.
- Los casos guardados permanecen debajo del título/subtítulo y encima de las cards.
- La vista TODOS mantiene la misma cabecera y continúa ocultando el panel lateral.

Microajustes visuales:
- Hipoteca: cifras de las cards KPI superiores reducidas 1 px.
- Nómina: cifras de las cards KPI superiores aumentadas 1 px.
- Préstamo personal: en las cards anuales de TODOS, los títulos se fuerzan a dos líneas:
  Pagado / al año, Importe / real, Intereses / reales.
- Se fija una altura mínima homogénea para esos títulos, de modo que las cifras queden perfectamente alineadas.

Guardar Nómina:
- Se añade un bloque "Guardar nómina" en el panel izquierdo.
- Las nóminas pueden guardarse con nombre (p. ej. Actual, Oferta nueva, Subida 2027).
- Las nóminas guardadas aparecen como botones compactos debajo del título Nómina 2026.
- Una nómina cargada queda resaltada.
- Tras el primer guardado, cualquier cambio de sus datos se guarda automáticamente en el caso activo.
- Se añade "+ Nueva nómina" para empezar una simulación limpia.
- La X de cada nómina pide confirmación explícita antes de borrar.
- Los casos de nómina se guardan en localStorage y también se incluyen en el Gist global.
- El Gist sigue conteniendo en un solo documento préstamos, hipotecas, proyección y nóminas.

Unificación de escala visual con Nómina como referencia:
- Préstamo personal e Hipoteca adoptan la misma escala tipográfica de las cards de Nómina.
- Cifra principal KPI: 23 px en las tres calculadoras.
- Título de card: 10 px.
- Nota inferior de card: 8,8 px.
- Cards superiores: padding 13 px y altura mínima 108 px.
- Se elimina el antiguo ajuste específico que hacía la cifra de Hipoteca 1 px más pequeña.
- El panel izquierdo de Préstamo/Hipoteca iguala a Nómina: labels 10,5 px, inputs/selects 11 px, padding 10x11 px y separación de campos 12 px.
- Botones del gestor de casos también se compactan a la escala de Guardar Nómina.
- Se mantienen colores, cálculos y contenido propios de cada pestaña.

Alineación entre pestañas:
- Se iguala la distancia entre subtítulo y GUARDADOS/GUARDADAS en las tres calculadoras.
- Nómina pasa de 14 px a 9 px de separación, igual que Préstamo personal e Hipoteca.
- Se iguala también el padding horizontal del bloque GUARDADAS para que no haya salto lateral.

Microalineación final:
- GUARDADAS de Nómina recupera 2 px de padding horizontal para coincidir exactamente con GUARDADOS de Préstamo/Hipoteca.
- El subtítulo de Nómina usa line-height 1.4, igual que Préstamo/Hipoteca.
- Se ajusta 1 px el espacio vertical inferior de la cabecera de Nómina para evitar el pequeño salto al cambiar de pestaña.

Proyección semestral V3:
- Se añade la columna manual "Ganancias Bolsa" entre Ahorro + capital préstamos y Cuotas de préstamos.
- Ganancias Bolsa se guarda por semestre y puede ser positiva o negativa.
- La cifra de Bolsa se suma al cálculo del Resultado real y se arrastra al semestre siguiente.
- El antiguo Resultado pasa a llamarse "Previsión resultado".
- Al abrir esta versión, la previsión de cada semestre se fotografía automáticamente con el valor que tenía el modelo anterior y queda congelada.
- Cambios posteriores en ahorro mensual, Bolsa, cuotas o Resultado real no modifican esa previsión histórica.
- Se añade al final "Resultado real".
- Si no se toca, Resultado real se calcula automáticamente: base acumulada + ahorro del periodo + Bolsa - cuotas.
- Resultado real es la cifra que alimenta el cálculo del semestre siguiente.
- Se puede escribir manualmente un Resultado real para sustituir el automático.
- Botón "Fijar": guarda ese Resultado real como cerrado y lo deja solo lectura.
- Botón "Editar": reabre un Resultado real cerrado si alguna vez necesita corregirse.
- Previsión, Bolsa y Resultados reales se guardan en localStorage y en el Gist global mediante projectionSettings.

Corrección de Proyección semestral:
- Resultado real deja de poder editarse o fijarse.
- Resultado real es siempre automático y se calcula con la fórmula:
  Ahorro acumulado + Ganancias Bolsa - Cuotas de préstamos.
- Resultado real es siempre el valor que alimenta el semestre siguiente.
- Previsión resultado permanece congelada frente a cambios automáticos.
- Previsión resultado sí puede editarse manualmente para afinar la previsión inicial.
- Se eliminan Fijar / Editar del Resultado real.
- Los antiguos realResults guardados por la versión anterior se ignoran al cargar.

Cierre definitivo de Proyección:
- Ahorro queda fijado en 25.878 € y no es editable desde la interfaz.
- Previsión resultado queda cerrada y deja de poder editarse.
- Los valores ya guardados en forecastResults se conservan como fotografía histórica.
- Resultado real sigue siendo siempre automático y encadena el semestre siguiente.
- Capital de los préstamos en Proyección pasa a representar el dinero realmente recibido:
  capital inicial - comisión de apertura.
- Esta resta afecta únicamente a la Proyección semestral / dinero disponible.
- El préstamo, sus cuotas, intereses y amortización siguen calculándose exactamente sobre el capital inicial completo.
- Si un préstamo no tiene comisión de apertura, su capital neto coincide con el capital inicial.
- El valor fijo de ahorro y la lógica de previsión permanecen en el código y pueden modificarse más adelante si se solicita.

Modelo definitivo de Proyección semestral:
- Se elimina por completo la columna Ganancias Bolsa.
- Orden de columnas:
  Ahorro + capital | Cuotas | Previsión | Ahorro real | Resultado real.
- Ahorro + capital representa la base prevista antes de pagar las cuotas.
- El ahorro inicial continúa cerrado en 25.878 €.
- El capital de cada préstamo es neto de comisión de apertura.
- Para nuevos préstamos, el capital se incorpora a la proyección en el mes en que el caso guardado entra en el dashboard.
- Cuotas es la suma prevista de cuotas ordinarias del semestre.
- Previsión = Ahorro + capital - Cuotas.
- En esta versión se crea una nueva fotografía de la previsión y queda cerrada.
- Se congelan también Ahorro + capital y Cuotas usados para esa previsión, de modo que la igualdad siempre sea coherente.
- Si en el futuro se añade un préstamo completamente nuevo, la previsión se recalcula únicamente desde el semestre en que entra ese nuevo capital; los periodos anteriores permanecen intactos.
- Ahorro real es manual y se introduce cada semestre.
- En un semestre en curso, Ahorro real puede modificarse hasta que cierre.
- Si un semestre ya está cerrado y no tiene dato, se permite introducirlo una única vez.
- Una vez un semestre está cerrado y tiene Ahorro real, el dato deja de ser editable desde la interfaz.
- Resultado real = Ahorro real - Previsión.
- Resultado positivo significa más ahorro del previsto; negativo, menos ahorro del previsto.
- Ahorro real y previsiones se guardan en localStorage y en el Gist global dentro de projectionSettings.
- Los antiguos datos de Ganancias Bolsa quedan ignorados por esta versión.

Conversión a app instalable:
- El título del navegador/app pasa a ser "Dashboard financiero".
- manifest.webmanifest para instalación PWA.
- Iconos 180, 192 y 512 px.
- Modo standalone: al instalarse abre sin la interfaz normal del navegador.
- Service worker con estrategia network-first para evitar quedarse con versiones antiguas del dashboard tras una actualización.
- Conserva apertura básica offline del shell de la app.
- No cambia cálculos, datos guardados, localStorage, Gist ni lógica financiera.

GitHub:
- Sube esta carpeta completa como /dashboard-financiero/
- No subas solo index.html: manifest, service-worker.js e icons/ también son necesarios para que sea instalable.
