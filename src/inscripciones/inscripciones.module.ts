import { Module } from '@nestjs/common';
import { EquiposController } from './controllers/equipos.controller.js';
import { TemporadasController } from './controllers/temporadas.controller.js';
import { EquiposService } from './services/equipos.service.js';
import { TemporadasService } from './services/temporadas.service.js';

@Module({
  controllers: [EquiposController, TemporadasController],
  providers: [EquiposService, TemporadasService],
})
export class InscripcionesModule {}
