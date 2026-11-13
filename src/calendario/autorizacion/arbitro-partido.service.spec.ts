import { Logger } from '@nestjs/common';
import { ArbitroPartidoService } from './arbitro-partido.service.js';

describe('BE-5.3: regla reutilizable del árbitro asignado', () => {
  const regla = new ArbitroPartidoService();
  const partido = { id: 12, arbitroId: 'asignado' };
  const asignado = { id: 'asignado', rol: 'ARBITRO', isActive: true } as const;

  afterEach(() => vi.restoreAllMocks());

  it('permite al árbitro asignado sin registrar un rechazo', () => {
    const log = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    expect(() => regla.exigirAsignacion(asignado, partido)).not.toThrow();
    expect(log).not.toHaveBeenCalled();
  });

  it.each([
    { ...asignado, id: 'otro-arbitro' },
    { ...asignado, rol: 'JUGADOR' as const },
    { ...asignado, rol: 'ORGANIZADOR' as const },
  ])(
    'deniega incluso si el id coincide, cuando el rol no corresponde: %j',
    (usuario) => {
      const log = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});
      try {
        regla.exigirAsignacion(usuario, partido);
        expect.fail('Debió denegar el acceso');
      } catch (error) {
        expect(error).toMatchObject({ status: 403 });
        expect((error as { getResponse(): unknown }).getResponse()).toEqual({
          mensaje: 'No tienes permiso para esta acción.',
        });
      }
      expect(log).toHaveBeenCalledExactlyOnceWith({
        evento: 'ACCESO_ARBITRO_PARTIDO_DENEGADO',
        usuarioId: usuario.id,
        partidoId: 12,
        fecha: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    },
  );

  it.each([undefined, { ...asignado, isActive: false }])(
    'exige una sesión activa también al reutilizar la regla: %j',
    (usuario) => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      expect(() => regla.exigirAsignacion(usuario, partido)).toThrow(
        expect.objectContaining({ status: 401 }),
      );
    },
  );

  it('revalida la asignación después de una reasignación', () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    regla.exigirAsignacion(asignado, partido);
    expect(() =>
      regla.exigirAsignacion(asignado, { ...partido, arbitroId: 'nuevo' }),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });
});
