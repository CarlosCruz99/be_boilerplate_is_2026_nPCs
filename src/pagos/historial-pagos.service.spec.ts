import {
  autorizarHistorial,
  totalizarHistorial,
} from './historial-pagos.service.js';
describe('BE-14.1: autorización y sumas exactas', () => {
  const actor = { id: 'capitan', rol: 'JUGADOR', isActive: true } as const;
  it('permite al capitán', () =>
    expect(() => autorizarHistorial(actor, 'capitan')).not.toThrow());
  it.each([
    { ...actor, id: 'otro' },
    { ...actor, rol: 'ARBITRO' as const },
    { ...actor, rol: 'ORGANIZADOR' as const },
  ])('rechaza %j', (usuario) =>
    expect(() => autorizarHistorial(usuario, 'capitan')).toThrow(
      expect.objectContaining({ status: 403 }),
    ),
  );
  it.each([undefined, { ...actor, isActive: false }])(
    'exige sesión %j',
    (usuario) =>
      expect(() => autorizarHistorial(usuario, 'capitan')).toThrow(
        expect.objectContaining({ status: 401 }),
      ),
  );
  it('separa estados', () =>
    expect(
      totalizarHistorial([
        { monto: '100.00', estado: 'VERIFICADO' },
        { monto: '25.50', estado: 'PENDIENTE' },
        { monto: '10.00', estado: 'RECHAZADO' },
      ]),
    ).toEqual({
      totalRegistrado: '135.50',
      totalVerificado: '100.00',
      pendienteVerificacion: '25.50',
      totalRechazado: '10.00',
    }));
  it('no pierde centavos al sumar importes grandes', () => {
    const r = totalizarHistorial([
      { monto: '0.10', estado: 'VERIFICADO' },
      { monto: '0.20', estado: 'VERIFICADO' },
      { monto: '9999999999.99', estado: 'RECHAZADO' },
      { monto: '9999999999.99', estado: 'RECHAZADO' },
    ]);
    expect(r.totalVerificado).toBe('0.30');
    expect(r.totalRegistrado).toBe('20000000000.28');
  });
  it('vacío válido da ceros', () =>
    expect(Object.values(totalizarHistorial([]))).toEqual([
      '0.00',
      '0.00',
      '0.00',
      '0.00',
    ]));
  it('datos inválidos no dan ceros simulados', () => {
    expect(() =>
      totalizarHistorial([{ monto: 'invalido', estado: 'PENDIENTE' }]),
    ).toThrow();
    expect(() =>
      totalizarHistorial([{ monto: '1.00', estado: 'OTRO' }]),
    ).toThrow();
  });
});
