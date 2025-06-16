export class StringHelper {
  /**
   * Capitalize the first letter of a string
   */
  static capitalize(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Capitalize each word in a string
   */
  static capitalizeWords(str: string): string {
    return str
      .split(' ')
      .map((word) => this.capitalize(word))
      .join(' ');
  }

  /**
   * Convert a string to camelCase
   */
  static toCamelCase(str: string): string {
    return str
      .replace(/[-_ ]+(\w)/g, (_, c) => c.toUpperCase())
      .replace(/^./, (c) => c.toLowerCase());
  }

  /**
   * Convert a string to kebab-case
   */
  static toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }

  /**
   * Convert a string to snake_case
   */
  static toSnakeCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .toLowerCase();
  }

  /**
   * Slugify a string (e.g. for URLs)
   */
  static slugify(str: string): string {
    return str
      .normalize('NFD') // remove diacritics
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .toLowerCase();
  }

  /**
   * Trim and collapse multiple spaces
   */
  static cleanSpaces(str: string): string {
    return str.replace(/\s+/g, ' ').trim();
  }

  /**
   * Check if string is empty or whitespace
   */
  static isEmpty(str: string): boolean {
    return !str || str.trim().length === 0;
  }

  /**
   * Limit string to a specified length with ellipsis
   */
  static truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength).trim() + '...';
  }

  static escapeStringRegexp(string: string): string {
    if (typeof string !== 'string') {
      throw new TypeError('Expected a string');
    }

    // Escape characters with special meaning either inside or outside character sets.
    // Use a simple backslash escape when it’s always valid, and a `\xnn` escape when the simpler form would be disallowed by Unicode patterns’ stricter grammar.
    return string.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d');
  }
}
