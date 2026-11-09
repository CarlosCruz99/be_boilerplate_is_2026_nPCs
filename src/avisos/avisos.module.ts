import { Module } from '@nestjs/common';
import { AvisosService } from './services/avisos.service.js';
@Module({ providers: [AvisosService], exports: [AvisosService] })
export class AvisosModule {}
