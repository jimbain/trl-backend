import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FirebaseService {
  private readonly SCOPES: string;
  private readonly SERVICE_ACCOUNT_FILE_PATH: string;
  private readonly FCM_URL: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.SCOPES = 'https://www.googleapis.com/auth/firebase.messaging';
    this.SERVICE_ACCOUNT_FILE_PATH = this.configService.getOrThrow<string>(
      'FIREBASE_SERVICE_ACCOUNT_FILE_PATH',
    );
    this.FCM_URL = 'https://fcm.googleapis.com/v1/projects/trl-app-68d7f/messages:send';
  }

  async getAccessToken(): Promise<string> {
    const auth = new google.auth.GoogleAuth({
      scopes: this.SCOPES,
      keyFile: this.SERVICE_ACCOUNT_FILE_PATH,
    });

    const client = await auth.getClient();
    const accessTokenResponse = await client.getAccessToken();

    if (!accessTokenResponse?.token) {
      throw new Error('Unable to retrieve access token');
    }
    return accessTokenResponse.token;
  }

  async sendNotification(data: object): Promise<void> {
    const accessToken = await this.getAccessToken();

    const message = { message: data };

    try {
      const response = await this.httpService.axiosRef.post(this.FCM_URL, message, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      console.log('Notification sent successfully:', response.data);
    } catch (error) {
      console.error(
        'Error sending notification:',
        error.response?.data || error.message,
      );
    }
  }
}
