import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { CreateMediaDto } from './dto/create-media.dto';
import { MediaService } from './media.service';

@Controller('sac-media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post()
  async register(
    @Body() dto: CreateMediaDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.mediaService.register(dto);
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);

    return {
      created: result.created,
      media: result.media,
    };
  }
}
