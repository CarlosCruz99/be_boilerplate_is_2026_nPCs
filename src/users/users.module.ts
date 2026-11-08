import { Module } from '@nestjs/common';
import { UsersService } from '@Users/services';
import { UserRepository } from '@Users/repositories';

@Module({
  providers: [UsersService, UserRepository],
  // Se exporta también el repositorio para que otros módulos puedan reutilizar
  // el acceso a datos de usuarios sin pasar por la lógica de UsersService.
  exports: [UsersService, UserRepository],
})
export class UsersModule {}
