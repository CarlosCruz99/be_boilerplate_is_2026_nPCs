import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@Config';
import { ResendCorreoService } from './resend-correo.service.js';

describe('ResendCorreoService', () => {
  const correo = new ResendCorreoService(
    new ConfigService<EnvConfig, true>({
      RESEND_API_KEY: 'clave-de-prueba',
      H15_CORREO_REMITENTE: 'liga@example.test',
    }),
  );

  afterEach(() => vi.unstubAllGlobals());

  it('envía un correo individual con la clave de idempotencia en el encabezado', async () => {
    const fetchSimulado = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchSimulado);
    await expect(
      correo.enviar(
        'h15/1/usuario',
        'jugador@example.test',
        'Cambio',
        'Cancha nueva',
      ),
    ).resolves.toBe('ENVIADO');
    expect(fetchSimulado).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Idempotency-Key': 'h15/1/usuario',
        }),
        body: JSON.stringify({
          from: 'liga@example.test',
          to: ['jugador@example.test'],
          subject: 'Cambio',
          text: 'Cancha nueva',
        }),
      }),
    );
  });

  it.each([
    [429, 'rate_limit_exceeded', 'REINTENTAR'],
    [503, 'internal_server_error', 'REINTENTAR'],
    [409, 'concurrent_idempotent_requests', 'REINTENTAR'],
    [409, 'invalid_idempotent_request', 'FALLIDO'],
    [422, 'validation_error', 'FALLIDO'],
  ])(
    'clasifica la respuesta HTTP %i con error %s',
    async (status, name, esperado) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ name }, { status })),
      );
      await expect(
        correo.enviar(
          'h15/1/usuario',
          'jugador@example.test',
          'Cambio',
          'Cancha nueva',
        ),
      ).resolves.toBe(esperado);
    },
  );

  it('permite reintentar un fallo de red con resultado desconocido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Tiempo agotado')),
    );
    await expect(
      correo.enviar(
        'h15/1/usuario',
        'jugador@example.test',
        'Cambio',
        'Cancha nueva',
      ),
    ).resolves.toBe('REINTENTAR');
  });
});
