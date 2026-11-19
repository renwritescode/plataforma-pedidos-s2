# Bitácora · Arquitecturas y procesos · René Herrera

## Entorno

| Dato | Valor |
| --- | --- |
| Laptop (CPU, RAM) | Apple M1, 8 núcleos, 16 GB de RAM, macOS 26.6.2 |
| Ejecución | Docker CLI 29.10.0 (Engine 29.5.2) + Compose 5.8.0 sobre Colima 0.10.3 (VM de 8 CPU y 8 GB) |
| nucleos según /metricas | 8 |
| MAX_TRABAJADORES y MAX_COLA | 8 y 16 (valores por defecto: `os.availableParallelism()` y su doble) |
| Duración de un reporte con n=2000000 | ≈160 ms en total (126 ms de cálculo) sin carga concurrente; /reporte/worker aislado: 144 ms |

Medición realizada el 18/11/2026 con la plataforma levantada mediante
`docker compose up -d --build`. Los tres escenarios se ejecutaron con un
`docker compose restart pedidos` antes de cada uno, para que el histograma y los
contadores del pool partieran de cero.

## 1. Resultados

| Escenario | Latencia 50 % | Latencia máx. | Respuestas 2xx | Respuestas 503 | Timeouts | bucle.maxMs |
| --- | --- | --- | --- | --- | --- | --- |
| 1 · bloqueo (/health) | 3 ms | 1514 ms | ≈69 000 | 0 | 0 | 1523 ms |
| 2 · worker sin límite | 1782 ms | 2526 ms | 613 | 0 | 0 | 179 ms |
| 3 · pool con límite | 15 ms | 1153 ms | 508 | 29 955 | 0 | 65 ms |

### Escenario 1 · bloqueo

Comando: `npx -y autocannon@8 -c 20 -d 15 http://localhost:3000/health`, con dos
peticiones a `/reporte/bloqueante?ms=1500` durante la carga.

```text
Running 15s test @ http://localhost:3000/health
20 connections

┌─────────┬──────┬──────┬───────┬──────┬─────────┬──────────┬─────────┐
│ Stat    │ 2.5% │ 50%  │ 97.5% │ 99%  │ Avg     │ Stdev    │ Max     │
├─────────┼──────┼──────┼───────┼──────┼─────────┼──────────┼─────────┤
│ Latency │ 1 ms │ 3 ms │ 7 ms  │ 8 ms │ 3.86 ms │ 36.18 ms │ 1514 ms │
└─────────┴──────┴──────┴───────┴──────┴─────────┴──────────┴─────────┘
┌───────────┬─────┬──────┬─────────┬────────┬──────────┬──────────┬─────────┐
│ Stat      │ 1%  │ 2.5% │ 50%     │ 97.5%  │ Avg      │ Stdev    │ Min     │
├───────────┼─────┼──────┼─────────┼────────┼──────────┼──────────┼─────────┤
│ Req/Sec   │ 0   │ 0    │ 5,591   │ 6,259  │ 4,596.87 │ 2,106.68 │ 145     │
├───────────┼─────┼──────┼─────────┼────────┼──────────┼──────────┼─────────┤
│ Bytes/Sec │ 0 B │ 0 B  │ 1.52 MB │ 1.7 MB │ 1.25 MB  │ 571 kB   │ 39.3 kB │
└───────────┴─────┴──────┴─────────┴────────┴──────────┴──────────┴─────────┘

69k requests in 15.02s, 18.7 MB read
```

Peticiones de bloqueo y respuesta de `/metricas`:

```text
Peticion 1: {"modo":"bloqueante","msSolicitados":1500,"msReales":1500}
Peticion 2: {"modo":"bloqueante","msSolicitados":1500,"msReales":1500}

{"bucle":{"p50Ms":11,"p99Ms":14,"maxMs":1523},"nucleos":8,
 "pool":{"maxTrabajadores":8,"activos":0,"enCola":0,"maxCola":16,"rechazadas":0}}
```

El interceptor de clase, en el mismo escenario, registró un máximo de **7 ms**
para `/health` (69 344 peticiones, casi todas en 0–3 ms), aunque el cliente esperó
hasta 1514 ms. Esa diferencia es la evidencia de que el interceptor no mide la
espera causada por el bloqueo.

### Escenario 2 · worker sin límite

Comando: `npx -y autocannon@8 -c 50 -d 20 "http://localhost:3000/reporte/worker?n=2000000"`.

```text
Running 20s test @ http://localhost:3000/reporte/worker?n=2000000
50 connections

┌─────────┬────────┬─────────┬─────────┬─────────┬────────────┬───────────┬─────────┐
│ Stat    │ 2.5%   │ 50%     │ 97.5%   │ 99%     │ Avg        │ Stdev     │ Max     │
├─────────┼────────┼─────────┼─────────┼─────────┼────────────┼───────────┼─────────┤
│ Latency │ 802 ms │ 1782 ms │ 2309 ms │ 2364 ms │ 1699.38 ms │ 378.37 ms │ 2526 ms │
└─────────┴────────┴─────────┴─────────┴─────────┴────────────┴───────────┴─────────┘
┌───────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
│ Stat      │ 1%      │ 2.5%    │ 50%     │ 97.5%   │ Avg     │ Stdev   │ Min     │
├───────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│ Req/Sec   │ 7       │ 7       │ 29      │ 47      │ 28.15   │ 9.76    │ 7       │
├───────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│ Bytes/Sec │ 2.12 kB │ 2.12 kB │ 8.84 kB │ 14.3 kB │ 8.58 kB │ 2.98 kB │ 2.12 kB │
└───────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘

613 requests in 20.05s, 172 kB read
```

```text
{"bucle":{"p50Ms":12,"p99Ms":86,"maxMs":179},"nucleos":8,
 "pool":{"maxTrabajadores":8,"activos":0,"enCola":0,"maxCola":16,"rechazadas":0}}
```

### Escenario 3 · pool con límite

Comando: `npx -y autocannon@8 -c 50 -d 20 "http://localhost:3000/reporte/pool?n=2000000"`.

```text
Running 20s test @ http://localhost:3000/reporte/pool?n=2000000
50 connections

┌─────────┬──────┬───────┬───────┬────────┬──────────┬──────────┬─────────┐
│ Stat    │ 2.5% │ 50%   │ 97.5% │ 99%    │ Avg      │ Stdev    │ Max     │
├─────────┼──────┼───────┼───────┼────────┼──────────┼──────────┼─────────┤
│ Latency │ 3 ms │ 15 ms │ 52 ms │ 929 ms │ 31.97 ms │ 119.5 ms │ 1153 ms │
└─────────┴──────┴───────┴───────┴────────┴──────────┴──────────┴─────────┘
┌───────────┬────────┬────────┬────────┬────────┬──────────┬────────┬────────┐
│ Stat      │ 1%     │ 2.5%   │ 50%    │ 97.5%  │ Avg      │ Stdev  │ Min    │
├───────────┼────────┼────────┼────────┼────────┼──────────┼────────┼────────┤
│ Req/Sec   │ 867    │ 867    │ 1,600  │ 1,958  │ 1,523.15 │ 255.47 │ 867    │
├───────────┼────────┼────────┼────────┼────────┼──────────┼────────┼────────┤
│ Bytes/Sec │ 383 kB │ 383 kB │ 711 kB │ 870 kB │ 676 kB   │ 114 kB │ 383 kB │
└───────────┴────────┴────────┴────────┴────────┴──────────┴────────┴────────┘

508 2xx responses, 29955 non 2xx responses
31k requests in 20.03s, 13.5 MB read
```

```text
{"bucle":{"p50Ms":15,"p99Ms":44,"maxMs":65},"nucleos":8,
 "pool":{"maxTrabajadores":8,"activos":8,"enCola":16,"maxCola":16,"rechazadas":29981}}
```

## 2. Análisis

### 2.1. Bloqueo medido desde dentro frente a latencia observada desde fuera

En el escenario 1, `bucle.maxMs` llegó a 1523 ms y autocannon midió un máximo de
1514 ms para `/health`; las dos peticiones a `/reporte/bloqueante` tardaron 1500
ms cada una. El histograma interno ve el bloqueo porque comparte el hilo con el
cálculo y registra el retraso de los temporizadores; autocannon lo ve desde el
cliente porque una de sus 20 conexiones quedó esperando respuesta. La mediana del
histograma se quedó en 11 ms, cerca del mínimo que impone `resolution: 10`; por eso
no sirve para diferencias por debajo de esa granularidad. El interceptor de clase,
en cambio, registró un máximo de solo 7 ms para `/health`: empieza a cronometrar
cuando la petición entra al middleware, y las peticiones que llegaron durante el
bloqueo entraron después de que el hilo se liberó. Por eso la espera externa no
distingue entre una ruta lenta y un proceso bloqueado, mientras que la sonda
interna sí.

### 2.2. Cincuenta peticiones simultáneas sobre un cálculo intensivo

Se completaron 613 peticiones, todas 2xx, y no hubo timeouts: autocannon esperó la
respuesta. Un reporte aislado con `n=2000000` tarda ≈160 ms (126 ms de cálculo),
pero con 50 conexiones simultáneas la latencia 50 % subió a 1782 ms y la máxima a
2526 ms, más de diez veces el costo individual. Cada petición crea un worker nuevo;
50 workers compiten por los 8 núcleos de la VM de Colima, el planificador cambia de
contexto y cada worker reserva su propio heap. El trabajo efectivo por segundo se
reparte entre decenas de cálculos y el bucle principal además atiende los mensajes
de todos los workers. Si el cliente tuviera un timeout de 1 s, esas mismas
peticiones habrían terminado como error de temporización.

### 2.3. Rechazo inmediato con Retry-After frente a timeout del cliente

En el escenario 3 se completaron 508 respuestas 2xx y 29 955 respuestas 503; no
hubo timeouts. La latencia 50 % fue de 15 ms porque la mayoría de las respuestas
fueron rechazos inmediatos, mientras que las peticiones admitidas llegaron hasta
1153 ms. El contador `rechazadas` de `/metricas` (29 981) es ligeramente mayor que
los non-2xx de autocannon (29 955) porque algunas peticiones en vuelo se rechazaron
después de que el cliente cerró la prueba. Un 503 con `Retry-After: 1` es una
negativa explícita del servidor antes de ejecutar el trabajo: el cliente sabe que
no se hizo y puede reintentar después. Un timeout es una falla por omisión: el
cliente no sabe si la operación ocurrió y puede duplicarla al reintentar. En los
modelos de fallo, el 503 corresponde a una indisponibilidad temporal declarada y el
timeout a una falla de temporización sin respuesta.

### 2.4. Reintentos inmediatos de autocannon y efecto sobre el servidor

Autocannon no interpreta `Retry-After` y reintenta en cuanto recibe el 503; por eso
el contador `rechazadas` llegó a 29 981 y la cola permaneció llena (activos 8,
enCola 16 de 16) al terminar la prueba. El pool protegió la CPU —`bucle.maxMs` fue
65 ms frente a 1523 ms del escenario 1— pero no redujo la demanda: el servidor
gastó tiempo en rechazar y el cliente siguió golpeando. Un cliente bien diseñado
debería respetar `Retry-After`, aplicar espera exponencial con jitter, limitar el
número de reintentos y, si la tasa de 503 se sostiene, abrir un cortacircuito para
dejar de enviar trabajo.

### 2.5. Métricas locales con tres réplicas detrás de un balanceador

Con tres réplicas, cada proceso tendría su propio histograma, su propio pool y sus
propios contadores en memoria. Una consulta a `/metricas` llegaría a una sola
réplica y mostraría, por ejemplo, `activos: 8` y `enCola: 16` de esa instancia, no
el agregado; con round robin, tres consultas seguidas podrían dar cifras distintas.
La capacidad total sería de 24 trabajadores simultáneos (3 × 8) y 48 puestos en
cola (3 × 16), siempre que el balanceador reparta parejo y ninguna réplica esté
caída. Cambiaría a un colector central de métricas con etiqueta de réplica, una cola
compartida o afinidad por pedido, y revisaría `os.availableParallelism()` dentro de
cada contenedor porque puede reflejar los núcleos del host y no el cupo de CPU.

### 2.6. Cambios que se proponen al diseño

El límite del pool estabiliza el proceso, pero no garantiza latencia baja: si el
trabajo encolado tarda más de lo que el cliente espera, el 503 llega tarde y la
persona percibe una caída. Exportaría las métricas a un colector central; movería
el cálculo intensivo a un servicio aparte o a un pool de workers dedicado;
aplicaría contrapresión antes de la cola con límites por cliente y 429 cuando la
demanda exceda la capacidad acordada; y dimensionaría `MAX_TRABAJADORES` y
`MAX_COLA` con la latencia medida, no con el número de conexiones de la prueba.

## 3. Problemas encontrados

1. **Docker no estaba instalado.** Se instaló Colima 0.10.3 con Docker 29.10.0 y
   Compose 5.8.0 sobre una VM de 8 CPU y 8 GB. La plataforma se levantó con
   `docker compose up -d --build`; el contenedor de Pedidos informa `nucleos: 8`.
   La virtualización agrega una capa de E/S: por eso las cifras de Docker difieren
   de una ejecución nativa y no deben mezclarse con ella.
2. **La primera captura de logs de Docker se tomaba antes del escenario.** El
   script guardaba `docker compose logs` justo después del reinicio, cuando aún no
   había carga. Se corrigió para guardar los logs después de cada escenario con
   `docker compose logs --since <marca>`, y así quedó registrado el máximo de 7 ms
   del interceptor.
3. **La base del repositorio se reconstruyó desde el zip del curso.** El zip
   `plataforma_pedidos` no incluía las rutas de clase (`/reporte/worker`,
   `/reporte/bloqueante` ni el interceptor), así que se añadieron para poder
   ejecutar la entrega. En el repositorio nuevo se conserva esa base y se añaden
   los cuatro archivos de la entrega.
4. **El escenario 2 no produjo timeouts.** Autocannon esperó las respuestas y las
   613 peticiones terminaron en 2xx; el exceso de demanda se manifestó como
   latencia (1782 ms de mediana) y no como error del cliente. No se inventaron
   timeouts para llenar la tabla.
5. **El escenario 3 produjo 29 955 respuestas 503.** Es el comportamiento esperado
   del límite: autocannon ignora `Retry-After` y reintenta de inmediato, por lo que
   el contador de rechazadas crece mientras la cola sigue llena.
6. **El interceptor de clase registra cada petición en stdout.** En el escenario 1
   generó ≈69 000 líneas y en el 3 ≈30 000; esa escritura compite con el bucle y
   explica parte del retardo base (65–179 ms) de los escenarios 2 y 3. Se mantuvo
   porque es el interceptor de clase y se aplicó igual en los tres escenarios; para
   producción conviene muestrear o escribir en un buffer.
7. **Conflicto de puerto 3000.** Si queda un proceso o contenedor anterior, el
   arranque falla con `EADDRINUSE`; se resuelve con `lsof -i :3000` y deteniendo el
   proceso, o con `docker compose down` antes de volver a levantar.
8. **Aviso de `uuid@8` al descargar autocannon con npx.** Es una advertencia de
   deprecación de una dependencia de autocannon; no afecta la medición.

## 4. Uso declarado de IA

Se usó asistencia de IA para estructurar `metricas.ts`, `pool.ts`, la ruta
`/reporte/pool`, la guía de importación y la redacción de este análisis a partir de
las salidas reales. La medición se ejecutó en el equipo del estudiante con Docker
sobre Colima; el estudiante revisó las salidas, verificó la tabla y tomará las
capturas definitivas. Ningún valor numérico fue inventado: todos provienen de las
salidas de autocannon y de `/metricas` reproducidas arriba.
