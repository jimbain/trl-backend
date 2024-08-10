import { Controller, Get, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { MailgunService } from './common/services/mailgun.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly mailgunService: MailgunService
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('test-email')
  async sendEmail(@Query('to') to: string) {
    try {
      const response = await this.mailgunService.sendEmail(to, "Test email for TRL through Mailgun");
      return response;
    } catch (error) {
      return { message: error.message };
    }
  }
}
