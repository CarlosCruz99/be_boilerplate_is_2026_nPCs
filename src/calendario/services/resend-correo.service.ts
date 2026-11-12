import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@Config';

export type ResultadoCorreo = 'ENVIADO' | 'REINTENTAR' | 'FALLIDO';

@Injectable()
export class ResendCorreoService {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  get habilitado(): boolean {
    return Boolean(this.config.get('RESEND_API_KEY', { infer: true }));
  }

  async enviar(
    clave: string,
    destinatario: string,
    asunto: string,
    mensaje: string,
  ): Promise<ResultadoCorreo> {
    let respuesta: Response;
    try {
      respuesta = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.get('RESEND_API_KEY', { infer: true })}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': clave,
        },
        body: JSON.stringify({
          from: this.config.get('H15_CORREO_REMITENTE', { infer: true }),
          to: [destinatario],
          subject: asunto,
          text: mensaje,
        }),
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      return 'REINTENTAR';
    }
    if (respuesta.ok) return 'ENVIADO';
    if (respuesta.status === 409) {
      const error = (await respuesta.json().catch(() => null)) as {
        name?: string;
      } | null;
      return error?.name === 'concurrent_idempotent_requests'
        ? 'REINTENTAR'
        : 'FALLIDO';
    }
    return respuesta.status === 408 ||
      respuesta.status === 429 ||
      respuesta.status >= 500
      ? 'REINTENTAR'
      : 'FALLIDO';
  }
}
