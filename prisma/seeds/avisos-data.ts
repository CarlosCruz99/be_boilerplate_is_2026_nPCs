/**
 * DB-20.1: datos de prueba de la bandeja de avisos. Módulo puro (no toca la base).
 * Usuario A: 45 avisos (20 leídos y 25 no leídos). Usuario B: 2. Usuario C: ninguno.
 */
export type ModuloOrigen = 'CALENDARIO' | 'PAGOS' | 'RESULTADOS';
export type TipoAviso =
  | 'PARTIDO_MODIFICADO' | 'JORNADA_PUBLICADA' | 'CUOTA_REGISTRADA'
  | 'PAGO_REGISTRADO' | 'RESULTADO_FINALIZADO' | 'RESULTADO_CORREGIDO';
export type ReferenciaTipo = 'PARTIDO' | 'JORNADA' | 'CUOTA' | 'PAGO';

export interface AvisoSeed {
  usuarioId: string;
  moduloOrigen: ModuloOrigen;
  tipo: TipoAviso;
  titulo: string;
  mensaje: string;
  referenciaTipo: ReferenciaTipo;
  referenciaId: number;
  claveIdempotencia: string;
  creadoEn: Date;
  leidoEn: Date | null;
  datos: Record<string, unknown> | null;
}

/** Cada tipo de aviso con su módulo (la correspondencia del contrato de H20) y su tipo de referencia. */
export const PLANTILLAS: ReadonlyArray<{
  tipo: TipoAviso; modulo: ModuloOrigen; referencia: ReferenciaTipo; titulo: string; mensaje: string;
}> = [
  { tipo: 'JORNADA_PUBLICADA', modulo: 'CALENDARIO', referencia: 'JORNADA', titulo: 'Calendario publicado: jornada {n}', mensaje: 'Tu equipo juega en la jornada {n}. Revisa fecha, hora y cancha.' },
  { tipo: 'PARTIDO_MODIFICADO', modulo: 'CALENDARIO', referencia: 'PARTIDO', titulo: 'Cambio en tu partido', mensaje: 'El organizador cambió la cancha o el horario de tu partido {n}.' },
  { tipo: 'CUOTA_REGISTRADA', modulo: 'PAGOS', referencia: 'CUOTA', titulo: 'Cuota registrada', mensaje: 'Se registró la cuota {n} de tu equipo.' },
  { tipo: 'PAGO_REGISTRADO', modulo: 'PAGOS', referencia: 'PAGO', titulo: 'Pago registrado', mensaje: 'Registraste el pago {n}; queda pendiente de verificación.' },
  { tipo: 'RESULTADO_FINALIZADO', modulo: 'RESULTADOS', referencia: 'PARTIDO', titulo: 'Resultado del partido', mensaje: 'Ya está el resultado final del partido {n}.' },
  { tipo: 'RESULTADO_CORREGIDO', modulo: 'RESULTADOS', referencia: 'PARTIDO', titulo: 'Resultado corregido', mensaje: 'Se corrigió el resultado del partido {n}.' },
];

export const BASE_FECHA = new Date('2026-10-20T12:00:00Z');
export const AVISOS_A = 45;
export const LEIDOS_A = 20;
export const AVISOS_B = 2;

function aviso(usuarioId: string, etiqueta: string, i: number, leido: boolean): AvisoSeed {
  const p = PLANTILLAS[(i - 1) % PLANTILLAS.length];
  const creadoEn = new Date(BASE_FECHA.getTime() + i * 3_600_000); // uno por hora
  return {
    usuarioId,
    moduloOrigen: p.modulo,
    tipo: p.tipo,
    titulo: p.titulo.replace('{n}', String(i)),
    mensaje: p.mensaje.replace('{n}', String(i)),
    referenciaTipo: p.referencia,
    referenciaId: i,
    // Clave fija: el seed se puede repetir sin duplicar avisos.
    claveIdempotencia: `seed-aviso-${etiqueta}-${String(i).padStart(3, '0')}`,
    creadoEn,
    leidoEn: leido ? new Date(creadoEn.getTime() + 30 * 60_000) : null,
    datos: i % 5 === 0 ? { origen: 'seed', numero: i } : null,
  };
}

export function buildAvisos(ids: { a: string; b: string; c: string }): AvisoSeed[] {
  const avisos: AvisoSeed[] = [];
  // A: los 20 más antiguos leídos, los 25 más recientes sin leer.
  for (let i = 1; i <= AVISOS_A; i++) avisos.push(aviso(ids.a, 'A', i, i <= LEIDOS_A));
  // B: uno leído y uno sin leer. C: ninguno.
  for (let i = 1; i <= AVISOS_B; i++) avisos.push(aviso(ids.b, 'B', i, i === 1));
  return avisos;
}
