import { globSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const escrituraPrisma =
  /(?:\.\s*aviso\b|\[\s*['"]aviso['"]\s*\])\s*(?:\.\s*|\[\s*['"])(?:create(?:Many(?:AndReturn)?)?|update(?:Many(?:AndReturn)?)?|upsert|delete(?:Many)?)\b/;
const escrituraSql =
  /\b(?:insert\s+into|update|delete\s+from|merge\s+into|truncate(?:\s+table)?)\s+(?:only\s+)?(?:(?:\w+|"[^"]+")\s*\.\s*)?"?aviso"?(?=\s|[(;`'"]|$)/i;

describe('BE-20.2 · centralización de escrituras de avisos', () => {
  it('restringe las escrituras de aviso al código de AvisosModule', () => {
    const raiz = fileURLToPath(new URL('../../', import.meta.url));
    const archivos = globSync('src/**/*.ts', { cwd: raiz });
    expect(archivos).toContain(join('src', 'app.module.ts'));
    const infracciones = archivos
      .filter(
        (archivo) =>
          !archivo.startsWith(`src${sep}avisos${sep}`) &&
          !archivo.startsWith(`src${sep}generated${sep}`) &&
          !archivo.endsWith('.spec.ts'),
      )
      .filter((archivo) => {
        const contenido = readFileSync(join(raiz, archivo), 'utf8');
        return escrituraPrisma.test(contenido) || escrituraSql.test(contenido);
      });

    expect(infracciones).toEqual([]);
  });
});
