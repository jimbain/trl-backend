import {
    Controller,
    Get,
    Param,
    Post,
    Query,
    Request,
} from '@nestjs/common';
import { NotificationService } from './notification.service';

@Controller('notification')
export class NotificationController {
    constructor(private readonly notificationService: NotificationService) { }

    @Get()
    findAll(
        @Query() payload: object = {},
    ) {
        return this.notificationService.findAll(payload);
    }

    @Post(":id/read")
    read(
        @Request() req,
        @Param('id') id : number)
    {
        return this.notificationService.read(id, req.user);
    }
}
