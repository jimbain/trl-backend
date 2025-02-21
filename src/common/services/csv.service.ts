import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class CsvService {
  parse(file: Express.Multer.File, requiredColumns: string[]) {
    if (!file.mimetype.includes('csv')) {
      throw new BadRequestException(
        'Invalid file format. Only CSV file is allowed.',
      );
    }

    const fileContent = file.buffer.toString('utf-8'); // Convert buffer to string
    const lines = fileContent
      .split(/\r?\n/)
      .filter((line) => line.trim() !== ''); // Split into lines & remove empty lines

    if (lines.length < 2) {
      throw new BadRequestException(
        'CSV file must contain at least one data row.',
      );
    }

    const headers = lines[0]
      .split(',')
      .map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));

    // Check if required columns exist
    const missingColumns = requiredColumns.filter(
      (col) => !headers.includes(col),
    );

    if (missingColumns.length > 0) {
      throw new BadRequestException(
        `Missing columns: ${missingColumns.join(', ')}`,
      );
    }

    const data = lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim());
      return headers.reduce(
        (acc, header, index) => {
          acc[header] = values[index] || null; // Assign value or null if missing
          return acc;
        },
        {} as Record<string, string | null>,
      );
    });

    return data;
  }
}
