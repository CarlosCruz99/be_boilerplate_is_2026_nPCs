import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';

describe('BE-12.1: cuotas en PostgreSQL', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let arbitro: string;
  let arbitroId: string;
  let otroArbitro: string;
  let organizador: string;
  let organizadorId: string;
  let capitan: string;
  let capitanId: string;
  let jugador: string;
  let temporadaId: number;
  let canchaId: number;
  let partidoId: number;
  let otroCapitanId: string;
  const client = () => request(app.getHttpServer());
  beforeAll(async () => {
    const entrada = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entrada)) as {
      createApp: typeof CreateApp;
    };
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const login = async (email: string, password = 'Liga2026!') => {
      const r = await client()
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      const token = r.body.accessToken as string;
      const me = await client()
        .get('/api/v1/auth/me')
        .auth(token, { type: 'bearer' })
        .expect(200);
      return { token, id: me.body.id as string };
    };
    const arb = await login('arbitro1@liga.test');
    arbitro = arb.token;
    arbitroId = arb.id;
    otroArbitro = (await login('arbitro2@liga.test')).token;
    const org = await login('organizador@liga.test');
    organizador = org.token;
    organizadorId = org.id;
    const cap = await login('capitan.tigres-fc.ap26@liga.test');
    capitan = cap.token;
    capitanId = cap.id;
    jugador = (await login('demo@example.com', 'Demo1234!')).token;
  }, 20000);

  beforeEach(async () => {
    const t = await db.query<{ id: number }>(
      "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2060-01-01','2060-12-31') RETURNING id",
      [`BE121-${randomUUID()}`],
    );
    temporadaId = t.rows[0].id;
    const c = await db.query<{ id: number }>(
      "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Pruebas BE121') RETURNING id",
      [`BE121-${randomUUID()}`],
    );
    canchaId = c.rows[0].id;
    const u = await db.query<{ id: string }>(
      "INSERT INTO usuario(id,nombre,email,password_hash,fecha_nacimiento,updated_at) VALUES ($1,'Capitán BE121',$2,'sin-login','1990-01-01',now()) RETURNING id",
      [randomUUID(), `be121-${randomUUID()}@liga.test`],
    );
    otroCapitanId = u.rows[0].id;
    const equipos: number[] = [];
    for (const id of [capitanId, otroCapitanId]) {
      const e = await db.query<{ id: number }>(
        "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
        [`BE121-${randomUUID()}`, temporadaId, id, organizadorId],
      );
      equipos.push(e.rows[0].id);
    }
    const j = await db.query<{ id: number }>(
      'INSERT INTO jornada(temporada_id,numero) VALUES ($1,1) RETURNING id',
      [temporadaId],
    );
    const p = await db.query<{ id: number }>(
      `INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin,estado,inicio_real)
      VALUES ($1,$2,$3,$4,$5,$6,'2060-02-01T14:00:00Z','2060-02-01T15:30:00Z','EN_CURSO','2060-02-01T14:00:00Z') RETURNING id`,
      [temporadaId, j.rows[0].id, ...equipos, canchaId, arbitroId],
    );
    partidoId = p.rows[0].id;
  });
  afterEach(async () => {
    await db.query(
      "DELETE FROM aviso WHERE referencia_tipo='CUOTA' AND clave_idempotencia LIKE 'cuota-%' AND referencia_id IN (SELECT id FROM cuota WHERE temporada_id=$1)",
      [temporadaId],
    );
    await db.query('DELETE FROM cuota WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM bitacora_marcador WHERE partido_id=$1', [
      partidoId,
    ]);
    await db.query('DELETE FROM partido WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM jornada WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM equipo WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM temporada WHERE id=$1', [temporadaId]);
    await db.query('DELETE FROM cancha WHERE id=$1', [canchaId]);
    await db.query('DELETE FROM usuario WHERE id=$1', [otroCapitanId]);
  });
  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  let equipoId: number;
  beforeEach(async () => {
    equipoId = (
      await db.query('SELECT equipo_local_id FROM partido WHERE id=$1', [
        partidoId,
      ])
    ).rows[0].equipo_local_id;
  });
  const datos = () => ({
    temporadaId,
    equipoId,
    concepto: 'INSCRIPCION',
    monto: '125.00',
    fechaVencimiento: '2099-12-31',
  });
  const crear = (cambio: object = {}, token = organizador) =>
    client()
      .post('/api/v1/cuotas')
      .auth(token, { type: 'bearer' })
      .send({ ...datos(), ...cambio });
  async function sinCuotas() {
    expect(
      (
        await db.query('SELECT * FROM cuota WHERE temporada_id=$1', [
          temporadaId,
        ])
      ).rowCount,
    ).toBe(0);
  }
  it('registra ambos conceptos y avisa solo al capitán', async () => {
    const r = await crear({ monto: '125.5' }).expect(201);
    expect(r.body).toEqual({
      id: expect.any(Number),
      ...datos(),
      monto: '125.50',
      partidoId: null,
    });
    const a = await crear({ concepto: 'ARBITRAJE', partidoId }).expect(201);
    expect(a.body.partidoId).toBe(partidoId);
    const avisos = (
      await db.query(
        "SELECT * FROM aviso WHERE referencia_tipo='CUOTA' AND clave_idempotencia LIKE 'cuota-%' AND referencia_id=ANY($1::int[])",
        [[r.body.id, a.body.id]],
      )
    ).rows;
    expect(avisos).toHaveLength(2);
    for (const aviso of avisos)
      expect(aviso).toMatchObject({
        usuario_id: capitanId,
        modulo_origen: 'PAGOS',
        tipo: 'CUOTA_REGISTRADA',
      });
    expect(avisos.find((a) => a.referencia_id === r.body.id).mensaje).toBe(
      'Se registró una cuota de $125.50 con vencimiento 2099-12-31.',
    );
    expect(
      (await db.query('SELECT creado_por FROM cuota WHERE id=$1', [r.body.id]))
        .rows[0].creado_por,
    ).toBe(organizadorId);
  });
  it('dos registros simultáneos crean solo una cuota', async () => {
    const r = await Promise.all([crear(), crear()]);
    expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(
      (
        await db.query('SELECT * FROM cuota WHERE temporada_id=$1', [
          temporadaId,
        ])
      ).rowCount,
    ).toBe(1);
  });
  it('rechaza arbitraje duplicado', async () => {
    await crear({ concepto: 'ARBITRAJE', partidoId }).expect(201);
    await crear({ concepto: 'ARBITRAJE', partidoId }).expect(409);
  });
  it.each([
    { monto: '1.005' },
    { monto: '100000.01' },
    { monto: 125 },
    { fechaVencimiento: '2027-02-29' },
    { fechaVencimiento: '2000-01-01' },
    { concepto: 'ARBITRAJE' },
    { partidoId: 1 },
    { creadoPor: 'inventado' },
  ])('rechaza %j sin crear', async (cambio) => {
    await crear(cambio).expect(400);
    await sinCuotas();
  });
  it('admite hoy de El Salvador y límites de monto', async () => {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/El_Salvador',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const parte = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
    await crear({
      monto: '0.01',
      fechaVencimiento: `${parte('year')}-${parte('month')}-${parte('day')}`,
    }).expect(201);
    await crear({
      concepto: 'ARBITRAJE',
      partidoId,
      monto: '100000.00',
    }).expect(201);
  });
  it('rechaza referencias inexistentes e inscripción incompatible', async () => {
    await crear({ temporadaId: 2147483647 }).expect(404);
    await crear({ equipoId: 2147483647 }).expect(404);
    await crear({ concepto: 'ARBITRAJE', partidoId: 2147483647 }).expect(404);
    const ajeno = (
      await db.query('SELECT id FROM equipo WHERE temporada_id<>$1 LIMIT 1', [
        temporadaId,
      ])
    ).rows[0].id;
    await crear({ equipoId: ajeno }).expect(422);
    await db.query(
      "UPDATE equipo SET estado='PENDIENTE',validado_por=NULL,fecha_validacion=NULL WHERE id=$1",
      [equipoId],
    );
    await crear().expect(422);
    await sinCuotas();
  });
  it('rechaza partido de otra temporada y cancelado', async () => {
    const ajeno = (
      await db.query('SELECT id FROM partido WHERE temporada_id<>$1 LIMIT 1', [
        temporadaId,
      ])
    ).rows[0].id;
    await crear({ concepto: 'ARBITRAJE', partidoId: ajeno }).expect(422);
    await db.query(
      "UPDATE partido SET estado='CANCELADO',inicio_real=NULL WHERE id=$1",
      [partidoId],
    );
    await crear({ concepto: 'ARBITRAJE', partidoId }).expect(422);
    await sinCuotas();
  });
  it('exige sesión y organizador', async () => {
    await client().post('/api/v1/cuotas').send(datos()).expect(401);
    for (const token of [arbitro, otroArbitro, capitan, jugador])
      await crear({}, token).expect(403);
    await sinCuotas();
  });
  it('conserva cuota y responde advertencia si falla el aviso', async () => {
    await db.query(
      "CREATE FUNCTION be121_fallo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo BE121'; END $$",
    );
    try {
      await db.query(
        `CREATE TRIGGER be121_fallo BEFORE INSERT ON aviso FOR EACH ROW WHEN (NEW.usuario_id='${capitanId}'::uuid AND NEW.tipo='CUOTA_REGISTRADA') EXECUTE FUNCTION be121_fallo()`,
      );
      const r = await crear().expect(201);
      expect(r.body.advertencia).toContain('no se pudo enviar');
      expect(
        (await db.query('SELECT id FROM cuota WHERE id=$1', [r.body.id]))
          .rowCount,
      ).toBe(1);
    } finally {
      await db.query('DROP TRIGGER IF EXISTS be121_fallo ON aviso');
      await db.query('DROP FUNCTION be121_fallo()');
    }
  });
});
