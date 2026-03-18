import { Injectable } from '@nestjs/common';
import FormData from 'form-data';
import Mailgun from 'mailgun.js';
import { ConfigService } from '@nestjs/config';
import { ContactUsDto } from 'src/users/dto/contact-us.dto';

@Injectable()
export class MailgunService {
  private mailgun: Mailgun;
  private mg: ReturnType<Mailgun['client']>;

  constructor(private readonly config: ConfigService) {
    this.mailgun = new Mailgun(FormData);
    this.mg = this.mailgun.client({
      username: 'api',
      key: this.config.getOrThrow<string>('MAILGUN_API_KEY'),
    });
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string,
    cc?: string,
    bcc?: string,
  ) {
    const data: any = {
      from: this.config.getOrThrow<string>('MAILGUN_FROM_ADDRESS'),
      to,
      subject,
      html: html,
    };

    // Add CC if provided
    if (cc) {
      data.cc = cc;
    }

    // Add BCC if provided
    if (bcc) {
      data.bcc = bcc;
    }

    try {
      const response = await this.mg.messages.create(
        this.config.getOrThrow<string>('MAILGUN_DOMAIN'),
        data,
      );
      return response;
    } catch (error) {
      console.log(error);
      throw new Error(error);
    }
  }

  getOtpEmailTemplate(otp: string): string {
    return `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <div style="background-color: #0a2b5a; color: #ffffff; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Password Reset Request</h1>
          </div>
          <div style="padding: 20px; color: #333333;">
            <p style="font-size: 16px; margin: 0 0 10px;">Hello,</p>
            <p style="font-size: 16px; margin: 0 0 10px;">
              You have requested to reset your password. Please use the OTP below to reset your password. This OTP is valid for 1 hour.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <span style="font-size: 24px; font-weight: bold; background-color: #f8f9fa; padding: 10px 20px; border-radius: 5px; border: 1px solid #dddddd; display: inline-block;">
                ${otp}
              </span>
            </div>
            <p style="font-size: 16px; margin: 0 0 10px;">
              If you did not request this, please ignore this email.
            </p>
            <p style="font-size: 16px; margin: 0;">Thank you!</p>
          </div>
          <div style="background-color: #f8f9fa; color: #888888; padding: 20px; text-align: center;">
            <p style="font-size: 14px; margin: 0;">&copy; 2024 TRL. All rights reserved.</p>
          </div>
        </div>
      </div>
    `;
  }

  getContactUsTemplate(data: ContactUsDto): string {
    return `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <div style="background-color: #0a2b5a; color: #ffffff; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Contact Us Message</h1>
          </div>
          <div style="padding: 20px; color: #333333;">
            <p style="font-size: 16px; margin: 0 0 10px;">Hello Admin,</p>
            <p style="font-size: 16px; margin: 0 0 10px;">
              You have received a new message from the Contact Us form. Here are the details:
            </p>
            <div style="margin: 20px 0;">
              <p><strong>Name:</strong> ${data.name}</p>
              <p><strong>Email:</strong> ${data.email}</p>
              <p><strong>Phone:</strong> ${data.phone || 'N/A'}</p>
              <p><strong>Message:</strong></p>
              <p style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; border: 1px solid #dddddd;">
                ${data.message}
              </p>
            </div>
            <p style="font-size: 16px; margin: 0;">Thank you!</p>
          </div>
          <div style="background-color: #f8f9fa; color: #888888; padding: 20px; text-align: center;">
            <p style="font-size: 14px; margin: 0;">&copy; 2024 TRL. All rights reserved.</p>
          </div>
        </div>
      </div>
    `;
  }
}
