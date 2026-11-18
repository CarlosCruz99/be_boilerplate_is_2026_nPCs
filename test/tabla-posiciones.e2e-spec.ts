import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CrearApp } from '../src/create-app.js';

describe('BE-7.1: posiciones públicas y solo lectura', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let temporadaId: number;
  let anteriorId: number;
  let anteriores: number[];
  let equipos: number[];
  let usuarios: string[];
  let organizador: string;
  let jugador: string;
  let organizadorId: string;
  const cliente = () => request(app.getHttpServer());
  const base = '/api/v1/posiciones';
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
      return r.body.accessToken as string;
    };
    organizador = await login('organizador@liga.test');
    jugador = await login('demo@example.com', 'Demo1234!');
    organizadorId = (
      await cliente()
        .get('/api/v1/auth/me')
        .auth(organizador, { type: 'bearer' })
        .expect(200)
    ).body.id;
    anteriores = (
      await db.query('SELECT id FROM temporada WHERE actual=true')
    ).rows.map((r) => r.id);
    await db.query('UPDATE temporada SET actual=false WHERE actual=true');
    temporadaId = (
      await db.query(
        "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin,actual) VALUES ($1,'2060-01-01','2060-12-31',true) RETURNING id",
        ['H7-' + randomUUID()],
      )
    ).rows[0].id;
    anteriorId = (
      await db.query(
        "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2059-01-01','2059-12-31') RETURNING id",
        ['H7-anterior-' + randomUUID()],
      )
    ).rows[0].id;
    equipos = [];
    usuarios = [];
    // Orden de inserción adverso; cada escalón ejercita un desempate diferente.
    const filas = [
      { nombre: 'Zeta', puntos: 8, dg: 4, gf: 9 },
      { nombre: 'Alfa', puntos: 8, dg: 4, gf: 9 },
      { nombre: 'Goles', puntos: 8, dg: 4, gf: 10 },
      { nombre: 'Diferencia', puntos: 8, dg: 5, gf: 10 },
      { nombre: 'Líder', puntos: 9, dg: 5, gf: 10 },
      { nombre: 'Cero', puntos: 0, dg: 0, gf: 0 },
    ];
    for (let i = 0; i < filas.length + 2; i++) {
      const user = randomUUID();
      usuarios.push(user);
      await db.query(
        "INSERT INTO usuario(id,email,password_hash,nombre,fecha_nacimiento,updated_at) VALUES ($1,$2,'sin-login','Capitán H7','1990-01-01',now())",
        [user, user + '@liga.test'],
      );
      const equipo = (
        await db.query(
          "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
          [
            filas[i]?.nombre ?? 'Sin fila',
            i === filas.length + 1 ? anteriorId : temporadaId,
            user,
            organizadorId,
          ],
        )
      ).rows[0].id;
      equipos.push(equipo);
      if (i === filas.length) continue; // Inscrito sin posición: la vista no lo incluye.
      const fila = filas[i] ?? { puntos: 99, dg: 99, gf: 99 };
      const pg = Math.floor(fila.puntos / 3),
        pe = fila.puntos % 3;
      await db.query(
        'INSERT INTO posicion(temporada_id,equipo_id,pj,pg,pe,pp,gf,gc,dg,puntos) VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9)',
        [
          i === filas.length + 1 ? anteriorId : temporadaId,
          equipo,
          pg + pe,
          pg,
          pe,
          fila.gf,
          fila.gf - fila.dg,
          fila.dg,
          fila.puntos,
        ],
      );
    }
  }, 30000);
  afterAll(async () => {
    if (db) {
      await db.query('DELETE FROM posicion WHERE temporada_id=ANY($1::int[])', [
        [temporadaId, anteriorId],
      ]);
      await db.query('DELETE FROM equipo WHERE temporada_id=ANY($1::int[])', [
        [temporadaId, anteriorId],
      ]);
      await db.query('DELETE FROM temporada WHERE id=ANY($1::int[])', [
        [temporadaId, anteriorId],
      ]);
      await db.query('DELETE FROM usuario WHERE id=ANY($1::uuid[])', [
        usuarios ?? [],
      ]);
      await db.query(
        'UPDATE temporada SET actual=true WHERE id=ANY($1::int[])',
        [anteriores ?? []],
      );
    }
    await app?.close();
    await db?.end();
  });
  it('sin sesión devuelve la tabla ordenada por puntos, DG, GF y nombre', async () => {
    const inicio = Date.now();
    const r = await cliente().get(base).expect(200);
    expect(Date.now() - inicio).toBeLessThan(2000);
    expect(r.body.temporadaId).toBe(temporadaId);
    expect(r.body.posiciones.map((p: { equipo: string }) => p.equipo)).toEqual([
      'Líder',
      'Diferencia',
      'Goles',
      'Alfa',
      'Zeta',
      'Cero',
    ]);
    expect(r.body.posiciones.map((p: { lugar: number }) => p.lugar)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(r.body.posiciones[5]).toEqual({
      lugar: 6,
      equipoId: equipos[5],
      equipo: 'Cero',
      pj: 0,
      pg: 0,
      pe: 0,
      pp: 0,
      gf: 0,
      gc: 0,
      dg: 0,
      puntos: 0,
    });
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body).not.toHaveProperty('proximosRivales');
  });
  it('el detalle conserva el lugar de la tabla, no vuelve a numerar desde 1', async () => {
    const tabla = (await cliente().get(base).expect(200)).body.posiciones;
    const r = await cliente().get(`${base}/equipos/${equipos[0]}`).expect(200);
    expect(r.body).toEqual(
      tabla.find((p: { equipoId: number }) => p.equipoId === equipos[0]),
    );
    expect(r.body.lugar).toBe(5);
  });
  it('es público para cualquier sesión o token inválido y no cambia datos', async () => {
    const antes = (
      await db.query(
        'SELECT * FROM posicion WHERE temporada_id=$1 ORDER BY equipo_id',
        [temporadaId],
      )
    ).rows;
    for (const token of [organizador, jugador, 'invalido'])
      await cliente().get(base).auth(token, { type: 'bearer' }).expect(200);
    expect(
      (
        await db.query(
          'SELECT * FROM posicion WHERE temporada_id=$1 ORDER BY equipo_id',
          [temporadaId],
        )
      ).rows,
    ).toEqual(antes);
  });
  it('equipo inexistente, de otra temporada o sin fila devuelve 404', async () => {
    for (const id of [2147483647, equipos[6], equipos[7]])
      await cliente().get(`${base}/equipos/${id}`).expect(404);
  });
  it.each(['0', '-1', 'abc', '1.5', '2147483648'])(
    'rechaza id %s',
    async (id) => {
      await cliente().get(`${base}/equipos/${id}`).expect(400);
    },
  );
  it('temporada actual sin posiciones devuelve 200 vacío; sin temporada actual devuelve 404', async () => {
    await db.query('UPDATE temporada SET actual=false WHERE id=$1', [
      temporadaId,
    ]);
    const vacia = (
      await db.query(
        "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin,actual) VALUES ($1,'2061-01-01','2061-12-31',true) RETURNING id",
        ['H7-vacía-' + randomUUID()],
      )
    ).rows[0].id;
    try {
      expect((await cliente().get(base).expect(200)).body).toEqual({
        temporadaId: vacia,
        posiciones: [],
      });
      await db.query('UPDATE temporada SET actual=false WHERE id=$1', [vacia]);
      const r = await cliente().get(base).expect(404);
      expect(r.body.message).toBe('No hay temporada actual.');
    } finally {
      await db.query('DELETE FROM temporada WHERE id=$1', [vacia]);
      await db.query('UPDATE temporada SET actual=true WHERE id=$1', [
        temporadaId,
      ]);
    }
  });
  it.each(['post', 'put', 'patch', 'delete'] as const)(
    '%s devuelve 405 en ambas rutas, también sin sesión',
    async (metodo) => {
      const antes = (
        await db.query(
          'SELECT * FROM posicion WHERE temporada_id=$1 ORDER BY equipo_id',
          [temporadaId],
        )
      ).rows;
      for (const ruta of [base, `${base}/equipos/${equipos[0]}`]) {
        const r = await cliente()
          [metodo](ruta)
          .send({ puntos: 999 })
          .expect(405);
        expect(r.headers.allow).toContain('GET');
        await cliente()
          [metodo](ruta)
          .auth(organizador, { type: 'bearer' })
          .send({ puntos: 999 })
          .expect(405);
      }
      expect(
        (
          await db.query(
            'SELECT * FROM posicion WHERE temporada_id=$1 ORDER BY equipo_id',
            [temporadaId],
          )
        ).rows,
      ).toEqual(antes);
    },
  );
  it('documenta únicamente GET en Swagger', async () => {
    const r = await cliente().get('/api/docs-json').expect(200);
    for (const ruta of [base, `${base}/equipos/{equipoId}`]) {
      const metodos = r.body.paths[ruta];
      expect(metodos.get).toBeDefined();
      for (const metodo of ['post', 'put', 'patch', 'delete'])
        expect(metodos[metodo]).toBeUndefined();
    }
  });
});
