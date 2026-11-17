import { Module } from '@nestjs/common';
import { GaleriaController } from './galeria.controller.js';
import { GaleriaService } from './galeria.service.js';

@Module({
  controllers: [GaleriaController],
  providers: [GaleriaService],
})
export class GaleriaModule {}
