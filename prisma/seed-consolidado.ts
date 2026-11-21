import type { PrismaClient } from '../src/generated/prisma/client.js';
import {
  buildCuotasPagos,
  buildResultadosApertura,
  buildResultadosClausura,
  CLAUSURA_2025,
  CUOTA_CREADA_EN,
  DURACION_PARTIDO_MIN,
  INDICE_EN_CURSO,
  PARTIDOS_FINALIZADOS,
  type PartidoBase,
  type Plantillas,
  type ResultadoPartido,
} from './seeds/consolidado-data.js';
import { ORGANIZADOR_EMAIL } from './seeds/h1-data.js';

const APERTURA = 'Apertura 2026';
const CANCHAS = ['Cancha 1', 'Cancha 2'];
const ARBITROS = ['arbitro1@liga.test', 'arbitro2@liga.test'];
const MIN = 60_000;

/**
 * DB-1.4: seed consolidado. Requiere los seeds de H1 (DB-1.2) y del calendario (DB-3.2). No crea equipos ni jugadores.
 *  - Apertura 2026: jornadas 1 a 3 Finalizadas (marcador, faltas, tiempos reales, participantes y estadísticas),
 *    el primer partido de la jornada 4 En curso y el resto Programado. Las jornadas 1 a 4 ya están Publicadas desde DB-3.2.
 *  - Clausura 2025: 1 jornada y 2 partidos Finalizados.
 *  - Cuotas y pagos de los equipos 1 a 6 de Apertura 2026.
 * Las posiciones NO se siembran: las calcula BE-8.1.
 *
 * Idempotente y respetuoso con lo que el backend haya hecho:
 *  - un partido solo se actualiza si sigue PROGRAMADO, y sus participantes y estadísticas se guardan en la misma
 *    transacción solo en ese caso (no se pisa ni se ensucia un resultado que BE ya cambió);
 *  - los pagos se insertan solo si su comprobante aún no existe;
 *  - cuotas se buscan por (equipo, concepto, partido) antes de crearse.
 * Los comprobantes de los pagos son claves de prueba sin archivo físico.
 */
export async function seedConsolidado(prisma: PrismaClient): Promise<void> {
  const organizador = await prisma.user.findUnique({ where: { email: ORGANIZADOR_EMAIL }, select: { id: true } });
  if (!organizador) throw new Error(`Falta el organizador ${ORGANIZADOR_EMAIL} del seed de H1.`);

  const apertura = await prisma.temporada.findUnique({ where: { nombre: APERTURA } });
  if (!apertura) throw new Error(`No existe la temporada "${APERTURA}". Corre antes el seed de H1.`);

  // ---------- Apertura 2026: marcadores y estadísticas ----------
  const partidosApertura = await partidosDe(prisma, apertura.id);
  if (partidosApertura.length < INDICE_EN_CURSO + 1) {
    throw new Error(`"${APERTURA}" tiene ${partidosApertura.length} partidos. Corre antes el seed del calendario.`);
  }
  const plantillasApertura = await plantillasDe(prisma, apertura.id);
  const resultadosApertura = buildResultadosApertura(partidosApertura, plantillasApertura);
  const actualizados = await aplicarResultados(prisma, resultadosApertura);

  // ---------- Clausura 2025: jornada, 2 partidos Finalizados ----------
  const clausura = await prisma.temporada.findUnique({ where: { nombre: CLAUSURA_2025.nombre } });
  if (!clausura) throw new Error(`No existe la temporada "${CLAUSURA_2025.nombre}". Corre antes el seed de H1.`);
  const partidosClausura = await asegurarPartidosClausura(prisma, clausura.id, organizador.id);
  const plantillasClausura = await plantillasDe(prisma, clausura.id);
  const resultadosClausura = buildResultadosClausura(partidosClausura, plantillasClausura);
  const actualizadosClausura = await aplicarResultados(prisma, resultadosClausura);

  // ---------- Cuotas y pagos de los equipos 1 a 6 de Apertura 2026 ----------
  const equipos = await prisma.equipo.findMany({
    where: { temporadaId: apertura.id, estado: 'INSCRITO' },
    orderBy: { id: 'asc' },
    select: { id: true, capitanId: true },
  });
  if (equipos.length < 6) throw new Error(`"${APERTURA}" necesita al menos 6 equipos Inscritos y tiene ${equipos.length}.`);

  const { cuotas, pagos } = buildCuotasPagos();
  const cuotaId = new Map<string, number>();
  const equipoDeCuota = new Map<string, { id: number; capitanId: string }>();
  let cuotasNuevas = 0;
  for (const c of cuotas) {
    const equipo = equipos[c.equipoIndice - 1];
    // El arbitraje se cobra por el primer partido Finalizado del equipo.
    const partido = c.conPartido
      ? partidosApertura.slice(0, PARTIDOS_FINALIZADOS).find((p) => p.localId === equipo.id || p.visitanteId === equipo.id)
      : undefined;
    if (c.conPartido && !partido) throw new Error(`El equipo ${equipo.id} no tiene un partido Finalizado para su cuota de arbitraje.`);
    const donde = { temporadaId: apertura.id, equipoId: equipo.id, concepto: c.concepto, partidoId: partido ? partido.id : null };
    const existente = await prisma.cuota.findFirst({ where: donde, select: { id: true } });
    if (existente) {
      cuotaId.set(c.ref, existente.id);
    } else {
      const nueva = await prisma.cuota.create({
        data: {
          ...donde,
          monto: c.monto,
          fechaVencimiento: new Date(`${c.fechaVencimiento}T00:00:00Z`),
          creadoPor: organizador.id,
          creadoEn: CUOTA_CREADA_EN,
        },
        select: { id: true },
      });
      cuotaId.set(c.ref, nueva.id);
      cuotasNuevas += 1;
    }
    equipoDeCuota.set(c.ref, equipo);
  }

  // El trigger que topa los pagos a la cuota corre ANTES de que Postgres detecte el duplicado, así que
  // skipDuplicates no basta: se filtran por adelantado los comprobantes que ya existen.
  const yaExisten = new Set(
    (await prisma.pago.findMany({ where: { comprobanteClave: { in: pagos.map((p) => p.comprobanteClave) } }, select: { comprobanteClave: true } })).map(
      (p) => p.comprobanteClave,
    ),
  );
  const creados = await prisma.pago.createMany({
    data: pagos
      .filter((p) => !yaExisten.has(p.comprobanteClave))
      .map((p) => ({
      cuotaId: cuotaId.get(p.cuotaRef)!,
      monto: p.monto,
      fechaPago: new Date(`${p.fechaPago}T00:00:00Z`),
      comprobanteClave: p.comprobanteClave,
      comprobanteMime: p.comprobanteMime,
      comprobanteBytes: p.comprobanteBytes,
      estado: p.estado,
      registradoPor: equipoDeCuota.get(p.cuotaRef)!.capitanId,
      creadoEn: p.creadoEn,
      verificadoPor: p.estado === 'PENDIENTE' ? null : organizador.id,
      verificadoEn: p.verificadoEn,
      motivoRechazo: p.motivoRechazo,
      })),
    skipDuplicates: true,
  });

  console.log(
    `Seed consolidado listo: Apertura ${actualizados}/${resultadosApertura.length} partidos actualizados, ` +
      `Clausura 2025 ${actualizadosClausura}/${resultadosClausura.length}, ${cuotasNuevas} cuotas nuevas, ${creados.count} pagos nuevos.`,
  );
}

async function partidosDe(prisma: PrismaClient, temporadaId: number): Promise<PartidoBase[]> {
  const filas = await prisma.partido.findMany({
    where: { temporadaId },
    orderBy: { id: 'asc' },
    select: { id: true, inicio: true, equipoLocalId: true, equipoVisitanteId: true },
  });
  return filas.map((p) => ({ id: p.id, inicio: p.inicio, localId: p.equipoLocalId, visitanteId: p.equipoVisitanteId }));
}

async function plantillasDe(prisma: PrismaClient, temporadaId: number): Promise<Plantillas> {
  const filas = await prisma.equipoJugador.findMany({
    where: { temporadaId },
    orderBy: [{ equipoId: 'asc' }, { jugadorId: 'asc' }],
    select: { equipoId: true, jugadorId: true },
  });
  const mapa: Plantillas = new Map();
  for (const f of filas) mapa.set(f.equipoId, [...(mapa.get(f.equipoId) ?? []), f.jugadorId]);
  return mapa;
}

/**
 * Aplica los resultados. Devuelve cuántos partidos cambiaron.
 * Cada partido va en UNA transacción: el cambio de estado y sus participantes/estadísticas se guardan juntos y
 * solo si el partido seguía PROGRAMADO. Un partido que ya no lo está (finalizado o corregido desde la aplicación)
 * se deja intacto, sin agregarle datos de prueba que aparecerían como oficiales.
 */
export async function aplicarResultados(prisma: PrismaClient, resultados: ResultadoPartido[]): Promise<number> {
  let cambiados = 0;
  for (const r of resultados) {
    cambiados += await prisma.$transaction(async (tx) => {
      const res = await tx.partido.updateMany({
        where: { id: r.partidoId, estado: 'PROGRAMADO' },
        data: {
          estado: r.estado,
          golesLocal: r.golesLocal,
          golesVisitante: r.golesVisitante,
          faltasLocal: r.faltasLocal,
          faltasVisitante: r.faltasVisitante,
          inicioReal: r.inicioReal,
          finReal: r.finReal,
        },
      });
      if (res.count === 0) return 0;
      // participación antes que estadística: un trigger exige que el jugador haya participado.
      await tx.participacionPartido.createMany({
        data: r.participantes.map((p) => ({ partidoId: r.partidoId, jugadorId: p.jugadorId, equipoId: p.equipoId })),
        skipDuplicates: true,
      });
      await tx.estadisticaPartido.createMany({
        data: r.estadisticas.map((e) => ({ partidoId: r.partidoId, ...e })),
        skipDuplicates: true,
      });
      return 1;
    });
  }
  return cambiados;
}

/** Crea (si no existen) la jornada 1 Publicada de Clausura 2025 y sus 2 partidos; los devuelve ordenados por id. */
async function asegurarPartidosClausura(prisma: PrismaClient, temporadaId: number, organizadorId: string): Promise<PartidoBase[]> {
  const equipos = await prisma.equipo.findMany({
    where: { temporadaId, estado: 'INSCRITO' },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  if (equipos.length < 4) throw new Error(`"${CLAUSURA_2025.nombre}" necesita 4 equipos Inscritos y tiene ${equipos.length}.`);

  const canchaIds: number[] = [];
  for (const nombre of CANCHAS) {
    const c = await prisma.cancha.findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' } }, select: { id: true } });
    if (!c) throw new Error(`Falta la cancha "${nombre}". Corre antes el seed del calendario.`);
    canchaIds.push(c.id);
  }
  const arbitros = await prisma.user.findMany({
    where: { rol: 'ARBITRO', email: { in: ARBITROS } },
    orderBy: { email: 'asc' },
    select: { id: true },
  });
  if (arbitros.length !== ARBITROS.length) throw new Error('Faltan los árbitros arbitro1 y arbitro2 del seed de H1.');

  const jornada = await prisma.jornada.upsert({
    where: { temporadaId_numero: { temporadaId, numero: CLAUSURA_2025.jornada.numero } },
    update: {},
    create: {
      temporadaId,
      numero: CLAUSURA_2025.jornada.numero,
      estado: 'PUBLICADA',
      publicadaEn: CLAUSURA_2025.jornada.publicadaEn,
      publicadaPorId: organizadorId,
    },
  });

  const salida: PartidoBase[] = [];
  for (let i = 0; i < CLAUSURA_2025.partidos.length; i++) {
    const def = CLAUSURA_2025.partidos[i];
    const clave = { temporadaId, jornadaId: jornada.id, equipoLocalId: equipos[2 * i].id, equipoVisitanteId: equipos[2 * i + 1].id };
    const existente = await prisma.partido.findFirst({ where: clave, select: { id: true } });
    const fila =
      existente ??
      (await prisma.partido.create({
        data: {
          ...clave,
          canchaId: canchaIds[def.cancha],
          arbitroId: arbitros[def.arbitro].id,
          inicio: def.inicio,
          fin: new Date(def.inicio.getTime() + DURACION_PARTIDO_MIN * MIN),
          estado: 'PROGRAMADO',
        },
        select: { id: true },
      }));
    salida.push({ id: fila.id, inicio: def.inicio, localId: clave.equipoLocalId, visitanteId: clave.equipoVisitanteId });
  }
  return salida;
}
