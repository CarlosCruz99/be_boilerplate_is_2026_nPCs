import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';
import type { CorreoCambioPartidoService } from '../src/calendario/services/correo-cambio-partido.service.js';
import type { ResendCorreoService } from '../src/calendario/services/resend-correo.service.js';

describe('BE-3.1: partidos y árbitros', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let organizador: string;
  let jugador: string;
  let tokenArbitro: string;
  let organizadorId: string;
  let temporadaId: number;
  let equipos: number[];
  let canchas: number[];
  let arbitros: string[];
  let usuarios: string[];
  let jugadores: number[];
  const api = '/api/v1';
  const client = () => request(app.getHttpServer());
  const base = new Date(Date.UTC(new Date().getUTCFullYear() + 2, 0, 7, 14));
  base.setUTCDate(base.getUTCDate() - ((base.getUTCDay() + 6) % 7));
  const fecha = (dias = 0, minutos = 0) =>
    new Date(base.getTime() + dias * 86400000 + minutos * 60000).toISOString();
  const datos = (cambios: Record<string, unknown> = {}) => ({
    temporadaId,
    jornada: 1,
    equipoLocalId: equipos[0],
    equipoVisitanteId: equipos[1],
    canchaId: canchas[0],
    arbitroId: arbitros[0],
    inicio: fecha(),
    ...cambios,
  });
  const crear = (cambios: Record<string, unknown> = {}) =>
    client()
      .post(`${api}/partidos`)
      .auth(organizador, { type: 'bearer' })
      .send(datos(cambios));
  const editar = (id: number, cambios: object) =>
    client()
      .patch(`${api}/partidos/${id}`)
      .auth(organizador, { type: 'bearer' })
      .send(cambios);

  beforeAll(async () => {
    const entry = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entry)) as {
      createApp: typeof CreateApp;
    };
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const login = async (email: string) => {
      const r = await client()
        .post(`${api}/auth/login`)
        .send({ email, password: 'Liga2026!' })
        .expect(200);
      return r.body.accessToken as string;
    };
    organizador = await login('organizador@liga.test');
    jugador = await login('capitan.panteras-fc.ap26@liga.test');
    tokenArbitro = await login('arbitro1@liga.test');
    const sesion = await client()
      .get(`${api}/auth/me`)
      .auth(organizador, { type: 'bearer' })
      .expect(200);
    organizadorId = sesion.body.id as string;
  }, 15000);

  beforeEach(async () => {
    equipos = [];
    canchas = [];
    arbitros = [];
    usuarios = [];
    jugadores = [];
    const temporada = await db.query<{ id: number }>(
      "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2027-01-01','2099-12-31') RETURNING id",
      [`BE31-${randomUUID()}`],
    );
    temporadaId = temporada.rows[0].id;
    for (let i = 0; i < 8; i++) {
      const capitanId = await usuario('JUGADOR');
      const r = await db.query<{ id: number }>(
        "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
        [`Equipo ${i}`, temporadaId, capitanId, organizadorId],
      );
      equipos.push(r.rows[0].id);
    }
    for (let i = 0; i < 2; i++) {
      const r = await db.query<{ id: number }>(
        'INSERT INTO cancha(nombre,direccion) VALUES ($1,$2) RETURNING id',
        [`Cancha ${randomUUID()}`, 'Dirección de prueba'],
      );
      canchas.push(r.rows[0].id);
      arbitros.push(await usuario('ARBITRO'));
    }
  });

  afterEach(async () => {
    await db.query(
      'DELETE FROM entrega_correo e USING cambio_partido c, partido p WHERE e.cambio_id=c.id AND c.partido_id=p.id AND p.temporada_id=$1',
      [temporadaId],
    );
    await db.query('DELETE FROM aviso WHERE usuario_id=ANY($1::uuid[])', [
      usuarios,
    ]);
    await db.query(
      'DELETE FROM cambio_partido c USING partido p WHERE c.partido_id=p.id AND p.temporada_id=$1',
      [temporadaId],
    );
    await db.query('DELETE FROM partido WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM jornada WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM equipo WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM temporada WHERE id=$1', [temporadaId]);
    await db.query('DELETE FROM cancha WHERE id=ANY($1::int[])', [canchas]);
    await db.query('DELETE FROM jugador WHERE id=ANY($1::int[])', [jugadores]);
    await db.query('DELETE FROM usuario WHERE id=ANY($1::uuid[])', [usuarios]);
  });
  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  async function usuario(rol: string) {
    const id = randomUUID();
    usuarios.push(id);
    await db.query(
      "INSERT INTO usuario(id,email,password_hash,nombre,fecha_nacimiento,rol,updated_at) VALUES ($1,$2,'sin-login','Usuario BE31','2000-01-01',$3::rol_usuario,now())",
      [id, `${id}@liga.test`, rol],
    );
    return id;
  }

  it('crea partido y jornada en borrador, calcula 90 minutos y normaliza la zona', async () => {
    const inicio = fecha().replace('14:00:00.000Z', '08:00:00-06:00');
    const r = await crear({ inicio }).expect(201);
    expect(r.body).toEqual({
      id: expect.any(Number),
      jornada: 1,
      equipoLocalId: equipos[0],
      equipoVisitanteId: equipos[1],
      canchaId: canchas[0],
      arbitroId: arbitros[0],
      inicio: fecha(),
      fin: fecha(0, 90),
      estado: 'PROGRAMADO',
    });
    const jornada = await db.query(
      'SELECT estado FROM jornada WHERE temporada_id=$1 AND numero=1',
      [temporadaId],
    );
    expect(jornada.rows).toEqual([{ estado: 'BORRADOR' }]);
  });

  it('rechaza entradas inválidas y campos que el cliente no puede controlar', async () => {
    for (const cambios of [
      { arbitroId: undefined },
      { arbitroId: '12' },
      { inicio: '2027-02-30T14:00:00Z' },
      { inicio: '2027-02-13T14:00:00' },
      { inicio: '2000-01-01T14:00:00Z' },
      { inicio: new Date().toISOString() },
      { fin: fecha(0, 90) },
      { estado: 'PROGRAMADO' },
      { jornada: 0 },
    ])
      await crear(cambios).expect(400);
    const r = await crear().expect(201);
    for (const cambios of [
      {},
      { inicio: null },
      { canchaId: null },
      { estado: 'FINALIZADO' },
      { equipoLocalId: equipos[2] },
      { fin: fecha(0, 90) },
    ])
      await editar(r.body.id as number, cambios).expect(400);
    await editar(0, { canchaId: canchas[1] }).expect(400);
  });

  it('exige sesión y organizador en todos los endpoints', async () => {
    const r = await crear().expect(201);
    await client().get(`${api}/arbitros`).expect(401);
    await client().post(`${api}/partidos`).send(datos()).expect(401);
    await client()
      .patch(`${api}/partidos/${r.body.id}`)
      .send({ estado: 'CANCELADO' })
      .expect(401);
    for (const token of [jugador, tokenArbitro]) {
      await client()
        .get(`${api}/arbitros`)
        .auth(token, { type: 'bearer' })
        .expect(403);
      await client()
        .post(`${api}/partidos`)
        .auth(token, { type: 'bearer' })
        .send(datos())
        .expect(403);
      await client()
        .patch(`${api}/partidos/${r.body.id}`)
        .auth(token, { type: 'bearer' })
        .send({ estado: 'CANCELADO' })
        .expect(403);
    }
  });

  it('devuelve 404 para cada referencia inexistente', async () => {
    for (const cambios of [
      { temporadaId: 2147483647 },
      { equipoLocalId: 2147483647 },
      { equipoVisitanteId: 2147483647 },
      { canchaId: 2147483647 },
      { arbitroId: randomUUID() },
    ])
      await crear(cambios).expect(404);
    await editar(2147483647, { estado: 'CANCELADO' }).expect(404);
    expect(
      (
        await db.query('SELECT 1 FROM jornada WHERE temporada_id=$1', [
          temporadaId,
        ])
      ).rowCount,
    ).toBe(0);
  });

  it('valida equipos distintos, inscritos y pertenecientes a la temporada', async () => {
    await crear({ equipoVisitanteId: equipos[0] }).expect(422);
    await db.query(
      "UPDATE equipo SET estado='PENDIENTE',validado_por=NULL,fecha_validacion=NULL WHERE id=$1",
      [equipos[0]],
    );
    await crear().expect(422);
    await db.query(
      "UPDATE equipo SET estado='INSCRITO',validado_por=$2,fecha_validacion=now() WHERE id=$1",
      [equipos[0], organizadorId],
    );
    const otra = await db.query<{ id: number }>(
      "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2027-01-01','2099-12-31') RETURNING id",
      [`Otra-${randomUUID()}`],
    );
    try {
      await crear({ temporadaId: otra.rows[0].id }).expect(422);
    } finally {
      await db.query('DELETE FROM temporada WHERE id=$1', [otra.rows[0].id]);
    }
  });

  it('valida cancha activa y rol del árbitro', async () => {
    await db.query('UPDATE cancha SET activa=false WHERE id=$1', [canchas[0]]);
    await crear().expect(422);
    await db.query('UPDATE cancha SET activa=true WHERE id=$1', [canchas[0]]);
    await crear({ arbitroId: organizadorId }).expect(422);
    await db.query('UPDATE usuario SET is_active=false WHERE id=$1', [
      arbitros[0],
    ]);
    await crear().expect(422);
  });

  it('lista solo árbitros activos, sin exponer credenciales', async () => {
    await db.query('UPDATE usuario SET is_active=false WHERE id=$1', [
      arbitros[1],
    ]);
    const r = await client()
      .get(`${api}/arbitros`)
      .auth(organizador, { type: 'bearer' })
      .expect(200);
    expect(r.body).toContainEqual({ id: arbitros[0], nombre: 'Usuario BE31' });
    expect(
      (r.body as { id: string }[]).some(
        (a) => a.id === arbitros[1] || a.id === organizadorId,
      ),
    ).toBe(false);
    for (const arbitro of r.body as object[])
      expect(Object.keys(arbitro).sort()).toEqual(['id', 'nombre']);
  });

  it('lista canchas para cualquier sesión y valida el filtro booleano', async () => {
    await db.query('UPDATE cancha SET activa=false WHERE id=$1', [canchas[1]]);
    await client().get(`${api}/canchas?activa=true`).expect(401);
    for (const token of [organizador, jugador, tokenArbitro]) {
      const r = await client()
        .get(`${api}/canchas?activa=true`)
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(r.body).toContainEqual({
        id: canchas[0],
        nombre: expect.any(String),
        direccion: 'Dirección de prueba',
        activa: true,
      });
      expect((r.body as { activa: boolean }[]).every((c) => c.activa)).toBe(
        true,
      );
    }
    const inactivas = await client()
      .get(`${api}/canchas?activa=false`)
      .auth(jugador, { type: 'bearer' })
      .expect(200);
    expect((inactivas.body as { id: number }[]).map((c) => c.id)).toContain(
      canchas[1],
    );
    const todas = await client()
      .get(`${api}/canchas`)
      .auth(jugador, { type: 'bearer' })
      .expect(200);
    expect((todas.body as { id: number }[]).map((c) => c.id)).toEqual(
      expect.arrayContaining(canchas),
    );
    for (const query of [
      'activa=1',
      'activa=',
      'activa=true&activa=false',
      'otro=true',
    ])
      await client()
        .get(`${api}/canchas?${query}`)
        .auth(jugador, { type: 'bearer' })
        .expect(400);
  });

  it('traduce exclusiones de cancha y árbitro a mensajes 409 y permite turnos consecutivos', async () => {
    await crear().expect(201);
    const otros = { equipoLocalId: equipos[2], equipoVisitanteId: equipos[3] };
    const cancha = await crear({
      ...otros,
      arbitroId: arbitros[1],
      inicio: fecha(0, 30),
    }).expect(409);
    expect(cancha.body.message).toBe(
      'Esa cancha ya tiene un partido en ese horario.',
    );
    const arbitro = await crear({
      ...otros,
      canchaId: canchas[1],
      inicio: fecha(0, 30),
    }).expect(409);
    expect(arbitro.body.message).toBe(
      'Ese árbitro ya tiene un partido en ese horario.',
    );
    await crear({ ...otros, inicio: fecha(0, 90) }).expect(201);
  });

  it('el cruce inverso retorna 409 incluso si también incumple la semana', async () => {
    await crear().expect(201);
    const r = await crear({
      equipoLocalId: equipos[1],
      equipoVisitanteId: equipos[0],
      inicio: fecha(0, 180),
    }).expect(409);
    expect(r.body.message).toBe(
      'Esos equipos ya se enfrentan en la temporada.',
    );
  });

  it('protege la semana lunes-domingo y revierte la jornada al fallar', async () => {
    await crear().expect(201);
    const r = await crear({
      equipoVisitanteId: equipos[2],
      jornada: 2,
      inicio: fecha(6, 900),
    }).expect(422);
    expect(r.body.message).toContain('ya tiene un partido esa semana.');
    expect(
      (
        await db.query(
          'SELECT 1 FROM jornada WHERE temporada_id=$1 AND numero=2',
          [temporadaId],
        )
      ).rowCount,
    ).toBe(0);
    // Domingo 23:00 local es lunes 05:00Z; lunes 00:00 local ya es otra semana.
    await crear({
      equipoVisitanteId: equipos[2],
      jornada: 2,
      inicio: fecha(7, -480),
    }).expect(201);
  });

  it('edita sin contarse a sí mismo y recalcula fin; los conflictos no modifican el partido', async () => {
    const primero = await crear().expect(201);
    await editar(primero.body.id as number, { inicio: fecha() }).expect(200);
    const r = await editar(primero.body.id as number, {
      canchaId: canchas[1],
      arbitroId: arbitros[1],
      inicio: fecha(7),
    }).expect(200);
    expect(r.body).toMatchObject({
      inicio: fecha(7),
      fin: fecha(7, 90),
      canchaId: canchas[1],
      arbitroId: arbitros[1],
    });
    await crear({
      equipoLocalId: equipos[2],
      equipoVisitanteId: equipos[3],
      inicio: fecha(7),
    }).expect(201);
    await editar(primero.body.id as number, { canchaId: canchas[0] }).expect(
      409,
    );
    const guardado = await db.query(
      'SELECT cancha_id FROM partido WHERE id=$1',
      [primero.body.id],
    );
    expect(guardado.rows[0].cancha_id).toBe(canchas[1]);
  });

  it('cancelar libera cancha, árbitro, cruce y semana', async () => {
    const r = await crear().expect(201);
    const cancelado = await editar(r.body.id as number, {
      estado: 'CANCELADO',
    }).expect(200);
    expect(cancelado.body.estado).toBe('CANCELADO');
    await crear().expect(201);
    await editar(r.body.id as number, { inicio: fecha(7) }).expect(422);
    await editar(r.body.id as number, { estado: 'CANCELADO' }).expect(422);
  });

  it('exige cancelar por separado y permite cancelar PROGRAMADO pasado con recursos inactivos', async () => {
    const r = await crear().expect(201);
    await editar(r.body.id as number, {
      estado: 'CANCELADO',
      canchaId: canchas[1],
    }).expect(400);
    await db.query(
      "UPDATE partido SET inicio='2000-01-01T14:00:00Z', fin='2000-01-01T15:30:00Z' WHERE id=$1",
      [r.body.id],
    );
    await editar(r.body.id as number, { canchaId: canchas[1] }).expect(400);
    await db.query('UPDATE cancha SET activa=false WHERE id=$1', [canchas[0]]);
    await db.query('UPDATE usuario SET is_active=false WHERE id=$1', [
      arbitros[0],
    ]);
    await editar(r.body.id as number, { estado: 'CANCELADO' }).expect(200);
  });

  it('registra los cambios de una jornada publicada y avisa una vez a cada destinatario', async () => {
    const jugadorVinculado = await usuario('JUGADOR');
    for (const usuarioId of [jugadorVinculado, usuarios[0], null]) {
      const ficha = await db.query<{ id: number }>(
        "INSERT INTO jugador(nombre_completo,fecha_nacimiento,identificacion,foto_url,usuario_id) VALUES ('Ficha H15','2000-01-01',$1,'/foto.jpg',$2) RETURNING id",
        [randomUUID().slice(0, 20), usuarioId],
      );
      const jugadorId = ficha.rows[0].id;
      jugadores.push(jugadorId);
      await db.query(
        'INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES ($1,$2,$3)',
        [equipos[0], jugadorId, temporadaId],
      );
    }

    const r = await crear().expect(201);
    const id = r.body.id as number;
    await editar(id, { inicio: fecha(0, 15) }).expect(200);
    await db.query(
      "UPDATE jornada SET estado='PUBLICADA',publicada_en=now(),publicada_por=$2 WHERE temporada_id=$1",
      [temporadaId, organizadorId],
    );
    await editar(id, { arbitroId: arbitros[1] }).expect(200);
    const cambio = { canchaId: canchas[1], inicio: fecha(1, 30) };
    const resultados = await Promise.all([
      editar(id, cambio).expect(200),
      editar(id, cambio).expect(200),
    ]);
    const [actualizado] = resultados;
    expect(actualizado.body).toMatchObject({
      canchaId: canchas[1],
      inicio: fecha(1, 30),
      fin: fecha(1, 120),
    });

    const cambios = await db.query(
      'SELECT campo_modificado, valor_anterior, valor_nuevo, modificado_por FROM cambio_partido WHERE partido_id=$1',
      [id],
    );
    expect(cambios.rows).toHaveLength(3);
    expect(cambios.rows).toEqual(
      expect.arrayContaining([
        {
          campo_modificado: 'FECHA',
          valor_anterior: fecha().slice(0, 10),
          valor_nuevo: fecha(1).slice(0, 10),
          modificado_por: organizadorId,
        },
        {
          campo_modificado: 'HORA',
          valor_anterior: '08:15:00.000',
          valor_nuevo: '08:30:00.000',
          modificado_por: organizadorId,
        },
        {
          campo_modificado: 'CANCHA',
          valor_anterior: String(canchas[0]),
          valor_nuevo: String(canchas[1]),
          modificado_por: organizadorId,
        },
      ]),
    );

    const avisos = await db.query<{ usuario_id: string; datos: unknown }>(
      "SELECT usuario_id, datos FROM aviso WHERE tipo='PARTIDO_MODIFICADO' AND referencia_tipo='PARTIDO' AND referencia_id=$1",
      [id],
    );
    expect(avisos.rows.map((aviso) => aviso.usuario_id).sort()).toEqual(
      [usuarios[0], usuarios[1], jugadorVinculado].sort(),
    );
    const entregas = await db.query(
      'SELECT e.usuario_id, e.estado, e.intentos FROM entrega_correo e JOIN cambio_partido c ON c.id=e.cambio_id WHERE c.partido_id=$1',
      [id],
    );
    expect(entregas.rows).toHaveLength(3);
    expect(entregas.rows).toEqual(
      expect.arrayContaining(
        [usuarios[0], usuarios[1], jugadorVinculado].map((usuarioId) => ({
          usuario_id: usuarioId,
          estado: 'PENDIENTE',
          intentos: 0,
        })),
      ),
    );
    for (const aviso of avisos.rows) {
      expect(aviso.datos).toMatchObject({
        equipoLocal: 'Equipo 0',
        equipoVisitante: 'Equipo 1',
        cambios: expect.arrayContaining([
          {
            campoModificado: 'CANCHA',
            valorAnterior: expect.stringMatching(/^Cancha /),
            valorNuevo: expect.stringMatching(/^Cancha /),
          },
        ]),
      });
    }
  });

  it('procesa una entrega por destinatario y conserva los avisos al agotar los reintentos', async () => {
    const r = await crear().expect(201);
    const id = r.body.id as number;
    await db.query(
      "UPDATE jornada SET estado='PUBLICADA',publicada_en=now(),publicada_por=$2 WHERE temporada_id=$1",
      [temporadaId, organizadorId],
    );
    await editar(id, { canchaId: canchas[1] }).expect(200);

    const workerPath =
      '../dist/calendario/services/correo-cambio-partido.service.js';
    const proveedorPath =
      '../dist/calendario/services/resend-correo.service.js';
    const { CorreoCambioPartidoService: Worker } = (await import(
      /* @vite-ignore */ workerPath
    )) as {
      CorreoCambioPartidoService: typeof CorreoCambioPartidoService;
    };
    const { ResendCorreoService: Proveedor } = (await import(
      /* @vite-ignore */ proveedorPath
    )) as {
      ResendCorreoService: typeof ResendCorreoService;
    };
    const worker = app.get(Worker);
    const temporal = `${usuarios[0]}@liga.test`;
    const enviar = vi
      .spyOn(app.get(Proveedor), 'enviar')
      .mockImplementation(async (_clave, email) =>
        email === temporal ? 'REINTENTAR' : 'ENVIADO',
      );
    try {
      await Promise.all([
        worker.procesarSiguiente(),
        worker.procesarSiguiente(),
      ]);
      await worker.procesarSiguiente();
      expect(enviar).toHaveBeenCalledTimes(2);
      for (let i = 0; i < 3; i++) {
        await db.query(
          "UPDATE entrega_correo SET ultimo_intento_en=now() - interval '31 seconds' WHERE usuario_id=$1",
          [usuarios[0]],
        );
        await worker.procesarSiguiente();
      }
      await worker.procesarSiguiente();
      expect(enviar).toHaveBeenCalledTimes(5);
      const intentos = enviar.mock.calls.filter(
        ([, email]) => email === temporal,
      );
      expect(intentos).toHaveLength(4);
      expect(new Set(intentos.map(([clave]) => clave)).size).toBe(1);
      const entregas = await db.query(
        'SELECT e.usuario_id, e.estado, e.intentos FROM entrega_correo e JOIN cambio_partido c ON c.id=e.cambio_id WHERE c.partido_id=$1',
        [id],
      );
      expect(entregas.rows).toEqual(
        expect.arrayContaining([
          { usuario_id: usuarios[0], estado: 'FALLIDO', intentos: 4 },
          { usuario_id: usuarios[1], estado: 'ENVIADO', intentos: 1 },
        ]),
      );
      const avisos = await db.query(
        "SELECT id FROM aviso WHERE tipo='PARTIDO_MODIFICADO' AND referencia_tipo='PARTIDO' AND referencia_id=$1",
        [id],
      );
      expect(avisos.rowCount).toBe(2);
    } finally {
      enviar.mockRestore();
    }
  });

  it('vuelve a validar la semana al editar y conserva el horario si falla', async () => {
    await crear().expect(201);
    const segundo = await crear({
      equipoVisitanteId: equipos[2],
      jornada: 2,
      inicio: fecha(7),
    }).expect(201);
    await editar(segundo.body.id as number, { inicio: fecha(1) }).expect(422);
    const guardado = await db.query('SELECT inicio FROM partido WHERE id=$1', [
      segundo.body.id,
    ]);
    expect((guardado.rows[0].inicio as Date).toISOString()).toBe(fecha(7));
  });

  it('revierte la edición y todos los avisos si falla un destinatario de H15', async () => {
    const r = await crear().expect(201);
    const id = r.body.id as number;
    await db.query(
      "UPDATE jornada SET estado='PUBLICADA',publicada_en=now(),publicada_por=$2 WHERE temporada_id=$1",
      [temporadaId, organizadorId],
    );
    const nombre = `be15_fallo_${randomUUID().replaceAll('-', '')}`;
    await db.query(
      `CREATE FUNCTION ${nombre}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo BE15 de prueba'; END; $$`,
    );
    try {
      await db.query(
        `CREATE TRIGGER ${nombre} BEFORE INSERT ON aviso FOR EACH ROW WHEN (NEW.usuario_id='${usuarios[1]}'::uuid AND NEW.tipo='PARTIDO_MODIFICADO') EXECUTE FUNCTION ${nombre}()`,
      );
      await editar(id, { canchaId: canchas[1] }).expect(500);
      const partido = await db.query(
        'SELECT cancha_id FROM partido WHERE id=$1',
        [id],
      );
      expect(partido.rows).toEqual([{ cancha_id: canchas[0] }]);
      const cambios = await db.query(
        'SELECT 1 FROM cambio_partido WHERE partido_id=$1',
        [id],
      );
      const avisos = await db.query(
        "SELECT 1 FROM aviso WHERE tipo='PARTIDO_MODIFICADO' AND referencia_tipo='PARTIDO' AND referencia_id=$1",
        [id],
      );
      expect(cambios.rowCount).toBe(0);
      expect(avisos.rowCount).toBe(0);
    } finally {
      await db.query(`DROP TRIGGER IF EXISTS ${nombre} ON aviso`);
      await db.query(`DROP FUNCTION ${nombre}()`);
    }
  });

  it('revierte partido y jornada si falla la confirmación de la transacción', async () => {
    const nombre = `be31_fallo_${randomUUID().replaceAll('-', '')}`;
    await db.query(
      `CREATE FUNCTION ${nombre}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo BE31 de prueba'; END; $$`,
    );
    try {
      await db.query(
        `CREATE CONSTRAINT TRIGGER ${nombre} AFTER INSERT ON partido DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.temporada_id=${temporadaId}) EXECUTE FUNCTION ${nombre}()`,
      );
      await crear().expect(500);
      expect(
        (
          await db.query('SELECT 1 FROM partido WHERE temporada_id=$1', [
            temporadaId,
          ])
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await db.query('SELECT 1 FROM jornada WHERE temporada_id=$1', [
            temporadaId,
          ])
        ).rowCount,
      ).toBe(0);
    } finally {
      await db.query(`DROP TRIGGER IF EXISTS ${nombre} ON partido`);
      await db.query(`DROP FUNCTION ${nombre}()`);
    }
  });

  it('rechaza cambios sobre partidos en curso o finalizados', async () => {
    const r = await crear().expect(201);
    await db.query(
      "UPDATE partido SET estado='EN_CURSO', inicio_real=inicio WHERE id=$1",
      [r.body.id],
    );
    const cancelacion = await editar(r.body.id as number, {
      estado: 'CANCELADO',
    }).expect(409);
    expect(cancelacion.body.message).toBe(
      'No se puede cambiar de ‘En curso’ a ‘Cancelado’.',
    );
    await editar(r.body.id as number, { canchaId: canchas[1] }).expect(409);
    await db.query(
      "UPDATE partido SET estado='FINALIZADO', fin_real=fin WHERE id=$1",
      [r.body.id],
    );
    await editar(r.body.id as number, { estado: 'CANCELADO' }).expect(422);
    await editar(r.body.id as number, { canchaId: canchas[1] }).expect(422);
  });

  it('dos altas simultáneas del mismo equipo y semana solo guardan una', async () => {
    const resultados = await Promise.all([
      crear(),
      crear({
        equipoVisitanteId: equipos[2],
        canchaId: canchas[1],
        arbitroId: arbitros[1],
        inicio: fecha(1),
      }),
    ]);
    expect(resultados.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 422,
    ]);
    expect(
      (
        await db.query('SELECT 1 FROM partido WHERE temporada_id=$1', [
          temporadaId,
        ])
      ).rowCount,
    ).toBe(1);
  });

  it('dos altas simultáneas de equipos distintos en la misma cancha solo guardan una', async () => {
    const resultados = await Promise.all([
      crear(),
      crear({
        equipoLocalId: equipos[2],
        equipoVisitanteId: equipos[3],
        arbitroId: arbitros[1],
      }),
    ]);
    expect(resultados.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
  });

  it('publica los contratos en Swagger', async () => {
    const r = await client().get('/api/docs-json').expect(200);
    expect(r.body.paths[`${api}/arbitros`].get).toBeDefined();
    expect(r.body.paths[`${api}/partidos`].post.responses['201']).toBeDefined();
    for (const codigo of ['200', '400', '401', '403', '404', '409', '422'])
      expect(
        r.body.paths[`${api}/partidos/{id}`].patch.responses[codigo],
      ).toBeDefined();
  });
});
