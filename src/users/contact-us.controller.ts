import {
  Controller,
  Post,
  Body,
  HttpCode,
  NotFoundException,
} from '@nestjs/common';
import { ContactUsDto } from './dto/contact-us.dto';
import { MailgunService } from 'src/common/services/mailgun.service';
import { InjectRepository } from '@nestjs/typeorm';
import { AppConfig } from 'src/app-config/entities/app-config.entity';
import { Repository, In } from 'typeorm';

@Controller()
export class ContactUsController {
  constructor(
    private readonly mailgunService: MailgunService,
    @InjectRepository(AppConfig)
    private readonly appConfigRepository: Repository<AppConfig>,
  ) {}

  /**
   * Helper method to parse comma-separated emails from config
   */
  private parseEmailList(
    emailString: string | null | undefined,
  ): string | undefined {
    if (!emailString) return undefined;
    return emailString
      .split(',')
      .map((email) => email.trim())
      .filter((email) => email.length > 0)
      .join(',');
  }

  @Post('contact-us')
  @HttpCode(200)
  async updateProfile(@Body() payload: ContactUsDto) {
    // Fetch all email configs in a single query using In operator
    const emailConfigs = await this.appConfigRepository.find({
      select: ['key', 'value'],
      where: {
        key: In([
          'contact_us_admin_email',
          'contact_us_admin_email_cc',
          'contact_us_admin_email_bcc',
        ]),
      },
    });

    // Map configs by key for easy access
    const configMap = emailConfigs.reduce(
      (map, config) => {
        map[config.key] = config.value;
        return map;
      },
      {} as Record<string, string>,
    );

    // Get main email (required)
    const mainEmail = configMap['contact_us_admin_email'];
    if (!mainEmail) {
      throw new NotFoundException(
        'Contact us admin email is missing in config',
      );
    }

    // Parse CC and BCC emails (optional)
    const ccEmails = this.parseEmailList(
      configMap['contact_us_admin_email_cc'],
    );
    const bccEmails = this.parseEmailList(
      configMap['contact_us_admin_email_bcc'],
    );

    await this.mailgunService.sendEmail(
      mainEmail,
      'Contact Us',
      this.mailgunService.getContactUsTemplate(payload),
      ccEmails,
      bccEmails,
    );
  }
}
