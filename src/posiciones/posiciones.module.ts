import { Module } from '@nestjs/common';
import { PosicionesService } from './posiciones.service.js';

@Module({
  providers: [PosicionesService],
  exports: [PosicionesService],
})
export class PosicionesModule {}
