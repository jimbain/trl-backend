# Authentication Module Documentation

## Overview

The Authentication Module provides comprehensive user authentication and authorization functionality for the application. It supports multiple authentication methods including JWT (JSON Web Tokens), SAML/SSO (Single Sign-On), and basic email/password authentication.

**Location:** `src/auth/`

---

## Table of Contents

1. [Authentication Methods](#authentication-methods)
2. [Module Architecture](#module-architecture)
3. [API Endpoints](#api-endpoints)
4. [Request/Response Examples](#requestresponse-examples)
5. [Configuration](#configuration)
6. [Security Features](#security-features)
7. [File Structure](#file-structure)

---

## Authentication Methods

### 1. JWT (JSON Web Tokens)

**Type:** Bearer Token Authentication
**Algorithm:** HS384 (HMAC with SHA-384)

#### Key Features:
- Access tokens and refresh tokens are issued on successful login
- Access tokens have a shorter expiration time for security
- Refresh tokens have a longer expiration time and are used to obtain new access tokens
- Tokens are extracted from the `Authorization` header with `Bearer` prefix
- Token payload includes: user ID, email, and refresh token flag

#### Configuration:
```
JWT_SECRET=your-secret-key
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d
```

#### Usage:
All protected endpoints require the `Authorization` header with JWT token:
```
Authorization: Bearer <access_token>
```

### 2. SAML/SSO (Single Sign-On)

**Type:** Enterprise Single Sign-On via SAML 2.0
**Provider Support:** Okta and other SAML 2.0 compliant providers

#### Key Features:
- Company-specific SAML configuration stored in the database
- Automatic user creation/update on first SSO login
- Company domain-based redirect after successful authentication
- SAML assertion validation and issuer verification
- Supports standard and SOAP SAML claim formats

#### SAML Configuration Fields:
- `saml_entry_point` - SAML IdP entry point URL
- `saml_issuer` - SAML issuer identifier
- `saml_callback_url` - Callback URL for SAML response
- `saml_audience_url` - SAML audience identifier
- `saml_certificate` - SAML IdP certificate (public key)

#### User Attributes Extracted from SAML:
- Email (required)
- First Name
- Last Name
- NameID (SAML Subject NameID)

#### Endpoints:
- Initiate SSO: `GET /auth/sso/:companyId`
- SSO Callback: `POST /auth/sso/callback/:companyId`
- Success Redirect: `GET /auth/sso/callback/:companyId/success?access_token=...&refresh_token=...`
- Error Redirect: `GET /auth/sso/callback/:companyId/error?message=...`

### 3. Basic Authentication

**Type:** Email and Password

#### Key Features:
- Email/password combination validation
- Passwords are hashed using bcryptjs
- Bcrypt comparison for secure password validation
- Optional master password support for administrative access
- Company login type validation (must be set to basic auth)

#### Master Password Feature:
- Allows override of user password validation
- Configuration: `AppConfig` entity with `master_password` and `is_master_password_active` fields
- Useful for administrative access in case of password issues

---

## Module Architecture

### Components

#### Controllers
- **auth.controller.ts** - Handles all authentication HTTP requests and responses

#### Services
- **auth.service.ts** - Contains core authentication business logic
  - User validation
  - Token generation and refresh
  - SSO handling
  - Password reset flows
  - OTP generation and verification

#### Guards
- **jwt-auth.guard.ts** - JWT authentication guard for protecting routes
- Validates JWT tokens and extracts user information

#### Strategies
- **jwt.strategy.ts** - Passport JWT strategy implementation
- **dynamic-saml.strategy.ts** - Dynamic SAML strategy with company-specific configuration

#### DTOs (Data Transfer Objects)
- LoginDto
- RegisterDto
- CheckUserDto
- RefreshTokenDto
- ForgotPasswordDto
- ForgotPasswordOtpVerifyDto
- ResetPasswordDto
- VerifyCurrentPasswordDto

#### Entities
- **password_reset_token.entity.ts** - Database entity for password reset tokens with OTP

---

## API Endpoints

### Public Endpoints (No Authentication Required)

#### 1. User Registration
**Endpoint:** `POST /auth/signup`
**Purpose:** Register a new user with a company

#### 2. User Login
**Endpoint:** `POST /auth/login`
**Purpose:** Authenticate user with email and password

#### 3. Check User Existence
**Endpoint:** `POST /auth/check-user`
**Purpose:** Check if a user exists and their login type (basic/SSO)

#### 4. Initiate SSO Login
**Endpoint:** `GET /auth/sso/:companyId`
**Purpose:** Redirect user to company-specific SAML IdP

#### 5. SSO Callback Handler
**Endpoint:** `POST /auth/sso/callback/:companyId`
**Purpose:** Process SAML response from IdP

#### 6. SSO Success Redirect
**Endpoint:** `GET /auth/sso/callback/:companyId/success`
**Purpose:** Redirect to frontend with access and refresh tokens

#### 7. SSO Error Redirect
**Endpoint:** `GET /auth/sso/callback/:companyId/error`
**Purpose:** Redirect to frontend with error message

#### 8. Forgot Password - Send OTP
**Endpoint:** `POST /auth/forgot-password/send-otp`
**Purpose:** Send OTP to user's email for password reset

#### 9. Forgot Password - Verify OTP
**Endpoint:** `POST /auth/forgot-password/verify-otp`
**Purpose:** Verify OTP and get password reset token

#### 10. Change Password - Verify Current Password
**Endpoint:** `POST /auth/change-password/verify-current-password`
**Purpose:** Verify current password for changing password

#### 11. Reset Password
**Endpoint:** `POST /auth/reset-password`
**Purpose:** Reset user password using token

### Protected Endpoints (JWT Required)

#### 1. Refresh Access Token
**Endpoint:** `POST /auth/refresh-token`
**Purpose:** Get a new access token using refresh token
**Authorization:** Required

#### 2. Get Current User
**Endpoint:** `GET /auth/me`
**Purpose:** Get currently authenticated user information (minimal user data)
**Authorization:** Required

#### 3. Get User Profile (Extended)
**Endpoint:** `GET /profile`
**Location:** Users Module (NOT Auth Module)
**Purpose:** Get complete user profile information with extended fields
**Authorization:** Required
**Note:** This is the recommended endpoint for frontend profile data (more complete than /auth/me)

---

## Request/Response Examples

### 1. User Registration

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "password": "SecurePassword123!",
    "password_confirmation": "SecurePassword123!",
    "phone": "+1234567890",
    "company": "CED"
  }'
```

**Response (201 Created):**
```json
{
  "message": "User registered successfully",
  "data": {
    "id": "user-uuid",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "company_id": "company-uuid",
    "is_active": true,
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

**Validation Rules:**
- `first_name`: Required, string
- `last_name`: Required, string
- `email`: Required, valid email, must be unique
- `password`: Required, string (minimum length recommended)
- `password_confirmation`: Required, must match password
- `phone`: Optional, string
- `company`: Required, must be "CED" or "MTF Biologics"

---

### 2. User Login

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "password": "SecurePassword123!",
    "os": "Windows",
    "device_model": "Desktop",
    "device_id": "device-123",
    "fcm_key": "fcm-key-123"
  }'
```

**Response (200 OK):**
```json
{
  "message": "Login successful",
  "data": {
    "user": {
      "id": "user-uuid",
      "email": "john.doe@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "company_id": "company-uuid",
      "is_active": true
    },
    "access_token": "eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer",
    "expires_in": 900
  }
}
```

**Request Fields:**
- `email`: Required, valid email address (case-insensitive)
- `password`: Required, user's password
- `os`: Optional, operating system name
- `device_model`: Optional, device model name
- `device_id`: Optional, unique device identifier
- `fcm_key`: Optional, Firebase Cloud Messaging token

**Error Response (401 Unauthorized):**
```json
{
  "statusCode": 401,
  "message": "Invalid email or password",
  "error": "Unauthorized"
}
```

---

### 3. Check User Existence

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/check-user \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com"
  }'
```

**Response (200 OK) - Basic Auth User:**
```json
{
  "is_sso_login": false
}
```

**Response (200 OK) - SSO User:**
```json
{
  "is_sso_login": true,
  "company_id": "company-uuid",
  "sso_entry_url": "/auth/sso/company-uuid"
}
```

**Response for Non-existent User (422 Unprocessable Entity):**
```json
{
  "statusCode": 422,
  "message": {
    "errors": {
      "email": ["User does not exist"]
    }
  },
  "error": "Unprocessable Entity"
}
```

**Response Format Explanation:**
- `is_sso_login`: Boolean flag indicating if user's company uses SSO authentication
- `company_id`: Only present if `is_sso_login` is true - the company UUID
- `sso_entry_url`: Only present if `is_sso_login` is true - the endpoint to initiate SSO login

---

### 4. Initiate SSO Login

**Request:**
```bash
curl -X GET "http://localhost:3000/api/v1/auth/sso/company-uuid-123"
```

**Response:** HTTP Redirect (302)
- Redirects to company's SAML IdP entry point (e.g., Okta login)
- Location header contains SAML request URL
- No JSON response - browser follows redirect automatically

---

### 5. SSO Callback Handler

**Note:** This endpoint is automatically handled by the SAML library. When the IdP redirects back with SAML assertion, the SAML strategy validates and processes it.

**Process:**
1. IdP sends SAML assertion to `/auth/sso/callback/:companyId`
2. Passport SAML strategy validates the assertion
3. User information is extracted from SAML assertion
4. User is found/created in database
5. Tokens are generated and user is redirected to success endpoint

---

### 6. SSO Success Redirect

**Automatic Redirect Flow:**
```bash
# After successful SAML validation, user is redirected to:
# /api/v1/auth/sso/callback/:companyId/success?access_token=...&refresh_token=...
```

**Frontend URL Redirect:**
```
https://frontend.example.com/sso-signin?access_token=eyJhbGc...&refresh_token=eyJhbGc...
```

The frontend application should:
1. Extract tokens from URL query parameters
2. Store tokens securely (localStorage/sessionStorage)
3. Use access token for API requests
4. Redirect user to dashboard

---

### 7. SSO Error Redirect

**Error Response Format:**
```bash
# /api/v1/auth/sso/callback/:companyId/error?message=User+does+not+exist
```

**Frontend Redirect:**
```
https://frontend.example.com/sso-signin?message=User+does+not+exist
```

**Possible Error Messages:**
- "User does not exist"
- "User does not belong to this company"
- "Company does not have SSO login enabled"
- "Authentication failed. Please contact your administrator."

---

### 8. Refresh Access Token

**Important Notes:**
- This endpoint REQUIRES JWT authentication (Authorization header with valid/expired access token)
- The refresh_token in the request body is the actual token used to generate new tokens
- Even if the access token is expired, the JwtAuthGuard will validate it - you must provide a valid (though possibly expired) access token in the header
- The refresh_token must have the `isRefreshToken: true` flag in its JWT payload

**Request:**
```bash
# Recommended: Send valid (even if expired) access token in Authorization header
curl -X POST http://localhost:3000/api/v1/auth/refresh-token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{
    "refresh_token": "eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9..."
  }'
```

**Response (200 OK):**
```json
{
  "message": "The token has been successfully refreshed.",
  "data": {
    "access_token": "eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user-uuid",
      "email": "john.doe@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "company_id": "company-uuid",
      "is_active": true
    },
    "token_type": "Bearer",
    "expires_in": 900
  }
}
```

**Error Response (401 Unauthorized):**
```json
{
  "statusCode": 401,
  "message": "Invalid refresh token",
  "error": "Unauthorized"
}
```

---

### 9. Send Forgot Password OTP

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/forgot-password/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com"
  }'
```

**Response (200 OK):**
```json
{
  "message": "OTP sent successfully to your email",
  "data": {
    "email": "john.doe@example.com",
    "otp_expires_in": 300,
    "message": "Please check your email for the OTP code"
  }
}
```

**Error Response (404 Not Found):**
```json
{
  "statusCode": 404,
  "message": "Email does not exist",
  "error": "Not Found"
}
```

---

### 10. Verify Forgot Password OTP

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/forgot-password/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "otp": "123456"
  }'
```

**Response (200 OK):**
```json
{
  "message": "OTP verified successfully",
  "data": {
    "token": "reset-token-uuid-xyz",
    "message": "Use this token to reset your password"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "statusCode": 400,
  "message": "Invalid OTP or OTP has expired",
  "error": "Bad Request"
}
```

---

### 11. Verify Current Password

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/change-password/verify-current-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "password": "CurrentPassword123!"
  }'
```

**Response (200 OK):**
```json
{
  "message": "Current password verified successfully",
  "data": {
    "token": "reset-token-uuid-abc",
    "message": "You can now change your password"
  }
}
```

**Error Response (401 Unauthorized):**
```json
{
  "statusCode": 401,
  "message": "Current password is incorrect",
  "error": "Unauthorized"
}
```

---

### 12. Reset Password

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "reset-token-uuid-xyz",
    "password": "NewPassword123!"
  }'
```

**Response (200 OK):**
```json
{
  "message": "Password reset successfully",
  "data": {
    "email": "john.doe@example.com",
    "message": "Your password has been updated. Please log in with your new password."
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "statusCode": 400,
  "message": "Invalid or expired reset token",
  "error": "Bad Request"
}
```

---

### 13. Get Current User (Auth Module)

**Request:**
```bash
curl -X GET http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9..."
```

**Response (200 OK):**
```json
{
  "user": {
    "id": "user-uuid",
    "email": "john.doe@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "company_id": "company-uuid",
    "is_active": true
  }
}
```

**Error Response (401 Unauthorized):**
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

---

### 14. Get User Profile (Users Module - Recommended)

**Endpoint:** `GET /profile`
**Location:** Users Module (NOT Auth Module)
**Purpose:** Get complete user profile information with all extended fields
**Authorization:** Required

**Request:**
```bash
curl -X GET http://localhost:3000/api/v1/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9..."
```

**Response (200 OK):**
```json
{
  "id": "user-uuid",
  "email": "john.doe@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+1234567890",
  "company_id": "company-uuid",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-20T15:45:00Z"
}
```

**Error Response (401 Unauthorized):**
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

**Note:** Use `/profile` endpoint instead of `/auth/me` for complete user information

---

## Domain & Security

### Company Domain Field

Every company in the system has a `domain` field that specifies the authorized domain(s) for accessing the API. This domain is returned in all authentication responses.

**Domain Field in Responses:**

All authentication endpoints return the company's domain in the user object:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "user": {
    "id": "user_01JZK1PN3KP5RVMTB2WV7M499N",
    "email": "user@example.com",
    "company": "Demo Company",
    "domain": "app.democompany.com",
    ...
  }
}
```

**Frontend Usage:**
```typescript
// Get domain from login response
const { data } = await loginResponse.json();
const companyDomain = data.user.domain;

// If domain is null/empty, company doesn't restrict domain access
if (!data.user.domain) {
  console.log('No domain restriction for this company');
}
```

### Domain Validation Feature

**What It Does:**
- Validates that requests come from the user's company's registered domain
- Applied to BOTH public auth routes AND protected endpoints:
  - **Auth Routes**: login, signup, check-user, forgot-password, reset-password, change-password
  - **Protected Routes**: Any endpoint with JwtAuthGuard (/auth/me, /profile, etc.)
- Provides company isolation and security in multi-tenant environments
- Three configurable actions: `DISABLE` (default), `LOG` (audit), `RESTRICT` (enforce)
- Automatically bypasses validation for localhost (development-friendly)
- Skips validation if company has no domain set

**Validation Actions:**

| Action | Behavior | Use Case |
|--------|----------|----------|
| `DISABLE` (default) | No validation performed - all domains allowed | Development, testing, flexible deployments |
| `LOG` | Domain mismatch is logged but request is allowed | Monitoring, audit trail, gradual rollout |
| `RESTRICT` | Domain mismatch blocks request with 401 error | Production, strict security policy |

**When Domain Validation is Applied:**

| Scenario | DISABLE | LOG | RESTRICT |
|----------|---------|-----|----------|
| No company domain set | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| Request from localhost | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| Request from correct domain | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| Request from wrong domain | ✅ Allowed | ⚠️ Allowed (logged) | ❌ Blocked (401) |

**Error Response When RESTRICT Action Blocks Request:**
```json
{
  "statusCode": 401,
  "message": "Access denied. This account is registered for domain: app.democompany.com",
  "error": "Unauthorized"
}
```

**Log Output When LOG Action Records Domain Mismatch:**
```
[Domain Validation] Access denied. This account is registered for domain: app.democompany.com | Request from: app.otherdomain.com | User: user@example.com
```

**Implementation Architecture:**

Domain validation is implemented via two mechanisms for complete coverage:

1. **DomainValidationGuard** - Applied to public auth routes
   - Validates domain for login, signup, check-user, forgot-password, reset-password routes
   - Extracts email from request body
   - Fetches user with company info from database
   - Applies configured action (DISABLE, LOG, RESTRICT)

2. **DomainValidationService** - Used in JWT Strategy for protected routes
   - Validates domain for all JWT-protected endpoints
   - Extracts user and company from JWT payload
   - Applies same configured action (DISABLE, LOG, RESTRICT)
   - Single reusable service ensures consistent behavior

**Benefits of Dual Approach:**
- ✅ Complete coverage - both public and protected endpoints secured
- ✅ DRY (Don't Repeat Yourself) - Single service used by both mechanisms
- ✅ Consistent behavior - Same validation logic and actions everywhere
- ✅ Flexible - Easy to enable/disable via environment variable
- ✅ Audit trail - LOG action records all domain violations

**Configuration:**
See [Environment Variables](#environment-variables) section below for setup instructions.

---

## Configuration

### Environment Variables

```env
# JWT Configuration
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d

# Domain Validation Configuration
# Controls domain validation behavior for authenticated requests
# DOMAIN_VALIDATION_ACTION=DISABLE
#   Development (default): No validation - all domains allowed
# DOMAIN_VALIDATION_ACTION=LOG
#   Monitoring: Log domain mismatches but allow access (audit trail)
# DOMAIN_VALIDATION_ACTION=RESTRICT
#   Production: Block requests from unauthorized domains (401 error)
# Note: localhost/127.0.0.1 always allowed (development)
# Note: If company domain is empty/null, validation is skipped
DOMAIN_VALIDATION_ACTION=DISABLE

# Application URLs
FRONTEND_APP_URL=http://localhost:3000,https://frontend.example.com

# SAML Configuration (stored per company in database)
# These are configured in the company's sso_config field
# saml_entry_point=https://company.okta.com/app/123/sso/saml
# saml_issuer=http://www.okta.com/123456789
# saml_callback_url=http://localhost:3000/api/v1/auth/sso/callback/:companyId
# saml_audience_url=http://www.okta.com/123456789
# saml_certificate=-----BEGIN CERTIFICATE-----...-----END CERTIFICATE-----

# Email Configuration (for OTP sending)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your-email@gmail.com
MAIL_PASSWORD=your-app-password
MAIL_FROM=noreply@example.com
```

### Database Configuration

The authentication module uses TypeORM entities:

#### User Entity Fields
- `id` - UUID primary key
- `email` - User email (unique)
- `first_name` - User's first name
- `last_name` - User's last name
- `password` - Hashed password (nullable for SSO-only users)
- `phone` - User's phone number (optional)
- `company_id` - Foreign key to Company
- `is_active` - User active status
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

#### Company Entity Fields
- `id` - UUID primary key
- `name` - Company name
- `domain` - Authorized domain for this company (used for domain validation)
- `login_type` - "basic" or "sso"
- `sso_config` - JSON configuration for SAML
- `available_medias` - Array of available media types (audio, video, pharma, etc.)
- `master_password` - Optional master password
- `is_master_password_active` - Master password feature flag
- `is_active` - Company active status

#### PasswordResetToken Entity
- `id` - UUID primary key
- `email` - User email
- `token` - Reset token
- `otp` - One-time password
- `expires_at` - OTP expiration timestamp
- `created_at` - Creation timestamp

---

## Security Features

### 1. Password Security
- **Hashing:** Passwords are hashed using bcryptjs with salt rounds
- **Comparison:** bcrypt.compare() for secure password validation
- **No Plaintext:** Passwords are never stored or logged in plaintext

### 2. Token Security
- **JWT Secret:** High-entropy secret key required (minimum 32 characters)
- **Signature Algorithm:** HS384 (HMAC with SHA-384)
- **Token Expiration:**
  - Access tokens: Short-lived (15 minutes default)
  - Refresh tokens: Long-lived (7 days default)
- **Token Validation:** Signature and expiration verified on each protected request

### 3. SAML Security
- **Assertion Validation:** SAML assertions are cryptographically signed and validated
- **Certificate Verification:** IdP certificate is validated against trusted certificates
- **Issuer Verification:** SAML issuer claim is verified against configured issuer
- **Response Validation:** SAML response is validated for correct company and user

### 4. Input Validation
- **Email Validation:** RFC 5322 compliant email format
- **Password Requirements:** Minimum length validation (configurable)
- **DTO Validation:** Class-validator for all request payloads
- **Transformer:** Email addresses converted to lowercase for consistency

### 5. OTP Security
- **Time-based Expiration:** OTPs expire after configured duration (300 seconds default)
- **One-time Use:** OTPs can only be used once
- **Email Delivery:** OTPs are sent via email

### 6. Company Isolation
- **Multi-tenancy:** Users are isolated by company
- **Login Type Validation:** Company login type is validated (basic vs SSO)
- **Company Verification:** SSO users must belong to the SSO-enabled company

### 7. Domain Validation
- **Company Domain Isolation:** Users can be restricted to access API only from their company's registered domain
- **Action-Based Control:** Configurable via `DOMAIN_VALIDATION_ACTION` environment variable (DISABLE, LOG, RESTRICT)
- **Three Modes:**
  - `DISABLE` - No validation (development, testing)
  - `LOG` - Audit mode, logs mismatches but allows access (monitoring)
  - `RESTRICT` - Enforces domain restrictions, blocks unauthorized requests (production)
- **Development Friendly:** Localhost/127.0.0.1 always allowed
- **Flexible:** Empty company domain bypasses validation for flexible deployments
- **Protected Routes:** Domain validation enforced on all JWT-protected endpoints via JWT Strategy
- **Error Handling:** Clear error messages indicating allowed domain when request is blocked

### 8. Rate Limiting (Recommended)
While not implemented in the module itself, it's recommended to implement rate limiting on:
- `/auth/login` - Prevent brute force attacks
- `/auth/forgot-password/send-otp` - Prevent OTP flooding
- `/auth/signup` - Prevent account creation spam

---

## File Structure

```
src/auth/
├── README.md                                    # This documentation file
├── auth.controller.ts                           # HTTP request handlers
├── auth.service.ts                              # Business logic
├── auth.module.ts                               # Module configuration
├── jwt-auth.guard.ts                            # JWT guard for route protection
├── jwt.strategy.ts                              # Passport JWT strategy
├── dynamic-saml.strategy.ts                     # Dynamic SAML strategy
│
├── dto/
│   ├── login.dto.ts                            # Login request validation
│   ├── register.dto.ts                         # Registration request validation
│   ├── check-user.dto.ts                       # User existence check validation
│   ├── refresh-token.dto.ts                    # Token refresh request validation
│   ├── forgot-password.dto.ts                  # Forgot password request validation
│   ├── forgot-password-otp-verify.dto.ts       # OTP verification validation
│   ├── reset-password.dto.ts                   # Password reset request validation
│   └── verify-current-password.dto.ts          # Current password verification validation
│
└── entities/
    └── password_reset_token.entity.ts          # Password reset token database entity
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 200 | OK | Successful request |
| 201 | Created | User successfully registered |
| 400 | Bad Request | Invalid input, validation errors |
| 401 | Unauthorized | Invalid credentials, expired token |
| 404 | Not Found | User/company not found |
| 500 | Server Error | Internal server error |

### Error Response Format

```json
{
  "statusCode": 400,
  "message": "Error description",
  "error": "Error type"
}
```

### Common Validation Errors

```json
{
  "statusCode": 400,
  "message": [
    "email must be an email",
    "password must not be empty",
    "password confirmation does not match password"
  ],
  "error": "Bad Request"
}
```

---

## Usage Examples

### Typical Authentication Flow

#### 1. Check if user exists
```bash
curl -X POST http://localhost:3000/api/v1/auth/check-user \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

#### 2. Register new user (if doesn't exist)
```bash
curl -X POST http://localhost:3000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "user@example.com",
    "password": "SecurePass123!",
    "password_confirmation": "SecurePass123!",
    "company": "CED"
  }'
```

#### 3. Login user
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

#### 4. Use access token for API requests
```bash
curl -X GET http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer <access_token>"
```

#### 5. Refresh token when access token expires
```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh-token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <expired_access_token>" \
  -d '{"refresh_token": "<refresh_token>"}'
```

### Password Reset Flow

#### 1. Request OTP
```bash
curl -X POST http://localhost:3000/api/v1/auth/forgot-password/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

#### 2. Verify OTP
```bash
curl -X POST http://localhost:3000/api/v1/auth/forgot-password/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "otp": "123456"
  }'
```

#### 3. Reset password
```bash
curl -X POST http://localhost:3000/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "<reset_token>",
    "password": "NewPassword123!"
  }'
```

### SSO Login Flow

#### 1. Initiate SSO (browser)
```bash
# User clicks "Login with SSO"
# Frontend redirects to:
# http://localhost:3000/api/v1/auth/sso/company-uuid
```

#### 2. SAML IdP redirect
- User logs in at IdP (Okta, etc.)
- IdP redirects back to application with SAML assertion

#### 3. Automatic token issuance
- Application validates SAML assertion
- Tokens are issued
- User is redirected to frontend with tokens

---

## Testing the API

### Using Postman

1. **Create Environment Variables:**
   - `base_url`: http://localhost:3000/api/v1
   - `access_token`: (populated after login)
   - `refresh_token`: (populated after login)

2. **Test Sequence:**
   - POST Signup → Check response
   - POST Login → Save tokens to environment
   - GET /auth/me → Verify token works
   - POST Refresh Token → Get new access token
   - Test other endpoints as needed

### Using curl with saved tokens

```bash
# Login and save tokens
RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password"
  }')

# Extract tokens (using jq)
ACCESS_TOKEN=$(echo $RESPONSE | jq -r '.data.access_token')
REFRESH_TOKEN=$(echo $RESPONSE | jq -r '.data.refresh_token')

# Use access token
curl -X GET http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## Troubleshooting

### Login fails with "Invalid email or password"
- Check email is correct (case-insensitive)
- Verify password is correct
- Confirm user exists in database
- Check if user/company is active

### JWT token validation fails
- Verify `Authorization` header format: `Bearer <token>`
- Check token hasn't expired
- Verify `JWT_SECRET` environment variable is set correctly
- Ensure token wasn't modified

### SSO login fails
- Verify company has SSO enabled (`login_type = 'sso'`)
- Check SAML configuration in company's `sso_config` field
- Verify IdP certificate is correct
- Check SAML callback URL matches configuration
- Ensure user exists in database

### OTP not received
- Check email configuration (MAIL_* environment variables)
- Verify email is not marked as spam
- Confirm OTP hasn't expired (5 minutes default)
- Check email address is correct

---

---

## Frontend Integration FAQ

This section answers common questions from frontend developers integrating with the authentication API.

### 1. Token Refresh Endpoint Behavior

**Question:** Can the refresh token endpoint work with an expired access token in the Authorization header? Or should we only send the refresh_token?

**Answer:**
✅ **YES - The endpoint works with expired access tokens in the Authorization header.**

**How it works:**
- The `/auth/refresh-token` endpoint is protected by `JwtAuthGuard`
- The guard validates the Authorization header token
- However, **Passport JWT strategy has `ignoreExpiration: false`**, which means:
  - If the token is **completely invalid** (malformed, wrong signature), you'll get 401
  - If the token is **expired**, it will still validate the signature and reject you with 401

**Best Practice for Frontend:**
```javascript
// Option 1: Send both access_token and refresh_token (Recommended)
// This handles both cases - even if access token is expired
fetch('/api/v1/auth/refresh-token', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + accessToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ refresh_token: refreshToken })
});

// Option 2: If you only have refresh_token
// You'll get 401 without Authorization header
// In this case, handle the error by redirecting to login
```

**Error Response:**
- Status: `401 Unauthorized`
- Message: `"Unauthorized"` (if Authorization header is missing or invalid)
- Message: `"Invalid refresh token"` (if refresh_token in body is invalid)

---

### 2. Profile Endpoint Discrepancy

**Question:** Frontend calls `/auth/profile` but README shows `/auth/me`. Which endpoint should we use?

**Answer:**
✅ **Use `/profile` (NOT `/auth/profile` or `/auth/me`)**

**Available Endpoints:**
| Endpoint | Module | Purpose | Response |
|----------|--------|---------|----------|
| `GET /auth/me` | Auth | Minimal user info | Minimal (id, email, name, company) |
| `GET /profile` | Users | Complete profile info | Extended (phone, timestamps, etc.) |

**Recommendation:**
- Use `GET /profile` for fetching complete user information
- Use `GET /auth/me` only if you need minimal user data after login
- Both require JWT authentication

**Frontend Implementation:**
```typescript
// Recommended: Use /profile endpoint
async getProfile() {
  const response = await fetch('/api/v1/profile', {
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  return response.json();
}

// Alternative: Use /auth/me for minimal data
async getCurrentUser() {
  const response = await fetch('/api/v1/auth/me', {
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  return response.json();
}
```

---

### 3. JWT Error Messages

**Question:** When a JWT is expired, does the backend return a specific error message we can detect?

**Answer:**
✅ **Yes, but with limitations. All JWT validation errors return `401 Unauthorized`.**

**JWT Validation Errors:**
```json
// Any JWT validation failure (including expiration)
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

**The Issue:**
- Passport JWT doesn't distinguish between "expired" and "invalid" tokens
- Both scenarios return the same generic 401 error
- You cannot determine if token is expired vs. completely invalid from the response

**Frontend Strategy:**
```typescript
// Strategy 1: Check token expiration locally before sending request
function isTokenExpired(token: string): boolean {
  try {
    const decoded = JSON.parse(atob(token.split('.')[1]));
    return decoded.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

// Strategy 2: Treat all 401 errors the same way
// Attempt to refresh, if refresh fails -> logout
async makeAuthenticatedRequest(url: string) {
  let response = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });

  if (response.status === 401) {
    // Try to refresh
    const refreshResult = await refreshToken();
    if (refreshResult.success) {
      // Retry original request with new token
      response = await fetch(url, {
        headers: { 'Authorization': 'Bearer ' + newAccessToken }
      });
    } else {
      // Refresh failed - logout user
      logout();
    }
  }

  return response;
}
```

---

### 4. Cookie Support

**Question:** Does the backend support setting httpOnly cookies for tokens? Or should we continue with the current localStorage approach?

**Answer:**
⚠️ **Partial YES - Infrastructure is ready, but tokens are NOT automatically set as cookies.**

**Current Implementation:**
- **Session middleware:** `express-session` is configured in `main.ts`
- **CORS credentials:** Enabled with `credentials: true`
- **Secure cookies:** In production, `secure: true` is set
- **Token handling:** Tokens are returned in JSON response body, NOT as cookies

**Token Storage Options:**

```typescript
// Current Approach: localStorage (what backend currently uses)
localStorage.setItem('accessToken', response.data.access_token);
localStorage.setItem('refreshToken', response.data.refresh_token);

// Better Approach: sessionStorage (auto-clears on browser close)
sessionStorage.setItem('accessToken', response.data.access_token);

// Best Approach (requires backend changes): httpOnly cookies
// Backend would set: Set-Cookie: accessToken=...; HttpOnly; Secure;
// Frontend would NOT access tokens directly (automatic CORS)
```

**Recommendation for Frontend:**
- **Continue using localStorage/sessionStorage** for now
- Do NOT store tokens in cookies without backend changes
- Use **sessionStorage** instead of localStorage for better security (auto-clears when browser closes)
- If you want httpOnly cookies, request this feature from the backend team

---

### 5. CORS & Frontend URLs

**Question:** Does the backend allow credentials/cookies in CORS responses? What about SSR token validation?

**Answer:**
✅ **YES - CORS is properly configured for credentials and SSR.**

**CORS Configuration:**
```typescript
// From main.ts (lines 20-24)
app.enableCors({
  origin: frontendUrls?.replace(/\s+/g, '')?.split(',') ?? [],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  credentials: true,  // ✅ Allows credentials/cookies in CORS
});
```

**What This Means:**
- ✅ Frontend domains listed in `FRONTEND_APP_URL` can send credentials
- ✅ Browser will automatically send cookies with requests (if using cookies)
- ✅ Server will set CORS headers to allow credentials
- ✅ SSR applications can validate tokens server-side

**Frontend Implementation:**
```typescript
// For localStorage tokens
fetch('/api/v1/auth/me', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('accessToken')
  }
});

// For cookie-based tokens (if implemented)
fetch('/api/v1/auth/me', {
  credentials: 'include',  // Include cookies in request
});

// For SSR/Next.js
// Tokens passed via Authorization header in server requests
const response = await fetch('http://localhost:3000/api/v1/auth/me', {
  headers: {
    'Authorization': 'Bearer ' + accessToken
  }
});
```

**Frontend URL Configuration:**
```
FRONTEND_APP_URL=http://localhost:3000,https://frontend.example.com
```

---

### 6. Check User Response Format

**Question:** What's the exact response structure for `/auth/check-user`? Is it `is_sso_login` boolean or `login_type` string?

**Answer:**
✅ **Response uses `is_sso_login` as a boolean flag, NOT `login_type` string.**

**Actual Response Format:**

**For Basic Auth Users:**
```json
{
  "is_sso_login": false
}
```

**For SSO Users:**
```json
{
  "is_sso_login": true,
  "company_id": "550e8400-e29b-41d4-a716-446655440000",
  "sso_entry_url": "/auth/sso/550e8400-e29b-41d4-a716-446655440000"
}
```

**Frontend Implementation:**
```typescript
async checkUser(email: string) {
  const response = await fetch('/api/v1/auth/check-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });

  const data = await response.json();

  if (data.is_sso_login) {
    // Show "Login with SSO" button
    // Use data.sso_entry_url to initiate SSO
    window.location.href = data.sso_entry_url;
  } else {
    // Show password login form
  }
}
```

**Common Mistakes to Avoid:**
```typescript
// ❌ WRONG: Looking for login_type string
if (data.login_type === 'sso') { }

// ❌ WRONG: Checking undefined properties
if (data.sso_enabled) { }

// ✅ CORRECT: Use is_sso_login boolean
if (data.is_sso_login) { }

// ✅ CORRECT: Check for sso_entry_url existence
if (data.sso_entry_url) { }
```

---

## References

- [NestJS Authentication](https://docs.nestjs.com/security/authentication)
- [Passport.js Strategies](http://www.passportjs.org/strategies/)
- [JWT.io](https://jwt.io/)
- [SAML 2.0 Specification](https://en.wikipedia.org/wiki/SAML_2.0)
- [bcryptjs Documentation](https://github.com/dcodeIO/bcrypt.js)

---

## Support & Maintenance

For issues or improvements to the authentication module:
1. Check this documentation
2. Review error logs for detailed messages
3. Verify environment configuration
4. Check database schema and data
5. Contact the development team

Last Updated: 2024 - Updated with Frontend Integration FAQ
