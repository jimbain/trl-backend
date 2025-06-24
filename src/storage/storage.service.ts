import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly bucketBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.getOrThrow<string>('DO_BUCKET_REGION');
    this.bucket = this.configService.getOrThrow<string>('DO_BUCKET_NAME');

    this.s3Client = new S3Client({
      endpoint: `https://${this.region}.digitaloceanspaces.com`,
      region: this.region,
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('DO_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>(
          'DO_SECRET_ACCESS_KEY',
        ),
      },
    });

    this.bucketBaseUrl = `https://${this.bucket}.${this.region}.digitaloceanspaces.com`;
  }

  async generateSignedUploadUrl(
    folder: string,
    fileName: string,
    fileType: string,
  ): Promise<{ signedUrl: string; fileUrl: string }> {
    const key = `${folder}/${fileName}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: fileType,
      ACL: 'public-read', // optional, depending on your needs
    });

    const signedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 900, // 15 minutes
    });

    const fileUrl = `${this.bucketBaseUrl}/${key}`;

    return { signedUrl, fileUrl };
  }

  /**
   * Generates a signed URL for viewing an existing object with specified Content-Type.
   * @param key - The object key in the bucket
   * @param expiresInSeconds - URL expiration in seconds (default 900s)
   * @param contentType - The desired Content-Type for the response
   */
  async generateSignedViewUrl(
    key: string,
    expiresInSeconds = 900,
    contentType?: string,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: contentType, // Override Content-Type in response
    });

    return await getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  /**
   * Strips the bucket base URL prefix from a full URL to get the object key path.
   * Example:
   *  input: https://mybucket.region.digitaloceanspaces.com/folder/file.png
   *  output: /folder/file.png
   */
  stripBucketUrl(url: string): string {
    const prefix = `${this.bucketBaseUrl}/`;
    return url?.startsWith(prefix) ? url.slice(prefix.length) : url;
  }
}
