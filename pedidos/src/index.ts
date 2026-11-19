import express, { Request, Response } from "express";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { medirLatencia, resumenMetricas } from "./metricas";
import {
  contarPrimosEnPool,
  estadoPool,
  PoolLlenoError,
} from "./pool";

const PORT = Number(process.env.PORT ?? 3000);
const INVENTARIO_URL = process.env.INVENTARIO_URL ?? "http://localhost:3001";
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 2000);
const MAX_MS_BLOQUEO = 10_000;

interface Pedido {
  id: string;
  sku: string;
  cantidad: number;
  creadoEn: string;
}

const pedidos: Pedido[] = [];
const app = express();
app.use(express.json());

/**
 * Interceptor de métricas: acumula peticiones, tiempo total, máximo y
 * cuántas superaron el umbral. Se registra después del parseo del cuerpo
 * y antes de las rutas de negocio.
 */
app.use(medirLatencia);

/** Resumen acumulado por método y ruta. */
app.get("/metricas", (_req: Request, res: Response) => {
  res.json(resumenMetricas());
});

/** Liveness. Se usa como carga base en el escenario 1. */
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", servicio: "pedidos" });
});

/**
 * Bloqueo síncrono del hilo principal. Sirve para el escenario 1: mientras
 * dura el bucle while, el proceso no puede atender /health; el interceptor
 * registra la duración de esta ruta y el cliente de /health ve la espera.
 */
app.get("/reporte/bloqueante", (req: Request, res: Response) => {
  const solicitado = Number(req.query.ms ?? 1500);
  const ms = Number.isFinite(solicitado)
    ? Math.min(MAX_MS_BLOQUEO, Math.max(100, Math.round(solicitado)))
    : 1500;

  const inicio = performance.now();
  const fin = inicio + ms;
  while (performance.now() < fin) {
    // Bucle intencionalmente vacío: mantiene ocupado el hilo principal.
  }

  res.json({
    modo: "bloqueante",
    msSolicitados: ms,
    msReales: Math.round(performance.now() - inicio),
  });
});

/** Un worker nuevo por petición, sin límite de concurrencia (comparación). */
app.get("/reporte/worker", async (req: Request, res: Response) => {
  const n = Number(req.query.n ?? 2_000_000);
  if (!Number.isInteger(n) || n <= 0) {
    res.status(400).json({ error: "n debe ser un entero mayor que 0" });
    return;
  }

  const inicio = performance.now();
  try {
    const resultado = await ejecutarEnWorker(n);
    res.json({
      modo: "worker",
      n,
      ...resultado,
      totalMs: Math.round(performance.now() - inicio),
    });
  } catch (error) {
    const e = error as Error;
    res.status(500).json({ error: e.message });
  }
});

/**
 * Pool con límite. Si hay cupo, espera el resultado; si la cola está llena,
 * responde 503 de inmediato con Retry-After: 1 y el estado del pool.
 */
app.get("/reporte/pool", async (req: Request, res: Response) => {
  const n = Number(req.query.n ?? 2_000_000);
  if (!Number.isInteger(n) || n <= 0) {
    res.status(400).json({ error: "n debe ser un entero mayor que 0" });
    return;
  }

  const inicio = performance.now();
  try {
    const resultado = await contarPrimosEnPool(n);
    res.json({
      modo: "pool",
      ...resultado,
      totalMs: Math.round(performance.now() - inicio),
      pool: estadoPool(),
    });
  } catch (error) {
    const e = error as Error;
    if (e instanceof PoolLlenoError || e.name === "PoolLleno") {
      res
        .set("Retry-After", "1")
        .status(503)
        .json({
          error: "pool_lleno",
          mensaje: "El pool no tiene trabajadores libres ni espacio en cola.",
          pool: estadoPool(),
        });
      return;
    }
    res.status(500).json({ error: e.message });
  }
});

/** Pedidos de la plataforma: se conserva la ruta de clase. */
app.get("/pedidos", (_req: Request, res: Response) => {
  res.json(pedidos);
});

app.post("/pedidos", async (req: Request, res: Response) => {
  const { sku, cantidad } = req.body ?? {};
  if (
    typeof sku !== "string" ||
    typeof cantidad !== "number" ||
    !Number.isInteger(cantidad) ||
    cantidad <= 0
  ) {
    res.status(400).json({ error: "sku o cantidad inválidos" });
    return;
  }

  try {
    const respuesta = await fetch(
      `${INVENTARIO_URL}/stock/${encodeURIComponent(sku)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );

    if (respuesta.status === 404) {
      res.status(404).json({ error: "sku no existe en inventario" });
      return;
    }

    const stock = (await respuesta.json()) as { disponible: number };
    if (stock.disponible < cantidad) {
      res
        .status(409)
        .json({ error: "stock insuficiente", disponible: stock.disponible });
      return;
    }

    const pedido: Pedido = {
      id: crypto.randomUUID(),
      sku,
      cantidad,
      creadoEn: new Date().toISOString(),
    };
    pedidos.push(pedido);
    res.status(201).json(pedido);
  } catch (error) {
    const e = error as Error & { cause?: { code?: string } };
    const motivo =
      e.name === "TimeoutError"
        ? `Inventario no respondió en ${TIMEOUT_MS} ms`
        : `No se pudo contactar con Inventario: ${e.cause?.code ?? e.message}`;
    res.status(503).json({ error: motivo });
  }
});

/** Lanza un worker independiente para /reporte/worker. */
function ejecutarEnWorker(
  n: number,
): Promise<{ primos: number; ms: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "worker-reporte.js"), {
      workerData: { n },
    });
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (codigo) => {
      if (codigo !== 0) {
        reject(new Error(`El worker terminó con código ${codigo}`));
      }
    });
  });
}

app.listen(PORT, () => {
  console.log(
    `Servicio de Pedidos escuchando en el puerto ${PORT} ` +
      `(inventario: ${INVENTARIO_URL}, timeout: ${TIMEOUT_MS} ms)`,
  );
  console.log(
    `Métricas: /metricas | Worker: /reporte/worker | Pool: /reporte/pool`,
  );
});
