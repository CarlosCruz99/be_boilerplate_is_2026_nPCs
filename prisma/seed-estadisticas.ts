import type { PrismaClient } from '../src/generated/prisma/client.js';

const TEMPORADA = 'Apertura 2026';
const POSICION_PARTIDO = 12; // "partido 12" del documento: el 12.º partido de la temporada, por id

/**
 * DB-9.1: una estadística de prueba (goles 1, asistencias 0, tarjetas 1) para un jugador inscrito
 * en el equipo local del partido 12 de Apertura 2026. Usa los ids reales del seed, no números fijos.
 * Idempotente: upsert por (partido, jugador) con `update: {}`, así no pisa lo que BE-9.1 haya guardado.
 * Requiere los seeds de H1 y de H3. DB-1.4 cargará después las estadísticas de los partidos Finalizados.
 */
export async function seedEstadisticas(prisma: PrismaClient): Promise<void> {
  const temporada = await prisma.temporada.findUnique({ where: { nombre: TEMPORADA } });
  if (!temporada) throw new Error(`No existe la temporada "${TEMPORADA}". Corre antes el seed de H1.`);

  const [partido] = await prisma.partido.findMany({
    where: { temporadaId: temporada.id },
    orderBy: { id: 'asc' },
    skip: POSICION_PARTIDO - 1,
    take: 1,
    select: { id: true, equipoLocalId: true },
  });
  if (!partido) throw new Error(`"${TEMPORADA}" no tiene ${POSICION_PARTIDO} partidos. Corre antes el seed del calendario.`);

  const inscrito = await prisma.equipoJugador.findFirst({
    where: { equipoId: partido.equipoLocalId, temporadaId: temporada.id },
    orderBy: { jugadorId: 'asc' },
    select: { jugadorId: true },
  });
  if (!inscrito) throw new Error(`El equipo local del partido ${partido.id} no tiene jugadores inscritos.`);

  const existente = await prisma.estadisticaPartido.findUnique({
    where: { partidoId_jugadorId: { partidoId: partido.id, jugadorId: inscrito.jugadorId } },
    select: { id: true },
  });
  await prisma.estadisticaPartido.upsert({
    where: { partidoId_jugadorId: { partidoId: partido.id, jugadorId: inscrito.jugadorId } },
    update: {},
    create: { partidoId: partido.id, jugadorId: inscrito.jugadorId, goles: 1, asistencias: 0, tarjetas: 1 },
  });
  console.log(`Seed estadisticas listo: partido ${partido.id}, jugador ${inscrito.jugadorId} (${existente ? 'ya existia' : 'nuevo'}).`);
}
