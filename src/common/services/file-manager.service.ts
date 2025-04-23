import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  GetObjectCommandOutput,
  ObjectCannedACL,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class FileManagerService {
  private bucketEndpoint: string;
  private bucketName: string;
  private s3Client: S3Client;

  constructor(private readonly configService: ConfigService) {
    this.bucketEndpoint =
      this.configService.getOrThrow<string>('DO_BUCKET_ENDPOINT');
    this.bucketName = this.configService.getOrThrow<string>('DO_BUCKET_NAME');

    // Initialize S3 client from AWS SDK v3
    this.s3Client = new S3Client({
      endpoint: this.bucketEndpoint,
      region: this.configService.getOrThrow<string>('DO_BUCKET_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('DO_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>(
          'DO_SECRET_ACCESS_KEY',
        ),
      },
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
      ACL: ObjectCannedACL.public_read, // Correct ACL enum for public-read access
    };

    try {
      // Use the PutObjectCommand for uploading a file
      const command = new PutObjectCommand(params);
      await this.s3Client.send(command);

      // Generate file URL manually (since Location is not returned)
      const fileUrl = `${this.bucketEndpoint}/${filePath}`;
      return fileUrl;
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
      // Use the DeleteObjectCommand for deleting a file
      const command = new DeleteObjectCommand(params);
      await this.s3Client.send(command);
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
      // Use the HeadObjectCommand to check if the file exists
      const command = new HeadObjectCommand(params);
      await this.s3Client.send(command);
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
      // Create the command to retrieve the object
      const command = new GetObjectCommand(params);

      // Use the getSignedUrl function to generate the presigned URL
      const url = await getSignedUrl(this.s3Client, command, { expiresIn });

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
