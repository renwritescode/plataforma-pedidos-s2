# Plataforma de Pedidos

Servicio de Pedidos e Inventario de la plataforma de la asignatura
**Arquitectura y Servicios Distribuidos** (PUCE Manabí).

- `pedidos/`: API de pedidos, sonda de salud y rutas de reporte con workers.
- `inventario/`: servicio de stock consultado por Pedidos.
- `compose.yaml`: levanta ambos servicios en Docker.

## Ejecución

```bash
docker compose up -d --build
```

- Pedidos: <http://localhost:3000>
- Inventario: <http://localhost:3001>

## Rutas principales de Pedidos

```text
GET  /health
GET  /pedidos
POST /pedidos
GET  /reporte/worker?n=2000000
GET  /reporte/bloqueante?ms=1500
```

## Ejecución sin Docker

```bash
cd pedidos
npm install
npm run build
PORT=3000 node dist/index.js
```
