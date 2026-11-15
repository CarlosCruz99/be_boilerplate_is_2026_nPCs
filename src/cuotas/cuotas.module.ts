import { Module } from '@nestjs/common';
import { AvisosModule } from '../avisos/avisos.module.js';
import { CuotasController } from './cuotas.controller.js';
import { CuotasService } from './cuotas.service.js';
@Module({
  imports: [AvisosModule],
  controllers: [CuotasController],
  providers: [CuotasService],
})
export class CuotasModule {}
