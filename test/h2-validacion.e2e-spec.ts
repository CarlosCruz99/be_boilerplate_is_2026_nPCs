import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';

describe('H2: decisión de inscripciones', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let organizador: string;
  let organizadorId: string;
  let capitan: string;
  let capitanId: string;
  let arbitro: string;
  const temporadas: number[] = [];
  const usuarios: string[] = [];
  const jugadores: number[] = [];
  const api = '/api/v1';
  const client = () => request(app.getHttpServer());
  const ruta = (id: number) => `${api}/equipos/${id}/validacion`;
  const decidir = (id: number, datos: object = { decision: 'APROBAR' }) =>
    client().patch(ruta(id)).auth(organizador, { type: 'bearer' }).send(datos);

  beforeAll(async () => {
    const entry = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entry)) as {
      createApp: typeof CreateApp;
    };
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const login = async (email: string) => {
      const response = await client()
        .post(`${api}/auth/login`)
        .send({ email, password: 'Liga2026!' })
        .expect(200);
      return response.body.accessToken as string;
    };
    organizador = await login('organizador@liga.test');
    arbitro = await login('arbitro1@liga.test');
    const registro = await client()
      .post(`${api}/users`)
      .send({
        nombre: 'Capitán H2',
        email: `h2-${randomUUID()}@liga.test`,
        password: 'unaclave1',
        fechaNacimiento: '2000-01-01',
      })
      .expect(201);
    capitan = registro.get('X-Access-Token')!;
    const sesion = await client()
      .get(`${api}/auth/me`)
      .auth(capitan, { type: 'bearer' })
      .expect(200);
    capitanId = sesion.body.id as string;
    usuarios.push(capitanId);
    const org = await client()
      .get(`${api}/auth/me`)
      .auth(organizador, { type: 'bearer' })
      .expect(200);
    organizadorId = org.body.id as string;
  }, 15_000);

  afterAll(async () => {
    await app?.close();
    if (db) {
      await db.query('DELETE FROM equipo WHERE temporada_id = ANY($1::int[])', [
        temporadas,
      ]);
      await db.query('DELETE FROM jugador WHERE id = ANY($1::int[])', [
        jugadores,
      ]);
      await db.query('DELETE FROM temporada WHERE id = ANY($1::int[])', [
        temporadas,
      ]);
      await db.query('DELETE FROM usuario WHERE id = ANY($1::uuid[])', [
        usuarios,
      ]);
      await db.end();
    }
  });

  async function temporada(maxEquipos = 12) {
    const result = await db.query<{ id: number }>(
      'INSERT INTO temporada(nombre, fecha_inicio, fecha_fin, max_equipos) VALUES ($1, $2, $3, $4) RETURNING id',
      [`H2-${randomUUID()}`, '2026-01-01', '2027-12-31', maxEquipos],
    );
    const id = result.rows[0].id;
    temporadas.push(id);
    return id;
  }

  async function equipo(
    temporadaId: number,
    cantidad = 7,
    estado = 'PENDIENTE',
    propio = false,
  ) {
    const usuarioId = propio ? capitanId : randomUUID();
    if (!propio) {
      usuarios.push(usuarioId);
      await db.query(
        "INSERT INTO usuario(id,email,password_hash,nombre,fecha_nacimiento,updated_at) VALUES ($1,$2,'sin-login','Capitán H2','2000-01-01',now())",
        [usuarioId, `${usuarioId}@liga.test`],
      );
    }
    const result = await db.query<{ id: number }>(
      `INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion)
      VALUES ($1,$2,$3,$4::estado_equipo,$5,$6) RETURNING id`,
      [
        `Equipo ${randomUUID()}`,
        temporadaId,
        usuarioId,
        estado,
        estado === 'INSCRITO' ? organizadorId : null,
        estado === 'INSCRITO' ? new Date() : null,
      ],
    );
    const id = result.rows[0].id;
    for (let i = 0; i < cantidad; i++) {
      const jugador = await db.query<{ id: number }>(
        "INSERT INTO jugador(nombre_completo,fecha_nacimiento,identificacion,foto_url) VALUES ('Jugador H2','2000-01-01',$1,'/foto-test.png') RETURNING id",
        [randomUUID().slice(0, 20)],
      );
      jugadores.push(jugador.rows[0].id);
      await db.query(
        'INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES ($1,$2,$3)',
        [id, jugador.rows[0].id, temporadaId],
      );
    }
    return id;
  }

  async function estado(id: number) {
    const result = await db.query(
      'SELECT estado, validado_por, fecha_validacion, motivo_rechazo FROM equipo WHERE id=$1',
      [id],
    );
    return result.rows[0];
  }

  it('aprueba siete jugadores, registra auditoría y el capitán consulta el resultado', async () => {
    const temporadaId = await temporada();
    const id = await equipo(temporadaId, 7, 'PENDIENTE', true);
    const response = await decidir(id).expect(200);
    expect(response.body).toEqual({
      id,
      estado: 'INSCRITO',
      validadoPor: organizadorId,
      fechaValidacion: expect.any(String),
      motivoRechazo: null,
    });
    expect(
      Number.isNaN(Date.parse(response.body.fechaValidacion as string)),
    ).toBe(false);
    const propio = await client()
      .get(`${api}/equipos/mi-equipo?temporadaId=${temporadaId}`)
      .auth(capitan, { type: 'bearer' })
      .expect(200);
    expect(propio.body).toMatchObject({
      id,
      estado: 'INSCRITO',
      motivoRechazo: null,
    });
    await decidir(id).expect(409);
    expect((await estado(id)).validado_por).toBe(organizadorId);
  });

  it('acumula fallas y no modifica el equipo cuando hay menos de siete y un menor', async () => {
    const id = await equipo(await temporada(), 6);
    await db.query(
      "UPDATE jugador SET fecha_nacimiento = CURRENT_DATE - INTERVAL '15 years' WHERE id=(SELECT jugador_id FROM equipo_jugador WHERE equipo_id=$1 LIMIT 1)",
      [id],
    );
    const response = await decidir(id).expect(422);
    expect(response.body.codigo).toBe('REQUISITOS_NO_CUMPLIDOS');
    expect(response.body.fallas).toHaveLength(2);
    expect(await estado(id)).toEqual({
      estado: 'PENDIENTE',
      validado_por: null,
      fecha_validacion: null,
      motivo_rechazo: null,
    });
  });

  it('acepta el cumpleaños 16 de hoy y rechaza al que los cumple mañana', async () => {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/El_Salvador',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
      Number(partes.find((p) => p.type === tipo)!.value);
    const nacimiento = new Date(
      Date.UTC(valor('year') - 16, valor('month') - 1, valor('day')),
    );
    const manana = new Date(nacimiento);
    manana.setUTCDate(manana.getUTCDate() + 1);
    const temporadaId = await temporada();
    const hoy = await equipo(temporadaId);
    const menor = await equipo(temporadaId);
    for (const [id, fecha] of [
      [hoy, nacimiento],
      [menor, manana],
    ] as const) {
      await db.query(
        'UPDATE jugador SET fecha_nacimiento=$2 WHERE id=(SELECT jugador_id FROM equipo_jugador WHERE equipo_id=$1 LIMIT 1)',
        [id, fecha.toISOString().slice(0, 10)],
      );
    }
    await decidir(hoy).expect(200);
    const response = await decidir(menor).expect(422);
    expect(response.body.codigo).toBe('REQUISITOS_NO_CUMPLIDOS');
  });

  it.each([20, 500])(
    'rechaza con motivo de %i caracteres aun con plantilla inválida y temporada llena',
    async (length) => {
      const temporadaId = await temporada(2);
      await equipo(temporadaId, 0, 'INSCRITO');
      await equipo(temporadaId, 0, 'INSCRITO');
      const id = await equipo(temporadaId, 0, 'PENDIENTE', true);
      const motivo = 'a'.repeat(length);
      const response = await decidir(id, {
        decision: 'RECHAZAR',
        motivo: `  ${motivo}  `,
      }).expect(200);
      expect(response.body).toMatchObject({
        id,
        estado: 'RECHAZADO',
        validadoPor: organizadorId,
        motivoRechazo: motivo,
      });
      const propio = await client()
        .get(`${api}/equipos/mi-equipo?temporadaId=${temporadaId}`)
        .auth(capitan, { type: 'bearer' })
        .expect(200);
      expect(propio.body).toMatchObject({
        estado: 'RECHAZADO',
        motivoRechazo: motivo,
      });
      await decidir(id, { decision: 'RECHAZAR', motivo }).expect(409);
    },
  );

  it('valida el cuerpo y el id, exige sesión y rol, y devuelve 404', async () => {
    const id = await equipo(await temporada());
    await client().patch(ruta(id)).send({ decision: 'APROBAR' }).expect(401);
    for (const token of [capitan, arbitro])
      await client()
        .patch(ruta(id))
        .auth(token, { type: 'bearer' })
        .send({ decision: 'APROBAR' })
        .expect(403);
    for (const datos of [
      {},
      { decision: 'OTRA' },
      { decision: 'RECHAZAR' },
      { decision: 'RECHAZAR', motivo: null },
      { decision: 'RECHAZAR', motivo: ' '.repeat(20) },
      { decision: 'RECHAZAR', motivo: 'a'.repeat(19) },
      { decision: 'RECHAZAR', motivo: 'a'.repeat(501) },
      { decision: 'APROBAR', validadoPor: capitanId },
    ])
      await decidir(id, datos).expect(400);
    await decidir(0).expect(400);
    await decidir(2147483647).expect(404);
    expect((await estado(id)).estado).toBe('PENDIENTE');
  });

  it('respeta maxEquipos y cuenta únicamente inscritos de la misma temporada', async () => {
    const temporadaId = await temporada(2);
    const otra = await temporada(2);
    await equipo(otra, 0, 'INSCRITO');
    await equipo(otra, 0, 'INSCRITO');
    await equipo(temporadaId, 0, 'INSCRITO');
    const ultimo = await equipo(temporadaId);
    await decidir(ultimo).expect(200);
    const lleno = await equipo(temporadaId);
    const response = await decidir(lleno).expect(422);
    expect(response.body).toEqual({
      codigo: 'TEMPORADA_COMPLETA',
      mensaje: 'La temporada está completa.',
    });
    expect((await estado(lleno)).estado).toBe('PENDIENTE');
  });

  // Una conexión externa retiene el bloqueo para garantizar que las dos
  // solicitudes estén en vuelo antes de permitir que compitan por el cupo.
  async function competir(
    temporadaId: number,
    peticiones: (() => PromiseLike<request.Response>)[],
  ) {
    const bloqueo = await db.connect();
    let resultados: Promise<request.Response>[] = [];
    try {
      await bloqueo.query('BEGIN');
      await bloqueo.query('SELECT id FROM temporada WHERE id=$1 FOR UPDATE', [
        temporadaId,
      ]);
      resultados = peticiones.map((peticion) => Promise.resolve(peticion()));
      const limite = Date.now() + 3000;
      let esperando = 0;
      while (esperando < 2 && Date.now() < limite) {
        const r = await db.query<{ total: string }>(
          "SELECT count(*) AS total FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM temporada%' AND query LIKE '%FOR UPDATE%'",
        );
        esperando = Number(r.rows[0].total);
        if (esperando < 2)
          await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(esperando).toBeGreaterThanOrEqual(2);
    } finally {
      await bloqueo.query('ROLLBACK');
      bloqueo.release();
    }
    return Promise.all(resultados);
  }

  it('con once inscritos solo una de dos aprobaciones simultáneas ocupa el último cupo', async () => {
    const temporadaId = await temporada();
    for (let i = 0; i < 11; i++) await equipo(temporadaId, 0, 'INSCRITO');
    const primero = await equipo(temporadaId);
    const segundo = await equipo(temporadaId);
    const resultados = await competir(temporadaId, [
      () => decidir(primero),
      () => decidir(segundo),
    ]);
    expect(resultados.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 422,
    ]);
    expect(resultados.find((r) => r.status === 422)!.body.codigo).toBe(
      'TEMPORADA_COMPLETA',
    );
    const total = await db.query(
      'SELECT count(*)::int AS total FROM equipo WHERE temporada_id=$1 AND estado=$2',
      [temporadaId, 'INSCRITO'],
    );
    expect(total.rows[0].total).toBe(12);
  });

  it('solo guarda una de dos decisiones simultáneas sobre el mismo equipo', async () => {
    const temporadaId = await temporada();
    const id = await equipo(temporadaId);
    const resultados = await competir(temporadaId, [
      () => decidir(id),
      () =>
        decidir(id, {
          decision: 'RECHAZAR',
          motivo: 'Motivo suficientemente detallado.',
        }),
    ]);
    expect(resultados.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect((await estado(id)).estado).toBe(
      resultados.find((r) => r.status === 200)!.body.estado,
    );
  });

  it('coordina aprobación y baja de plantilla sin inscribir menos de siete jugadores', async () => {
    const temporadaId = await temporada();
    const id = await equipo(temporadaId, 7, 'PENDIENTE', true);
    const ficha = await db.query(
      'SELECT jugador_id FROM equipo_jugador WHERE equipo_id=$1 LIMIT 1',
      [id],
    );
    const resultados = await Promise.all([
      decidir(id),
      client()
        .delete(`${api}/equipos/${id}/jugadores/${ficha.rows[0].jugador_id}`)
        .auth(capitan, { type: 'bearer' }),
    ]);
    const final = await estado(id);
    const total = await db.query(
      'SELECT count(*)::int AS total FROM equipo_jugador WHERE equipo_id=$1',
      [id],
    );
    if (final.estado === 'INSCRITO') {
      expect(resultados.map((r) => r.status)).toEqual([200, 422]);
      expect(total.rows[0].total).toBe(7);
    } else {
      expect(final.estado).toBe('PENDIENTE');
      expect(resultados.map((r) => r.status)).toEqual([422, 204]);
      expect(total.rows[0].total).toBe(6);
    }
  });

  it('revierte la decisión completa si falla la confirmación de la transacción', async () => {
    const id = await equipo(await temporada());
    const nombre = `h2_fallo_${randomUUID().replaceAll('-', '')}`;
    await db.query(
      `CREATE FUNCTION ${nombre}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo H2 de prueba'; END; $$`,
    );
    try {
      await db.query(
        `CREATE CONSTRAINT TRIGGER ${nombre} AFTER UPDATE ON equipo DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.id=${id}) EXECUTE FUNCTION ${nombre}()`,
      );
      await decidir(id).expect(500);
      expect(await estado(id)).toEqual({
        estado: 'PENDIENTE',
        validado_por: null,
        fecha_validacion: null,
        motivo_rechazo: null,
      });
    } finally {
      await db.query(`DROP TRIGGER IF EXISTS ${nombre} ON equipo`);
      await db.query(`DROP FUNCTION ${nombre}()`);
    }
  });

  it('documenta la decisión y los dos contratos 422 en Swagger', async () => {
    const response = await client().get('/api/docs-json').expect(200);
    const operacion =
      response.body.paths[`${api}/equipos/{id}/validacion`].patch;
    for (const codigo of ['200', '400', '401', '403', '404', '409', '422'])
      expect(operacion.responses[codigo]).toBeDefined();
    expect(
      operacion.responses['422'].content['application/json'].schema.oneOf,
    ).toHaveLength(2);
  });
});
