import { Controller, Get, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { MailgunService } from './common/services/mailgun.service';
import { FirebaseService } from './common/services/firebase.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly mailgunService: MailgunService,
    private readonly firebaseService: FirebaseService,

  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('test-email')
  async sendEmail(@Query('to') to: string) {
    try {
      const response = await this.mailgunService.sendEmail(
        to,
        'Test email for TRL through Mailgun',
        '<h1>Hello World</h1>',
      );
      return response.status === 200;
    } catch (error) {
      return { message: error.message };
    }
  }

  @Get('send-firebase-notification')
  async sendFireBaseNotification() {
    try {
      const data = {
        token: "cPEsrW3cQMqZpWqPDgH6tp:APA91bG_iDXFdupQi33HAxXlfiNWNyYT1McoCLUWu9zYoxw6IPRBko_stD9ov_S7DDJiBF9CXTvHC9zOhYfpaZS5kj_Ga6JWcvE4kSkpzMmkPD19ql0DnLY",
        notification: {
          title: "Audio mobile app",
          body: "Audio mobile app description"
        },
      }

      await this.firebaseService.sendNotification(data);
      
      return { message: 'Notification sent successfully' };
    } catch (error) {
      return { message: error.message };
    }
  }
}
