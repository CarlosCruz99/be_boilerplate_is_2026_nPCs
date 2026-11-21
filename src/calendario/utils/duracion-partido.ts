/** Minutos completos transcurridos; el reloj de consulta se puede inyectar en pruebas. */
export function duracionPartido(
  inicioReal: Date,
  finReal: Date | null,
  ahora = new Date(),
): number {
  return Math.max(
    0,
    Math.floor(((finReal ?? ahora).getTime() - inicioReal.getTime()) / 60000),
  );
}
