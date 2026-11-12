import type { INestApplication } from '@nestjs/common';
import type { EstadoPartido, Prisma } from '@PrismaClient';
import type { PrismaService } from '@Prisma/services';
import type { createApp as CrearApp } from '../src/create-app.js';
import type { PosicionesService } from '../src/posiciones/posiciones.service.js';

async function preparar(tx: Prisma.TransactionClient) {
  await tx.temporada.updateMany({
    where: { actual: true },
    data: { actual: false },
  });
  const periodo = {
    fechaInicio: new Date('2040-01-01'),
    fechaFin: new Date('2040-12-31'),
  };
  const actual = await tx.temporada.create({
    data: { ...periodo, nombre: 'H8 temporada actual', actual: true },
  });
  const anterior = await tx.temporada.create({
    data: { ...periodo, nombre: 'H8 temporada anterior' },
  });
  const cuenta = (nombre: string) => ({
    nombre,
    email: `h8-${nombre.toLowerCase()}@liga.test`,
    passwordHash: 'sin-login',
    fechaNacimiento: new Date('1990-01-01'),
  });
  const organizador = await tx.user.create({
    data: { ...cuenta('Organizador'), rol: 'ORGANIZADOR' },
  });
  const arbitro = await tx.user.create({
    data: { ...cuenta('Arbitro'), rol: 'ARBITRO' },
  });
  const cancha = await tx.cancha.create({
    data: { nombre: 'Cancha H8', direccion: 'Pruebas H8' },
  });
  const nombres = [
    'Zulu',
    'Alfa',
    'Bravo',
    'Beta',
    'Charlie',
    'Delta',
    'Eco',
    'Foxtrot',
  ];
  const equipos = [];
  for (const nombre of nombres) {
    const capitan = await tx.user.create({ data: cuenta(nombre) });
    const equipo = {
      nombre,
      capitanId: capitan.id,
      estado: 'INSCRITO' as const,
      validadoPor: organizador.id,
      fechaValidacion: new Date(),
    };
    const local = await tx.equipo.create({
      data: { ...equipo, temporadaId: actual.id },
    });
    const previo = await tx.equipo.create({
      data: { ...equipo, temporadaId: anterior.id },
    });
    equipos.push({ local: local.id, previo: previo.id });
  }
  let turno = 0;
  async function partido(
    local: number,
    visitante: number,
    golesLocal: number,
    golesVisitante: number,
    estado: EstadoPartido = 'FINALIZADO',
    temporadaId = actual.id,
  ) {
    turno++;
    const jornada = await tx.jornada.create({
      data: { temporadaId, numero: turno },
    });
    const inicio = new Date(Date.UTC(2040, 0, 1 + turno * 7, 16));
    const fin = new Date(inicio.getTime() + 90 * 60_000);
    return tx.partido.create({
      data: {
        temporadaId,
        jornadaId: jornada.id,
        equipoLocalId: local,
        equipoVisitanteId: visitante,
        canchaId: cancha.id,
        arbitroId: arbitro.id,
        inicio,
        fin,
        inicioReal:
          estado === 'FINALIZADO' || estado === 'EN_CURSO' ? inicio : null,
        finReal: estado === 'FINALIZADO' ? fin : null,
        golesLocal,
        golesVisitante,
        estado,
      },
    });
  }
  return {
    temporadaId: actual.id,
    temporadaAnteriorId: anterior.id,
    equipos: equipos.map(({ local }) => local),
    equiposAnteriores: equipos.map(({ previo }) => previo),
    partido,
  };
}

describe('BE-8.2 · recálculo de posiciones en PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let posiciones: PosicionesService;

  beforeAll(async () => {
    const appPath = '../dist/create-app.js';
    const prismaPath = '../dist/prisma/services/prisma.service.js';
    const posicionesPath = '../dist/posiciones/posiciones.service.js';
    const { createApp } = (await import(/* @vite-ignore */ appPath)) as {
      createApp: typeof CrearApp;
    };
    const { PrismaService: PrismaToken } = (await import(
      /* @vite-ignore */ prismaPath
    )) as { PrismaService: typeof PrismaService };
    const { PosicionesService: PosicionesToken } = (await import(
      /* @vite-ignore */ posicionesPath
    )) as { PosicionesService: typeof PosicionesService };
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaToken);
    posiciones = app.get(PosicionesToken);
  });

  afterAll(async () => {
    await app?.close();
  });

  async function conDatos(
    ejecutar: (
      tx: Prisma.TransactionClient,
      datos: Awaited<ReturnType<typeof preparar>>,
    ) => Promise<void>,
  ): Promise<void> {
    const revertir = new Error('Revertir datos de prueba H8');
    try {
      await prisma.$transaction(
        async (tx) => {
          await ejecutar(tx, await preparar(tx));
          throw revertir;
        },
        { isolationLevel: 'ReadCommitted', timeout: 15000 },
      );
    } catch (error) {
      if (error !== revertir) throw error;
    }
  }

  const tabla = (tx: Prisma.TransactionClient, temporadaId: number) =>
    tx.posicion.findMany({
      where: { temporadaId },
      orderBy: { equipoId: 'asc' },
    });

  it('incorpora una finalización y deja en cero a los equipos sin resultados', async () => {
    await conDatos(async (tx, { temporadaId, equipos: [a, b, c], partido }) => {
      const enCurso = await partido(a, b, 4, 2, 'EN_CURSO');
      await tx.partido.update({
        where: { id: enCurso.id },
        data: { estado: 'FINALIZADO', finReal: enCurso.fin },
      });
      await posiciones.recalcular(temporadaId, tx);
      expect(await tabla(tx, temporadaId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            equipoId: a,
            pj: 1,
            pg: 1,
            pe: 0,
            pp: 0,
            gf: 4,
            gc: 2,
            dg: 2,
            puntos: 3,
          }),
          expect.objectContaining({
            equipoId: b,
            pj: 1,
            pg: 0,
            pe: 0,
            pp: 1,
            gf: 2,
            gc: 4,
            dg: -2,
            puntos: 0,
          }),
          expect.objectContaining({
            equipoId: c,
            pj: 0,
            pg: 0,
            pe: 0,
            pp: 0,
            gf: 0,
            gc: 0,
            dg: 0,
            puntos: 0,
          }),
        ]),
      );
    });
  });

  it('ordena en la vista oficial por diferencia de goles, goles a favor y nombre', async () => {
    await conDatos(
      async (
        tx,
        {
          temporadaId,
          equipos: [zulu, alfa, bravo, beta, charlie, delta, eco, foxtrot],
          partido,
        },
      ) => {
        await partido(zulu, delta, 4, 0);
        await partido(alfa, eco, 5, 2);
        await partido(beta, foxtrot, 3, 0);
        await partido(bravo, charlie, 3, 0);
        await posiciones.recalcular(temporadaId, tx);
        const lideres = await tx.$queryRaw<
          { equipo_id: number; lugar: number }[]
        >`
        SELECT equipo_id, lugar FROM v_tabla_posiciones ORDER BY lugar LIMIT 4
      `;
        expect(lideres).toEqual(
          [zulu, alfa, beta, bravo].map((equipo_id, i) => ({
            equipo_id,
            lugar: i + 1,
          })),
        );
      },
    );
  });

  it('mantiene aislados los partidos y las posiciones de otra temporada', async () => {
    await conDatos(
      async (
        tx,
        {
          temporadaId,
          temporadaAnteriorId,
          equiposAnteriores: [a, b],
          partido,
        },
      ) => {
        await partido(a, b, 9, 0, 'FINALIZADO', temporadaAnteriorId);
        await posiciones.recalcular(temporadaAnteriorId, tx);
        const anterior = await tabla(tx, temporadaAnteriorId);
        await posiciones.recalcular(temporadaId, tx);
        expect(anterior[0].puntos).toBe(3);
        expect(await tabla(tx, temporadaAnteriorId)).toEqual(anterior);
        const actual = await tabla(tx, temporadaId);
        expect(actual).toHaveLength(8);
        expect(actual.every((fila) => fila.pj === 0 && fila.puntos === 0)).toBe(
          true,
        );
      },
    );
  });

  it('excluye partidos programados, en curso y cancelados', async () => {
    await conDatos(
      async (tx, { temporadaId, equipos: [a, b, c, d], partido }) => {
        await partido(a, b, 2, 0, 'PROGRAMADO');
        await partido(a, c, 3, 0, 'EN_CURSO');
        await partido(a, d, 4, 0, 'CANCELADO');
        await posiciones.recalcular(temporadaId, tx);
        const filas = await tabla(tx, temporadaId);
        expect(filas).toHaveLength(8);
        expect(
          filas.every(
            ({ pj, gf, puntos }) => pj === 0 && gf === 0 && puntos === 0,
          ),
        ).toBe(true);
      },
    );
  });

  it('acumula resultados sucesivos y vuelve a calcular tras una corrección', async () => {
    await conDatos(async (tx, { temporadaId, equipos: [a, b, c], partido }) => {
      const primero = await partido(a, b, 2, 0);
      await posiciones.recalcular(temporadaId, tx);
      await partido(c, a, 1, 1);
      await posiciones.recalcular(temporadaId, tx);
      expect((await tabla(tx, temporadaId))[0]).toMatchObject({
        equipoId: a,
        pj: 2,
        pg: 1,
        pe: 1,
        gf: 3,
        gc: 1,
        dg: 2,
        puntos: 4,
      });
      await tx.partido.update({
        where: { id: primero.id },
        data: { golesVisitante: 3 },
      });
      await posiciones.recalcular(temporadaId, tx);
      expect((await tabla(tx, temporadaId))[0]).toMatchObject({
        equipoId: a,
        pj: 2,
        pg: 0,
        pe: 1,
        pp: 1,
        gf: 3,
        gc: 4,
        dg: -1,
        puntos: 1,
      });
    });
  });

  it('recalcula dos veces sin duplicar ni cambiar las posiciones', async () => {
    await conDatos(async (tx, { temporadaId, equipos: [a, b], partido }) => {
      await partido(a, b, 2, 2);
      await posiciones.recalcular(temporadaId, tx);
      const primera = await tabla(tx, temporadaId);
      expect(primera).toHaveLength(8);
      expect(primera[0]).toMatchObject({
        equipoId: a,
        pj: 1,
        pe: 1,
        puntos: 1,
      });
      await posiciones.recalcular(temporadaId, tx);
      expect(await tabla(tx, temporadaId)).toEqual(primera);
    });
  });
});
