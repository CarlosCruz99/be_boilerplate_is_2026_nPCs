import { InternalServerErrorException } from '@nestjs/common';
import { dinero } from '../pagos/pago.dto.js';
import type {
  EquipoReportePagosDto,
  EstadoReporte,
  TotalesReportePagosDto,
} from './reporte-pagos.dto.js';

export type FilaReporte = {
  equipoId: number;
  nombre: string;
  totalCuotas: string;
  pagado: string;
  saldoPendiente: string;
  vencidoDesde: string | null;
};

// Los agregados de NUMERIC no tienen el límite individual de una cuota o pago.
function centimos(valor: string): bigint {
  if (!/^\d+(?:\.\d{1,2})?$/.test(valor))
    throw new InternalServerErrorException(
      'El reporte contiene un monto inválido.',
    );
  const [entero, decimal = ''] = valor.split('.');
  return BigInt(entero) * 100n + BigInt(decimal.padEnd(2, '0'));
}

export function estadoPago(
  totalCuotas: bigint,
  saldo: bigint,
  vencidoDesde: string | null,
): EstadoReporte {
  if (totalCuotas === 0n) return 'SIN_CUOTAS';
  if (vencidoDesde !== null) return 'MOROSO';
  if (saldo > 0n) return 'CON_SALDO';
  return 'PAGADO';
}

export function calcularReportePagos(
  filas: FilaReporte[],
  filtro?: EstadoReporte,
): {
  equipos: EquipoReportePagosDto[];
  totales: TotalesReportePagosDto;
} {
  let total = 0n,
    pagadoTotal = 0n,
    saldoTotal = 0n,
    equiposMorosos = 0;
  const equipos: EquipoReportePagosDto[] = [];
  for (const fila of filas) {
    const totalCuotas = centimos(fila.totalCuotas);
    const pagado = centimos(fila.pagado);
    const saldo = centimos(fila.saldoPendiente);
    if (totalCuotas !== pagado + saldo)
      throw new InternalServerErrorException(
        'El reporte contiene saldos inconsistentes.',
      );
    const estado = estadoPago(totalCuotas, saldo, fila.vencidoDesde);
    if (filtro !== undefined && estado !== filtro) continue;
    equipos.push({
      ...fila,
      totalCuotas: dinero(totalCuotas),
      pagado: dinero(pagado),
      saldoPendiente: dinero(saldo),
      estado,
    });
    total += totalCuotas;
    pagadoTotal += pagado;
    saldoTotal += saldo;
    if (estado === 'MOROSO') equiposMorosos++;
  }
  const prioridad: Record<EstadoReporte, number> = {
    MOROSO: 0,
    CON_SALDO: 1,
    PAGADO: 2,
    SIN_CUOTAS: 3,
  };
  equipos.sort(
    (a, b) =>
      prioridad[a.estado] - prioridad[b.estado] ||
      a.nombre.localeCompare(b.nombre, 'es') ||
      a.equipoId - b.equipoId,
  );
  return {
    equipos,
    totales: {
      totalCuotas: dinero(total),
      pagado: dinero(pagadoTotal),
      saldoPendiente: dinero(saldoTotal),
      equiposMorosos,
    },
  };
}
