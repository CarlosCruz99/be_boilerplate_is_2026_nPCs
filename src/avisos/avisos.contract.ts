import type {
  ModuloOrigenAviso,
  TipoAviso as Tipo,
  ReferenciaAviso,
} from '@PrismaClient';
export {
  ModuloOrigenAviso as ModuloOrigen,
  TipoAviso,
  ReferenciaAviso as TipoReferencia,
} from '@PrismaClient';

export interface CrearAvisoDto {
  moduloOrigen: ModuloOrigenAviso;
  tipo: Tipo;
  destinatario:
    { usuarioId: string } | { equipoId: number; temporadaId: number };
  titulo: string;
  mensaje: string;
  referencia?: { tipo: ReferenciaAviso; id: number };
  datos?: object;
  claveIdempotencia?: string;
}

export interface ResultadoEnvioAvisos {
  avisosCreados: number;
  avisoIds: number[];
}
