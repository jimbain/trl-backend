import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AudioEngineService {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiUrl = this.configService.getOrThrow<string>('AUDIO_ENGINE_API_BASE_URL');
    this.apiKey = this.configService.getOrThrow<string>('AUDIO_ENGINE_API_KEY');
  }

  private getHeaders(customHeaders?: Record<string, string>) {
    return {
      'Content-Type': 'application/json',
      'API-KEY': this.apiKey,
      ...customHeaders,
    };
  }

  async get<T>(
    endpoint: string,
    params?: Record<string, any>,
    customHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.apiUrl}${endpoint}`;
    try {
      const response = await this.httpService.axiosRef.get(url, {
        headers: this.getHeaders(customHeaders),
        params,
      });
      return response.data;
    } catch (error) {
      throw new BadRequestException(`GET request failed: ${error.message}`);
    }
  }

  async post<T>(
    endpoint: string,
    data: Record<string, any>,
    customHeaders?: Record<string, string>,
    overwriteHeaders: boolean = false
  ): Promise<T> {
    const url = `${this.apiUrl}${endpoint}`;

    try {
      const response = await this.httpService.axiosRef.post(url, data, {
        headers: overwriteHeaders ? customHeaders : this.getHeaders(customHeaders),
      });

      return response.data;
    } catch (error) {
      throw new BadRequestException(`POST request failed: ${error.message}`);
    }
  }

  async put<T>(
    endpoint: string,
    data: Record<string, any>,
    customHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.apiUrl}${endpoint}`;
    try {
      const response = await this.httpService.axiosRef.put(url, data, {
        headers: this.getHeaders(customHeaders),
      });
      return response.data;
    } catch (error) {
      throw new BadRequestException(`PUT request failed: ${error.message}`);
    }
  }

  async delete<T>(
    endpoint: string,
    customHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.apiUrl}${endpoint}`;
    try {
      const response = await this.httpService.axiosRef.delete(url, {
        headers: this.getHeaders(customHeaders),
      });
      return response.data;
    } catch (error) {
      throw new BadRequestException(`DELETE request failed: ${error.message}`);
    }
  }

  async getSessionKey(){
    const session: {key: string} = await this.post("/sessions", {
      account_ids: [this.configService.getOrThrow<string>('AUDIO_ENGINE_ACCOUNT_ID')],
      external_listener_id: this.configService.getOrThrow<string>('AUDIO_ENGINE_EXTERNAL_LISTENER_ID')
    });

    return session.key;
  }
}
