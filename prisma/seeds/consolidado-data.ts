/**
 * DB-1.4 · Dataset consolidado de partidos, marcadores, estadísticas, cuotas y pagos.
 *
 * Este archivo es PURO: no importa Prisma ni toca la base ni lee la hora actual. Recibe lo que ya existe (partidos,
 * plantillas y equipos de DB-1.2 y DB-3.2) y devuelve qué escribir. Es determinista: mismas entradas, mismo resultado,
 * sin importar el día en que se corra. Quien escribe en la base es prisma/seed-consolidado.ts.
 */

export const PARTICIPANTES_POR_EQUIPO = 7;
/** Partidos de las jornadas 1 a 3 (6 por jornada) quedan Finalizados. */
export const PARTIDOS_FINALIZADOS = 18;
/** El primer partido de la jornada 4 (posición 19, índice 18) queda En curso. */
export const INDICE_EN_CURSO = 18;

/** Marcadores de los 18 partidos Finalizados de Apertura 2026, en orden de id. El partido 12 (índice 11) es 2-1. */
const GOLES_LOCAL = [2, 1, 0, 3, 1, 2, 0, 2, 1, 1, 3, 2, 1, 0, 2, 1, 4, 1];
const GOLES_VISITANTE = [1, 1, 0, 0, 2, 2, 2, 0, 1, 3, 1, 1, 0, 0, 2, 2, 1, 0];

export interface PartidoBase {
  id: number;
  inicio: Date;
  localId: number;
  visitanteId: number;
}
/** equipoId -> ids de sus jugadores, ordenados por id. */
export type Plantillas = Map<number, number[]>;

export interface FilaEstadistica {
  jugadorId: number;
  goles: number;
  asistencias: number;
  tarjetas: number;
}
export interface ResultadoPartido {
  partidoId: number;
  estado: 'FINALIZADO' | 'EN_CURSO';
  golesLocal: number;
  golesVisitante: number;
  faltasLocal: number;
  faltasVisitante: number;
  inicioReal: Date;
  finReal: Date | null;
  participantes: { jugadorId: number; equipoId: number }[];
  estadisticas: FilaEstadistica[];
}

const MIN = 60_000;

/**
 * Una fila por cada uno de los 7 participantes del equipo (los de total cero también). Los goles se reparten uno a uno
 * entre los primeros jugadores; cada gol pares (según k) lleva asistencia del siguiente jugador, nunca del primero;
 * hay una tarjeta por lado y una segunda al local cuando k es múltiplo de 4.
 * Para el partido 12 (k = 11) el primer jugador local queda con 1 gol, 0 asistencias y 1 tarjeta: la misma fila que
 * ya sembró DB-9.1.
 */
function filasDeLado(k: number, jugadores: number[], goles: number, esLocal: boolean): FilaEstadistica[] {
  if (jugadores.length < PARTICIPANTES_POR_EQUIPO) {
    throw new Error(`Se necesitan ${PARTICIPANTES_POR_EQUIPO} jugadores por equipo y hay ${jugadores.length}.`);
  }
  const filas = jugadores
    .slice(0, PARTICIPANTES_POR_EQUIPO)
    .map((jugadorId) => ({ jugadorId, goles: 0, asistencias: 0, tarjetas: 0 }));
  for (let i = 0; i < goles; i++) {
    filas[i % PARTICIPANTES_POR_EQUIPO].goles += 1;
    if ((k + i) % 2 === 0) filas[(i + 1) % PARTICIPANTES_POR_EQUIPO].asistencias += 1;
  }
  filas[(esLocal ? k + 3 : k + 5) % PARTICIPANTES_POR_EQUIPO].tarjetas += 1;
  if (esLocal && k % 4 === 0) filas[(k + 4) % PARTICIPANTES_POR_EQUIPO].tarjetas += 1;
  return filas;
}

function resultado(
  k: number,
  p: PartidoBase,
  plantillas: Plantillas,
  estado: 'FINALIZADO' | 'EN_CURSO',
  golesLocal: number,
  golesVisitante: number,
): ResultadoPartido {
  const local = plantillas.get(p.localId);
  const visitante = plantillas.get(p.visitanteId);
  if (!local || !visitante) throw new Error(`Faltan las plantillas de los equipos del partido ${p.id}.`);
  const filasLocal = filasDeLado(k, local, golesLocal, true);
  const filasVisitante = filasDeLado(k, visitante, golesVisitante, false);
  const inicioReal = new Date(p.inicio.getTime() + (2 + (k % 4)) * MIN);
  return {
    partidoId: p.id,
    estado,
    golesLocal,
    golesVisitante,
    faltasLocal: 3 + ((k * 2) % 5),
    faltasVisitante: 2 + ((k * 3) % 5),
    inicioReal,
    finReal: estado === 'FINALIZADO' ? new Date(inicioReal.getTime() + (90 + (k % 3)) * MIN) : null,
    participantes: [
      ...filasLocal.map((f) => ({ jugadorId: f.jugadorId, equipoId: p.localId })),
      ...filasVisitante.map((f) => ({ jugadorId: f.jugadorId, equipoId: p.visitanteId })),
    ],
    estadisticas: [...filasLocal, ...filasVisitante],
  };
}

/**
 * Apertura 2026: partidos de las jornadas 1 a 3 Finalizados con marcador, faltas, tiempos reales y estadísticas;
 * el primer partido de la jornada 4 En curso (1-0, con una estadística que NO es oficial todavía); el resto, sin tocar.
 * @param partidos los 66 partidos de la temporada, ordenados por id.
 */
export function buildResultadosApertura(partidos: PartidoBase[], plantillas: Plantillas): ResultadoPartido[] {
  if (partidos.length <= INDICE_EN_CURSO) throw new Error(`Apertura 2026 necesita al menos ${INDICE_EN_CURSO + 1} partidos.`);
  const salida: ResultadoPartido[] = [];
  for (let k = 0; k < PARTIDOS_FINALIZADOS; k++) {
    salida.push(resultado(k, partidos[k], plantillas, 'FINALIZADO', GOLES_LOCAL[k], GOLES_VISITANTE[k]));
  }
  salida.push(resultado(INDICE_EN_CURSO, partidos[INDICE_EN_CURSO], plantillas, 'EN_CURSO', 1, 0));
  return salida;
}

/** Clausura 2025: 2 partidos Finalizados (2-1 y 0-0). Los crea el seed, porque DB-3.2 solo sembró Apertura. */
export const CLAUSURA_2025 = {
  nombre: 'Clausura 2025',
  jornada: { numero: 1, publicadaEn: new Date('2025-10-03T18:00:00Z') },
  partidos: [
    { inicio: new Date('2025-10-04T14:00:00Z'), cancha: 0, arbitro: 0, golesLocal: 2, golesVisitante: 1 },
    { inicio: new Date('2025-10-04T15:30:00Z'), cancha: 1, arbitro: 1, golesLocal: 0, golesVisitante: 0 },
  ],
};
export const DURACION_PARTIDO_MIN = 90;

/** @param partidos los 2 partidos de Clausura 2025 (ya creados), ordenados por id. */
export function buildResultadosClausura(partidos: PartidoBase[], plantillas: Plantillas): ResultadoPartido[] {
  if (partidos.length !== CLAUSURA_2025.partidos.length) throw new Error('Clausura 2025 debe tener 2 partidos.');
  return partidos.map((p, i) =>
    resultado(100 + i, p, plantillas, 'FINALIZADO', CLAUSURA_2025.partidos[i].golesLocal, CLAUSURA_2025.partidos[i].golesVisitante),
  );
}

// ======================= Cuotas y pagos de Apertura 2026 =======================

/** Fechas fijas (no relativas al día): la pasada ya venció y seguirá vencida; la futura es lejana. */
export const VENCE_PASADA = '2026-10-31';
export const VENCE_FUTURA = '2027-12-31';
export const CUOTA_CREADA_EN = new Date('2026-10-01T12:00:00Z');
export const MOTIVO_RECHAZO = 'Comprobante ilegible: la imagen no muestra el monto del pago';

export type ConceptoCuota = 'INSCRIPCION' | 'ARBITRAJE';
export type EstadoPago = 'PENDIENTE' | 'VERIFICADO' | 'RECHAZADO';

export interface CuotaSeed {
  ref: string; // identifica la cuota dentro del dataset, p. ej. "E1-INSCRIPCION"
  equipoIndice: number; // 1 a 6: posición del equipo entre los 12 Inscritos de Apertura, por id
  concepto: ConceptoCuota;
  monto: string;
  fechaVencimiento: string; // AAAA-MM-DD
  /** Solo ARBITRAJE: el equipo paga el arbitraje de su primer partido Finalizado. */
  conPartido: boolean;
}
export interface PagoSeed {
  cuotaRef: string;
  monto: string;
  fechaPago: string; // AAAA-MM-DD
  estado: EstadoPago;
  comprobanteClave: string;
  comprobanteMime: string;
  comprobanteBytes: number;
  creadoEn: Date;
  verificadoEn: Date | null;
  motivoRechazo: string | null;
}
export interface DatasetPagos {
  cuotas: CuotaSeed[];
  pagos: PagoSeed[];
}

function pago(cuotaRef: string, monto: string, fechaPago: string, estado: EstadoPago, n: number): PagoSeed {
  const creadoEn = new Date(`${fechaPago}T15:00:00Z`);
  return {
    cuotaRef,
    monto,
    fechaPago,
    estado,
    comprobanteClave: `seed/pagos/${cuotaRef.toLowerCase()}-${n}.png`,
    comprobanteMime: 'image/png',
    comprobanteBytes: 150_000 + n * 1_000,
    creadoEn,
    verificadoEn: estado === 'PENDIENTE' ? null : new Date(creadoEn.getTime() + 24 * 60 * 60_000),
    motivoRechazo: estado === 'RECHAZADO' ? MOTIVO_RECHAZO : null,
  };
}

/**
 * Equipos de Apertura 2026 (los 12 Inscritos, por id):
 *  1: todas sus cuotas pagadas y verificadas.            2: saldo con vencimiento futuro.
 *  3: saldo con vencimiento pasado y un pago Pendiente.  4: sin cuotas.
 *  5: inscripción 100.00 con pago Verificado de 100.00; arbitraje 25.50 con un pago Pendiente de 25.50 y uno Rechazado de 10.00.
 *  6: pagos propios (aislamiento).                       7 a 12: sin cuotas.
 * El dinero confirmado es solo lo VERIFICADO; un pago Pendiente o Rechazado no reduce el saldo.
 */
export function buildCuotasPagos(): DatasetPagos {
  const cuotas: CuotaSeed[] = [
    { ref: 'E1-INSCRIPCION', equipoIndice: 1, concepto: 'INSCRIPCION', monto: '100.00', fechaVencimiento: VENCE_PASADA, conPartido: false },
    { ref: 'E1-ARBITRAJE', equipoIndice: 1, concepto: 'ARBITRAJE', monto: '25.50', fechaVencimiento: VENCE_PASADA, conPartido: true },
    { ref: 'E2-INSCRIPCION', equipoIndice: 2, concepto: 'INSCRIPCION', monto: '100.00', fechaVencimiento: VENCE_FUTURA, conPartido: false },
    { ref: 'E3-INSCRIPCION', equipoIndice: 3, concepto: 'INSCRIPCION', monto: '100.00', fechaVencimiento: VENCE_PASADA, conPartido: false },
    { ref: 'E5-INSCRIPCION', equipoIndice: 5, concepto: 'INSCRIPCION', monto: '100.00', fechaVencimiento: VENCE_FUTURA, conPartido: false },
    { ref: 'E5-ARBITRAJE', equipoIndice: 5, concepto: 'ARBITRAJE', monto: '25.50', fechaVencimiento: VENCE_FUTURA, conPartido: true },
    { ref: 'E6-INSCRIPCION', equipoIndice: 6, concepto: 'INSCRIPCION', monto: '100.00', fechaVencimiento: VENCE_FUTURA, conPartido: false },
  ];
  const pagos: PagoSeed[] = [
    pago('E1-INSCRIPCION', '100.00', '2026-10-20', 'VERIFICADO', 1),
    pago('E1-ARBITRAJE', '25.50', '2026-10-25', 'VERIFICADO', 1),
    pago('E2-INSCRIPCION', '40.00', '2026-10-22', 'VERIFICADO', 1),
    pago('E3-INSCRIPCION', '30.00', '2026-10-18', 'VERIFICADO', 1),
    pago('E3-INSCRIPCION', '50.00', '2026-11-10', 'PENDIENTE', 2),
    pago('E5-INSCRIPCION', '100.00', '2026-10-21', 'VERIFICADO', 1),
    pago('E5-ARBITRAJE', '25.50', '2026-11-11', 'PENDIENTE', 1),
    pago('E5-ARBITRAJE', '10.00', '2026-11-09', 'RECHAZADO', 2),
    pago('E6-INSCRIPCION', '77.00', '2026-10-23', 'VERIFICADO', 1),
    pago('E6-INSCRIPCION', '15.00', '2026-11-12', 'PENDIENTE', 2),
  ];
  return { cuotas, pagos };
}
