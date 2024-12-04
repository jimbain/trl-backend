import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import axios from 'axios';

@Injectable()
export class FirebaseService {
  private readonly SCOPES = [
    'https://www.googleapis.com/auth/firebase.messaging',
  ];
  private readonly SERVICE_ACCOUNT_FILE =
    '/home/axil-mashfiq/Videos/DEV-DEC/TRL/cred/trl-app-68d7f-firebase-adminsdk-gpx9w-7d87ecd046.json';
  private readonly FCM_URL =
    'https://fcm.googleapis.com/v1/projects/trl-app-68d7f/messages:send';

  async getAccessToken(): Promise<string> {
    const auth = new google.auth.GoogleAuth({
      scopes: this.SCOPES,
      keyFile: this.SERVICE_ACCOUNT_FILE,
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
      const response = await axios.post(this.FCM_URL, message, {
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
