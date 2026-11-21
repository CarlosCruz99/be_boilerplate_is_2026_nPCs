import { Body, Controller, Post, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../auth/decorators/public.decorator.js';
import { AuthService } from '../../auth/services/auth.service.js';
import { CreateUserDto } from '@Users/dto';
import { RegisteredUserDto } from '../dto/registered-user.dto.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Registro. Crear un usuario es crear un recurso, así que es un POST a la
   * colección `/users` y responde 201 (el default de Nest para POST).
   */
  @Public()
  @Post()
  @ApiOperation({ summary: 'Registra un nuevo usuario' })
  @ApiCreatedResponse({
    type: RegisteredUserDto,
    headers: {
      'X-Access-Token': {
        description: 'JWT de acceso.',
        schema: { type: 'string' },
      },
      'X-Refresh-Token': {
        description: 'Token de renovación.',
        schema: { type: 'string' },
      },
      'X-Token-Expires-In': {
        description: 'Vigencia del JWT en segundos.',
        schema: { type: 'integer' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Datos inválidos o campo no permitido.',
  })
  @ApiConflictResponse({ description: 'Este correo ya está registrado.' })
  async create(
    @Body() dto: CreateUserDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RegisteredUserDto> {
    const { user, tokens } = await this.authService.register(dto);
    response.set({
      'Cache-Control': 'no-store',
      'X-Access-Token': tokens.accessToken,
      'X-Refresh-Token': tokens.refreshToken,
      'X-Token-Expires-In': String(tokens.expiresIn),
    });
    return RegisteredUserDto.fromEntity(user);
  }
}
