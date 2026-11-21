const fechaCivil = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/El_Salvador',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** El nacimiento es un DATE de PostgreSQL; la referencia es un instante. */
export function calcularEdad(
  nacimiento: Date,
  referencia = new Date(),
): number {
  const partes = fechaCivil.formatToParts(referencia);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((parte) => parte.type === tipo)!.value);
  const mes = valor('month');
  const dia = valor('day');
  const anio = valor('year');
  const bisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
  const mesNacimiento = nacimiento.getUTCMonth() + 1;
  const diaCumpleanios =
    mesNacimiento === 2 && nacimiento.getUTCDate() === 29 && !bisiesto
      ? 28
      : nacimiento.getUTCDate();
  const cumplePendiente =
    mes < mesNacimiento || (mes === mesNacimiento && dia < diaCumpleanios);
  return anio - nacimiento.getUTCFullYear() - Number(cumplePendiente);
}
