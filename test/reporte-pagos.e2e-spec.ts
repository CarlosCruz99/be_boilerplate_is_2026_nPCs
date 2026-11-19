import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CrearApp } from '../src/create-app.js';

describe('BE-21.1: reporte de pagos del organizador', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let temporadaId: number, otraTemporadaId: number, canchaId: number;
  let equipos: number[], usuarios: string[], cuotasC: number[];
  let organizador: string,
    organizadorId: string,
    capitan: string,
    capitanId: string,
    jugador: string,
    arbitro: string,
    arbitroId: string;
  let pendienteId: number, ayer: string;
  const cliente = () => request(app.getHttpServer());
  const ruta = '/api/v1/reportes/pagos';
  const consultar = (filtros: Record<string, unknown> = {}) =>
    cliente()
      .get(ruta)
      .auth(organizador, { type: 'bearer' })
      .query({ temporadaId, ...filtros });

  beforeAll(async () => {
    const entrada = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entrada)) as {
      createApp: typeof CrearApp;
    };
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const login = async (email: string, password = 'Liga2026!') => {
      const r = await cliente()
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      const token = r.body.accessToken as string;
      const me = await cliente()
        .get('/api/v1/auth/me')
        .auth(token, { type: 'bearer' })
        .expect(200);
      return { token, id: me.body.id as string };
    };
    const org = await login('organizador@liga.test');
    organizador = org.token;
    organizadorId = org.id;
    const cap = await login('capitan.tigres-fc.ap26@liga.test');
    capitan = cap.token;
    capitanId = cap.id;
    const arb = await login('arbitro1@liga.test');
    arbitro = arb.token;
    arbitroId = arb.id;
    jugador = (await login('demo@example.com', 'Demo1234!')).token;
  }, 20000);

  async function cuota(
    equipo: number,
    monto: string,
    dias: number,
    partido: number | null = null,
  ): Promise<number> {
    return (
      await db.query(
        `INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por,partido_id)
      VALUES ($1,$2,$3,$4,(now() AT TIME ZONE 'America/El_Salvador')::date + $5::int,$6,$7) RETURNING id`,
        [
          temporadaId,
          equipo,
          partido === null ? 'INSCRIPCION' : 'ARBITRAJE',
          monto,
          dias,
          organizadorId,
          partido,
        ],
      )
    ).rows[0].id as number;
  }
  async function pago(
    cuotaId: number,
    monto: string,
    estado: string,
  ): Promise<number> {
    return (
      await db.query(
        `INSERT INTO pago(cuota_id,monto,fecha_pago,comprobante_clave,comprobante_mime,comprobante_bytes,estado,registrado_por,verificado_por,verificado_en,motivo_rechazo)
      VALUES ($1,$2,current_date,$3,'image/png',100,$4::text::estado_pago,$5::uuid,CASE WHEN $4::text <> 'PENDIENTE' THEN $5::uuid END,CASE WHEN $4::text <> 'PENDIENTE' THEN now() END,CASE WHEN $4::text = 'RECHAZADO' THEN 'Comprobante ilegible o incompleto' END) RETURNING id`,
        [cuotaId, monto, randomUUID(), estado, organizadorId],
      )
    ).rows[0].id as number;
  }
  beforeEach(async () => {
    usuarios = [];
    equipos = [];
    cuotasC = [];
    temporadaId = (
      await db.query(
        "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2061-01-01','2061-12-31') RETURNING id",
        ['BE211-' + randomUUID()],
      )
    ).rows[0].id;
    otraTemporadaId = (
      await db.query(
        "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2062-01-01','2062-12-31') RETURNING id",
        ['BE211-' + randomUUID()],
      )
    ).rows[0].id;
    canchaId = (
      await db.query(
        "INSERT INTO cancha(nombre,direccion) VALUES ($1,'BE211') RETURNING id",
        ['BE211-' + randomUUID()],
      )
    ).rows[0].id;
    for (let i = 0; i < 6; i++) {
      let cap = capitanId;
      if (i > 0) {
        cap = randomUUID();
        usuarios.push(cap);
        await db.query(
          "INSERT INTO usuario(id,nombre,email,password_hash,fecha_nacimiento,updated_at) VALUES ($1,'Capitán H21',$2,'sin-login','1990-01-01',now())",
          [cap, cap + '@liga.test'],
        );
      }
      const estado = i === 4 ? 'PENDIENTE' : i === 5 ? 'RECHAZADO' : 'INSCRITO';
      equipos.push(
        (
          await db.query(
            `INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion,motivo_rechazo)
        VALUES ($1,$2,$3,$4::text::estado_equipo,CASE WHEN $4::text <> 'PENDIENTE' THEN $5::uuid END,CASE WHEN $4::text <> 'PENDIENTE' THEN now() END,CASE WHEN $4::text = 'RECHAZADO' THEN 'La plantilla no cumple con los requisitos' END) RETURNING id`,
            [
              ['A', 'B', 'C', 'D', 'Pendiente', 'Rechazado'][i],
              temporadaId,
              cap,
              estado,
              organizadorId,
            ],
          )
        ).rows[0].id,
      );
    }
    const partidos: number[] = [];
    for (let n = 1; n <= 3; n++) {
      const jornadaId = (
        await db.query(
          'INSERT INTO jornada(temporada_id,numero) VALUES ($1,$2) RETURNING id',
          [temporadaId, n],
        )
      ).rows[0].id;
      partidos.push(
        (
          await db.query(
            `INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin)
        VALUES ($1,$2,$3,$4,$5,$6,'2061-02-01T14:00:00Z'::timestamptz + $7::int * interval '1 day','2061-02-01T15:30:00Z'::timestamptz + $7::int * interval '1 day') RETURNING id`,
            [
              temporadaId,
              jornadaId,
              equipos[[0, 1, 3][n - 1]],
              equipos[2],
              canchaId,
              arbitroId,
              n,
            ],
          )
        ).rows[0].id,
      );
    }
    await pago(await cuota(equipos[0], '100', -30), '100', 'VERIFICADO');
    await pago(
      await cuota(equipos[0], '25.50', -10, partidos[0]),
      '25.50',
      'VERIFICADO',
    );
    await pago(await cuota(equipos[1], '100', 10), '40', 'VERIFICADO');
    const c = await cuota(equipos[2], '100', -20);
    cuotasC.push(c);
    await pago(c, '30', 'VERIFICADO');
    pendienteId = await pago(c, '50', 'PENDIENTE');
    await pago(c, '20', 'RECHAZADO');
    for (const [n, monto, dias, abonado] of [
      [0, '25', -40, '25'],
      [1, '30', -15, '10'],
      [2, '25', -5, '0'],
    ] as const) {
      const id = await cuota(equipos[2], monto, dias, partidos[n]);
      cuotasC.push(id);
      if (abonado !== '0') await pago(id, abonado, 'VERIFICADO');
    }
    await cuota(equipos[4], '100', -3);
    await cuota(equipos[5], '100', -3);
    ayer = (
      await db.query(
        "SELECT ((now() AT TIME ZONE 'America/El_Salvador')::date - 1)::text AS fecha",
      )
    ).rows[0].fecha;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.query(
      'DELETE FROM pago WHERE cuota_id IN (SELECT id FROM cuota WHERE temporada_id=$1)',
      [temporadaId],
    );
    await db.query('DELETE FROM cuota WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM partido WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM jornada WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM equipo WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM temporada WHERE id=ANY($1::int[])', [
      [temporadaId, otraTemporadaId],
    ]);
    await db.query('DELETE FROM cancha WHERE id=$1', [canchaId]);
    await db.query('DELETE FROM usuario WHERE id=ANY($1::uuid[])', [usuarios]);
  });
  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  it('reproduce A pagado, B con saldo, C moroso, D sin cuotas y sus totales', async () => {
    const r = await consultar().expect(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.body.concepto).toBe('TODOS');
    expect(r.body.temporadaId).toBe(temporadaId);
    expect(Number.isNaN(Date.parse(r.body.generadoEn))).toBe(false);
    expect(
      r.body.equipos.map((e: { nombre: string; estado: string }) => [
        e.nombre,
        e.estado,
      ]),
    ).toEqual([
      ['C', 'MOROSO'],
      ['B', 'CON_SALDO'],
      ['A', 'PAGADO'],
      ['D', 'SIN_CUOTAS'],
    ]);
    expect(r.body.totales).toEqual({
      totalCuotas: '405.50',
      pagado: '230.50',
      saldoPendiente: '175.00',
      equiposMorosos: 1,
    });
    expect(r.body.equipos[0]).toMatchObject({
      totalCuotas: '180.00',
      pagado: '65.00',
      saldoPendiente: '115.00',
    });
    const fecha = (
      await db.query(
        "SELECT ((now() AT TIME ZONE 'America/El_Salvador')::date - 20)::text AS fecha",
      )
    ).rows[0].fecha;
    expect(r.body.equipos[0].vencidoDesde).toBe(fecha);
    expect(r.body.equipos[2].vencidoDesde).toBeNull();
    expect(r.body.equipos[3]).toMatchObject({
      totalCuotas: '0.00',
      pagado: '0.00',
      saldoPendiente: '0.00',
      vencidoDesde: null,
    });
  });
  it('filtra concepto antes de clasificar y conserva equipos sin cuotas del concepto', async () => {
    const r = await consultar({ concepto: 'ARBITRAJE' }).expect(200);
    expect(
      r.body.equipos.map((e: { nombre: string; estado: string }) => [
        e.nombre,
        e.estado,
      ]),
    ).toEqual([
      ['C', 'MOROSO'],
      ['A', 'PAGADO'],
      ['B', 'SIN_CUOTAS'],
      ['D', 'SIN_CUOTAS'],
    ]);
    expect(r.body.totales).toEqual({
      totalCuotas: '105.50',
      pagado: '60.50',
      saldoPendiente: '45.00',
      equiposMorosos: 1,
    });
    const fecha = (
      await db.query(
        "SELECT ((now() AT TIME ZONE 'America/El_Salvador')::date - 15)::text AS fecha",
      )
    ).rows[0].fecha;
    expect(r.body.equipos[0].vencidoDesde).toBe(fecha);
    const ins = await consultar({ concepto: 'INSCRIPCION' }).expect(200);
    expect(ins.body.totales).toEqual({
      totalCuotas: '300.00',
      pagado: '170.00',
      saldoPendiente: '130.00',
      equiposMorosos: 1,
    });
  });
  it.each(['MOROSO', 'CON_SALDO', 'PAGADO', 'SIN_CUOTAS'])(
    'filtra estado %s y recalcula totales',
    async (estado) => {
      const r = await consultar({ estado }).expect(200);
      expect(r.body.equipos).toHaveLength(1);
      expect(r.body.equipos[0].estado).toBe(estado);
      expect(r.body.totales).toEqual({
        totalCuotas: r.body.equipos[0].totalCuotas,
        pagado: r.body.equipos[0].pagado,
        saldoPendiente: r.body.equipos[0].saldoPendiente,
        equiposMorosos: estado === 'MOROSO' ? 1 : 0,
      });
    },
  );
  it('combina concepto y estado; devuelve ceros en un filtro sin coincidencias', async () => {
    const r = await consultar({
      concepto: 'ARBITRAJE',
      estado: 'SIN_CUOTAS',
    }).expect(200);
    expect(r.body.equipos.map((e: { nombre: string }) => e.nombre)).toEqual([
      'B',
      'D',
    ]);
    const vacio = await consultar({
      concepto: 'ARBITRAJE',
      estado: 'CON_SALDO',
    }).expect(200);
    expect(vacio.body.equipos).toEqual([]);
    expect(vacio.body.totales).toEqual({
      totalCuotas: '0.00',
      pagado: '0.00',
      saldoPendiente: '0.00',
      equiposMorosos: 0,
    });
  });
  it('una temporada vacía existe y devuelve lista vacía válida', async () => {
    const r = await consultar({ temporadaId: otraTemporadaId }).expect(200);
    expect(r.body.equipos).toEqual([]);
    expect(r.body.totales.equiposMorosos).toBe(0);
    expect(r.body.totales.saldoPendiente).toBe('0.00');
  });
  it('distingue vence hoy de venció ayer en America/El_Salvador', async () => {
    const id = await cuota(equipos[3], '0.30', 0);
    let r = await consultar().expect(200);
    expect(
      r.body.equipos.find((e: { nombre: string }) => e.nombre === 'D'),
    ).toMatchObject({ estado: 'CON_SALDO', vencidoDesde: null });
    await db.query('UPDATE cuota SET fecha_vencimiento=$1::date WHERE id=$2', [
      ayer,
      id,
    ]);
    r = await consultar().expect(200);
    expect(
      r.body.equipos.find((e: { nombre: string }) => e.nombre === 'D'),
    ).toMatchObject({ estado: 'MOROSO', vencidoDesde: ayer });
    expect(r.body.totales.equiposMorosos).toBe(2);
  });
  it('una verificación y una cuota nuevas aparecen en la siguiente solicitud', async () => {
    await consultar().expect(200);
    await db.query(
      "UPDATE pago SET estado='VERIFICADO',verificado_por=$1,verificado_en=now() WHERE id=$2",
      [organizadorId, pendienteId],
    );
    await cuota(equipos[3], '0.30', 5);
    const r = await consultar().expect(200);
    expect(r.body.totales).toEqual({
      totalCuotas: '405.80',
      pagado: '280.50',
      saldoPendiente: '125.30',
      equiposMorosos: 1,
    });
    expect(
      r.body.equipos.find((e: { nombre: string }) => e.nombre === 'C')
        .saldoPendiente,
    ).toBe('65.00');
  });
  it('reserva 401 para sesiones inválidas y 403 para otros roles sin montos', async () => {
    await cliente().get(ruta).query({ temporadaId }).expect(401);
    await cliente()
      .get(ruta)
      .auth('token-invalido', { type: 'bearer' })
      .query({ temporadaId })
      .expect(401);
    for (const token of [capitan, jugador, arbitro]) {
      const r = await cliente()
        .get(ruta)
        .auth(token, { type: 'bearer' })
        .query({ temporadaId })
        .expect(403);
      expect(r.body.equipos).toBeUndefined();
      expect(r.body.totales).toBeUndefined();
    }
  });
  it('rechaza filtros inválidos, temporada ausente o inexistente', async () => {
    await cliente().get(ruta).auth(organizador, { type: 'bearer' }).expect(400);
    for (const filtros of [
      { temporadaId: 'abc' },
      { temporadaId: 0 },
      { temporadaId: -1 },
      { temporadaId: '1.5' },
      { temporadaId: 2147483648 },
      { concepto: 'OTRO' },
      { concepto: '' },
      { estado: 'PENDIENTE' },
      { estado: 'TODOS' },
      { estado: '' },
      { extra: 'x' },
    ])
      await consultar(filtros).expect(400);
    await cliente()
      .get(ruta)
      .auth(organizador, { type: 'bearer' })
      .query({ temporadaId, concepto: ['TODOS', 'ARBITRAJE'] })
      .expect(400);
    await consultar({ temporadaId: 2147483647 }).expect(404);
  });
  it('es de solo lectura y está documentado en Swagger', async () => {
    const antes = (
      await db.query(
        'SELECT row_to_json(p) AS dato FROM pago p WHERE cuota_id=ANY($1::int[]) ORDER BY id',
        [cuotasC],
      )
    ).rows;
    await consultar().expect(200);
    expect(
      (
        await db.query(
          'SELECT row_to_json(p) AS dato FROM pago p WHERE cuota_id=ANY($1::int[]) ORDER BY id',
          [cuotasC],
        )
      ).rows,
    ).toEqual(antes);
    await cliente()
      .patch(ruta)
      .auth(organizador, { type: 'bearer' })
      .send({ estado: 'PAGADO' })
      .expect(404);
    const swagger = await cliente().get('/api/docs-json').expect(200);
    expect(swagger.body.paths[ruta].get.security).toBeDefined();
    expect(swagger.body.paths[ruta].get.responses['403']).toBeDefined();
  });
  it('un fallo real de consulta devuelve 500, no un reporte vacío', async () => {
    const entrada = '../dist/prisma/services/prisma.service.js';
    const { PrismaService } = (await import(
      /* @vite-ignore */ entrada
    )) as typeof import('../src/prisma/services/prisma.service.js');
    vi.spyOn(app.get(PrismaService), '$transaction').mockRejectedValueOnce(
      new Error('Fallo controlado BE211'),
    );
    const r = await consultar().expect(500);
    expect(r.body.equipos).toBeUndefined();
    expect(r.body.totales).toBeUndefined();
  });
});
