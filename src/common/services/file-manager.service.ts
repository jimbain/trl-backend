import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';

@Injectable()
export class FileManagerService {
  private bucketEndpoint: string;
  private bucketName: string;
  private s3: AWS.S3;

  constructor(private readonly configService: ConfigService) {
    this.bucketEndpoint =
      this.configService.getOrThrow<string>('DO_BUCKET_ENDPOINT');
    this.bucketName = this.configService.getOrThrow<string>('DO_BUCKET_NAME');

    this.s3 = new AWS.S3({
      endpoint: this.bucketEndpoint,
      accessKeyId: this.configService.getOrThrow<string>('DO_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.getOrThrow<string>(
        'DO_SECRET_ACCESS_KEY',
      ),
      region: this.configService.getOrThrow<string>('DO_BUCKET_REGION'),
    });
  }

  // Function to upload a file to DigitalOcean Spaces
  async uploadFile(
    file: Express.Multer.File,
    folderName: string,
  ): Promise<string> {
    const filePath = `${folderName}/${file.originalname}`;
    const params = {
      Bucket: this.bucketName,
      Key: filePath,
      Body: file.buffer, // The file buffer to upload
      ACL: 'public-read', // Make it publicly accessible
    };

    try {
      const data = await this.s3.upload(params).promise();
      const url = new URL(data.Location);
      return url.pathname.substring(1);
    } catch (error) {
      console.error('Error uploading file:', error);
      throw new Error('File upload failed');
    }
  }

  getFileUrl(filePath: string | null) {
    return filePath ? `${this.bucketEndpoint}/${filePath}` : null;
  }

  // Function to delete a file from DigitalOcean Spaces
  async deleteFile(fileUrl: string): Promise<boolean> {
    const fileKey = fileUrl.replace(`${this.bucketEndpoint}/`, '');
    const params = {
      Bucket: this.bucketName,
      Key: fileKey,
    };

    try {
      await this.s3.deleteObject(params).promise();
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      throw new Error('File deletion failed');
    }
  }

  // Function to check if file exists in the DO Spaces
  async fileExists(fileUrl: string): Promise<boolean> {
    const fileKey = fileUrl.replace(`${this.bucketEndpoint}/`, '');
    const params = {
      Bucket: this.bucketName,
      Key: fileKey,
    };

    try {
      await this.s3.headObject(params).promise();
      return true; // File exists
    } catch (error) {
      return false; // File doesn't exist
    }
  }

  // Function to generate a presigned URL for file download
  async generatePresignedUrl(
    fileUrl: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    const fileKey = fileUrl.replace(`${this.bucketEndpoint}/`, '');
    const params = {
      Bucket: this.bucketName,
      Key: fileKey,
      Expires: expiresIn, // Expiry time for the presigned URL
    };

    try {
      const url = await this.s3.getSignedUrlPromise('getObject', params);
      return url; // Return the presigned URL
    } catch (error) {
      console.error('Error generating presigned URL:', error);
      throw new Error('Failed to generate presigned URL');
    }
  }

  // Optionally add method to handle multiple file uploads (useful for batch uploads)
  async uploadMultipleFiles(
    files: Express.Multer.File[],
    folderName: string,
  ): Promise<string[]> {
    const uploadPromises = files.map((file) =>
      this.uploadFile(file, folderName),
    );
    return Promise.all(uploadPromises);
  }
}
