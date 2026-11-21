import { describe, expect, it } from 'vitest';
import { aplicarResultados } from '../../prisma/seed-consolidado.js';
import type { ResultadoPartido } from '../../prisma/seeds/consolidado-data.js';

/** Cliente falso: lleva la cuenta de lo que se escribe y simula que $transaction ejecuta el callback con el mismo cliente. */
function falso(programados: Set<number>) {
  const llamadas = { participaciones: 0, estadisticas: 0, enTransaccion: 0 };
  let dentro = false;
  const cliente: any = {
    $transaction: async (fn: (tx: any) => Promise<number>) => {
      dentro = true;
      llamadas.enTransaccion += 1;
      try {
        return await fn(cliente);
      } finally {
        dentro = false;
      }
    },
    partido: {
      updateMany: async (a: { where: { id: number; estado: string } }) => {
        if (!dentro) throw new Error('updateMany fuera de la transaccion');
        return { count: programados.has(a.where.id) && a.where.estado === 'PROGRAMADO' ? 1 : 0 };
      },
    },
    participacionPartido: {
      createMany: async (a: { data: unknown[] }) => {
        if (!dentro) throw new Error('participaciones fuera de la transaccion');
        llamadas.participaciones += a.data.length;
        return { count: a.data.length };
      },
    },
    estadisticaPartido: {
      createMany: async (a: { data: unknown[] }) => {
        if (!dentro) throw new Error('estadisticas fuera de la transaccion');
        llamadas.estadisticas += a.data.length;
        return { count: a.data.length };
      },
    },
  };
  return { cliente, llamadas };
}

function resultado(id: number): ResultadoPartido {
  return {
    partidoId: id,
    estado: 'FINALIZADO',
    golesLocal: 1,
    golesVisitante: 0,
    faltasLocal: 3,
    faltasVisitante: 2,
    inicioReal: new Date('2026-11-07T14:02:00Z'),
    finReal: new Date('2026-11-07T15:32:00Z'),
    participantes: [{ jugadorId: 1, equipoId: 1 }, { jugadorId: 2, equipoId: 2 }],
    estadisticas: [{ jugadorId: 1, goles: 1, asistencias: 0, tarjetas: 0 }, { jugadorId: 2, goles: 0, asistencias: 0, tarjetas: 0 }],
  };
}

describe('DB-1.4 · escritura de resultados', () => {
  it('partido Programado: cambia el estado y guarda participantes y estadisticas, todo dentro de una transaccion', async () => {
    const { cliente, llamadas } = falso(new Set([10]));
    expect(await aplicarResultados(cliente, [resultado(10)])).toBe(1);
    expect(llamadas).toEqual({ participaciones: 2, estadisticas: 2, enTransaccion: 1 });
  });

  it('partido que ya no esta Programado: no se le agregan participantes ni estadisticas', async () => {
    const { cliente, llamadas } = falso(new Set());
    expect(await aplicarResultados(cliente, [resultado(10)])).toBe(0);
    expect(llamadas.participaciones).toBe(0);
    expect(llamadas.estadisticas).toBe(0);
  });

  it('mezcla: solo escribe los que seguian Programados', async () => {
    const { cliente, llamadas } = falso(new Set([10, 12]));
    expect(await aplicarResultados(cliente, [resultado(10), resultado(11), resultado(12)])).toBe(2);
    expect(llamadas.estadisticas).toBe(4);
  });
});
