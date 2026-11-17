import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';
import type { ComprobantesService } from '../src/pagos/comprobantes.service.js';

describe('BE-13.1: pagos y comprobantes privados', () => {
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
  let almacenamiento: ComprobantesService;
  let cuotaId: number;
  let equipoId: number;
  const client = () => request(app.getHttpServer());
  beforeAll(async () => {
    const entrada = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entrada)) as {
      createApp: typeof CreateApp;
    };
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const entradaArchivos = '../dist/pagos/comprobantes.service.js';
    const { ComprobantesService: Token } = (await import(
      /* @vite-ignore */ entradaArchivos
    )) as typeof import('../src/pagos/comprobantes.service.js');
    almacenamiento = app.get(Token);
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
      [`BE131-${randomUUID()}`],
    );
    temporadaId = t.rows[0].id;
    const c = await db.query<{ id: number }>(
      "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Pruebas BE131') RETURNING id",
      [`BE131-${randomUUID()}`],
    );
    canchaId = c.rows[0].id;
    const u = await db.query<{ id: string }>(
      "INSERT INTO usuario(id,nombre,email,password_hash,fecha_nacimiento,updated_at) VALUES ($1,'Capitán BE131',$2,'sin-login','1990-01-01',now()) RETURNING id",
      [randomUUID(), `be131-${randomUUID()}@liga.test`],
    );
    otroCapitanId = u.rows[0].id;
    const equipos: number[] = [];
    for (const id of [capitanId, otroCapitanId]) {
      const e = await db.query<{ id: number }>(
        "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
        [`BE131-${randomUUID()}`, temporadaId, id, organizadorId],
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
    vi.restoreAllMocks();
    const archivos = (
      await db.query(
        'SELECT id,comprobante_clave FROM pago WHERE cuota_id IN (SELECT id FROM cuota WHERE temporada_id=$1)',
        [temporadaId],
      )
    ).rows;
    for (const archivo of archivos)
      await almacenamiento.eliminar(archivo.comprobante_clave);
    await db.query(
      "DELETE FROM aviso WHERE referencia_tipo='PAGO' AND clave_idempotencia LIKE 'pago-%' AND referencia_id=ANY($1::int[])",
      [archivos.map((a) => a.id)],
    );
    await db.query(
      'DELETE FROM pago WHERE cuota_id IN (SELECT id FROM cuota WHERE temporada_id=$1)',
      [temporadaId],
    );
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

  beforeEach(async () => {
    equipoId = (
      await db.query('SELECT equipo_local_id FROM partido WHERE id=$1', [
        partidoId,
      ])
    ).rows[0].equipo_local_id;
    const cuota = await client()
      .post('/api/v1/cuotas')
      .auth(organizador, { type: 'bearer' })
      .send({
        temporadaId,
        equipoId,
        concepto: 'INSCRIPCION',
        monto: '100.00',
        fechaVencimiento: '2099-12-31',
      })
      .expect(201);
    cuotaId = cuota.body.id;
  });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=',
    'base64',
  );
  const ruta = () => `/api/v1/cuotas/${cuotaId}/pagos`;
  const enviar = (
    clave = randomUUID(),
    monto = '60.00',
    archivo = png,
    token = capitan,
    fecha = '2026-01-01',
  ) =>
    client()
      .post(ruta())
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', clave)
      .field('monto', monto)
      .field('fechaPago', fecha)
      .attach('comprobante', archivo, {
        filename: 'nombre-no-confiable.exe',
        contentType: 'application/octet-stream',
      });
  const listar = (token = capitan) =>
    client()
      .get(`/api/v1/equipos/${equipoId}/cuotas?temporadaId=${temporadaId}`)
      .auth(token, { type: 'bearer' });
  const pagos = async () =>
    (await db.query('SELECT * FROM pago WHERE cuota_id=$1', [cuotaId])).rows;

  it('registra pendiente, guarda contenido privado y reserva disponible sin alterar saldo', async () => {
    const antes = await listar().expect(200);
    expect(antes.body.cuotas[0]).toMatchObject({
      montoTotal: '100.00',
      saldo: '100.00',
      disponible: '100.00',
    });
    const r = await enviar().expect(201);
    expect(r.body).toMatchObject({
      cuotaId,
      monto: '60.00',
      fechaPago: '2026-01-01',
      estado: 'PENDIENTE',
      saldo: '100.00',
      disponible: '40.00',
    });
    expect(r.body.comprobanteClave).toBeUndefined();
    const [pago] = await pagos();
    expect(pago.comprobante_mime).toBe('image/png');
    expect(await almacenamiento.leer(pago.comprobante_clave)).toEqual(png);
    await client()
      .get(`/uploads/comprobantes-privados/${pago.comprobante_clave}`)
      .expect(404);
    const despues = await listar().expect(200);
    expect(despues.body.cuotas[0]).toMatchObject({
      pendienteVerificacion: '60.00',
      saldo: '100.00',
      disponible: '40.00',
    });
    expect(
      (
        await db.query(
          "SELECT id FROM aviso WHERE referencia_tipo='PAGO' AND referencia_id=$1 AND clave_idempotencia=$2",
          [pago.id, `pago-${pago.id}`],
        )
      ).rowCount,
    ).toBe(1);
  });
  it('reintenta con 200, sin duplicar, y devuelve saldos actuales', async () => {
    const clave = randomUUID();
    const primero = await enviar(clave).expect(201);
    await enviar(randomUUID(), '10.00').expect(201);
    const repetido = await enviar(clave, '60.0').expect(200);
    expect(repetido.body).toMatchObject({
      id: primero.body.id,
      disponible: '30.00',
      saldo: '100.00',
    });
    expect(await pagos()).toHaveLength(2);
    await enviar(clave, '61.00').expect(409);
    await enviar(
      clave,
      '60.00',
      Buffer.concat([png, Buffer.from('diferente')]),
    ).expect(409);
  });
  it('dos reintentos simultáneos solo crean un pago', async () => {
    const clave = randomUUID();
    const r = await Promise.all([enviar(clave), enviar(clave)]);
    expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([200, 201]);
    expect(await pagos()).toHaveLength(1);
  });
  it('dos pagos simultáneos no exceden el disponible', async () => {
    const r = await Promise.all([enviar(), enviar()]);
    expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(await pagos()).toHaveLength(1);
  });
  it('verificados bajan saldo, rechazados liberan disponible', async () => {
    const p = await enviar().expect(201);
    await db.query(
      "UPDATE pago SET estado='VERIFICADO', verificado_por=$2, verificado_en=now() WHERE id=$1",
      [p.body.id, organizadorId],
    );
    expect((await listar().expect(200)).body.cuotas[0]).toMatchObject({
      totalVerificado: '60.00',
      saldo: '40.00',
      disponible: '40.00',
    });
    await db.query(
      "UPDATE pago SET estado='RECHAZADO', verificado_por=$2, verificado_en=now(), motivo_rechazo=$3 WHERE id=$1",
      [p.body.id, organizadorId, 'El comprobante no es legible'],
    );
    expect((await listar().expect(200)).body.cuotas[0]).toMatchObject({
      saldo: '100.00',
      disponible: '100.00',
    });
  });
  it('requiere capitán, sesión y cuota existente', async () => {
    for (const token of [organizador, arbitro, otroArbitro, jugador]) {
      await enviar(randomUUID(), '1', png, token).expect(403);
      await listar(token).expect(403);
    }
    const otroEquipo = (
      await db.query('SELECT equipo_visitante_id FROM partido WHERE id=$1', [
        partidoId,
      ])
    ).rows[0].equipo_visitante_id;
    const ajena = await client()
      .post('/api/v1/cuotas')
      .auth(organizador, { type: 'bearer' })
      .send({
        temporadaId,
        equipoId: otroEquipo,
        concepto: 'INSCRIPCION',
        monto: '100.00',
        fechaVencimiento: '2099-12-31',
      })
      .expect(201);
    await client()
      .post(`/api/v1/cuotas/${ajena.body.id}/pagos`)
      .auth(capitan, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .field('monto', '1')
      .field('fechaPago', '2026-01-01')
      .attach('comprobante', png, 'foto.png')
      .expect(403);
    await client().post(ruta()).expect(401);
    await client()
      .get(`/api/v1/equipos/${equipoId}/cuotas`)
      .auth(capitan, { type: 'bearer' })
      .expect(400);
    expect(await pagos()).toHaveLength(0);
  });
  it('rechaza claves ausentes, montos inválidos, fecha futura y archivo ausente', async () => {
    await client()
      .post(ruta())
      .auth(capitan, { type: 'bearer' })
      .field('monto', '1')
      .field('fechaPago', '2026-01-01')
      .attach('comprobante', png, 'foto.png')
      .expect(400);
    await enviar(randomUUID(), '1.001').expect(400);
    await enviar(randomUUID(), '1', png, capitan, '2099-01-01').expect(400);
    await client()
      .post(ruta())
      .auth(capitan, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .field('monto', '1')
      .field('fechaPago', '2026-01-01')
      .expect(400);
    expect(await pagos()).toHaveLength(0);
  });
  it('rechaza archivo vacío, falso y demasiado grande', async () => {
    await enviar(randomUUID(), '1', Buffer.alloc(0)).expect(400);
    await enviar(randomUUID(), '1', Buffer.from('no es png')).expect(415);
    await enviar(randomUUID(), '1', Buffer.alloc(5 * 1024 * 1024 + 1)).expect(
      413,
    );
    expect(await pagos()).toHaveLength(0);
  });
  it('un fallo de almacenamiento no crea pagos', async () => {
    vi.spyOn(almacenamiento, 'guardar').mockRejectedValueOnce(
      new Error('Fallo de prueba'),
    );
    await enviar().expect(500);
    expect(await pagos()).toHaveLength(0);
  });
  it('elimina el archivo si falla la inserción', async () => {
    const guardar = vi.spyOn(almacenamiento, 'guardar');
    await db.query(
      "CREATE FUNCTION be131_fallo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo BE131'; END $$",
    );
    try {
      await db.query(
        `CREATE TRIGGER be131_fallo BEFORE INSERT ON pago FOR EACH ROW WHEN (NEW.cuota_id=${cuotaId}) EXECUTE FUNCTION be131_fallo()`,
      );
      await enviar().expect(500);
      const clave = await guardar.mock.results[0].value;
      await expect(almacenamiento.leer(clave)).rejects.toMatchObject({
        code: 'ENOENT',
      });
      expect(await pagos()).toHaveLength(0);
    } finally {
      await db.query('DROP TRIGGER IF EXISTS be131_fallo ON pago');
      await db.query('DROP FUNCTION be131_fallo()');
    }
  });
  it('acepta PDF y JPEG por contenido y PNG de exactamente 5 MiB', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
    const jpeg = Buffer.from(
      'ffd8ffe000104a46494600010100000100010000ffd9',
      'hex',
    );
    await enviar(randomUUID(), '1', pdf).expect(201);
    await enviar(randomUUID(), '1', jpeg).expect(201);
    await enviar(
      randomUUID(),
      '1',
      Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024 - png.length)]),
    ).expect(201);
    expect((await pagos()).map((p) => p.comprobante_mime)).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
    ]);
  });
  it('conserva el pago si falla H20 y recupera el aviso al reintentar sin duplicarlo', async () => {
    const clave = randomUUID();
    await db.query(
      "CREATE FUNCTION be131_aviso_fallo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo aviso BE131'; END $$",
    );
    try {
      await db.query(
        `CREATE TRIGGER be131_aviso_fallo BEFORE INSERT ON aviso FOR EACH ROW WHEN (NEW.usuario_id='${capitanId}'::uuid AND NEW.tipo='PAGO_REGISTRADO') EXECUTE FUNCTION be131_aviso_fallo()`,
      );
      const r = await enviar(clave).expect(201);
      expect(r.body.advertencia).toContain('no se pudo enviar');
      expect(await pagos()).toHaveLength(1);
    } finally {
      await db.query('DROP TRIGGER IF EXISTS be131_aviso_fallo ON aviso');
      await db.query('DROP FUNCTION be131_aviso_fallo()');
    }
    const r = await enviar(clave).expect(200);
    expect(r.body.advertencia).toBeUndefined();
    await enviar(clave).expect(200);
    expect(
      (
        await db.query(
          "SELECT id FROM aviso WHERE referencia_tipo='PAGO' AND referencia_id=$1",
          [r.body.id],
        )
      ).rowCount,
    ).toBe(1);
  });
});
