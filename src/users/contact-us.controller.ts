import {
  Controller,
  Request,
  Post,
  UseGuards,
  Body,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { ContactUsDto } from './dto/contact-us.dto';
import { MailgunService } from 'src/common/services/mailgun.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class ContactUsController {
  constructor(private readonly mailgunService: MailgunService) {}

  @Post('contact-us')
  @HttpCode(200)
  async updateProfile(@Request() req, @Body() payload: ContactUsDto) {
    await this.mailgunService.sendEmail(
      'mashfiqurrr@gmail.com',
      'Contact Us',
      this.mailgunService.getContactUsTemplate(payload),
    );
  }
}
