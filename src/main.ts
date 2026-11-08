import { ConfigService } from '@nestjs/config';
import { createApp } from './create-app.js';
import type { EnvConfig } from '@Config';

async function bootstrap() {
  const app = await createApp();
  const configService = app.get(ConfigService<EnvConfig, true>);
  app.enableShutdownHooks();
  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
}

await bootstrap();
