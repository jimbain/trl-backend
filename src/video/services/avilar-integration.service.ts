import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import * as crypto from 'crypto';

export interface AvilarStudent {
  studentId: string;
  fullName: string;
  password: string;
  email: string;
  timeZone?: string;
  customFields?: Record<string, string>;
}

export interface AvilarCourseRegistration {
  studentId: string;
  courseNo: string;
  sessionNo?: string;
  poNo?: string;
}

export interface AvilarApiResponse {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
}

export interface EnsureStudentExistsParams {
  email: string;
  firstName: string;
  lastName: string;
  address: {
    address?: string;
    city?: string;
    country?: string;
    phone?: string;
    state?: string;
    zipCode?: string;
  };
}

@Injectable()
export class AvilarIntegrationService {
  private readonly logger = new Logger(AvilarIntegrationService.name);
  private readonly baseUrl: string;
  private readonly organizationId: string;
  private readonly organizationPassword: string;
  private readonly studentPassword: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('AVILAR_SOAP_API_BASE_URL');
    this.organizationId = this.configService.get<string>(
      'AVILAR_ORGANIZATION_ID',
    );
    this.organizationPassword = this.configService.get<string>(
      'AVILAR_ORGANIZATION_PASSWORD',
    );
    this.studentPassword = this.configService.get<string>(
      'AVILAR_STUDENT_PASSWORD',
    );

    // Log configuration for debugging
    this.logger.log('Avilar Configuration:', {
      baseUrl: this.baseUrl,
      organizationId: this.organizationId,
      organizationPassword: this.organizationPassword ? '***SET***' : 'NOT SET',
      studentPassword: this.studentPassword ? '***SET***' : 'NOT SET',
    });

    if (
      !this.baseUrl ||
      !this.organizationId ||
      !this.organizationPassword ||
      !this.studentPassword
    ) {
      this.logger.error('Missing required Avilar configuration');
      this.logger.error('Missing configs:', {
        baseUrl: !this.baseUrl,
        organizationId: !this.organizationId,
        organizationPassword: !this.organizationPassword,
        studentPassword: !this.studentPassword,
      });
      throw new Error('Missing required Avilar configuration');
    }
  }

  /**
   * Get complete status of a student in Avilar system
   */
  async getStudentStatus(
    email: string,
    courseId: string,
  ): Promise<{
    studentExists: boolean;
    isRegistered: boolean;
    studentId?: string;
    details?: any;
  }> {
    try {
      const studentId = this.generateStudentId(email);

      // Check if student exists
      const isStudentResponse = await this.isStudent(studentId, email);
      const studentExists = isStudentResponse.success;

      if (!studentExists) {
        return {
          studentExists: false,
          isRegistered: false,
          studentId,
        };
      }

      // Check if student is registered for the course
      const isRegisteredResponse = await this.isStudentRegistered(
        studentId,
        courseId,
      );
      const isRegistered = isRegisteredResponse.success;

      return {
        studentExists: true,
        isRegistered,
        studentId,
        details: {
          isStudent: isStudentResponse,
          isRegistered: isRegisteredResponse,
        },
      };
    } catch (error) {
      this.logger.error(`Error getting student status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if a video has Avilar integration enabled
   */
  isVideoAvilarEnabled(video: { avilar_course_id?: string }): boolean {
    return !!video.avilar_course_id && video.avilar_course_id.trim() !== '';
  }

  /**
   * Ensure student exists and is registered for the course in Avilar system
   */
  async ensureStudentExists(
    params: EnsureStudentExistsParams,
    courseId: string,
  ): Promise<AvilarApiResponse> {
    const maxRetries = 3;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { email, firstName, lastName, address } = params;

        // Generate student ID based on email
        const studentId = this.generateStudentId(email);
        const fullName = `${firstName} ${lastName}`.trim();

        this.logger.log(
          `Ensuring student exists and is registered for course: ${email} -> Course: ${courseId} (attempt ${attempt}/${maxRetries})`,
        );

        // Step 1: Check if student exists
        this.logger.log(`Step 1: Checking if student exists: ${email}`);
        const isStudentResponse = await this.isStudent(studentId, email);

        if (!isStudentResponse.success) {
          // Step 2: Student doesn't exist, create new student
          this.logger.log(`Step 2: Creating new student: ${email}`);
          const addStudentResponse = await this.addStudent({
            studentId,
            fullName,
            password: this.studentPassword,
            email,
            timeZone: '',
            customFields: {
              Address: address.address || '',
              City: address.city || '',
              Country: address.country || '',
              Phone: address.phone || '',
              State: address.state || '',
              'Zip Code': address.zipCode || '',
            },
          });

          if (!addStudentResponse.success) {
            this.logger.error(
              `Failed to create student: ${email}`,
              addStudentResponse,
            );
            throw new Error(
              `Failed to create student: ${addStudentResponse.message || 'Unknown error'}`,
            );
          }
          this.logger.log(`Student created successfully: ${email}`);
        } else {
          this.logger.log(`Student already exists: ${email}`);
        }

        // Step 3: Check if student is registered for the course
        this.logger.log(
          `Step 3: Checking if student is registered for course: ${courseId}`,
        );
        const isRegisteredResponse = await this.isStudentRegistered(
          studentId,
          courseId,
        );

        this.logger.log(`IsRegistered response:`, {
          success: isRegisteredResponse.success,
          message: isRegisteredResponse.message,
          data: isRegisteredResponse.data,
        });

        if (isRegisteredResponse.success) {
          this.logger.log(
            `Student is already registered for course: ${courseId}`,
          );
          return {
            success: true,
            message: 'Student exists and is registered for course',
            data: { studentId, email, fullName, courseId, isRegistered: true },
          };
        }

        this.logger.log(
          `Student is NOT registered for course: ${courseId}, proceeding to register...`,
        );

        // Step 4: Student is not registered for the course, register them
        this.logger.log(`Step 4: Registering student for course: ${courseId}`);
        const registerStudentResponse = await this.registerStudent({
          studentId,
          courseNo: courseId,
        });

        this.logger.log(`RegisterStudent response:`, {
          success: registerStudentResponse.success,
          message: registerStudentResponse.message,
          data: registerStudentResponse.data,
        });

        if (registerStudentResponse.success) {
          this.logger.log(
            `Student registered successfully for course: ${courseId}`,
          );
          return {
            success: true,
            message: 'Student created/verified and registered for course',
            data: { studentId, email, fullName, courseId, isRegistered: true },
          };
        } else {
          this.logger.error(
            `Failed to register student for course: ${email} -> ${courseId}`,
            registerStudentResponse,
          );
          throw new Error(
            `Failed to register student for course: ${registerStudentResponse.message || 'Unknown error'}`,
          );
        }
      } catch (error) {
        lastError = error;
        this.logger.error(
          `Error ensuring student exists and is registered (attempt ${attempt}/${maxRetries}): ${error.message}`,
        );

        // If it's a DNS issue and we have retries left, wait and retry
        if (
          error.message.includes('DNS resolution failed temporarily') &&
          attempt < maxRetries
        ) {
          const waitTime = attempt * 1000; // 1s, 2s, 3s
          this.logger.log(`Waiting ${waitTime}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }

        // For other errors or if we're out of retries, break
        break;
      }
    }

    // If we get here, all retries failed
    this.logger.error(
      `All ${maxRetries} attempts failed. Last error: ${lastError.message}`,
      lastError.stack,
    );
    throw new HttpException(
      'Failed to ensure student exists and is registered in Avilar system after multiple attempts',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  /**
   * Generate student ID based on email using intHash function
   */
  public generateStudentId(email: string): string {
    // Use intHash function to generate consistent ID
    const hashNum = this.intHash(email, false);
    return `TRL${hashNum}`;
  }

  /**
   * intHash function to generate consistent numeric hash from string
   */
  private intHash(name: string, noCase: boolean = false): number {
    if (noCase) {
      name = name.toLowerCase();
    }

    // Create md5 hash (hex string)
    const md5 = crypto.createHash('md5').update(name, 'utf8').digest('hex');

    // First 8 hex chars = 4 bytes
    const hashBuffer = Buffer.from(md5.substring(0, 8), 'hex');

    // Reconstruct integer like in PHP
    const hashNum =
      ((hashBuffer[0] & 0x7f) << 24) |
      (hashBuffer[1] << 16) |
      (hashBuffer[2] << 8) |
      hashBuffer[3];

    return hashNum >>> 0; // unsigned 32-bit integer
  }

  /**
   * Check if a student is registered for a specific course
   */
  async isStudentRegistered(
    studentId: string,
    courseNo: string,
  ): Promise<AvilarApiResponse> {
    try {
      const soapEnvelope = this.buildSoapEnvelope('IsRegistered', {
        Organization_ID: this.organizationId,
        Organization_Password: this.organizationPassword,
        Student_ID: studentId,
        Course_No: courseNo,
      });

      const response = await this.makeSoapRequest(soapEnvelope, 'IsRegistered');
      return this.parseAvilarResponse(response, 'IsRegistered');
    } catch (error) {
      this.logger.error(
        `Error checking student registration: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Failed to check student registration',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Check if a student exists in the system
   */
  async isStudent(
    studentId: string,
    email: string,
  ): Promise<AvilarApiResponse> {
    try {
      const soapEnvelope = this.buildSoapEnvelope('IsStudent', {
        Organization_ID: this.organizationId,
        Organization_Password: this.organizationPassword,
        Student_ID: studentId,
        Student_Email: email,
      });

      const response = await this.makeSoapRequest(soapEnvelope, 'IsStudent');
      return this.parseAvilarResponse(response, 'IsStudent');
    } catch (error) {
      this.logger.error(
        `Error checking if student exists: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Failed to check if student exists',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Add a new student to the system
   */
  async addStudent(student: AvilarStudent): Promise<AvilarApiResponse> {
    try {
      const customFields = student.customFields
        ? Object.keys(student.customFields).join(',')
        : '';
      const customValues = student.customFields
        ? Object.values(student.customFields).join(',')
        : '';

      const soapEnvelope = this.buildSoapEnvelope('AddStudent', {
        Organization_ID: this.organizationId,
        Organization_Password: this.organizationPassword,
        Student_ID: student.studentId,
        Student_Full_Name: student.fullName,
        Student_Password: student.password,
        Student_Email: student.email,
        Student_Time_Zone: student.timeZone || 'UTC',
        Student_Fields: customFields,
        Student_Values: customValues,
        Fields_Delimiter: ',',
      });

      const response = await this.makeSoapRequest(soapEnvelope, 'AddStudent');
      return this.parseAvilarResponse(response, 'AddStudent');
    } catch (error) {
      this.logger.error(`Error adding student: ${error.message}`, error.stack);
      throw new HttpException(
        'Failed to add student',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Register a student for a course
   */
  async registerStudent(
    registration: AvilarCourseRegistration,
  ): Promise<AvilarApiResponse> {
    try {
      const soapEnvelope = this.buildSoapEnvelope('RegisterStudent', {
        Organization_ID: this.organizationId,
        Organization_Password: this.organizationPassword,
        Student_ID: registration.studentId,
        Course_No: registration.courseNo,
      });

      const response = await this.makeSoapRequest(
        soapEnvelope,
        'RegisterStudent',
      );
      return this.parseAvilarResponse(response, 'RegisterStudent');
    } catch (error) {
      this.logger.error(
        `Error registering student: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Failed to register student',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Build SOAP envelope for Avilar API calls
   */
  private buildSoapEnvelope(
    operation: string,
    params: Record<string, string>,
  ): string {
    const paramsXml = Object.entries(params)
      .map(([key, value]) => `<${key}>${this.escapeXml(value)}</${key}>`)
      .join('');

    return `<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
            <${operation}>
            ${paramsXml}
            </${operation}>
        </soap:Body>
        </soap:Envelope>`;
  }

  /**
   * Make SOAP request to Avilar API
   */
  private async makeSoapRequest(
    soapEnvelope: string,
    operation: string,
  ): Promise<string> {
    try {
      const url = `${this.baseUrl}/webmentor/template/services/wmlms.cfc`;
      this.logger.log(`Making SOAP request to: ${url}`);
      this.logger.log(`SOAP Envelope: ${soapEnvelope}`);

      const response: AxiosResponse = await axios.post(url, soapEnvelope, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: operation, // Set SOAPAction to the operation name
        },
        timeout: 30000, // 30 seconds timeout
        // Add more debugging options
        validateStatus: (status) => true, // Don't throw on non-2xx status
        maxRedirects: 5,
        // Add request logging
        onUploadProgress: (progressEvent) => {
          this.logger.log(`Upload progress: ${JSON.stringify(progressEvent)}`);
        },
        onDownloadProgress: (progressEvent) => {
          this.logger.log(
            `Download progress: ${JSON.stringify(progressEvent)}`,
          );
        },
      });

      this.logger.log(`Response status: ${response.status}`);
      this.logger.log(`Response headers: ${JSON.stringify(response.headers)}`);
      this.logger.log(`Response data length: ${response.data?.length || 0}`);

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.data;
    } catch (error) {
      this.logger.error(`SOAP request failed: ${error.message}`);

      if (axios.isAxiosError(error)) {
        // Safe logging without circular references
        const errorDetails = {
          code: error.code,
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            timeout: error.config?.timeout,
            headers: error.config?.headers,
          },
        };

        this.logger.error(`Axios error details:`, errorDetails);

        // Handle specific error codes
        if (error.code === 'EAI_AGAIN') {
          throw new Error(
            'DNS resolution failed temporarily - please try again',
          );
        }
        if (error.code === 'ENOTFOUND') {
          throw new Error('DNS resolution failed - host not found');
        }
        if (error.code === 'ECONNABORTED') {
          throw new Error('Request timeout - server took too long to respond');
        }
        if (error.code === 'ECONNREFUSED') {
          throw new Error(
            'Connection refused - server not accepting connections',
          );
        }
        if (error.code === 'ECONNRESET') {
          throw new Error(
            'Connection reset by server - check SOAP format and headers',
          );
        }
        if (error.response) {
          throw new Error(
            `HTTP ${error.response.status}: ${error.response.statusText}`,
          );
        }
        if (error.request) {
          this.logger.error('Request was made but no response received');
          throw new Error(
            'No response received from server - check network connectivity and server status',
          );
        }
      }

      this.logger.error('Non-axios error:', error.message);
      throw error;
    }
  }

  /**
   * Parse Avilar API response using regex-based parsing
   */
  private parseAvilarResponse(
    response: string,
    operation: string,
  ): AvilarApiResponse {
    try {
      this.logger.log(`Parsing response for operation: ${operation}`);
      this.logger.log(`Response preview: ${response.substring(0, 200)}...`);

      // Extract the operation response using regex
      const operationRegex = new RegExp(
        `<${operation}Response[^>]*>(.*?)</${operation}Response>`,
        's',
      );
      const operationMatch = response.match(operationRegex);

      if (!operationMatch) {
        // Try to find the operation without "Response" suffix
        const fallbackRegex = new RegExp(
          `<${operation}[^>]*>(.*?)</${operation}>`,
          's',
        );
        const fallbackMatch = response.match(fallbackRegex);

        if (!fallbackMatch) {
          this.logger.warn(`No response found for operation: ${operation}`);
          this.logger.warn(`Full response: ${response}`);
          throw new Error(`No response found for operation: ${operation}`);
        }

        return this.parseOperationResponse(fallbackMatch[1], operation);
      }

      return this.parseOperationResponse(operationMatch[1], operation);
    } catch (error) {
      this.logger.error(`Error parsing Avilar response: ${error.message}`);
      return {
        success: false,
        error: 'Failed to parse response',
        data: response,
      };
    }
  }

  /**
   * Parse the content of an operation response
   */
  private parseOperationResponse(
    content: string,
    operation: string,
  ): AvilarApiResponse {
    try {
      this.logger.log(
        `Parsing operation content: ${content.substring(0, 200)}...`,
      );

      // For IsStudent operation, look for IsStudentReturn field
      if (operation === 'IsStudent') {
        this.logger.log(`Parsing IsStudent operation, content: ${content}`);
        const isStudentMatch = content.match(
          /<IsStudentReturn[^>]*>([^<]+)<\/IsStudentReturn>/i,
        );
        if (isStudentMatch) {
          const isStudentResult = isStudentMatch[1].trim();
          this.logger.log(`IsStudent result: ${isStudentResult}`);

          // NO means student doesn't exist, YES means student exists
          const success = isStudentResult === 'YES';

          this.logger.log(
            `IsStudent parsing - Result: ${isStudentResult}, Success: ${success}`,
          );

          return {
            success,
            message: success ? 'Student exists' : 'Student does not exist',
            data: { content, operation, isStudentResult },
          };
        } else {
          this.logger.warn(
            `IsStudent operation but no IsStudentReturn field found in content`,
          );
        }
      }

      // For IsRegistered operation, look for IsRegisteredReturn field
      if (operation === 'IsRegistered') {
        this.logger.log(`Parsing IsRegistered operation, content: ${content}`);
        const isRegisteredMatch = content.match(
          /<IsRegisteredReturn[^>]*>([^<]+)<\/IsRegisteredReturn>/i,
        );
        if (isRegisteredMatch) {
          const isRegisteredResult = isRegisteredMatch[1].trim();
          this.logger.log(`IsRegistered result: ${isRegisteredResult}`);

          // NO means student is NOT registered, YES means student IS registered
          const success = isRegisteredResult === 'YES';

          this.logger.log(
            `IsRegistered parsing - Result: ${isRegisteredResult}, Success: ${success}`,
          );

          return {
            success,
            message: success
              ? 'Student is registered for course'
              : 'Student is not registered for course',
            data: { content, operation, isRegisteredResult },
          };
        } else {
          this.logger.warn(
            `IsRegistered operation but no IsRegisteredReturn field found in content`,
          );
        }
      }

      // Extract Result/result field
      const resultMatch = content.match(/<(Result|result)>([^<]+)<\/\1>/i);
      const result = resultMatch ? resultMatch[2].trim() : '';

      // Extract Message/message field
      const messageMatch = content.match(/<(Message|message)>([^<]+)<\/\1>/i);
      const message = messageMatch ? messageMatch[2].trim() : '';

      this.logger.log(
        `Falling back to generic parsing - Result: ${result}, Message: ${message}`,
      );

      // For Avilar, we might need to look for different success indicators
      // Let's check if there are any error messages or specific response patterns
      const errorMatch = content.match(/<(Error|error|fault)>([^<]+)<\/\1>/i);
      const faultMatch = content.match(/<(Fault|fault)>([^<]+)<\/\1>/i);

      if (errorMatch || faultMatch) {
        const errorMsg = errorMatch ? errorMatch[2] : faultMatch[2];
        this.logger.warn(`Avilar returned error: ${errorMsg}`);
        return {
          success: false,
          message: errorMsg,
          data: { content, operation },
        };
      }

      // Determine success based on result and absence of errors
      const success =
        result === 'true' ||
        result === '1' ||
        result === 'SUCCESS' ||
        result === 'success' ||
        (!errorMatch && !faultMatch);

      this.logger.log(
        `Parsed response - Success: ${success}, Result: ${result}, Message: ${message}`,
      );

      return {
        success,
        message: message || undefined,
        data: { content, operation },
      };
    } catch (error) {
      this.logger.error(`Error parsing operation response: ${error.message}`);
      return {
        success: false,
        error: 'Failed to parse operation response',
        data: { content, operation },
      };
    }
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Validate required parameters
   */
  private validateParams(
    params: Record<string, any>,
    required: string[],
  ): void {
    const missing = required.filter((param) => !params[param]);
    if (missing.length > 0) {
      throw new Error(`Missing required parameters: ${missing.join(', ')}`);
    }
  }

  /**
   * Simple connectivity check for Avilar service
   */
  async checkConnectivity(): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      const url = `${this.baseUrl}/webmentor/template/services/wmlms.cfc`;
      this.logger.log(`Checking connectivity to: ${url}`);

      // Simple GET request to test if server is reachable
      const response = await axios.get(url, {
        timeout: 10000, // 10 seconds for connectivity test
        validateStatus: (status) => true,
      });

      this.logger.log(`Connectivity check response: ${response.status}`);

      return {
        success: true,
        message: `Server is reachable. Status: ${response.status}`,
        details: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.keys(response.headers),
        },
      };
    } catch (error) {
      this.logger.error('Connectivity check failed:', error.message);

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          return {
            success: false,
            message: 'Connection timeout - server not responding',
            details: { error: error.message },
          };
        }
        if (error.code === 'ENOTFOUND') {
          return {
            success: false,
            message: 'DNS resolution failed - host not found',
            details: { error: error.message, code: error.code },
          };
        }
        if (error.code === 'EAI_AGAIN') {
          return {
            success: false,
            message: 'DNS resolution failed temporarily - try again',
            details: { error: error.message, code: error.code },
          };
        }
        if (error.code === 'ECONNREFUSED') {
          return {
            success: false,
            message: 'Connection refused - server not accepting connections',
            details: { error: error.message, code: error.code },
          };
        }
      }

      return {
        success: false,
        message: `Connectivity check failed: ${error.message}`,
        details: { error: error.message },
      };
    }
  }

  /**
   * Test basic connectivity to Avilar server
   */
  async testConnectivity(): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      const url = `${this.baseUrl}/webmentor/template/services/wmlms.cfc`;
      this.logger.log(`Testing connectivity to: ${url}`);

      // Simple GET request to test if server is reachable
      const response = await axios.get(url, {
        timeout: 10000, // 10 seconds for connectivity test
        validateStatus: (status) => true,
      });

      this.logger.log(`Connectivity test response: ${response.status}`);

      return {
        success: true,
        message: `Server is reachable. Status: ${response.status}`,
        details: {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        },
      };
    } catch (error) {
      this.logger.error('Connectivity test failed:', error);

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          return {
            success: false,
            message: 'Connection timeout - server not responding',
            details: { error: error.message },
          };
        }
        if (error.code === 'ENOTFOUND') {
          return {
            success: false,
            message: 'DNS resolution failed - host not found',
            details: { error: error.message, code: error.code },
          };
        }
        if (error.code === 'ECONNREFUSED') {
          return {
            success: false,
            message: 'Connection refused - server not accepting connections',
            details: { error: error.message, code: error.code },
          };
        }
      }

      return {
        success: false,
        message: `Connectivity test failed: ${error.message}`,
        details: { error: error.message },
      };
    }
  }

  /**
   * Test SOAP functionality with a simple IsStudent call
   */
  async testSOAPFunctionality(): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      this.logger.log('Testing SOAP functionality with IsStudent call...');

      const result = await this.isStudent(
        'TRL1000063263',
        'mkramm@TRLonline.com',
      );

      return {
        success: true,
        message: 'SOAP functionality test successful',
        details: {
          result: result,
          studentId: 'TRL1000063263',
          email: 'mkramm@TRLonline.com',
        },
      };
    } catch (error) {
      this.logger.error('SOAP functionality test failed:', error.message);

      return {
        success: false,
        message: `SOAP functionality test failed: ${error.message}`,
        details: { error: error.message },
      };
    }
  }

  /**
   * Health check for Avilar service
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try a simple operation to check connectivity
      const response = await this.isStudent('TEST', 'test@test.com');
      return true;
    } catch (error) {
      this.logger.error('Avilar service health check failed', error.stack);
      return false;
    }
  }
}
