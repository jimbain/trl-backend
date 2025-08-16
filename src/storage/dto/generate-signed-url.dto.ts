import { IsString, Matches, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export class GenerateSignedUrlDto {
  @IsString()
  @IsIn(['pharma/thumbnails', 'pharma/videos'], {
    message: 'Folder must be either "pharma/thumbnails" or "pharma/videos"',
  })
  folder: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message:
      'File name must only contain letters, numbers, underscores, dots, or hyphens',
  })
  @Transform(({ value }) => {
    if (!value) return value;

    return value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_') // replace spaces with underscores
      .replace(/[^a-z0-9_.-]/gi, ''); // remove disallowed characters
  })
  file_name: string;

  @IsString()
  file_type: string;
}
