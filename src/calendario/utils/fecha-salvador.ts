const formato = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/El_Salvador',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function fechaCivilSalvador(referencia = new Date()): string {
  const partes = formato.formatToParts(referencia);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)!.value;
  return `${parte('year')}-${parte('month')}-${parte('day')}`;
}
