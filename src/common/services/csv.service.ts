import { BadRequestException, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';

@Injectable()
export class CsvService {
  parse(file: Express.Multer.File, requiredColumns: string[]) {
    // Validate file extension and MIME type (Windows may send different MIME types)
    const validMimeTypes = [
      'text/csv',
      'application/csv',
      'text/x-csv',
      'application/vnd.ms-excel',
      'text/plain',
    ];
    const isValidExtension = file.originalname.toLowerCase().endsWith('.csv');
    const isValidMimeType = validMimeTypes.some((type) =>
      file.mimetype.includes(type),
    );

    if (!isValidExtension || !isValidMimeType) {
      throw new BadRequestException(
        'Invalid file format. Only CSV file is allowed.',
      );
    }

    let records: any[];

    try {
      // Use csv-parse for proper CSV parsing (handles quotes, commas in values, etc.)
      records = parse(file.buffer, {
        columns: (header) => {
          // Normalize headers
          return header.map((h: string) => {
            const normalized = h.trim().toLowerCase().replace(/\s+/g, '_');
            // Map various email column variations to 'email'
            if (normalized === 'email_address') {
              return 'email';
            }
            return normalized;
          });
        },
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true, // Allow quotes in unquoted fields
        relax_column_count: true, // Don't fail if row has different number of columns
      });
    } catch (error) {
      throw new BadRequestException(
        `Failed to parse CSV file: ${error.message}`,
      );
    }

    if (!records || records.length === 0) {
      throw new BadRequestException(
        'CSV file must contain at least one data row.',
      );
    }

    // Get headers from first record
    const headers = Object.keys(records[0]);

    // Check if required columns exist
    const missingColumns = requiredColumns.filter(
      (col) => !headers.includes(col),
    );

    if (missingColumns.length > 0) {
      throw new BadRequestException(
        `Missing required columns: ${missingColumns.join(', ')}`,
      );
    }

    // Normalize data (convert empty strings to null)
    return records.map((record) => {
      const normalized: Record<string, string | null> = {};
      for (const key in record) {
        normalized[key] = record[key]?.trim() || null;
      }
      return normalized;
    });
  }
}
