# Multi-Company SSO Implementation Summary

## 📚 Documentation Files

1. **[SSO_SETUP_GUIDE.md](./SSO_SETUP_GUIDE.md)** - Backend/Database setup for administrators
   - SSO config structure
   - Database setup instructions
   - Okta dashboard configuration
   - Testing and troubleshooting

2. **[SSO_CLIENT_INTEGRATION_GUIDE.md](./SSO_CLIENT_INTEGRATION_GUIDE.md)** - Frontend implementation for developers
   - Mobile app implementation (React Native & Flutter)
   - Web app implementation (React)
   - Complete code examples
   - Error handling
   - Testing guide

---

## 🚀 Quick Start

### For Backend Administrators

1. **Get Company ID:**
   ```sql
   SELECT id, name FROM companies WHERE name = 'Sarepta';
   ```

2. **Update SSO Config:**
   ```sql
   UPDATE companies
   SET sso_config = '{
     "saml_entry_point": "https://sarepta.okta.com/app/.../sso/saml",
     "saml_issuer": "http://www.okta.com/exk...",
     "saml_callback_url": "https://yourapp.com/api/v1/auth/sso/callback/{COMPANY_ID}",
     "saml_audience_url": "https://yourapp.com/api/v1/auth/sso/{COMPANY_ID}",
     "saml_certificate": "MIIDnjCCAoag...full cert...mSca"
   }'::jsonb
   WHERE id = '{COMPANY_ID}';
   ```

3. **Configure Okta Dashboard** with URLs containing company ID

See [SSO_SETUP_GUIDE.md](./SSO_SETUP_GUIDE.md) for detailed instructions.

---

### For Frontend Developers

#### Step 1: Check User
```typescript
POST /api/v1/auth/check-user
Body: { "email": "user@example.com" }

Response (SSO):
{
  "is_sso_login": true,
  "company_id": "company_...",
  "sso_entry_url": "/api/v1/auth/sso/company_..."
}

Response (Credential):
{
  "is_sso_login": false
}
```

#### Step 2: Handle Login
```typescript
// If SSO
window.location.href = `${API_BASE_URL}${sso_entry_url}`;

// If Credential
POST /api/v1/auth/login
Body: { "email": "...", "password": "..." }
```

#### Step 3: Handle Callback
```typescript
// SSO redirects to:
// https://yourapp.com/sso-signin?access_token=...&refresh_token=...

// Extract tokens from URL and store
const params = new URLSearchParams(window.location.search);
const accessToken = params.get('access_token');
const refreshToken = params.get('refresh_token');

localStorage.setItem('access_token', accessToken);
localStorage.setItem('refresh_token', refreshToken);
```

See [SSO_CLIENT_INTEGRATION_GUIDE.md](./SSO_CLIENT_INTEGRATION_GUIDE.md) for complete implementations.

---

## 🔄 Authentication Flow

```
User Email → Check User API → SSO or Credential?
                                    ↓
                    ┌──────────────┴──────────────┐
                    ↓                             ↓
              SSO Login                    Credential Login
                    ↓                             ↓
          Redirect to Okta              Password Input
                    ↓                             ↓
          User Authenticates            Login API Call
                    ↓                             ↓
          SAML Callback                  JWT Tokens
                    ↓                             ↓
          Validate & Generate JWT         Store Tokens
                    ↓                             ↓
          Redirect with Tokens            Navigate to App
                    ↓
          Extract & Store Tokens
                    ↓
          Navigate to App
```

---

## 🎯 Key Changes

### API Endpoints

| Old Endpoint | New Endpoint | Purpose |
|-------------|--------------|---------|
| `GET /auth/okta` | `GET /auth/sso/:companyId` | Initiate SSO |
| `POST /auth/okta/callback` | `POST /auth/sso/callback/:companyId` | SAML callback |
| N/A | Enhanced `/auth/check-user` | Returns company ID & SSO URL |

### Check User Response Enhancement

**Before:**
```json
{ "is_sso_login": true }
```

**After:**
```json
{
  "is_sso_login": true,
  "company_id": "company_01JQHXYZ123456789ABCDEFG",
  "sso_entry_url": "/api/v1/auth/sso/company_01JQHXYZ123456789ABCDEFG"
}
```

---

## 📋 Configuration Structure

### Database (companies.sso_config)
```json
{
  "saml_entry_point": "Okta SSO URL",
  "saml_issuer": "Okta Issuer ID",
  "saml_callback_url": "Your callback URL with company ID",
  "saml_audience_url": "Your audience URL with company ID",
  "saml_certificate": "X.509 certificate (single line, no headers)"
}
```

### Okta Dashboard Settings
- **Single sign-on URL:** `https://yourapp.com/api/v1/auth/sso/{COMPANY_ID}`
- **Audience URI:** `https://yourapp.com/api/v1/auth/sso/{COMPANY_ID}`
- **ACS URL:** `https://yourapp.com/api/v1/auth/sso/callback/{COMPANY_ID}`

---

## ✅ Testing Checklist

### Backend
- [ ] Company has `login_type = 'sso'`
- [ ] Company has valid `sso_config` in database
- [ ] Okta dashboard configured with correct URLs
- [ ] Certificate is single-line, no headers
- [ ] All 5 SSO config fields are populated

### Frontend - Web
- [ ] Email input works
- [ ] Check user API call succeeds
- [ ] SSO redirect works
- [ ] Credential login works
- [ ] Callback URL extracts tokens
- [ ] Tokens stored correctly
- [ ] User redirected to dashboard

### Frontend - Mobile
- [ ] In-app browser opens for SSO
- [ ] Okta login page loads
- [ ] Authentication succeeds
- [ ] Callback captured by app
- [ ] Tokens extracted from URL
- [ ] Tokens stored in secure storage
- [ ] Navigation to home screen works

---

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| "Company does not support SSO login" | Set `login_type = 'sso'` in database |
| "SSO configuration is missing" | Populate `sso_config` field |
| "Invalid SAML issuer" | Verify issuer matches Okta exactly |
| SSO redirect doesn't work | Check FRONTEND_APP_URL in .env |
| Tokens not appearing in URL | Verify callback route matches redirect |
| In-app browser doesn't open (mobile) | Check permissions & library installation |

---

## 🔐 Security Considerations

1. **Always use HTTPS** in production
2. **Validate JWT tokens** on every API request
3. **Store tokens securely:**
   - Mobile: KeyChain (iOS), KeyStore (Android)
   - Web: HttpOnly cookies or secure localStorage
4. **Handle token expiry** with refresh tokens
5. **Validate SAML issuer** on backend
6. **Isolate companies** - users can only auth through their company's SSO

---

## 📞 Support

For issues or questions:
1. Check [SSO_SETUP_GUIDE.md](./SSO_SETUP_GUIDE.md) for backend/database setup
2. Check [SSO_CLIENT_INTEGRATION_GUIDE.md](./SSO_CLIENT_INTEGRATION_GUIDE.md) for frontend implementation
3. Review troubleshooting sections in both guides
4. Contact the development team

---

## 🎓 Additional Resources

- [Backend Setup Guide](./SSO_SETUP_GUIDE.md) - Database and Okta configuration
- [Client Integration Guide](./SSO_CLIENT_INTEGRATION_GUIDE.md) - Mobile and web implementation
- [SAML 2.0 Overview](http://docs.oasis-open.org/security/saml/Post2.0/sstc-saml-tech-overview-2.0.html)
- [Okta SAML Docs](https://developer.okta.com/docs/concepts/saml/)

---

## 📝 Implementation Checklist

### Phase 1: Backend Setup
- [x] SSO config interface created
- [x] Dynamic SAML strategy implemented
- [x] Auth controller updated with new routes
- [x] Auth service enhanced (check-user endpoint)
- [x] Old okta.strategy.ts removed
- [x] Environment variables deprecated

### Phase 2: Database Configuration
- [ ] Get company IDs for SSO-enabled companies
- [ ] Update `sso_config` for each company
- [ ] Configure Okta dashboards
- [ ] Test SSO login for each company
- [ ] Verify SAML validation works

### Phase 3: Frontend Integration
- [ ] Update login screens (web/mobile)
- [ ] Implement check-user API call
- [ ] Add SSO redirect logic
- [ ] Handle callback URLs
- [ ] Store and manage JWT tokens
- [ ] Test complete auth flows
- [ ] Deploy to production

---

**Implementation Complete:** ✅ Backend | ⏳ Database Setup | ⏳ Frontend Integration
