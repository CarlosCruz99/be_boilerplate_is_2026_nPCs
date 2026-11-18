import { Module } from '@nestjs/common';
import { EstadisticasPersonalesController } from './controllers/estadisticas-personales.controller.js';
import { JugadoresDestacadosController } from './controllers/jugadores-destacados.controller.js';
import { EstadisticasPersonalesService } from './services/estadisticas-personales.service.js';
import { JugadoresDestacadosService } from './services/jugadores-destacados.service.js';

@Module({
  controllers: [
    EstadisticasPersonalesController,
    JugadoresDestacadosController,
  ],
  providers: [EstadisticasPersonalesService, JugadoresDestacadosService],
})
export class EstadisticasModule {}
