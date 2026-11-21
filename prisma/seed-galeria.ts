import type { PrismaClient } from '../src/generated/prisma/client.js';
import { buildGaleria } from './seeds/galeria-data.js';
import { ORGANIZADOR_EMAIL } from './seeds/h1-data.js';

const TEMPORADA = 'Apertura 2026';

/**
 * DB-17.1: metadatos de galería de prueba para los 3 primeros partidos (por id) de Apertura 2026:
 * el 1.º con 30 elementos activos, el 2.º con uno y el 3.º con ninguno. Publica el organizador del seed de H1.
 * Los archivos físicos no existen: solo hay metadatos, así que la descarga dará 404 hasta que se coloquen archivos
 * de ejemplo en el almacenamiento local con esas claves.
 * Idempotente: upsert por storageKey con `update: {}`, así no pisa lo que BE-17.1 haya cambiado.
 */
export async function seedGaleria(prisma: PrismaClient): Promise<void> {
  const temporada = await prisma.temporada.findUnique({ where: { nombre: TEMPORADA } });
  if (!temporada) throw new Error(`No existe la temporada "${TEMPORADA}". Corre antes el seed de H1.`);
  const organizador = await prisma.user.findUnique({ where: { email: ORGANIZADOR_EMAIL }, select: { id: true } });
  if (!organizador) throw new Error(`Falta el organizador ${ORGANIZADOR_EMAIL} del seed de H1.`);

  const partidos = await prisma.partido.findMany({
    where: { temporadaId: temporada.id },
    orderBy: { id: 'asc' },
    take: 3,
    select: { id: true },
  });
  if (partidos.length < 3) throw new Error(`"${TEMPORADA}" necesita 3 partidos y tiene ${partidos.length}. Corre antes el seed del calendario.`);

  const items = buildGaleria({ treinta: partidos[0].id, uno: partidos[1].id });
  let nuevos = 0;
  for (const c of items) {
    const existente = await prisma.contenidoGaleria.findUnique({ where: { storageKey: c.storageKey }, select: { id: true } });
    await prisma.contenidoGaleria.upsert({
      where: { storageKey: c.storageKey },
      update: {},
      create: {
        partidoId: c.partidoId,
        tipo: c.tipo,
        storageKey: c.storageKey,
        nombreOriginal: c.nombreOriginal,
        mimeType: c.mimeType,
        tamanoBytes: c.tamanoBytes,
        descripcion: c.descripcion,
        subidoPor: organizador.id,
        creadoEn: c.creadoEn,
      },
    });
    if (!existente) nuevos += 1;
  }
  console.log(`Seed galeria listo: ${items.length} contenidos (${nuevos} nuevos, ${items.length - nuevos} ya existian). Partidos: ${partidos[0].id} (30), ${partidos[1].id} (1), ${partidos[2].id} (0).`);
}
