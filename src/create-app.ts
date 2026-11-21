import {
  BadRequestException,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

export async function createApp() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'uploads/jugadores/:archivo', method: RequestMethod.GET },
    ],
  });

  const defaultValidationError = new ValidationPipe().createExceptionFactory();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        errors.some((error) => error.constraints?.whitelistValidation)
          ? new BadRequestException('Campo no permitido.')
          : defaultValidationError(errors),
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('nPCs — Plataforma de gestión deportiva (Liga amateur)')
    .setDescription(
      'API REST de nPCs para registro y validación de equipos, calendario, partidos, ' +
        'marcadores, posiciones, estadísticas, cuotas, pagos, notificaciones, galería ' +
        'y reportes. Los roles y la propiedad de los recursos se verifican en el servidor.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );
  return app;
}
