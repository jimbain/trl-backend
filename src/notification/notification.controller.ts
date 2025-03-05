import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  findAll(@Query() payload: object = {}, @Request() req) {
    return this.notificationService.findAll(payload, req.user);
  }

  @Post(':id/read')
  read(@Request() req, @Param('id') id: number) {
    return this.notificationService.read(id, req.user);
  }
}
