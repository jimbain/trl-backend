import {
  Controller,
  Request,
  Post,
  Body,
  HttpCode,
  NotFoundException,
} from '@nestjs/common';
import { ContactUsDto } from './dto/contact-us.dto';
import { MailgunService } from 'src/common/services/mailgun.service';
import { InjectRepository } from '@nestjs/typeorm';
import { AppConfig } from 'src/app-config/entities/app-config.entity';
import { Repository } from 'typeorm';


@Controller()
export class ContactUsController {
  constructor(
    private readonly mailgunService: MailgunService,
    @InjectRepository(AppConfig)
    private readonly appConfigRepository: Repository<AppConfig>,
  ) {}

  @Post('contact-us')
  @HttpCode(200)
  async updateProfile(@Request() req, @Body() payload: ContactUsDto) {
    const contactUsEmail = await this.appConfigRepository.findOne({
      select: ['value'],
      where: { key: 'contact_us_email' },
    });

    if (!contactUsEmail || !contactUsEmail.value) {
      throw new NotFoundException(
        'Contact us admin email is missing in config',
      );
    }

    await this.mailgunService.sendEmail(
      contactUsEmail.value,
      'Contact Us',
      this.mailgunService.getContactUsTemplate(payload),
    );
  }
}
