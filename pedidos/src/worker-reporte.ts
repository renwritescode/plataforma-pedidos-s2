import { parentPort, workerData } from "node:worker_threads";

/**
 * Cálculo intensivo que se ejecuta dentro de un worker thread.
 * Se reutiliza tal como está: el pool y la ruta /reporte/worker solo lo lanzan.
 */

function esPrimo(numero: number): boolean {
  if (numero < 2) return false;
  if (numero % 2 === 0) return numero === 2;
  for (let divisor = 3; divisor * divisor <= numero; divisor += 2) {
    if (numero % divisor === 0) return false;
  }
  return true;
}

export function contarPrimos(limite: number): number {
  let total = 0;
  for (let numero = 2; numero <= limite; numero += 1) {
    if (esPrimo(numero)) total += 1;
  }
  return total;
}

if (!parentPort) {
  throw new Error("worker-reporte.ts debe ejecutarse como worker thread");
}

const { n } = workerData as { n: number };

if (!Number.isInteger(n) || n <= 0) {
  throw new Error("El valor n debe ser un entero mayor que 0");
}

const inicio = performance.now();
const primos = contarPrimos(n);
const ms = Math.round(performance.now() - inicio);

parentPort.postMessage({ primos, ms });
