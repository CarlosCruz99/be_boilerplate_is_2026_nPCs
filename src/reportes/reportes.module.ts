import { Module } from '@nestjs/common';
import { ReportePagosController } from './reporte-pagos.controller.js';
import { ReportePagosService } from './reporte-pagos.service.js';

@Module({
  controllers: [ReportePagosController],
  providers: [ReportePagosService],
})
export class ReportesModule {}
