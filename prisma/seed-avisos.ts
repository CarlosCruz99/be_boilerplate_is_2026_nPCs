import type { PrismaClient } from '../src/generated/prisma/client.js';
import { buildAvisos } from './seeds/avisos-data.js';

const TEMPORADA = 'Apertura 2026';

/**
 * DB-20.1: avisos de prueba para 3 usuarios existentes: los capitanes de los 3 primeros
 * equipos (por id) de "Apertura 2026". A recibe 45 (20 leídos, 25 sin leer), B recibe 2 y C ninguno.
 * Requiere haber corrido antes el seed de H1 (DB-1.2).
 *
 * Idempotente: upsert por (usuario, claveIdempotencia) con `update: {}`, así una segunda corrida
 * no duplica avisos ni reinicia los que BE-19 haya marcado como leídos. Aquí se escribe directo en la
 * tabla porque es un seed; los módulos de la aplicación solo lo hacen mediante AvisosService (H20).
 */
export async function seedAvisos(prisma: PrismaClient): Promise<void> {
  const temporada = await prisma.temporada.findUnique({ where: { nombre: TEMPORADA } });
  if (!temporada) throw new Error(`No existe la temporada "${TEMPORADA}". Corre antes el seed de H1 (DB-1.2).`);

  const equipos = await prisma.equipo.findMany({
    where: { temporadaId: temporada.id },
    orderBy: { id: 'asc' },
    take: 3,
    select: { capitanId: true },
  });
  if (equipos.length < 3) throw new Error(`"${TEMPORADA}" necesita al menos 3 equipos y tiene ${equipos.length}.`);

  const avisos = buildAvisos({ a: equipos[0].capitanId, b: equipos[1].capitanId, c: equipos[2].capitanId });
  let nuevos = 0;
  for (const a of avisos) {
    const existente = await prisma.aviso.findUnique({
      where: { usuarioId_claveIdempotencia: { usuarioId: a.usuarioId, claveIdempotencia: a.claveIdempotencia } },
      select: { id: true },
    });
    await prisma.aviso.upsert({
      where: { usuarioId_claveIdempotencia: { usuarioId: a.usuarioId, claveIdempotencia: a.claveIdempotencia } },
      update: {},
      create: {
        usuarioId: a.usuarioId,
        moduloOrigen: a.moduloOrigen,
        tipo: a.tipo,
        titulo: a.titulo,
        mensaje: a.mensaje,
        referenciaTipo: a.referenciaTipo,
        referenciaId: a.referenciaId,
        claveIdempotencia: a.claveIdempotencia,
        creadoEn: a.creadoEn,
        leidoEn: a.leidoEn,
        datos: a.datos ?? undefined,
      },
    });
    if (!existente) nuevos += 1;
  }
  console.log(`Seed avisos listo: ${avisos.length} avisos (${nuevos} nuevos, ${avisos.length - nuevos} ya existían).`);
}
