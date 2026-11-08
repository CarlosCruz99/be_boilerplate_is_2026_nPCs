/** Lunes 00:00 a lunes 00:00 de El Salvador (UTC-06, sin cambio estacional). */
export function limitesSemana(inicio: Date): { desde: Date; hasta: Date } {
  const local = new Date(inicio.getTime() - 6 * 60 * 60 * 1000);
  const lunes = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - ((local.getUTCDay() + 6) % 7),
  );
  const desde = new Date(lunes + 6 * 60 * 60 * 1000);
  return { desde, hasta: new Date(desde.getTime() + 7 * 24 * 60 * 60 * 1000) };
}
