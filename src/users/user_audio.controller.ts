import {
  Controller,
  Param,
  UseGuards,
  Request,
  Post,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UserAudioService } from './user_audio.service';
import { UserAudioActionParamsDto } from './dto/user-audio-action-params.dto';

@UseGuards(JwtAuthGuard)
@Controller('user-audios')
export class UserAudioController {
  constructor(private readonly userAudioService: UserAudioService) {}

  @HttpCode(200)
  @Post(':audioId/actions/:action')
  audioAction(
    @Param('audioId') audioId: string,
    @Param() params: UserAudioActionParamsDto,
    @Request() req,
  ) {
    const { action } = params;

    if (action === 'queue') {
      return this.userAudioService.queueAudio(audioId, req.user);
    } else if (action === 'dequeue') {
      return this.userAudioService.dequeueAudio(audioId, req.user);
    } else if (action === 'renew') {
      return this.userAudioService.renewRentedAudio(audioId, req.user);
    } else if (action === 'return') {
      return this.userAudioService.returnRentedAudio(audioId, req.user);
    } else if (action === 'rent') {
      return this.userAudioService.rentAudio(audioId, req.user);
    } else if (action === 'bookself') {
      return this.userAudioService.bookselfAudio(audioId, req.user);
    }
  }
}
