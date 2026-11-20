import { Module } from '@nestjs/common';
import { ConsultaGaleriaService } from './consulta-galeria.service.js';
import { GaleriaController } from './galeria.controller.js';
import { GaleriaService } from './galeria.service.js';

@Module({
  controllers: [GaleriaController],
  providers: [GaleriaService, ConsultaGaleriaService],
})
export class GaleriaModule {}
