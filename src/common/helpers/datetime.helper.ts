import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(customParseFormat);

export class DateTimeHelper {
  /**
   * Format a date with a given format
   * Default format: YYYY-MM-DD
   */
  static format(date: Date | string, formatStr = 'YYYY-MM-DD'): string {
    return dayjs(date).format(formatStr);
  }

  /**
   * Format date and time
   */
  static formatDateTime(date: Date | string): string {
    return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
  }

  /**
   * Parse a custom format string into a Date
   */
  static parse(dateStr: string, formatStr: string): Date {
    return dayjs(dateStr, formatStr).toDate();
  }

  /**
   * Get the difference between two dates in days
   */
  static diffInDays(date1: Date | string, date2: Date | string): number {
    return dayjs(date1).diff(dayjs(date2), 'day');
  }

  /**
   * Get the difference in milliseconds
   */
  static diffInMilliseconds(
    date1: Date | string,
    date2: Date | string,
  ): number {
    return dayjs(date1).diff(dayjs(date2), 'millisecond');
  }

  /**
   * Add days to a date
   */
  static addDays(date: Date | string, days: number): Date {
    return dayjs(date).add(days, 'day').toDate();
  }

  /**
   * Subtract days from a date
   */
  static subtractDays(date: Date | string, days: number): Date {
    return dayjs(date).subtract(days, 'day').toDate();
  }

  /**
   * Check if date1 is before date2
   */
  static isBefore(date1: Date | string, date2: Date | string): boolean {
    return dayjs(date1).isBefore(dayjs(date2));
  }

  /**
   * Check if date1 is after date2
   */
  static isAfter(date1: Date | string, date2: Date | string): boolean {
    return dayjs(date1).isAfter(dayjs(date2));
  }

  /**
   * Check if a date is between two other dates (inclusive)
   */
  static isBetween(
    date: Date | string,
    start: Date | string,
    end: Date | string,
  ): boolean {
    return dayjs(date).isSameOrAfter(start) && dayjs(date).isSameOrBefore(end);
  }

  /**
   * Get current ISO timestamp
   */
  static nowISO(): string {
    return dayjs().toISOString();
  }

  /**
   * Get today's date string
   */
  static today(formatStr = 'YYYY-MM-DD'): string {
    return dayjs().format(formatStr);
  }
}
