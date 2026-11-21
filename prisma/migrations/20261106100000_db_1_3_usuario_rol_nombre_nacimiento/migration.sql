-- DB-1.3: usuario con rol, nombre y fecha de nacimiento.
-- Prisma no detecta renombres (generaria DROP + CREATE y perderia datos),
-- por eso esta migracion se escribe a mano con RENAME.
CREATE TYPE "rol_usuario" AS ENUM ('JUGADOR', 'ARBITRO', 'ORGANIZADOR');

ALTER TABLE "users" RENAME TO "usuario";
-- Prisma espera estos nombres a partir de @@map("usuario"); si no se renombran
-- la proxima `migrate dev` detecta desviacion.
ALTER TABLE "usuario" RENAME CONSTRAINT "users_pkey" TO "usuario_pkey";
ALTER INDEX "users_email_key" RENAME TO "usuario_email_key";

ALTER TABLE "usuario"
  ADD COLUMN "rol" "rol_usuario" NOT NULL DEFAULT 'JUGADOR',
  ADD COLUMN "nombre" VARCHAR(120) NOT NULL DEFAULT 'Usuario de prueba',
  ADD COLUMN "fecha_nacimiento" DATE NOT NULL DEFAULT DATE '2000-01-01',
  ADD CONSTRAINT "ck_usuario_nombre" CHECK (char_length(btrim("nombre")) >= 3),
  ADD CONSTRAINT "ck_usuario_nacimiento" CHECK ("fecha_nacimiento" <= CURRENT_DATE);
