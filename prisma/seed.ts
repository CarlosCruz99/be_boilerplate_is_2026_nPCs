import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PASSWORD_PRUEBA } from './seeds/h1-data.js';
import { seedH1 } from './seeds/h1.js';
import { seedCalendario } from './seed-calendario.js';
import { seedAvisos } from './seed-avisos.js';
import { seedEstadisticas } from './seed-estadisticas.js';

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'Demo1234!';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // `upsert` hace el seed idempotente: se puede correr las veces que haga falta.
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      nombre: 'Usuario de prueba',
      fechaNacimiento: new Date('2000-01-01'),
    },
  });
  console.log(`Usuario demo listo: ${user.email} / ${DEMO_PASSWORD}`);

  // DB-1.2: un solo hash para todas las cuentas de prueba (es lo más rápido y
  // las contraseñas de prueba se documentan en el README).
  const hashPrueba = await bcrypt.hash(PASSWORD_PRUEBA, 12);
  await seedH1(prisma, hashPrueba);
  await seedCalendario(prisma);
  await seedAvisos(prisma);
  await seedEstadisticas(prisma);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
