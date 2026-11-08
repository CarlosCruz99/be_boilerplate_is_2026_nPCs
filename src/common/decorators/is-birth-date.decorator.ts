import { isISO8601, ValidateBy } from 'class-validator';

const fechaLocal = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/El_Salvador',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function IsBirthDate(): PropertyDecorator {
  return ValidateBy({
    name: 'isBirthDate',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        value >= '0001-01-01' &&
        isISO8601(value, { strict: true }) &&
        value <= fechaLocal.format(new Date()),
      defaultMessage: () =>
        'La fecha de nacimiento debe ser válida y no futura (AAAA-MM-DD).',
    },
  });
}
