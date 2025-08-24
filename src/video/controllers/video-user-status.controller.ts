import {
  Controller,
  Param,
  UseGuards,
  Request,
  Post,
  HttpCode,
  Get,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { VideoUserStatusService } from '../services/video-user-status.service';
import { VideoUserActionParamsDto } from '../dto/video-user-action-params.dto';

@UseGuards(JwtAuthGuard)
@Controller('user-videos')
export class VideoUserStatusController {
  constructor(
    private readonly videoUserStatusService: VideoUserStatusService,
  ) {}

  @Get()
  getUserVideoStatuses(
    @Request() req,
    @Query('status') status?: 'queued' | 'rented',
  ) {
    return this.videoUserStatusService.findUserVideoStatuses(
      req.user.id,
      status,
    );
  }

  @HttpCode(200)
  @Post(':id/actions/:action')
  videoAction(
    @Param('id') id: string,
    @Param() params: VideoUserActionParamsDto,
    @Request() req,
  ) {
    const { action } = params;
    return this.videoUserStatusService.performAction(
      id,
      action as any,
      req.user,
    );
  }
}
