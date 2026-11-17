import { Module } from '@nestjs/common';
import { EstadisticasPersonalesController } from './controllers/estadisticas-personales.controller.js';
import { EstadisticasPersonalesService } from './services/estadisticas-personales.service.js';

@Module({
  controllers: [EstadisticasPersonalesController],
  providers: [EstadisticasPersonalesService],
})
export class EstadisticasModule {}
