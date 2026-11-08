ALTER TABLE "usuario"
  DROP CONSTRAINT "ck_usuario_nacimiento",
  DROP CONSTRAINT "ck_usuario_nombre",
  DROP COLUMN "fecha_nacimiento",
  DROP COLUMN "nombre",
  DROP COLUMN "rol";
ALTER INDEX "usuario_email_key" RENAME TO "users_email_key";
ALTER TABLE "usuario" RENAME CONSTRAINT "usuario_pkey" TO "users_pkey";
ALTER TABLE "usuario" RENAME TO "users";
DROP TYPE "rol_usuario";
