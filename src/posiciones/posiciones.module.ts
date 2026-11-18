import { Module } from '@nestjs/common';
import { PosicionesService } from './posiciones.service.js';
import { ConsultaPosicionesService } from './consulta-posiciones.service.js';
import { TablaPosicionesController } from './tabla-posiciones.controller.js';

@Module({
  controllers: [TablaPosicionesController],
  providers: [PosicionesService, ConsultaPosicionesService],
  exports: [PosicionesService],
})
export class PosicionesModule {}
