export interface EntradaCalendarioIda {
  equipoIds: number[];
  canchaIds: number[];
  arbitroIds: string[];
  fechaPrimeraJornada: string;
  horaPrimerTurno: string;
}

export interface PartidoPlan {
  jornada: number;
  equipoLocalId: number;
  equipoVisitanteId: number;
  canchaId: number;
  arbitroId: string;
  inicio: Date;
  fin: Date;
}

/** Función pura: círculo, descansos implícitos y asignación cronológica de recursos. */
export function construirCalendarioIda(entrada: EntradaCalendarioIda): {
  jornadas: number;
  partidos: PartidoPlan[];
} {
  const {
    equipoIds,
    canchaIds,
    arbitroIds,
    fechaPrimeraJornada,
    horaPrimerTurno,
  } = entrada;
  if (
    equipoIds.length < 2 ||
    new Set(equipoIds).size !== equipoIds.length ||
    !canchaIds.length ||
    new Set(canchaIds).size !== canchaIds.length ||
    new Set(arbitroIds).size !== arbitroIds.length
  ) {
    throw new RangeError(
      'Los equipos y recursos deben ser distintos y suficientes.',
    );
  }
  const porJornada = Math.floor(equipoIds.length / 2);
  if (arbitroIds.length < Math.min(canchaIds.length, porJornada))
    throw new RangeError(
      'No hay suficientes árbitros para las canchas simultáneas.',
    );
  const [hora, minuto] = horaPrimerTurno.split(':').map(Number);
  const turnos = Math.ceil(porJornada / canchaIds.length);
  if (hora * 60 + minuto + turnos * 90 > 1440)
    throw new RangeError('Los partidos de la jornada no caben en el día.');
  const base = new Date(
    `${fechaPrimeraJornada}T${horaPrimerTurno}:00-06:00`,
  ).getTime();
  if (!Number.isFinite(base))
    throw new RangeError('La fecha u hora no es válida.');
  let circulo: (number | null)[] = [...equipoIds].sort((a, b) => a - b);
  // null representa descanso; no crea un partido ni una fila artificial de equipo.
  if (circulo.length % 2 !== 0) circulo.push(null);
  const jornadas = circulo.length - 1;
  const partidos: PartidoPlan[] = [];
  for (let ronda = 0; ronda < jornadas; ronda++) {
    let indicePartido = 0;
    for (let i = 0; i < circulo.length / 2; i++) {
      const a = circulo[i];
      const b = circulo[circulo.length - 1 - i];
      if (a === null || b === null) continue;
      const [local, visitante] = (i + ronda) % 2 === 0 ? [a, b] : [b, a];
      const inicioMs =
        base +
        ronda * 7 * 86400000 +
        Math.floor(indicePartido / canchaIds.length) * 90 * 60000;
      partidos.push({
        jornada: ronda + 1,
        equipoLocalId: local,
        equipoVisitanteId: visitante,
        canchaId: canchaIds[indicePartido % canchaIds.length],
        arbitroId: arbitroIds[partidos.length % arbitroIds.length],
        inicio: new Date(inicioMs),
        fin: new Date(inicioMs + 90 * 60000),
      });
      indicePartido++;
    }
    circulo = [
      circulo[0],
      circulo[circulo.length - 1],
      ...circulo.slice(1, -1),
    ];
  }
  return { jornadas, partidos };
}
