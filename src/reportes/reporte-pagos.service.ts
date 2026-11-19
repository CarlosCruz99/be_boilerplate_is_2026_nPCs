import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { calcularReportePagos } from './calcular-reporte-pagos.js';
import type { FilaReporte } from './calcular-reporte-pagos.js';
import type {
  ReportePagosDto,
  ReportePagosQueryDto,
} from './reporte-pagos.dto.js';

@Injectable()
export class ReportePagosService {
  constructor(private readonly prisma: PrismaService) {}

  async consultar(query: ReportePagosQueryDto): Promise<ReportePagosDto> {
    const filas = await this.prisma.$transaction(
      async (db) => {
        const temporada = await db.temporada.findUnique({
          where: { id: query.temporadaId },
          select: { id: true },
        });
        if (!temporada) throw new NotFoundException('La temporada no existe.');
        // Partimos de todos los equipos de la vista; el filtro afecta los montos,
        // no elimina al equipo sin cuotas del concepto seleccionado (SIN_CUOTAS).
        return db.$queryRaw<FilaReporte[]>`
        SELECT equipo_id AS "equipoId", nombre,
          COALESCE(SUM(total_cuotas) FILTER (WHERE ${query.concepto} = 'TODOS' OR concepto::text = ${query.concepto}), 0)::text AS "totalCuotas",
          COALESCE(SUM(pagado) FILTER (WHERE ${query.concepto} = 'TODOS' OR concepto::text = ${query.concepto}), 0)::text AS pagado,
          COALESCE(SUM(saldo_pendiente) FILTER (WHERE ${query.concepto} = 'TODOS' OR concepto::text = ${query.concepto}), 0)::text AS "saldoPendiente",
          (MIN(vencido_desde) FILTER (WHERE ${query.concepto} = 'TODOS' OR concepto::text = ${query.concepto}))::text AS "vencidoDesde"
        FROM v_estado_pagos_equipo
        WHERE temporada_id = ${query.temporadaId}
        GROUP BY equipo_id, nombre
      `;
      },
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      temporadaId: query.temporadaId,
      concepto: query.concepto,
      generadoEn: new Date().toISOString(),
      ...calcularReportePagos(filas, query.estado),
    };
  }
}
