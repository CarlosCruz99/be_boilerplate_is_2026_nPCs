import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CrearApp } from '../src/create-app.js';
import type { ComprobantesService } from '../src/pagos/comprobantes.service.js';

describe('BE-24.1: revisión privada y decisión de pagos', () => {
  let app: INestApplication<Server>, db: Pool, archivos: ComprobantesService;
  let organizador: string,
    organizadorId: string,
    segundoOrg: string,
    segundoOrgId: string;
  let capitan: string, capitanId: string, jugador: string, arbitro: string;
  let temporadaId: number,
    equipoId: number,
    cuotaId: number,
    pagoId: number,
    otroPagoId: number;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=',
    'base64',
  );
  const cliente = () => request(app.getHttpServer());
  const base = '/api/v1/pagos';
  const revision = (id = pagoId) =>
    cliente()
      .get(`${base}/${id}/revision`)
      .auth(organizador, { type: 'bearer' });
  const decidir = (
    estado = 'VERIFICADO',
    motivo?: string,
    id = pagoId,
    token = organizador,
  ) =>
    cliente()
      .patch(`${base}/${id}/verificacion`)
      .auth(token, { type: 'bearer' })
      .send({ estado, ...(motivo === undefined ? {} : { motivo }) });
  const enviar = (monto: string, clave = randomUUID()) =>
    cliente()
      .post(`/api/v1/cuotas/${cuotaId}/pagos`)
      .auth(capitan, { type: 'bearer' })
      .set('Idempotency-Key', clave)
      .field('monto', monto)
      .field('fechaPago', '2026-01-01')
      .attach('comprobante', png, {
        filename: 'privado.png',
        contentType: 'image/png',
      });
  const historial = () =>
    cliente()
      .get(`/api/v1/equipos/${equipoId}/pagos`)
      .query({ temporadaId })
      .auth(capitan, { type: 'bearer' });
  const reporte = () =>
    cliente()
      .get('/api/v1/reportes/pagos')
      .query({ temporadaId })
      .auth(organizador, { type: 'bearer' });
  const estadoPersistido = async () =>
    (
      await db.query(
        'SELECT estado,verificado_por,verificado_en,motivo_rechazo FROM pago WHERE id=$1',
        [pagoId],
      )
    ).rows[0];

  beforeAll(async () => {
    const entrada = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entrada)) as {
      createApp: typeof CrearApp;
    };
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const entradaArchivos = '../dist/pagos/comprobantes.service.js';
    const { ComprobantesService: Token } = (await import(
      /* @vite-ignore */ entradaArchivos
    )) as typeof import('../src/pagos/comprobantes.service.js');
    archivos = app.get(Token);
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
    arbitro = (await login('arbitro1@liga.test')).token;
    jugador = (await login('demo@example.com', 'Demo1234!')).token;
    segundoOrgId = randomUUID();
    const email = `be241-${randomUUID()}@liga.test`;
    await db.query(
      `INSERT INTO usuario(id,nombre,email,password_hash,rol,fecha_nacimiento,updated_at)
      SELECT $1,'Organizador H24',$2,password_hash,'ORGANIZADOR','1990-01-01',now() FROM usuario WHERE id=$3`,
      [segundoOrgId, email, organizadorId],
    );
    segundoOrg = (await login(email)).token;
  }, 30000);

  beforeEach(async () => {
    temporadaId = (
      await db.query(
        "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2063-01-01','2063-12-31') RETURNING id",
        ['BE241-' + randomUUID()],
      )
    ).rows[0].id;
    equipoId = (
      await db.query(
        "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
        ['BE241-' + randomUUID(), temporadaId, capitanId, organizadorId],
      )
    ).rows[0].id;
    const cuota = await cliente()
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
    pagoId = (await enviar('60.00').expect(201)).body.id;
    otroPagoId = (await enviar('20.00').expect(201)).body.id;
    await db.query(
      "UPDATE pago SET creado_en='1900-01-01T00:00:00Z' WHERE id=ANY($1::int[])",
      [[pagoId, otroPagoId]],
    );
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    const pagos = (
      await db.query(
        'SELECT id,comprobante_clave FROM pago WHERE cuota_id=$1',
        [cuotaId],
      )
    ).rows;
    for (const pago of pagos) await archivos.eliminar(pago.comprobante_clave);
    await db.query(
      "DELETE FROM aviso WHERE referencia_tipo='PAGO' AND clave_idempotencia LIKE 'pago-%' AND referencia_id=ANY($1::int[])",
      [pagos.map((p) => p.id)],
    );
    await db.query('DELETE FROM pago WHERE cuota_id=$1', [cuotaId]);
    await db.query(
      "DELETE FROM aviso WHERE referencia_tipo='CUOTA' AND clave_idempotencia LIKE 'cuota-%' AND referencia_id=$1",
      [cuotaId],
    );
    await db.query('DELETE FROM cuota WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM equipo WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM temporada WHERE id=$1', [temporadaId]);
  });
  afterAll(async () => {
    if (segundoOrgId)
      await db.query('DELETE FROM usuario WHERE id=$1', [segundoOrgId]);
    await app?.close();
    await db?.end();
  });

  it('pagina pendientes antiguos primero con total consistente y equipo explícito', async () => {
    const total = Number(
      (await db.query("SELECT count(*) FROM pago WHERE estado='PENDIENTE'"))
        .rows[0].count,
    );
    const r = await cliente()
      .get(`${base}/pendientes`)
      .auth(organizador, { type: 'bearer' })
      .query({ page: 1, pageSize: 1 })
      .expect(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.body).toMatchObject({
      total,
      page: 1,
      pageSize: 1,
      pagos: [
        {
          id: pagoId,
          cuotaId,
          equipo: { id: equipoId, nombre: expect.any(String) },
          concepto: 'INSCRIPCION',
          monto: '60.00',
          fechaPago: '2026-01-01',
        },
      ],
    });
    expect(r.body.pagos[0]).not.toHaveProperty('comprobanteClave');
    const segunda = await cliente()
      .get(`${base}/pendientes`)
      .auth(organizador, { type: 'bearer' })
      .query({ page: 2, pageSize: 1 })
      .expect(200);
    expect(segunda.body.pagos[0].id).toBe(otroPagoId);
    const vacia = await cliente()
      .get(`${base}/pendientes`)
      .auth(organizador, { type: 'bearer' })
      .query({ page: 2147483647, pageSize: 50 })
      .expect(200);
    expect(vacia.body).toMatchObject({ total, pagos: [] });
  });
  it('muestra detalle de cuota, saldos y existencia real sin exponer almacenamiento', async () => {
    const r = await revision().expect(200);
    expect(r.body).toEqual({
      id: pagoId,
      estado: 'PENDIENTE',
      monto: '60.00',
      fechaPago: '2026-01-01',
      cuota: {
        id: cuotaId,
        temporadaId,
        equipo: { id: equipoId, nombre: expect.any(String) },
        concepto: 'INSCRIPCION',
        montoTotal: '100.00',
        saldo: '100.00',
        disponible: '20.00',
      },
      tieneComprobante: true,
      verificadoPor: null,
      verificadoEn: null,
      motivoRechazo: null,
    });
    expect(JSON.stringify(r.body)).not.toContain('comprobanteClave');
  });
  it('descarga privada correcta y sin abrir la ruta exclusiva del capitán', async () => {
    const r = await cliente()
      .get(`${base}/${pagoId}/revision/comprobante`)
      .auth(organizador, { type: 'bearer' })
      .expect(200);
    expect(r.body).toEqual(png);
    expect(r.headers['content-type']).toContain('image/png');
    expect(r.headers['content-disposition']).toBe(
      `attachment; filename="pago-${pagoId}.png"`,
    );
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    await cliente()
      .get(`${base}/${pagoId}/comprobante`)
      .auth(organizador, { type: 'bearer' })
      .expect(403);
    await cliente()
      .get(`${base}/${pagoId}/comprobante`)
      .auth(capitan, { type: 'bearer' })
      .expect(200);
  });
  it('verifica, audita al actor de sesión y reduce saldo sin liberar otra reserva', async () => {
    const r = await decidir().expect(200);
    expect(r.body).toEqual({
      id: pagoId,
      estado: 'VERIFICADO',
      verificadoPor: organizadorId,
      verificadoEn: expect.any(String),
      saldo: '40.00',
      disponible: '20.00',
    });
    const guardado = await estadoPersistido();
    expect(guardado).toMatchObject({
      estado: 'VERIFICADO',
      verificado_por: organizadorId,
      motivo_rechazo: null,
    });
    expect(guardado.verificado_en.toISOString()).toBe(r.body.verificadoEn);
    const detalle = await revision().expect(200);
    expect(detalle.body.estado).toBe('VERIFICADO');
    await cliente()
      .get(`${base}/${pagoId}/revision/comprobante`)
      .auth(organizador, { type: 'bearer' })
      .expect(200);
    const bandeja = await cliente()
      .get(`${base}/pendientes`)
      .auth(organizador, { type: 'bearer' })
      .expect(200);
    expect(
      bandeja.body.pagos.some((p: { id: number }) => p.id === pagoId),
    ).toBe(false);
    const h = await historial().expect(200);
    expect(h.body.totales.totalVerificado).toBe('60.00');
    const rep = await reporte().expect(200);
    expect(rep.body.totales).toMatchObject({
      pagado: '60.00',
      saldoPendiente: '40.00',
    });
  });
  it('rechaza con motivo recortado, libera disponible y muestra el motivo en H14', async () => {
    const motivo = 'El comprobante no corresponde a esta cuota.';
    const r = await decidir('RECHAZADO', '  ' + motivo + '  ').expect(200);
    expect(r.body).toMatchObject({
      estado: 'RECHAZADO',
      saldo: '100.00',
      disponible: '80.00',
      verificadoPor: organizadorId,
    });
    expect((await estadoPersistido()).motivo_rechazo).toBe(motivo);
    expect((await revision().expect(200)).body.motivoRechazo).toBe(motivo);
    const h = await historial().expect(200);
    expect(
      h.body.pagos.find((p: { id: number }) => p.id === pagoId).motivoRechazo,
    ).toBe(motivo);
    expect(h.body.totales).toMatchObject({
      totalVerificado: '0.00',
      totalRechazado: '60.00',
      pendienteVerificacion: '20.00',
    });
    expect((await reporte().expect(200)).body.totales).toMatchObject({
      pagado: '0.00',
      saldoPendiente: '100.00',
    });
    await enviar('80.00').expect(201);
  });
  it.each(['VERIFICADO', 'RECHAZADO'])(
    'impide decidir otra vez un pago %s y conserva su auditoría',
    async (estado) => {
      await decidir(
        estado,
        estado === 'RECHAZADO'
          ? 'El comprobante no corresponde a la cuota.'
          : undefined,
      ).expect(200);
      const antes = await estadoPersistido();
      const r = await decidir(
        'VERIFICADO',
        undefined,
        pagoId,
        segundoOrg,
      ).expect(409);
      expect(r.body.message).toBe('El pago ya fue resuelto.');
      expect(await estadoPersistido()).toEqual(antes);
    },
  );
  it('con dos organizadores concurrentes solo una decisión y su auditoría se guardan', async () => {
    const respuestas = await Promise.all([
      decidir('VERIFICADO'),
      decidir(
        'RECHAZADO',
        'El comprobante no coincide con la transferencia.',
        pagoId,
        segundoOrg,
      ),
    ]);
    expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    const ganadora = respuestas.find((r) => r.status === 200)!;
    const perdida = respuestas.find((r) => r.status === 409)!;
    expect(perdida.body.message).toBe('El pago ya fue resuelto.');
    const guardado = await estadoPersistido();
    expect(guardado.estado).toBe(ganadora.body.estado);
    expect(guardado.verificado_por).toBe(ganadora.body.verificadoPor);
    expect(guardado.verificado_en.toISOString()).toBe(
      ganadora.body.verificadoEn,
    );
    expect((await revision().expect(200)).body.cuota).toMatchObject({
      saldo: ganadora.body.saldo,
      disponible: ganadora.body.disponible,
    });
  });
  it('dos pagos de la misma cuota pueden verificarse concurrentemente sin perder importes', async () => {
    const respuestas = await Promise.all([
      decidir(),
      decidir('VERIFICADO', undefined, otroPagoId, segundoOrg),
    ]);
    expect(respuestas.map((r) => r.status)).toEqual([200, 200]);
    expect((await revision().expect(200)).body.cuota).toMatchObject({
      saldo: '20.00',
      disponible: '20.00',
    });
    expect((await reporte().expect(200)).body.totales.pagado).toBe('80.00');
  });
  it('comparte el bloqueo de cuota con un registro simultáneo de H13', async () => {
    const respuestas = await Promise.all([decidir(), enviar('20.00')]);
    expect(respuestas.map((r) => r.status)).toEqual([200, 201]);
    expect((await revision().expect(200)).body.cuota).toMatchObject({
      saldo: '40.00',
      disponible: '0.00',
    });
  });
  it('archivo ausente: detalle false, descarga 404, verificar 422 y rechazar permitido', async () => {
    const clave = (
      await db.query('SELECT comprobante_clave FROM pago WHERE id=$1', [pagoId])
    ).rows[0].comprobante_clave;
    await archivos.eliminar(clave);
    expect((await revision().expect(200)).body.tieneComprobante).toBe(false);
    await cliente()
      .get(`${base}/${pagoId}/revision/comprobante`)
      .auth(organizador, { type: 'bearer' })
      .expect(404);
    await decidir().expect(422);
    expect(await estadoPersistido()).toMatchObject({
      estado: 'PENDIENTE',
      verificado_por: null,
      verificado_en: null,
      motivo_rechazo: null,
    });
    await decidir(
      'RECHAZADO',
      'El archivo del comprobante no está disponible.',
    ).expect(200);
    expect((await revision().expect(200)).body.cuota.disponible).toBe('80.00');
  });
  it('un error de almacenamiento no se disfraza de archivo ausente ni guarda decisión', async () => {
    vi.spyOn(archivos, 'existe').mockRejectedValueOnce(
      Object.assign(new Error('Sin acceso'), { code: 'EACCES' }),
    );
    await decidir().expect(500);
    expect((await estadoPersistido()).estado).toBe('PENDIENTE');
    vi.spyOn(archivos, 'leer').mockRejectedValueOnce(
      Object.assign(new Error('Sin acceso'), { code: 'EACCES' }),
    );
    await cliente()
      .get(`${base}/${pagoId}/revision/comprobante`)
      .auth(organizador, { type: 'bearer' })
      .expect(500);
  });
  it('un fallo después de actualizar revierte estado y campos de auditoría', async () => {
    // Falla al COMMIT, después del UPDATE y del cálculo de saldos real.
    const nombre = 'be241_fallo_' + randomUUID().replaceAll('-', '');
    await db.query(
      `CREATE FUNCTION ${nombre}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo controlado BE241 al confirmar'; RETURN NEW; END $$`,
    );
    try {
      await db.query(
        `CREATE CONSTRAINT TRIGGER ${nombre} AFTER UPDATE ON pago DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.id = ${pagoId}) EXECUTE FUNCTION ${nombre}()`,
      );
      try {
        await decidir().expect(500);
      } finally {
        await db.query(`DROP TRIGGER ${nombre} ON pago`);
      }
    } finally {
      await db.query(`DROP FUNCTION ${nombre}()`);
    }
    expect(await estadoPersistido()).toMatchObject({
      estado: 'PENDIENTE',
      verificado_por: null,
      verificado_en: null,
      motivo_rechazo: null,
    });
    expect((await revision().expect(200)).body.cuota).toMatchObject({
      saldo: '100.00',
      disponible: '20.00',
    });
  });
  it('exige rol organizador para las cuatro rutas y no permite decidir al capitán dueño', async () => {
    const rutas = [
      `${base}/pendientes`,
      `${base}/${pagoId}/revision`,
      `${base}/${pagoId}/revision/comprobante`,
    ];
    for (const ruta of rutas) {
      await cliente().get(ruta).expect(401);
      for (const token of [capitan, jugador, arbitro])
        await cliente().get(ruta).auth(token, { type: 'bearer' }).expect(403);
    }
    await cliente()
      .patch(`${base}/${pagoId}/verificacion`)
      .send({ estado: 'VERIFICADO' })
      .expect(401);
    for (const token of [capitan, jugador, arbitro]) {
      const r = await decidir('VERIFICADO', undefined, pagoId, token).expect(
        403,
      );
      expect(r.body.message).toBe('No tienes permiso para esta acción.');
    }
    expect((await estadoPersistido()).estado).toBe('PENDIENTE');
  });
  it('rechaza motivos y cuerpos inválidos sin alterar el pago', async () => {
    for (const dto of [
      { estado: 'RECHAZADO' },
      { estado: 'RECHAZADO', motivo: null },
      { estado: 'RECHAZADO', motivo: ' '.repeat(50) },
      { estado: 'RECHAZADO', motivo: 'a'.repeat(19) },
      { estado: 'RECHAZADO', motivo: 'a'.repeat(501) },
      { estado: 'PENDIENTE' },
      {},
      { estado: 'VERIFICADO', verificadoPor: segundoOrgId },
      { estado: 'VERIFICADO', verificadoEn: '2026-01-01' },
      { estado: 'VERIFICADO', cuotaId },
    ])
      await cliente()
        .patch(`${base}/${pagoId}/verificacion`)
        .auth(organizador, { type: 'bearer' })
        .send(dto)
        .expect(400);
    expect((await estadoPersistido()).estado).toBe('PENDIENTE');
  });
  it.each([20, 500])('acepta motivo de %s caracteres', async (n) => {
    await decidir('RECHAZADO', 'a'.repeat(n)).expect(200);
    expect((await estadoPersistido()).motivo_rechazo).toBe('a'.repeat(n));
  });
  it('valida identificadores, paginación y recursos inexistentes', async () => {
    for (const id of ['0', '-1', 'abc', '1.5', '2147483648']) {
      await cliente()
        .get(`${base}/${id}/revision`)
        .auth(organizador, { type: 'bearer' })
        .expect(400);
      await cliente()
        .get(`${base}/${id}/revision/comprobante`)
        .auth(organizador, { type: 'bearer' })
        .expect(400);
      await cliente()
        .patch(`${base}/${id}/verificacion`)
        .auth(organizador, { type: 'bearer' })
        .send({ estado: 'VERIFICADO' })
        .expect(400);
    }
    for (const query of [
      { page: 0 },
      { page: 'abc' },
      { pageSize: 0 },
      { pageSize: 51 },
      { page: '1.5' },
      { page: ['1', '2'] },
      { extra: 'x' },
    ])
      await cliente()
        .get(`${base}/pendientes`)
        .auth(organizador, { type: 'bearer' })
        .query(query)
        .expect(400);
    await revision(2147483647).expect(404);
    await decidir('VERIFICADO', undefined, 2147483647).expect(404);
    await cliente()
      .get(`${base}/2147483647/revision/comprobante`)
      .auth(organizador, { type: 'bearer' })
      .expect(404);
  });
  it('documenta las cuatro rutas y la condición 422 en Swagger', async () => {
    const r = await cliente().get('/api/docs-json').expect(200);
    for (const path of [
      `${base}/pendientes`,
      `${base}/{id}/revision`,
      `${base}/{id}/revision/comprobante`,
    ])
      expect(r.body.paths[path].get.security).toBeDefined();
    expect(
      r.body.paths[`${base}/{id}/verificacion`].patch.responses['422'],
    ).toBeDefined();
  });
});
