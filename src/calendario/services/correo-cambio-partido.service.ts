import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { ResendCorreoService } from './resend-correo.service.js';

interface EntregaPendiente {
  cambioId: number;
  usuarioId: string;
  intentos: number;
  vencida: boolean;
  email: string;
  titulo: string;
  mensaje: string;
}

const maxIntentos = 4;

@Injectable()
export class CorreoCambioPartidoService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(CorreoCambioPartidoService.name);
  private temporizador?: ReturnType<typeof setInterval>;
  private procesamiento?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly correo: ResendCorreoService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.correo.habilitado) return;
    this.temporizador = setInterval(() => {
      if (this.procesamiento) return;
      this.procesamiento = this.procesarSiguiente()
        .catch(() =>
          this.logger.error('Falló el procesamiento de entregas de H15.'),
        )
        .finally(() => {
          this.procesamiento = undefined;
        });
    }, 1000);
    this.temporizador.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.temporizador);
    await this.procesamiento;
  }

  async procesarSiguiente(): Promise<void> {
    await this.prisma.$transaction(
      async (db) => {
        // El bloqueo impide que dos réplicas envíen la misma entrega a la vez.
        // Si el proceso cae tras aceptar el correo, el proveedor conserva la clave.
        const [entrega] = await db.$queryRaw<EntregaPendiente[]>`
        SELECT e.cambio_id AS "cambioId", e.usuario_id AS "usuarioId",
          e.intentos, c.modificado_en <= now() - interval '23 hours' AS vencida,
          u.email, a.titulo, a.mensaje
        FROM entrega_correo e
        JOIN cambio_partido c ON c.id = e.cambio_id
        JOIN usuario u ON u.id = e.usuario_id
        JOIN aviso a ON a.usuario_id = e.usuario_id
          AND a.clave_idempotencia = 'cambio-partido-' || e.cambio_id::text
        WHERE e.estado = 'PENDIENTE'
          AND (e.ultimo_intento_en IS NULL OR e.ultimo_intento_en <= now() - interval '30 seconds')
        ORDER BY e.cambio_id, e.usuario_id
        LIMIT 1 FOR UPDATE OF e SKIP LOCKED
      `;
        if (!entrega) return;

        const {
          cambioId,
          usuarioId,
          email,
          titulo,
          mensaje,
          intentos,
          vencida,
        } = entrega;
        const where = { cambioId_usuarioId: { cambioId, usuarioId } };
        if (vencida || intentos >= maxIntentos) {
          await db.entregaCorreo.update({ where, data: { estado: 'FALLIDO' } });
          return;
        }

        const resultado = await this.correo.enviar(
          `h15/${cambioId}/${usuarioId}`,
          email,
          titulo,
          mensaje,
        );
        const siguienteIntento = intentos + 1;
        await db.entregaCorreo.update({
          where,
          data: {
            intentos: siguienteIntento,
            ultimoIntentoEn: new Date(),
            estado:
              resultado === 'REINTENTAR'
                ? siguienteIntento < maxIntentos
                  ? 'PENDIENTE'
                  : 'FALLIDO'
                : resultado,
          },
        });
      },
      { timeout: 10000 },
    );
  }
}
