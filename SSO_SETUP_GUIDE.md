# Multi-Company Okta SSO Setup Guide

## Overview
The application now supports multiple companies with their own individual Okta SSO configurations. Each company's SSO configuration is stored in the `companies.sso_config` JSONB field in the database.

## What Changed

### 1. New Route Structure
- **Old Routes (Removed):**
  - `GET /api/v1/auth/okta`
  - `POST /api/v1/auth/okta/callback`
  - `GET /api/v1/auth/okta/callback/success`
  - `GET /api/v1/auth/okta/callback/error`

- **New Routes:**
  - `GET /api/v1/auth/sso/:companyId` - SSO initiation (redirects to Okta)
  - `POST /api/v1/auth/sso/callback/:companyId` - SAML callback endpoint
  - `GET /api/v1/auth/sso/callback/:companyId/success` - Success redirect
  - `GET /api/v1/auth/sso/callback/:companyId/error` - Error redirect

### 2. Check User Endpoint Enhancement
The `/api/v1/auth/check-user` endpoint now returns additional fields for SSO users:

**Request:**
```json
{
  "email": "user@sarepta.com"
}
```

**Response (SSO User):**
```json
{
  "is_sso_login": true,
  "company_id": "company_01JQHXYZ123456789ABCDEFG",
  "sso_entry_url": "/api/v1/auth/sso/company_01JQHXYZ123456789ABCDEFG"
}
```

**Response (Credential User):**
```json
{
  "is_sso_login": false
}
```

---

## SSO Config Structure

Each company with SSO enabled must have the following structure in their `sso_config` field:

```json
{
  "saml_entry_point": "https://company.okta.com/app/company_app_1/exk.../sso/saml",
  "saml_issuer": "http://www.okta.com/exk...",
  "saml_callback_url": "https://yourapp.com/api/v1/auth/sso/callback/{COMPANY_ID}",
  "saml_audience_url": "https://yourapp.com/api/v1/auth/sso/{COMPANY_ID}",
  "saml_certificate": "MIIDnjCCAoag...full certificate here...mSca"
}
```

### Field Descriptions:

| Field | Description | Example |
|-------|-------------|---------|
| `saml_entry_point` | Okta SSO URL from Okta dashboard | `https://sarepta.okta.com/app/sarepta_trltaperentallibrary_1/exks8j9mrd5tfJhxZ0x7/sso/saml` |
| `saml_issuer` | Issuer identifier from Okta | `http://www.okta.com/exks8j9mrd5tfJhxZ0x7` |
| `saml_callback_url` | Callback URL (with company ID) | `https://159.203.4.73.nip.io/api/v1/auth/sso/callback/company_01JQHXYZ...` |
| `saml_audience_url` | Audience/Entity ID (with company ID) | `https://159.203.4.73.nip.io/api/v1/auth/sso/company_01JQHXYZ...` |
| `saml_certificate` | X.509 certificate (single line, no headers) | `MIIDnjCCAoag...` |

---

## Manual Setup Instructions

### Step 1: Get Company ID
First, identify the company ID that needs SSO configuration:

```sql
SELECT id, name, login_type FROM companies WHERE name = 'Sarepta';
```

Example output:
```
id                              | name    | login_type
--------------------------------|---------|------------
company_01JQHXYZ123456789ABCDEFG| Sarepta | sso
```

### Step 2: Configure Okta Dashboard

In the company's Okta dashboard, configure the following URLs (replace `{COMPANY_ID}` with actual company ID):

1. **Single sign-on URL:** `https://yourapp.com/api/v1/auth/sso/{COMPANY_ID}`
2. **Audience URI (SP Entity ID):** `https://yourapp.com/api/v1/auth/sso/{COMPANY_ID}`
3. **Assertion Consumer Service (ACS) URL:** `https://yourapp.com/api/v1/auth/sso/callback/{COMPANY_ID}`

### Step 3: Get Okta Configuration

From the Okta dashboard, collect:
- SSO URL (Entry Point)
- Issuer
- X.509 Certificate

### Step 4: Update Database

Run the following SQL to update the company's `sso_config`:

```sql
UPDATE companies
SET sso_config = '{
  "saml_entry_point": "https://sarepta.okta.com/app/sarepta_trltaperentallibrary_1/exks8j9mrd5tfJhxZ0x7/sso/saml",
  "saml_issuer": "http://www.okta.com/exks8j9mrd5tfJhxZ0x7",
  "saml_callback_url": "https://159.203.4.73.nip.io/api/v1/auth/sso/callback/company_01JQHXYZ123456789ABCDEFG",
  "saml_audience_url": "https://159.203.4.73.nip.io/api/v1/auth/sso/company_01JQHXYZ123456789ABCDEFG",
  "saml_certificate": "MIIDnjCCAoagAwIBAgIGAV2nMdcmMA0GCSqGSIb3DQEBCwUAMIGPMQswCQYDVQQGEwJVUzETMBEGA1UECAwKQ2FsaWZvcm5pYTEWMBQGA1UEBwwNU2FuIEZyYW5jaXNjbzENMAsGA1UECgwET2t0YTEUMBIGA1UECwwLU1NPUHJvdmlkZXIxEDAOBgNVBAMMB3NhcmVwdGExHDAaBgkqhkiG9w0BCQEWDWluZm9Ab2t0YS5jb20wHhcNMTcwODAzMDgyMzA3WhcNMjcwODAzMDgyNDA3WjCBjzELMAkGA1UEBhMCVVMxEzARBgNVBAgMCkNhbGlmb3JuaWExFjAUBgNVBAcMDVNhbiBGcmFuY2lzY28xDTALBgNVBAoMBE9rdGExFDASBgNVBAsMC1NTT1Byb3ZpZGVyMRAwDgYDVQQDDAdzYXJlcHRhMRwwGgYJKoZIhvcNAQkBFg1pbmZvQG9rdGEuY29tMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsgVMHFI9XzmgZ6tje186vf1QC+E8jO+8jtBz5yvSeVSqc2YYQASI3GqmK9EyUb892LLNk1I6dAciVwH1i6XMwWDeEhJgJb/Gxc6a4/IqGjfq1q0hHHGyqqqPqNjUmUn785dPJecHQKjx3S0py5MjJHmRBbA/ZQHnG2KBsCSPHpXK5wGbvcWPovugY4Ojfk34bG0wBebAYby4Z55Snb29PdoGN8x9YKmmYSAD815+DFWc3reUs/IjKePup8dW2DI0VVs/Sl3LGwiCjEDzM41QCsMCBj47m+2WvEzuOVuOBptkcZQn4qpyrI3UUKUZX4I25Ox2B7+4Ngov2h6JvPP8hQIDAQABMA0GCSqGSIb3DQEBCwUAA4IBAQACZQyeXLkj0rGTYvffJ83Up0cM2lbG3s4MBNY2ogEFBJI+ic+h13fSnQSDjlU2sqgKP0u71Gh4kY6d2BovCs9y6fG2AissrbsOvJj6LQAeODkHOIpwAGKCdnCj2VypjNmbIY/3wxJO9PMzV2FX4Sm7xM0quC/R4hwu6SlcMXkpIcfswfan6t5BQAJQLfMutphf7FxI+3GMliHkeFjtcYn3ynZoDQpc5G3zOEVelEM2htBfquxkLt9niQBfi6wh1AnWxoNh20EQjobj+dr7VvShcipvFtrCNMjU2RZByJQQ9qwcsQ5JEfp+rAMP7HJf81HIGJNUXUX9MSkSRRlvmSca"
}'::jsonb
WHERE id = 'company_01JQHXYZ123456789ABCDEFG';
```

**Important Notes:**
- Replace `company_01JQHXYZ123456789ABCDEFG` with the actual company ID
- Certificate must be a **single-line string** (no line breaks, no `-----BEGIN CERTIFICATE-----` headers)
- All URLs must match exactly what's configured in Okta

### Step 5: Verify Configuration

```sql
SELECT
  id,
  name,
  login_type,
  sso_config->'saml_entry_point' as entry_point,
  sso_config->'saml_issuer' as issuer
FROM companies
WHERE id = 'company_01JQHXYZ123456789ABCDEFG';
```

---

## Example: Sarepta Company Configuration

### Database Update:
```sql
UPDATE companies
SET sso_config = '{
  "saml_entry_point": "https://sarepta.okta.com/app/sarepta_trltaperentallibrary_1/exks8j9mrd5tfJhxZ0x7/sso/saml",
  "saml_issuer": "http://www.okta.com/exks8j9mrd5tfJhxZ0x7",
  "saml_callback_url": "https://159.203.4.73.nip.io/api/v1/auth/sso/callback/company_01JQHXYZ123456789ABCDEFG",
  "saml_audience_url": "https://159.203.4.73.nip.io/api/v1/auth/sso/company_01JQHXYZ123456789ABCDEFG",
  "saml_certificate": "MIIDnjCCAoagAwIBAgIGAV2nMdcmMA0GCSqGSIb3DQEBCwUAMIGPMQswCQYDVQQGEwJVUzETMBEGA1UECAwKQ2FsaWZvcm5pYTEWMBQGA1UEBwwNU2FuIEZyYW5jaXNjbzENMAsGA1UECgwET2t0YTEUMBIGA1UECwwLU1NPUHJvdmlkZXIxEDAOBgNVBAMMB3NhcmVwdGExHDAaBgkqhkiG9w0BCQEWDWluZm9Ab2t0YS5jb20wHhcNMTcwODAzMDgyMzA3WhcNMjcwODAzMDgyNDA3WjCBjzELMAkGA1UEBhMCVVMxEzARBgNVBAgMCkNhbGlmb3JuaWExFjAUBgNVBAcMDVNhbiBGcmFuY2lzY28xDTALBgNVBAoMBE9rdGExFDASBgNVBAsMC1NTT1Byb3ZpZGVyMRAwDgYDVQQDDAdzYXJlcHRhMRwwGgYJKoZIhvcNAQkBFg1pbmZvQG9rdGEuY29tMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsgVMHFI9XzmgZ6tje186vf1QC+E8jO+8jtBz5yvSeVSqc2YYQASI3GqmK9EyUb892LLNk1I6dAciVwH1i6XMwWDeEhJgJb/Gxc6a4/IqGjfq1q0hHHGyqqqPqNjUmUn785dPJecHQKjx3S0py5MjJHmRBbA/ZQHnG2KBsCSPHpXK5wGbvcWPovugY4Ojfk34bG0wBebAYby4Z55Snb29PdoGN8x9YKmmYSAD815+DFWc3reUs/IjKePup8dW2DI0VVs/Sl3LGwiCjEDzM41QCsMCBj47m+2WvEzuOVuOBptkcZQn4qpyrI3UUKUZX4I25Ox2B7+4Ngov2h6JvPP8hQIDAQABMA0GCSqGSIb3DQEBCwUAA4IBAQACZQyeXLkj0rGTYvffJ83Up0cM2lbG3s4MBNY2ogEFBJI+ic+h13fSnQSDjlU2sqgKP0u71Gh4kY6d2BovCs9y6fG2AissrbsOvJj6LQAeODkHOIpwAGKCdnCj2VypjNmbIY/3wxJO9PMzV2FX4Sm7xM0quC/R4hwu6SlcMXkpIcfswfan6t5BQAJQLfMutphf7FxI+3GMliHkeFjtcYn3ynZoDQpc5G3zOEVelEM2htBfquxkLt9niQBfi6wh1AnWxoNh20EQjobj+dr7VvShcipvFtrCNMjU2RZByJQQ9qwcsQ5JEfp+rAMP7HJf81HIGJNUXUX9MSkSRRlvmSca"
}'::jsonb
WHERE name = 'Sarepta';
```

---

## Mobile App Integration Flow

1. **User enters email** in mobile app
2. **App calls** `POST /api/v1/auth/check-user` with email
3. **Backend returns:**
   - If SSO: `{ is_sso_login: true, company_id: "...", sso_entry_url: "/api/v1/auth/sso/..." }`
   - If Credentials: `{ is_sso_login: false }`
4. **App redirects** user to `sso_entry_url` if SSO enabled
5. **User authenticates** with Okta
6. **Okta redirects** back to callback URL with SAML assertion
7. **Backend validates** SAML assertion and user
8. **Backend redirects** to success URL with tokens
9. **App receives** access and refresh tokens

---

## Testing

### Test SSO Login:
```bash
# 1. Check user
curl -X POST http://localhost/api/v1/auth/check-user \
  -H "Content-Type: application/json" \
  -d '{"email": "user@sarepta.com"}'

# 2. Initiate SSO (replace {companyId} with actual ID)
curl http://localhost/api/v1/auth/sso/{companyId}
# This will redirect to Okta login page
```

### Verify Database:
```sql
-- Check all SSO-enabled companies
SELECT
  id,
  name,
  login_type,
  CASE
    WHEN sso_config IS NOT NULL THEN 'Configured'
    ELSE 'Missing'
  END as sso_config_status
FROM companies
WHERE login_type = 'sso';
```

---

## Troubleshooting

### Error: "Company does not support SSO login"
- **Cause:** Company's `login_type` is not set to `'sso'`
- **Fix:** Update company: `UPDATE companies SET login_type = 'sso' WHERE id = '...'`

### Error: "SSO configuration is missing"
- **Cause:** `sso_config` field is `NULL`
- **Fix:** Follow Step 4 above to populate the configuration

### Error: "Invalid SAML issuer"
- **Cause:** `saml_issuer` in database doesn't match the issuer from Okta's SAML response
- **Fix:** Verify issuer value from Okta dashboard matches database exactly

### Error: "User does not belong to this company"
- **Cause:** User's `company_id` doesn't match the company ID in the URL
- **Fix:** Ensure user is assigned to the correct company in the database

---

## Security Considerations

1. **Certificate Storage:** X.509 certificates are stored in the database. Ensure database backups are secure.
2. **URL Validation:** The system validates that the SAML issuer matches the configured issuer.
3. **Company Isolation:** Users can only authenticate through their own company's SSO configuration.
4. **Session Management:** Uses existing JWT-based session management after SSO authentication.

---

## Migration from Old System

If you had the old single-SSO setup with environment variables:

1. **Identify the company** that was using the env-based SSO
2. **Get the company ID** from the database
3. **Collect the values** from your `.env` file:
   - `SAML_ENTRY_POINT`
   - `SAML_ISSUER`
   - `SAML_CERTIFICATE`
4. **Update the callback and audience URLs** to include the company ID
5. **Run the SQL update** as shown in Step 4 above
6. **Update Okta dashboard** with new URLs containing company ID
7. **Test the SSO flow** to ensure it works
8. **Remove old env variables** from `.env` file (they are no longer used)
