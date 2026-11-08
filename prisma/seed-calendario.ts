import type { PrismaClient } from '../src/generated/prisma/client.js';
import { buildCalendario, CANCHAS } from './seeds/calendario-data.js';

const TEMPORADA = 'Apertura 2026';
const ARBITROS = ['arbitro1@liga.test', 'arbitro2@liga.test', 'arbitro3@liga.test', 'arbitro4@liga.test'];

/**
 * DB-3.2: 2 canchas, 11 jornadas (1 a 4 Publicadas, 5 a 11 Borrador) y los 66 partidos
 * de la temporada "Apertura 2026". Requiere haber corrido antes el seed de H1 (DB-1.2).
 *
 * Idempotente:
 *  - cancha: se busca por nombre (sin distinguir mayúsculas)
 *  - jornada: upsert por (temporada, número); `update: {}` conserva el estado actual
 *    (por ejemplo una jornada que BE-16.1 ya publicó)
 *  - partido: se busca por (temporada, jornada, local, visitante). Si existe solo se
 *    reponen cancha, árbitro y horario; NO se toca `estado`, para respetar lo que DB-1.4
 *    o las pruebas hayan cambiado (En curso, Finalizado, Cancelado).
 */
export async function seedCalendario(prisma: PrismaClient): Promise<void> {
  const temporada = await prisma.temporada.findUnique({ where: { nombre: TEMPORADA } });
  if (!temporada) throw new Error(`No existe la temporada "${TEMPORADA}". Corre antes el seed de H1 (DB-1.2).`);

  const equipos = await prisma.equipo.findMany({
    where: { temporadaId: temporada.id, estado: 'INSCRITO' },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  if (equipos.length !== 12) throw new Error(`"${TEMPORADA}" debe tener 12 equipos Inscritos y tiene ${equipos.length}.`);

  const arbitros = await prisma.user.findMany({
    where: { rol: 'ARBITRO', email: { in: ARBITROS } },
    orderBy: { email: 'asc' },
    select: { id: true },
  });
  if (arbitros.length !== ARBITROS.length) throw new Error('Faltan los 4 árbitros del seed de H1 (arbitro1..4@liga.test).');

  // 1. Canchas
  const canchaIds: number[] = [];
  for (const c of CANCHAS) {
    const existente = await prisma.cancha.findFirst({ where: { nombre: { equals: c.nombre, mode: 'insensitive' } } });
    const fila = existente
      ? await prisma.cancha.update({ where: { id: existente.id }, data: { direccion: c.direccion, activa: true } })
      : await prisma.cancha.create({ data: { nombre: c.nombre, direccion: c.direccion } });
    canchaIds.push(fila.id);
  }

  // 2. Calendario puro
  const calendario = buildCalendario(
    equipos.map((e) => e.id),
    arbitros.map((a) => a.id),
  );

  // 3. Jornadas
  const jornadaId = new Map<number, number>();
  for (const j of calendario.jornadas) {
    const fila = await prisma.jornada.upsert({
      where: { temporadaId_numero: { temporadaId: temporada.id, numero: j.numero } },
      update: {},
      create: { temporadaId: temporada.id, numero: j.numero, estado: j.estado },
    });
    jornadaId.set(j.numero, fila.id);
  }

  // 4. Partidos
  let creados = 0;
  let actualizados = 0;
  for (const p of calendario.partidos) {
    const clave = {
      temporadaId: temporada.id,
      jornadaId: jornadaId.get(p.jornada)!,
      equipoLocalId: p.localId,
      equipoVisitanteId: p.visitanteId,
    };
    const horario = { canchaId: canchaIds[p.cancha], arbitroId: p.arbitroId, inicio: p.inicio, fin: p.fin };
    const existente = await prisma.partido.findFirst({ where: clave, select: { id: true } });
    if (existente) {
      await prisma.partido.update({ where: { id: existente.id }, data: horario });
      actualizados += 1;
    } else {
      await prisma.partido.create({ data: { ...clave, ...horario, estado: 'PROGRAMADO' } });
      creados += 1;
    }
  }
  console.log(
    `Seed calendario listo: ${calendario.jornadas.length} jornadas, ${calendario.partidos.length} partidos (${creados} nuevos, ${actualizados} ya existían).`,
  );
}
