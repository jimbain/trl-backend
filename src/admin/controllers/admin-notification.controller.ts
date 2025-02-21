import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { NotificationNewBookDto } from '../dto/notification/notification-new-book.dto';
import { AdminNotificationService } from '../services/admin-notification.service';

@Controller('admin/notifications')
export class AdminNotificationController {
  constructor(
    private readonly adminNotificationService: AdminNotificationService,
  ) {}

  @Post('new-book')
  @HttpCode(200)
  async login(@Body() payload: NotificationNewBookDto) {
    return this.adminNotificationService.handleNewBookNotification(payload);
  }
}
