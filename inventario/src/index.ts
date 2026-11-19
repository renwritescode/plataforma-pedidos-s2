import express, { Request, Response } from "express";

const PORT = Number(process.env.PORT ?? 3001);
const RETARDO_MS = Number(process.env.RETARDO_MS ?? 1000);

const stock = new Map<string, number>([
  ["Laptop-14", 5],
  ["MOUSE-USB", 40],
  ["TECLADO-ES", 12],
  ["MONITOR-24", 0],
]);

const esperar = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const app = express();

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", servicio: "inventario" });
});

app.get("/stock/:sku", async (req: Request<{ sku: string }>, res: Response) => {
  if (RETARDO_MS > 0) await esperar(RETARDO_MS);

  const disponible = stock.get(req.params.sku);
  if (disponible === undefined) {
    res.status(404).json({ error: `sku no encontrado: ${req.params.sku}` });
    return;
  }
  res.json({ sku: req.params.sku, disponible });
});

app.listen(PORT, () => {
  console.log(
    `Servicio de Inventario escuchando en el puerto ${PORT} (retardo: ${RETARDO_MS} ms)`,
  );
});
