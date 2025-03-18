import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
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

  @Post(':id/:eventType')
  @HttpCode(200)
  handleEvent(
    @Request() req,
    @Param('id') id: number,
    @Param('eventType', new ParseEnumPipe(['read', 'expire']))
    eventType: 'read' | 'expire',
  ) {
    return this.notificationService.handleEvent(id, eventType, req.user);
  }
}
