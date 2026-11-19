import { monitorEventLoopDelay } from "node:perf_hooks";

/**
 * Histograma del retardo del bucle de eventos.
 *
 * monitorEventLoopDelay mide cuánto tiempo pasa entre el instante en que un
 * temporizador debería dispararse y el instante en que realmente se ejecuta.
 * Un bloqueo del hilo principal aparece como un valor alto en max y en p99.
 *
 * resolution: 10 fija la granularidad en milisegundos. Los percentiles y max
 * se expresan en nanosegundos; por eso se dividen para 1e6 antes de publicar.
 */
const retardoBucle = monitorEventLoopDelay({ resolution: 10 });
retardoBucle.enable();

const aMilisegundos = (nanosegundos: number): number =>
  Math.round(nanosegundos / 1e6);

export interface MetricasBucle {
  p50Ms: number;
  p99Ms: number;
  maxMs: number;
}

/** Devuelve el retardo acumulado desde el arranque o desde el último reset. */
export function leerMetricas(): MetricasBucle {
  return {
    p50Ms: aMilisegundos(retardoBucle.percentile(50)),
    p99Ms: aMilisegundos(retardoBucle.percentile(99)),
    maxMs: aMilisegundos(retardoBucle.max),
  };
}

/** Limpia el histograma para que el siguiente escenario parta de cero. */
export function reiniciarMetricas(): void {
  retardoBucle.reset();
}
