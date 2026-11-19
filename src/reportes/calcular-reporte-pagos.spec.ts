import { calcularReportePagos, estadoPago } from './calcular-reporte-pagos.js';
import type { FilaReporte } from './calcular-reporte-pagos.js';

const fila = (
  equipoId: number,
  nombre: string,
  totalCuotas: string,
  pagado: string,
  saldoPendiente: string,
  vencidoDesde: string | null = null,
): FilaReporte => ({
  equipoId,
  nombre,
  totalCuotas,
  pagado,
  saldoPendiente,
  vencidoDesde,
});
describe('BE-21.1: clasificación y totales exactos', () => {
  it.each([
    [0n, 0n, null, 'SIN_CUOTAS'],
    [10000n, 0n, null, 'PAGADO'],
    [10000n, 5000n, null, 'CON_SALDO'],
    [10000n, 5000n, '2026-11-01', 'MOROSO'],
  ] as const)('clasifica %s / %s / %s', (total, saldo, fecha, esperado) =>
    expect(estadoPago(total, saldo, fecha)).toBe(esperado),
  );
  const filas = [
    fila(1, 'A', '100', '100', '0'),
    fila(2, 'B', '100', '40', '60'),
    fila(3, 'C', '100', '30', '70', '2026-11-01'),
    fila(4, 'D', '0', '0', '0'),
  ];
  it('ordena estados y suma el conjunto completo', () => {
    const r = calcularReportePagos(filas);
    expect(r.equipos.map((e) => e.equipoId)).toEqual([3, 2, 1, 4]);
    expect(r.totales).toEqual({
      totalCuotas: '300.00',
      pagado: '170.00',
      saldoPendiente: '130.00',
      equiposMorosos: 1,
    });
  });
  it.each(['MOROSO', 'CON_SALDO', 'PAGADO', 'SIN_CUOTAS'] as const)(
    'totaliza solo el estado %s',
    (estado) => {
      const r = calcularReportePagos(filas, estado);
      expect(r.equipos).toHaveLength(1);
      expect(r.totales.totalCuotas).toBe(r.equipos[0].totalCuotas);
      expect(r.totales.pagado).toBe(r.equipos[0].pagado);
      expect(r.totales.saldoPendiente).toBe(r.equipos[0].saldoPendiente);
      expect(r.totales.equiposMorosos).toBe(estado === 'MOROSO' ? 1 : 0);
    },
  );
  it('ordena por nombre y usa id para empates', () => {
    expect(
      calcularReportePagos([
        fila(2, 'Águilas', '1', '1', '0'),
        fila(3, 'Tigres', '1', '1', '0'),
        fila(1, 'Águilas', '1', '1', '0'),
      ]).equipos.map((e) => e.equipoId),
    ).toEqual([1, 2, 3]);
  });
  it('no redondea y soporta agregados mayores que NUMERIC(12,2)', () => {
    const r = calcularReportePagos([
      fila(1, 'A', '19999999999.98', '0.10', '19999999999.88'),
      fila(2, 'B', '0.20', '0.20', '0'),
    ]);
    expect(r.totales).toEqual({
      totalCuotas: '20000000000.18',
      pagado: '0.30',
      saldoPendiente: '19999999999.88',
      equiposMorosos: 0,
    });
  });
  it('devuelve ceros solo ante un conjunto realmente vacío', () => {
    expect(calcularReportePagos([]).totales).toEqual({
      totalCuotas: '0.00',
      pagado: '0.00',
      saldoPendiente: '0.00',
      equiposMorosos: 0,
    });
  });
  it('no oculta valores corruptos o inconsistentes con ceros', () => {
    expect(() =>
      calcularReportePagos([fila(1, 'A', 'abc', '0', '0')]),
    ).toThrow();
    expect(() =>
      calcularReportePagos([fila(1, 'A', '10', '0', '9')]),
    ).toThrow();
    expect(() =>
      calcularReportePagos([fila(1, 'A', '10', '11', '-1')]),
    ).toThrow();
  });
});
