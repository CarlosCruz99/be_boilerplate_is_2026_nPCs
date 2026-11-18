import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';
import type { ComprobantesService } from '../src/pagos/comprobantes.service.js';

describe('BE-14.1: historial y descarga privada', () => {
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
      [`BE141-${randomUUID()}`],
    );
    temporadaId = t.rows[0].id;
    const c = await db.query<{ id: number }>(
      "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Pruebas BE141') RETURNING id",
      [`BE141-${randomUUID()}`],
    );
    canchaId = c.rows[0].id;
    const u = await db.query<{ id: string }>(
      "INSERT INTO usuario(id,nombre,email,password_hash,fecha_nacimiento,updated_at) VALUES ($1,'Capitán BE141',$2,'sin-login','1990-01-01',now()) RETURNING id",
      [randomUUID(), `be141-${randomUUID()}@liga.test`],
    );
    otroCapitanId = u.rows[0].id;
    const equipos: number[] = [];
    for (const id of [capitanId, otroCapitanId]) {
      const e = await db.query<{ id: number }>(
        "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
        [`BE141-${randomUUID()}`, temporadaId, id, organizadorId],
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
  const pagos = async () =>
    (await db.query('SELECT * FROM pago WHERE cuota_id=$1', [cuotaId])).rows;

  let pendienteId: number;
  let verificadoId: number;
  let rechazadoId: number;
  let cuotaArbitraje: number;
  const motivo = 'El comprobante no corresponde al pago registrado.';
  beforeEach(async () => {
    pendienteId = (await enviar(randomUUID(), '25.50').expect(201)).body.id;
    cuotaArbitraje = (
      await client()
        .post('/api/v1/cuotas')
        .auth(organizador, { type: 'bearer' })
        .send({
          temporadaId,
          equipoId,
          concepto: 'ARBITRAJE',
          monto: '200.00',
          fechaVencimiento: '2099-12-31',
          partidoId,
        })
        .expect(201)
    ).body.id;
    for (const [indice, monto] of ['100.00', '10.00'].entries()) {
      const r = await client()
        .post(`/api/v1/cuotas/${cuotaArbitraje}/pagos`)
        .auth(capitan, { type: 'bearer' })
        .set('Idempotency-Key', randomUUID())
        .field('monto', monto)
        .field('fechaPago', indice === 0 ? '2026-01-03' : '2026-01-02')
        .attach('comprobante', png, 'foto.png')
        .expect(201);
      if (indice === 0) verificadoId = r.body.id;
      else rechazadoId = r.body.id;
    }
    await db.query(
      "UPDATE pago SET estado='VERIFICADO',verificado_por=$2,verificado_en=now() WHERE id=$1",
      [verificadoId, organizadorId],
    );
    await db.query(
      "UPDATE pago SET estado='RECHAZADO',verificado_por=$2,verificado_en=now(),motivo_rechazo=$3 WHERE id=$1",
      [rechazadoId, organizadorId, motivo],
    );
  });
  const historial = (
    query = `temporadaId=${temporadaId}`,
    token = capitan,
    id: number | string = equipoId,
  ) =>
    client()
      .get(`/api/v1/equipos/${id}/pagos?${query}`)
      .auth(token, { type: 'bearer' });
  const descargar = (id: number | string = pendienteId, token = capitan) =>
    client()
      .get(`/api/v1/pagos/${id}/comprobante`)
      .auth(token, { type: 'bearer' });
  it('lista todos los estados, motivo y cuatro totales exactos', async () => {
    const r = await historial().expect(200);
    expect(r.body).toMatchObject({
      equipoId,
      temporadaId,
      concepto: null,
      totales: {
        totalRegistrado: '135.50',
        totalVerificado: '100.00',
        pendienteVerificacion: '25.50',
        totalRechazado: '10.00',
      },
    });
    expect(r.body.pagos.map((p: { id: number }) => p.id)).toEqual([
      verificadoId,
      rechazadoId,
      pendienteId,
    ]);
    expect(r.body.pagos[1]).toMatchObject({
      estado: 'RECHAZADO',
      motivoRechazo: motivo,
      tieneComprobante: true,
    });
    expect(r.body.pagos[2].motivoRechazo).toBeNull();
    expect(JSON.stringify(r.body)).not.toMatch(
      /comprobanteClave|comprobante_clave|comprobanteMime|comprobanteBytes|uploads/,
    );
    expect(r.headers['cache-control']).toBe('private, no-store');
  });
  it.each([
    {
      concepto: 'INSCRIPCION',
      total: '25.50',
      verificado: '0.00',
      cantidad: 1,
    },
    {
      concepto: 'ARBITRAJE',
      total: '110.00',
      verificado: '100.00',
      cantidad: 2,
    },
  ])('filtra $concepto con sumas completas', async (dato) => {
    const r = await historial(
      `temporadaId=${temporadaId}&concepto=${dato.concepto}`,
    ).expect(200);
    expect(r.body.concepto).toBe(dato.concepto);
    expect(r.body.pagos).toHaveLength(dato.cantidad);
    expect(r.body.totales.totalRegistrado).toBe(dato.total);
    expect(r.body.totales.totalVerificado).toBe(dato.verificado);
  });
  it('consulta vacía válida da cuatro ceros', async () => {
    // No modificar pagos: se usa el equipo visitante sin cuotas y se intercambian capitanías temporalmente.
    const otro = (
      await db.query('SELECT equipo_visitante_id FROM partido WHERE id=$1', [
        partidoId,
      ])
    ).rows[0].equipo_visitante_id;
    const user = randomUUID();
    await db.query(
      "INSERT INTO usuario(id,email,password_hash,nombre,fecha_nacimiento,updated_at) VALUES ($1,$2,'sin-login','Temporal H14','1990-01-01',now())",
      [user, user + '@liga.test'],
    );
    try {
      await db.query('UPDATE equipo SET capitan_id=$2 WHERE id=$1', [
        equipoId,
        user,
      ]);
      await db.query('UPDATE equipo SET capitan_id=$2 WHERE id=$1', [
        otro,
        capitanId,
      ]);
      const r = await historial(
        `temporadaId=${temporadaId}`,
        capitan,
        otro,
      ).expect(200);
      expect(r.body.pagos).toEqual([]);
      expect(Object.values(r.body.totales)).toEqual([
        '0.00',
        '0.00',
        '0.00',
        '0.00',
      ]);
    } finally {
      await db.query('UPDATE equipo SET capitan_id=$2 WHERE id=$1', [
        otro,
        otroCapitanId,
      ]);
      await db.query('UPDATE equipo SET capitan_id=$2 WHERE id=$1', [
        equipoId,
        capitanId,
      ]);
      await db.query('DELETE FROM usuario WHERE id=$1', [user]);
    }
  });
  it('descarga bytes con MIME y nombre seguro', async () => {
    const r = await descargar().expect(200);
    expect(r.headers['content-type']).toContain('image/png');
    expect(r.headers['content-disposition']).toBe(
      `attachment; filename="pago-${pendienteId}.png"`,
    );
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.body).toEqual(png);
    expect(r.headers['cache-control']).toBe('private, no-store');
  });
  it('archivo ausente indica false y descarga 404 sin alterar sumas', async () => {
    const p = (await pagos()).find((p) => p.id === pendienteId);
    await almacenamiento.eliminar(p.comprobante_clave);
    const r = await historial().expect(200);
    expect(
      r.body.pagos.find((p: { id: number }) => p.id === pendienteId)
        .tieneComprobante,
    ).toBe(false);
    expect(r.body.totales.totalRegistrado).toBe('135.50');
    await descargar().expect(404);
  });
  it('admite metadatos relativos del seed, sin simular archivos ni permitir salir del directorio', async () => {
    const p = (await pagos()).find((p) => p.id === pendienteId);
    await almacenamiento.eliminar(p.comprobante_clave);
    await db.query('UPDATE pago SET comprobante_clave=$2 WHERE id=$1', [
      pendienteId,
      `seed/pagos/be14-${randomUUID()}.png`,
    ]);
    const r = await historial().expect(200);
    expect(
      r.body.pagos.find((p: { id: number }) => p.id === pendienteId)
        .tieneComprobante,
    ).toBe(false);
    await descargar().expect(404);
    for (const clave of [
      '../archivo',
      '/archivo',
      'C:\\archivo',
      'seed/../archivo',
      'seed\\archivo',
    ])
      await expect(almacenamiento.leer(clave)).rejects.toThrow(
        'Clave de comprobante inválida.',
      );
  });
  it('errores de almacenamiento no se presentan como vacío o 404', async () => {
    vi.spyOn(almacenamiento, 'existe').mockRejectedValueOnce(
      Object.assign(new Error('Prueba'), { code: 'EACCES' }),
    );
    await historial().expect(500);
    vi.spyOn(almacenamiento, 'leer').mockRejectedValueOnce(
      Object.assign(new Error('Prueba'), { code: 'EACCES' }),
    );
    await descargar().expect(500);
  });
  it('rechaza acceso cruzado y revalida la capitanía al descargar', async () => {
    await client()
      .get(`/api/v1/equipos/${equipoId}/pagos?temporadaId=${temporadaId}`)
      .expect(401);
    await client().get(`/api/v1/pagos/${pendienteId}/comprobante`).expect(401);
    for (const token of [jugador, arbitro, otroArbitro, organizador]) {
      await historial(`temporadaId=${temporadaId}`, token).expect(403);
      await descargar(pendienteId, token).expect(403);
    }
    const otro = (
      await db.query('SELECT equipo_visitante_id FROM partido WHERE id=$1', [
        partidoId,
      ])
    ).rows[0].equipo_visitante_id;
    await historial(`temporadaId=${temporadaId}`, capitan, otro).expect(403);
    const user = randomUUID();
    await db.query(
      "INSERT INTO usuario(id,email,password_hash,nombre,fecha_nacimiento,updated_at) VALUES ($1,$2,'sin-login','Nuevo capitán','1990-01-01',now())",
      [user, user + '@liga.test'],
    );
    try {
      await db.query('UPDATE equipo SET capitan_id=$2 WHERE id=$1', [
        equipoId,
        user,
      ]);
      await historial().expect(403);
      await descargar().expect(403);
    } finally {
      await db.query('UPDATE equipo SET capitan_id=$2 WHERE id=$1', [
        equipoId,
        capitanId,
      ]);
      await db.query('DELETE FROM usuario WHERE id=$1', [user]);
    }
  });
  it('valida IDs, temporada, filtros e identidad en el cuerpo', async () => {
    await historial(`temporadaId=${temporadaId}`, capitan, 2147483647).expect(
      404,
    );
    await descargar(2147483647).expect(404);
    const otra = (
      await db.query('SELECT id FROM temporada WHERE id<>$1 LIMIT 1', [
        temporadaId,
      ])
    ).rows[0].id;
    await historial(`temporadaId=${otra}`).expect(422);
    await historial('temporadaId=2147483647').expect(404);
    for (const query of [
      '',
      'temporadaId=0',
      `temporadaId=${temporadaId}&concepto=OTRO`,
      `temporadaId=${temporadaId}&usuarioId=otro`,
    ])
      await historial(query).expect(400);
    for (const id of ['0', 'abc', '-1', '1.5']) {
      await historial(`temporadaId=${temporadaId}`, capitan, id).expect(400);
      await descargar(id).expect(400);
    }
    await historial().send({ usuarioId: 'otro' }).expect(400);
    await descargar().send({ rol: 'ORGANIZADOR' }).expect(400);
  });
  it('no modifica registros y documenta ambas rutas', async () => {
    const sql = 'SELECT * FROM pago WHERE cuota_id=ANY($1::int[]) ORDER BY id';
    const args = [[cuotaId, cuotaArbitraje]];
    const antes = (await db.query(sql, args)).rows;
    await historial().expect(200);
    await descargar().expect(200);
    expect((await db.query(sql, args)).rows).toEqual(antes);
    const r = await client().get('/api/docs-json').expect(200);
    for (const ruta of [
      '/api/v1/equipos/{equipoId}/pagos',
      '/api/v1/pagos/{pagoId}/comprobante',
    ])
      expect(r.body.paths[ruta].get.responses['200']).toBeDefined();
  });
  it('una decisión concurrente no mezcla la lista anterior con totales nuevos', async () => {
    const existe = almacenamiento.existe.bind(almacenamiento);
    vi.spyOn(almacenamiento, 'existe').mockImplementationOnce(async (clave) => {
      // La lista ya se obtuvo; H24 confirma una decisión mientras se consulta el disco.
      await db.query(
        "UPDATE pago SET estado='VERIFICADO',verificado_por=$2,verificado_en=now() WHERE id=$1",
        [pendienteId, organizadorId],
      );
      return existe(clave);
    });
    const anterior = await historial().expect(200);
    expect(
      anterior.body.pagos.find((p: { id: number }) => p.id === pendienteId)
        .estado,
    ).toBe('PENDIENTE');
    expect(anterior.body.totales).toMatchObject({
      totalVerificado: '100.00',
      pendienteVerificacion: '25.50',
    });
    const nuevo = await historial().expect(200);
    expect(
      nuevo.body.pagos.find((p: { id: number }) => p.id === pendienteId).estado,
    ).toBe('VERIFICADO');
    expect(nuevo.body.totales).toMatchObject({
      totalVerificado: '125.50',
      pendienteVerificacion: '0.00',
    });
  });
});
