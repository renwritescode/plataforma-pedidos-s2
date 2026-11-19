# Métricas del interceptor — Pedidos

## 1. Evidencia del cliente

| Dato | Valor |
|---|---|
| Petición A (bloqueo) | `GET http://localhost:3000/reporte/bloqueante?ms=2500` |
| Petición B (medida) | `GET http://localhost:3000/health` |
| Código de estado de B | `200 OK` |
| Tiempo de B según Postman | `1.21 s` (1210 ms) |
| Herramienta usada | Postman |
| Fecha y hora de la corrida | 19 de noviembre de 2026, 03:05 |

## 2. Respuesta completa de `GET /metricas`

```json
{
  "umbralLentaMs": 1000,
  "rutas": [
    {
      "ruta": "GET /metricas",
      "peticiones": 1,
      "promedioMs": 5.35,
      "maxMs": 5.35,
      "lentas": 0
    },
    {
      "ruta": "GET /health",
      "peticiones": 12,
      "promedioMs": 0.88,
      "maxMs": 2.11,
      "lentas": 0
    },
    {
      "ruta": "GET /reporte/bloqueante",
      "peticiones": 1,
      "promedioMs": 2501.28,
      "maxMs": 2501.28,
      "lentas": 1
    }
  ]
}
```

## 3. ¿Por qué Postman y el interceptor miden distinto a `/health`?

Postman cronometra desde antes de abrir la conexión hasta el último byte
recibido, e incluye la resolución de nombre, el establecimiento de TCP, el
encolado de la petición y la transferencia de la respuesta. El interceptor
arranca cuando el middleware ya se ejecuta y cierra en el evento `finish`, así
que no ve la espera previa en la cola del bucle de eventos ni el transporte; por
eso anotó 2.11 ms para `/health` mientras Postman midió 1210 ms. La diferencia
es la espera mientras `/reporte/bloqueante` retenía el hilo durante 2501.28 ms.
El cliente ve una degradación por latencia: el servicio responde `200`, pero
tarda, y si la espera supera su timeout lo interpreta como caída aunque el
proceso siga vivo; no es un fallo de disponibilidad, sino de tiempo de respuesta.

## 4. Conclusión breve

El interceptor sirve para ubicar la ruta que retiene el hilo; el cliente sirve
para medir la experiencia real. Las dos cifras no se contradicen: miran ventanas
distintas del mismo evento.
