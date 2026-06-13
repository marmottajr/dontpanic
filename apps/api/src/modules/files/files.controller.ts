import {
  BadRequestException,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import type { AvatarResponse } from '@dontpanic/shared';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { AvatarService } from './services/avatar.service';

/** @fastify/multipart augments FastifyRequest with `isMultipart()` and `file()`. */
type MultipartRequest = FastifyRequest & {
  isMultipart: () => boolean;
  file: () => Promise<{ toBuffer: () => Promise<Buffer> } | undefined>;
};

@ApiTags('users')
@Controller('users/me/avatar')
export class FilesController {
  constructor(private readonly avatars: AvatarService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an avatar image (PNG/JPEG/WebP, <=5MB)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  async uploadAvatar(
    @CurrentUser() user: AuthUser,
    @Req() req: MultipartRequest,
  ): Promise<AvatarResponse> {
    if (!req.isMultipart()) {
      throw new BadRequestException('Expected a multipart/form-data upload.');
    }

    const part = await req.file();
    if (!part) {
      throw new BadRequestException('No file field found in the request.');
    }

    // toBuffer() respects the registered fileSize limit and throws on overflow.
    const buffer = await part.toBuffer();
    return this.avatars.uploadAvatar(user.id, buffer);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove the current avatar' })
  async deleteAvatar(@CurrentUser() user: AuthUser): Promise<AvatarResponse> {
    return this.avatars.deleteAvatar(user.id);
  }
}
