import { exigirCapitan } from './autorizacion-capitan.js';
describe('BE-7.2: autorización de capitanía', () => {
  const usuario = { id: 'capitan', rol: 'JUGADOR', isActive: true } as const;
  it('permite solo al jugador que capitanea el equipo', () =>
    expect(() => exigirCapitan(usuario, 'capitan')).not.toThrow());
  it.each([
    { ...usuario, id: 'otro' },
    { ...usuario, rol: 'ARBITRO' as const },
    { ...usuario, rol: 'ORGANIZADOR' as const },
  ])('rechaza %j', (actor) =>
    expect(() => exigirCapitan(actor, 'capitan')).toThrow(
      expect.objectContaining({ status: 403 }),
    ),
  );
  it.each([undefined, { ...usuario, isActive: false }])(
    'exige sesión activa %j',
    (actor) =>
      expect(() => exigirCapitan(actor, 'capitan')).toThrow(
        expect.objectContaining({ status: 401 }),
      ),
  );
});
