import { validarAviso } from './validar-aviso.js';

const valido = {
  moduloOrigen: 'CALENDARIO',
  tipo: 'JORNADA_PUBLICADA',
  destinatario: { usuarioId: '00000000-0000-4000-8000-000000000012' },
  titulo: 'Título',
  mensaje: 'Mensaje',
};
describe('validación del contrato central de avisos', () => {
  it('acepta usuario/equipo y recorta texto', () => {
    expect(validarAviso({ ...valido, titulo: '  Título  ' }).dto.titulo).toBe(
      'Título',
    );
    expect(
      validarAviso({ ...valido, destinatario: { equipoId: 1, temporadaId: 2 } })
        .dto.destinatario,
    ).toEqual({ equipoId: 1, temporadaId: 2 });
  });
  it.each([
    { destinatario: undefined },
    { destinatario: {} },
    { destinatario: { usuarioId: '12' } },
    {
      destinatario: {
        usuarioId: valido.destinatario.usuarioId,
        equipoId: 1,
        temporadaId: 2,
      },
    },
    { destinatario: { equipoId: 1 } },
    { titulo: ' ' },
    { titulo: 'a'.repeat(121) },
    { mensaje: '' },
    { mensaje: 'a'.repeat(501) },
    { moduloOrigen: 'OTRO' },
    { moduloOrigen: 'PAGOS' },
    { tipo: 'OTRO' },
    { referencia: { tipo: 'JORNADA' } },
    { referencia: { id: 1 } },
    { referencia: { tipo: 'OTRO', id: 1 } },
    { referencia: { tipo: 'JORNADA', id: 0 } },
    { datos: null },
    { datos: [] },
    { datos: { texto: 'á'.repeat(2048) } },
    { claveIdempotencia: 'a'.repeat(101) },
  ])('rechaza campos inválidos %j', (cambio) => {
    expect(() => validarAviso({ ...valido, ...cambio })).toThrow();
  });
  it.each([
    ['CALENDARIO', 'PARTIDO_MODIFICADO'],
    ['CALENDARIO', 'JORNADA_PUBLICADA'],
    ['PAGOS', 'CUOTA_REGISTRADA'],
    ['PAGOS', 'PAGO_REGISTRADO'],
    ['RESULTADOS', 'RESULTADO_FINALIZADO'],
    ['RESULTADOS', 'RESULTADO_CORREGIDO'],
  ])('admite la correspondencia %s / %s', (moduloOrigen, tipo) => {
    expect(validarAviso({ ...valido, moduloOrigen, tipo }).dto.tipo).toBe(tipo);
  });
});
