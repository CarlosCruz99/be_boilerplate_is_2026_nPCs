import { setTimeout } from 'node:timers/promises';
import { Prisma } from '@PrismaClient';

const codigosPrismaTransitorios = new Set([
  'P1001', // Servidor no disponible.
  'P1002', // Tiempo de conexión agotado.
  'P1008', // Tiempo de operación agotado.
  'P1017', // Conexión cerrada por el servidor.
  'P2024', // Espera agotada por una conexión del pool.
  'P2034', // Conflicto de escritura o interbloqueo.
  'P2037', // Demasiadas conexiones abiertas.
]);
const estadosPostgresTransitorios = new Set([
  '40001',
  '40P01',
  '53300',
  '55P03',
  '57P01',
  '57P02',
  '57P03',
]);

function esTransitorio(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return codigosPrismaTransitorios.has(error.errorCode ?? '');
  }
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (codigosPrismaTransitorios.has(error.code)) return true;

  const adaptador = error.meta?.driverAdapterError;
  const causa = adaptador instanceof Error ? adaptador.cause : undefined;
  if (!causa || typeof causa !== 'object' || !('originalCode' in causa)) {
    return false;
  }
  const codigo = causa.originalCode;
  return (
    typeof codigo === 'string' &&
    (codigo.startsWith('08') || estadosPostgresTransitorios.has(codigo))
  );
}

/** Cada intento debe abrir su propia transacción y reutilizar la misma clave. */
export async function reintentarEnvioAviso<T>(
  enviar: () => Promise<T>,
): Promise<T> {
  for (const espera of [50, 100, 200]) {
    try {
      return await enviar();
    } catch (error) {
      if (!esTransitorio(error)) throw error;
      await setTimeout(espera);
    }
  }
  return enviar();
}
