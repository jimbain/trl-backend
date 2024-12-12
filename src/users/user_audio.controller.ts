import {
  Controller,
  Patch,
  Param,
  UseGuards,
  Request,
  Post,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UserAudioService } from './user_audio.service';

@UseGuards(JwtAuthGuard)
@Controller('user-audios')
export class UserAudioController {
  constructor(private readonly userAudioService: UserAudioService) {}

  @Patch(':audioId/status/:status')
  update(
    @Param('audioId') audioId: string,
    @Param('status') status: 'queued' | 'rented' | 'bookshelved',
    @Request() req,
  ) {
    return this.userAudioService.update(audioId, status, req.user);
  }
  
  @HttpCode(200)
  @Post(':audioId/dequeue')
  dequeueAudio(@Param('audioId') audioId: string, @Request() req) {
    return this.userAudioService.dequeueAudio(audioId, req.user);
  }

  @HttpCode(200)
  @Post(':audioId/renew')
  renewRentedAudio(@Param('audioId') audioId: string, @Request() req) {
    return this.userAudioService.renewRentedAudio(audioId, req.user);
  }
}
