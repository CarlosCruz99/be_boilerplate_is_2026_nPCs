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
    .setTitle('SI Backend Boilerplate')
    .setDescription('API REST con autenticación por usuario y contraseña.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );
  return app;
}
