import { Logger } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import type { PosicionesService } from '../../posiciones/posiciones.service.js';
import type { AvisosService } from '../../avisos/services/avisos.service.js';
import { ArbitroPartidoService } from '../autorizacion/arbitro-partido.service.js';
import {
  FinalizarPartidoService,
  tituloResultado,
} from './finalizar-partido.service.js';

describe('BE-5.2: finalización', () => {
  const usuario = { id: 'asignado', rol: 'ARBITRO', isActive: true } as const;
  const partido = {
    id: 12,
    temporadaId: 3,
    arbitroId: usuario.id,
    estado: 'EN_CURSO',
    equipoLocalId: 5,
    equipoVisitanteId: 6,
    golesLocal: 2,
    golesVisitante: 1,
    faltasLocal: 3,
    faltasVisitante: 4,
    local: { nombre: 'Local' },
    visitante: { nombre: 'Visitante' },
    jornada: { numero: 2 },
  };
  const db = {
    $queryRaw: vi.fn(),
    partido: { findUnique: vi.fn(), update: vi.fn() },
    bitacoraMarcador: { create: vi.fn() },
  };
  let confirmado = false;
  const prisma = {
    $transaction: vi.fn(async (fn: (tx: typeof db) => Promise<unknown>) => {
      const r = await fn(db);
      confirmado = true;
      return r;
    }),
  };
  const posiciones = { recalcular: vi.fn() };
  const avisos = { send: vi.fn() };
  const servicio = new FinalizarPartidoService(
    prisma as unknown as PrismaService,
    new ArbitroPartidoService(),
    posiciones as unknown as PosicionesService,
    avisos as unknown as AvisosService,
  );
  beforeEach(() => {
    vi.clearAllMocks();
    confirmado = false;
    db.partido.findUnique.mockReset();
    posiciones.recalcular.mockReset();
    avisos.send.mockReset();
    db.partido.findUnique.mockResolvedValueOnce({ temporadaId: 3 });
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());
  it.each(['PROGRAMADO', 'FINALIZADO', 'CANCELADO'])(
    'rechaza %s sin escribir',
    async (estado) => {
      db.partido.findUnique.mockResolvedValueOnce({ ...partido, estado });
      await expect(servicio.finalizar(12, usuario)).rejects.toMatchObject({
        status: 409,
      });
      expect(db.partido.update).not.toHaveBeenCalled();
      expect(posiciones.recalcular).not.toHaveBeenCalled();
      expect(avisos.send).not.toHaveBeenCalled();
    },
  );
  it('revalida la asignación después de los bloqueos', async () => {
    db.partido.findUnique.mockResolvedValueOnce({
      ...partido,
      arbitroId: 'nuevo',
    });
    await expect(servicio.finalizar(12, usuario)).rejects.toMatchObject({
      status: 403,
    });
    expect(db.partido.update).not.toHaveBeenCalled();
  });
  it('recalcula con el mismo cliente transaccional y envía solo después del commit', async () => {
    db.partido.findUnique.mockResolvedValueOnce(partido);
    avisos.send.mockImplementation(async () => {
      expect(confirmado).toBe(true);
      return { avisosCreados: 1, avisoIds: [1] };
    });
    await expect(servicio.finalizar(12, usuario)).resolves.toMatchObject({
      estado: 'FINALIZADO',
      golesLocal: 2,
    });
    expect(posiciones.recalcular).toHaveBeenCalledWith(3, db);
    expect(avisos.send).toHaveBeenCalledTimes(2);
  });
  it('no avisa si falla el recálculo', async () => {
    db.partido.findUnique.mockResolvedValueOnce(partido);
    posiciones.recalcular.mockRejectedValue(new Error('fallo'));
    await expect(servicio.finalizar(12, usuario)).rejects.toThrow('fallo');
    expect(confirmado).toBe(false);
    expect(avisos.send).not.toHaveBeenCalled();
  });
  it('acorta solo nombres largos y conserva el marcador y el límite de H20', () => {
    expect(tituloResultado('Local', 'Visitante', 2, 1)).toBe(
      'Resultado final: Local 2-1 Visitante',
    );
    for (const [a, b] of [
      ['a'.repeat(100), 'b'.repeat(100)],
      ['Corto', '😀'.repeat(60)],
      ['a'.repeat(100), 'B'],
    ]) {
      const titulo = tituloResultado(a, b, 99, 99);
      expect(titulo.length).toBeLessThanOrEqual(120);
      expect(titulo).toContain(' 99-99 ');
      expect(titulo).toContain('…');
    }
  });
});
