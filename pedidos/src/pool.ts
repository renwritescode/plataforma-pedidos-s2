import { Worker } from "node:worker_threads";
import os from "node:os";
import path from "node:path";

/**
 * Despachador con un número fijo de trabajadores y una cola acotada.
 *
 * MAX_TRABAJADORES  límite de workers simultáneos.
 * MAX_COLA          límite de trabajos esperando un worker libre.
 *
 * Cuando la cola está llena, contarPrimosEnPool rechaza con un error cuyo
 * name es "PoolLleno"; la ruta /reporte/pool lo traduce a 503 + Retry-After.
 */

const maxTrabajadoresEnv = Number(process.env.MAX_TRABAJADORES);
const MAX_TRABAJADORES =
  Number.isInteger(maxTrabajadoresEnv) && maxTrabajadoresEnv > 0
    ? maxTrabajadoresEnv
    : os.availableParallelism();

const maxColaEnv = Number(process.env.MAX_COLA);
const MAX_COLA =
  Number.isInteger(maxColaEnv) && maxColaEnv >= 0
    ? maxColaEnv
    : MAX_TRABAJADORES * 2;

export class PoolLlenoError extends Error {
  constructor() {
    super("El pool de trabajadores no tiene capacidad disponible");
    this.name = "PoolLleno";
  }
}

export interface ResultadoReporte {
  n: number;
  primos: number;
  ms: number;
}

export interface EstadoPool {
  maxTrabajadores: number;
  activos: number;
  enCola: number;
  maxCola: number;
  rechazadas: number;
}

interface Trabajo {
  n: number;
  resolve: (resultado: ResultadoReporte) => void;
  reject: (error: Error) => void;
}

let activos = 0;
let rechazadas = 0;
const cola: Trabajo[] = [];

/** Toma el siguiente trabajo de la cola si hay un worker libre. */
function despachar(): void {
  while (activos < MAX_TRABAJADORES && cola.length > 0) {
    const trabajo = cola.shift();
    if (trabajo) ejecutar(trabajo);
  }
}

/** Lanza un worker y resuelve o rechaza la promesa del trabajo. */
function ejecutar(trabajo: Trabajo): void {
  activos += 1;
  let finalizado = false;

  const worker = new Worker(path.join(__dirname, "worker-reporte.js"), {
    workerData: { n: trabajo.n },
  });

  /**
   * Finaliza el trabajo una sola vez y devuelve true si esta llamada fue la
   * que lo cerró. Así message + exit no descuentan dos veces el contador.
   */
  const finalizar = (): boolean => {
    if (finalizado) return false;
    finalizado = true;
    activos -= 1;
    return true;
  };

  worker.once("message", (mensaje: { primos: number; ms: number }) => {
    if (!finalizar()) return;
    trabajo.resolve({ n: trabajo.n, primos: mensaje.primos, ms: mensaje.ms });
    despachar();
  });

  worker.once("error", (error: Error) => {
    if (!finalizar()) return;
    trabajo.reject(error);
    despachar();
  });

  worker.once("exit", (codigo: number) => {
    if (codigo === 0 || !finalizar()) return;
    trabajo.reject(
      new Error(`El worker terminó inesperadamente con código ${codigo}`),
    );
    despachar();
  });
}

/**
 * Encola un cálculo de primos. Devuelve una promesa que se resuelve con el
 * resultado del worker o se rechaza con PoolLleno si la cola ya no admite más.
 */
export function contarPrimosEnPool(n: number): Promise<ResultadoReporte> {
  return new Promise<ResultadoReporte>((resolve, reject) => {
    const trabajo: Trabajo = { n, resolve, reject };

    if (activos < MAX_TRABAJADORES) {
      ejecutar(trabajo);
      return;
    }

    if (cola.length < MAX_COLA) {
      cola.push(trabajo);
      return;
    }

    rechazadas += 1;
    reject(new PoolLlenoError());
  });
}

/** Fotografía del estado real del despachador para /metricas. */
export function estadoPool(): EstadoPool {
  return {
    maxTrabajadores: MAX_TRABAJADORES,
    activos,
    enCola: cola.length,
    maxCola: MAX_COLA,
    rechazadas,
  };
}
