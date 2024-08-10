import { Injectable } from '@nestjs/common';
import FormData from 'form-data';
import Mailgun from 'mailgun.js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailgunService {
  private mailgun: Mailgun;
  private mg: ReturnType<Mailgun['client']>;

  constructor(
    private readonly config: ConfigService,
  ) {
    this.mailgun = new Mailgun(FormData);
    this.mg = this.mailgun.client({ 
      username: 'api', 
      key: this.config.getOrThrow<string>('MAILGUN_API_KEY') 
    });
  }

  async sendEmail(to: string, subject: string) {
    const data = {
      from: this.config.getOrThrow<string>('MAILGUN_FROM_ADDRESS'),
      to,
      subject,
      html: "<h1>Hello World</h1>",
    };

    try {
      const response = await this.mg.messages.create(this.config.getOrThrow<string>('MAILGUN_DOMAIN') , data);
      return response;
    } catch (error) {
      console.log(error)
      throw new Error(error);
    }
  }
}
