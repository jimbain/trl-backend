# SSO Client Integration Guide
## Mobile App & Web App Implementation

This guide explains how to implement the multi-company Okta SSO feature in your mobile and web applications.

---

## Table of Contents
1. [Authentication Flow Overview](#authentication-flow-overview)
2. [API Endpoints](#api-endpoints)
3. [Mobile App Implementation (React Native / Flutter)](#mobile-app-implementation)
4. [Web App Implementation (React / Vue / Angular)](#web-app-implementation)
5. [Error Handling](#error-handling)
6. [Testing](#testing)

---

## Authentication Flow Overview

```
┌─────────────┐
│   User      │
│ Enters Email│
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│ App calls /auth/check-user      │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ Backend checks user's company   │
└──────┬──────────────────────────┘
       │
       ├──────────────┬──────────────┐
       ▼              ▼              ▼
  SSO Login    Credential Login   Error
  (Company     (Show password    (User not
   has SSO)     input field)      found)
       │
       │
┌──────▼──────────────────────────┐
│ App redirects to SSO entry URL  │
│ /auth/sso/:companyId            │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ Backend redirects to Okta       │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ User authenticates with Okta    │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ Okta sends SAML assertion       │
│ to /auth/sso/callback/:companyId│
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ Backend validates SAML          │
│ and generates JWT tokens        │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ Backend redirects to success    │
│ URL with access & refresh tokens│
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ App receives tokens and logs in │
└─────────────────────────────────┘
```

---

## API Endpoints

### 1. Check User Endpoint
**Purpose:** Determine if user should use SSO or credential-based login

**Endpoint:** `POST /api/v1/auth/check-user`

**Request:**
```json
{
  "email": "user@example.com"
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

**Error Response:**
```json
{
  "errors": {
    "email": ["User does not exist"]
  }
}
```

### 2. SSO Login Endpoint
**Purpose:** Initiate SSO login flow (redirects to Okta)

**Endpoint:** `GET /api/v1/auth/sso/:companyId`

**Behavior:**
- Redirects user to company-specific Okta login page
- No JSON response, pure HTTP redirect

### 3. SSO Callback Success
**Endpoint:** `GET /api/v1/auth/sso/callback/:companyId/success`

**Query Parameters:**
- `access_token`: JWT access token
- `refresh_token`: JWT refresh token

**Behavior:**
- Redirects to frontend URL with tokens
- Example: `https://app.example.com/sso-signin?access_token=...&refresh_token=...`

### 4. SSO Callback Error
**Endpoint:** `GET /api/v1/auth/sso/callback/:companyId/error`

**Query Parameters:**
- `message`: Error message

**Behavior:**
- Redirects to frontend URL with error message
- Example: `https://app.example.com/sso-signin?message=User+does+not+exist`

---

## Mobile App Implementation

### React Native Implementation

#### 1. Install Dependencies
```bash
npm install react-native-inappbrowser-reborn
# or
yarn add react-native-inappbrowser-reborn
```

#### 2. Login Screen Component

```typescript
import React, { useState } from 'react';
import { View, TextInput, Button, Alert } from 'react-native';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://159.203.4.73.nip.io/api/v1';

export const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Step 1: Check if user should use SSO or credentials
  const handleEmailSubmit = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/check-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        // User not found
        Alert.alert('Error', data.errors?.email?.[0] || 'User not found');
        return;
      }

      if (data.is_sso_login) {
        // User should use SSO
        handleSSOLogin(data.company_id, data.sso_entry_url);
      } else {
        // User should use credential login
        setShowPassword(true);
      }
    } catch (error) {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Handle SSO login via in-app browser
  const handleSSOLogin = async (companyId: string, ssoEntryUrl: string) => {
    try {
      const ssoUrl = `${API_BASE_URL}${ssoEntryUrl}`;

      // Open in-app browser for SSO
      if (await InAppBrowser.isAvailable()) {
        const result = await InAppBrowser.openAuth(
          ssoUrl,
          `${API_BASE_URL}/auth/sso/callback/${companyId}/success`,
          {
            // iOS options
            ephemeralWebSession: false,
            // Android options
            showTitle: true,
            enableUrlBarHiding: true,
            enableDefaultShare: false,
          }
        );

        if (result.type === 'success' && result.url) {
          // Extract tokens from callback URL
          const tokens = extractTokensFromUrl(result.url);
          if (tokens) {
            await handleSuccessfulLogin(tokens);
          }
        }
      } else {
        Alert.alert('Error', 'Browser not available');
      }
    } catch (error) {
      console.error('SSO Login Error:', error);
      Alert.alert('Error', 'SSO login failed. Please try again.');
    }
  };

  // Step 3: Extract tokens from callback URL
  const extractTokensFromUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      const accessToken = urlObj.searchParams.get('access_token');
      const refreshToken = urlObj.searchParams.get('refresh_token');
      const errorMessage = urlObj.searchParams.get('message');

      if (errorMessage) {
        Alert.alert('SSO Error', errorMessage);
        return null;
      }

      if (accessToken && refreshToken) {
        return { access_token: accessToken, refresh_token: refreshToken };
      }

      return null;
    } catch (error) {
      console.error('Error parsing URL:', error);
      return null;
    }
  };

  // Step 4: Handle credential-based login
  const handleCredentialLogin = async () => {
    if (!password) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Error', data.errors?.password?.[0] || 'Login failed');
        return;
      }

      await handleSuccessfulLogin(data);
    } catch (error) {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 5: Store tokens and navigate
  const handleSuccessfulLogin = async (tokens: {
    access_token: string;
    refresh_token: string;
  }) => {
    try {
      await AsyncStorage.setItem('access_token', tokens.access_token);
      await AsyncStorage.setItem('refresh_token', tokens.refresh_token);

      // Navigate to main app screen
      // navigation.navigate('Home');
      console.log('Login successful!');
    } catch (error) {
      Alert.alert('Error', 'Failed to save login session');
    }
  };

  return (
    <View>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        editable={!showPassword}
      />

      {showPassword && (
        <TextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
      )}

      <Button
        title={showPassword ? 'Login' : 'Continue'}
        onPress={showPassword ? handleCredentialLogin : handleEmailSubmit}
        disabled={loading}
      />

      {showPassword && (
        <Button
          title="Back"
          onPress={() => {
            setShowPassword(false);
            setPassword('');
          }}
        />
      )}
    </View>
  );
};
```

### Flutter Implementation

```dart
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';

const String API_BASE_URL = 'https://159.203.4.73.nip.io/api/v1';

class LoginScreen extends StatefulWidget {
  @override
  _LoginScreenState createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _showPassword = false;
  bool _loading = false;

  // Step 1: Check if user should use SSO
  Future<void> _handleEmailSubmit() async {
    if (_emailController.text.isEmpty) {
      _showError('Please enter your email');
      return;
    }

    setState(() => _loading = true);

    try {
      final response = await http.post(
        Uri.parse('$API_BASE_URL/auth/check-user'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': _emailController.text}),
      );

      final data = jsonDecode(response.body);

      if (response.statusCode != 200) {
        _showError(data['errors']?['email']?[0] ?? 'User not found');
        return;
      }

      if (data['is_sso_login'] == true) {
        // SSO Login
        _handleSSOLogin(data['company_id'], data['sso_entry_url']);
      } else {
        // Credential Login
        setState(() => _showPassword = true);
      }
    } catch (e) {
      _showError('Network error. Please try again.');
    } finally {
      setState(() => _loading = false);
    }
  }

  // Step 2: Handle SSO login with in-app browser
  Future<void> _handleSSOLogin(String companyId, String ssoEntryUrl) async {
    final ssoUrl = '$API_BASE_URL$ssoEntryUrl';
    final callbackUrl = '$API_BASE_URL/auth/sso/callback/$companyId/success';

    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => SSOWebView(
          ssoUrl: ssoUrl,
          callbackUrl: callbackUrl,
          onSuccess: _handleSuccessfulLogin,
          onError: _showError,
        ),
      ),
    );
  }

  // Step 3: Handle credential login
  Future<void> _handleCredentialLogin() async {
    if (_passwordController.text.isEmpty) {
      _showError('Please enter your password');
      return;
    }

    setState(() => _loading = true);

    try {
      final response = await http.post(
        Uri.parse('$API_BASE_URL/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email': _emailController.text,
          'password': _passwordController.text,
        }),
      );

      final data = jsonDecode(response.body);

      if (response.statusCode != 200) {
        _showError(data['errors']?['password']?[0] ?? 'Login failed');
        return;
      }

      await _handleSuccessfulLogin(
        data['access_token'],
        data['refresh_token'],
      );
    } catch (e) {
      _showError('Network error. Please try again.');
    } finally {
      setState(() => _loading = false);
    }
  }

  // Step 4: Store tokens
  Future<void> _handleSuccessfulLogin(
    String accessToken,
    String refreshToken,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('access_token', accessToken);
    await prefs.setString('refresh_token', refreshToken);

    // Navigate to home screen
    // Navigator.pushReplacementNamed(context, '/home');
  }

  void _showError(String message) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Error'),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Login')),
      body: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              controller: _emailController,
              decoration: InputDecoration(labelText: 'Email'),
              keyboardType: TextInputType.emailAddress,
              enabled: !_showPassword,
            ),
            if (_showPassword)
              TextField(
                controller: _passwordController,
                decoration: InputDecoration(labelText: 'Password'),
                obscureText: true,
              ),
            SizedBox(height: 20),
            ElevatedButton(
              onPressed: _loading
                  ? null
                  : _showPassword
                      ? _handleCredentialLogin
                      : _handleEmailSubmit,
              child: Text(_showPassword ? 'Login' : 'Continue'),
            ),
            if (_showPassword)
              TextButton(
                onPressed: () {
                  setState(() {
                    _showPassword = false;
                    _passwordController.clear();
                  });
                },
                child: Text('Back'),
              ),
          ],
        ),
      ),
    );
  }
}

// SSO WebView Component
class SSOWebView extends StatelessWidget {
  final String ssoUrl;
  final String callbackUrl;
  final Function(String, String) onSuccess;
  final Function(String) onError;

  SSOWebView({
    required this.ssoUrl,
    required this.callbackUrl,
    required this.onSuccess,
    required this.onError,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('SSO Login')),
      body: InAppWebView(
        initialUrlRequest: URLRequest(url: Uri.parse(ssoUrl)),
        onLoadStop: (controller, url) async {
          if (url.toString().startsWith(callbackUrl)) {
            final accessToken = url?.queryParameters['access_token'];
            final refreshToken = url?.queryParameters['refresh_token'];
            final errorMessage = url?.queryParameters['message'];

            if (errorMessage != null) {
              Navigator.pop(context);
              onError(errorMessage);
            } else if (accessToken != null && refreshToken != null) {
              Navigator.pop(context);
              await onSuccess(accessToken, refreshToken);
            }
          }
        },
      ),
    );
  }
}
```

---

## Web App Implementation

### React Implementation

```typescript
// services/authService.ts
import axios from 'axios';

const API_BASE_URL = 'https://159.203.4.73.nip.io/api/v1';

export interface CheckUserResponse {
  is_sso_login: boolean;
  company_id?: string;
  sso_entry_url?: string;
}

export const checkUser = async (email: string): Promise<CheckUserResponse> => {
  const response = await axios.post(`${API_BASE_URL}/auth/check-user`, {
    email,
  });
  return response.data;
};

export const loginWithCredentials = async (
  email: string,
  password: string
) => {
  const response = await axios.post(`${API_BASE_URL}/auth/login`, {
    email,
    password,
  });
  return response.data;
};

export const storeTokens = (accessToken: string, refreshToken: string) => {
  localStorage.setItem('access_token', accessToken);
  localStorage.setItem('refresh_token', refreshToken);
};

export const getStoredTokens = () => {
  return {
    accessToken: localStorage.getItem('access_token'),
    refreshToken: localStorage.getItem('refresh_token'),
  };
};
```

```typescript
// components/LoginForm.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { checkUser, loginWithCredentials, storeTokens } from '../services/authService';

const API_BASE_URL = 'https://159.203.4.73.nip.io/api/v1';

export const LoginForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const location = useLocation();

  // Handle SSO callback on component mount
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const errorMessage = params.get('message');

    if (errorMessage) {
      setError(errorMessage);
    } else if (accessToken && refreshToken) {
      handleSuccessfulLogin(accessToken, refreshToken);
    }
  }, [location]);

  // Step 1: Check if user should use SSO
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email');
      return;
    }

    setLoading(true);
    try {
      const data = await checkUser(email);

      if (data.is_sso_login && data.sso_entry_url) {
        // Redirect to SSO
        window.location.href = `${API_BASE_URL}${data.sso_entry_url}`;
      } else {
        // Show password field for credential login
        setShowPassword(true);
      }
    } catch (err: any) {
      setError(err.response?.data?.errors?.email?.[0] || 'User not found');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Handle credential login
  const handleCredentialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password) {
      setError('Please enter your password');
      return;
    }

    setLoading(true);
    try {
      const data = await loginWithCredentials(email, password);
      handleSuccessfulLogin(data.access_token, data.refresh_token);
    } catch (err: any) {
      setError(
        err.response?.data?.errors?.password?.[0] || 'Login failed'
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Store tokens and navigate
  const handleSuccessfulLogin = (accessToken: string, refreshToken: string) => {
    storeTokens(accessToken, refreshToken);
    navigate('/dashboard');
  };

  return (
    <div className="login-form">
      <h2>Login</h2>

      {error && <div className="error-message">{error}</div>}

      <form onSubmit={showPassword ? handleCredentialLogin : handleEmailSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={showPassword || loading}
          required
        />

        {showPassword && (
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
          />
        )}

        <button type="submit" disabled={loading}>
          {loading ? 'Loading...' : showPassword ? 'Login' : 'Continue'}
        </button>

        {showPassword && (
          <button
            type="button"
            onClick={() => {
              setShowPassword(false);
              setPassword('');
              setError('');
            }}
          >
            Back
          </button>
        )}
      </form>
    </div>
  );
};
```

```typescript
// App.tsx - Setup routes
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LoginForm } from './components/LoginForm';
import { Dashboard } from './components/Dashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginForm />} />
        <Route path="/sso-signin" element={<LoginForm />} /> {/* SSO callback route */}
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
```

---

## Error Handling

### Common Errors and Solutions

| Error Message | Cause | Solution |
|--------------|-------|----------|
| "User does not exist" | Email not found in database | Verify email or contact support |
| "Company does not support SSO login" | Company's `login_type` is not 'sso' | Contact admin to enable SSO |
| "SSO configuration is missing" | Company's `sso_config` is null | Contact admin to configure SSO |
| "Invalid SAML issuer" | SAML issuer mismatch | Check Okta configuration |
| "User does not belong to this company" | User's company_id doesn't match URL | Contact support |

### Error Handling Example

```typescript
const handleSSOError = (error: any) => {
  if (error.response) {
    // Server responded with error
    const statusCode = error.response.status;
    const message = error.response.data?.message || 'An error occurred';

    switch (statusCode) {
      case 400:
        alert('Invalid request. Please try again.');
        break;
      case 401:
        alert('Authentication failed. Please contact support.');
        break;
      case 404:
        alert('Company not found. Please contact support.');
        break;
      case 500:
        alert('Server error. Please try again later.');
        break;
      default:
        alert(message);
    }
  } else if (error.request) {
    // Request made but no response
    alert('Network error. Please check your connection.');
  } else {
    // Something else happened
    alert('An unexpected error occurred.');
  }
};
```

---

## Testing

### Test Scenarios

#### 1. Test SSO Login Flow
```typescript
// Test with SSO-enabled user
const testSSOLogin = async () => {
  // Step 1: Check user
  const response = await fetch('http://localhost/api/v1/auth/check-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@sarepta.com' }),
  });

  const data = await response.json();
  console.log('Check User Response:', data);
  // Expected: { is_sso_login: true, company_id: "...", sso_entry_url: "..." }

  // Step 2: Open SSO URL in browser
  // window.location.href = `${API_BASE_URL}${data.sso_entry_url}`;
};
```

#### 2. Test Credential Login Flow
```typescript
// Test with credential-based user
const testCredentialLogin = async () => {
  // Step 1: Check user
  const checkResponse = await fetch('http://localhost/api/v1/auth/check-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@company.com' }),
  });

  const checkData = await checkResponse.json();
  console.log('Check User Response:', checkData);
  // Expected: { is_sso_login: false }

  // Step 2: Login with credentials
  const loginResponse = await fetch('http://localhost/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'user@company.com',
      password: 'password123',
    }),
  });

  const loginData = await loginResponse.json();
  console.log('Login Response:', loginData);
  // Expected: { access_token: "...", refresh_token: "...", user: {...} }
};
```

### Manual Testing Checklist

- [ ] User with SSO-enabled company can login via Okta
- [ ] User with credential-based company can login with password
- [ ] Invalid email shows appropriate error
- [ ] SSO redirect works correctly
- [ ] Callback URL receives tokens
- [ ] Tokens are stored correctly
- [ ] User is redirected to dashboard after successful login
- [ ] Error messages are displayed correctly
- [ ] Back button works when switching from password to email input

---

## Security Best Practices

1. **Use HTTPS only** - Never use HTTP for SSO flows in production
2. **Validate tokens** - Always validate JWT tokens on the backend
3. **Secure storage** - Use secure storage for tokens (Keychain on iOS, KeyStore on Android, secure cookies for web)
4. **Token expiry** - Handle token expiry and refresh tokens appropriately
5. **Deep links** - Use app deep links for mobile apps instead of web redirects when possible
6. **PKCE** - Consider implementing PKCE for enhanced security (if using OAuth2)

---

## Troubleshooting

### Mobile App Issues

**Issue:** In-app browser doesn't open
- **Solution:** Check permissions in AndroidManifest.xml / Info.plist
- Ensure `react-native-inappbrowser-reborn` is properly linked

**Issue:** Tokens not extracted from callback URL
- **Solution:** Check if callback URL matches the redirect URL format
- Verify URL parsing logic

### Web App Issues

**Issue:** SSO redirect doesn't work
- **Solution:** Check if `window.location.href` is being called correctly
- Verify API_BASE_URL is correct

**Issue:** Tokens not appearing in URL after SSO
- **Solution:** Check backend FRONTEND_APP_URL configuration
- Verify callback route matches redirect URL

---

## Additional Resources

- [Backend Setup Guide](./SSO_SETUP_GUIDE.md)
- [SAML 2.0 Specification](http://docs.oasis-open.org/security/saml/Post2.0/sstc-saml-tech-overview-2.0.html)
- [Okta SAML Documentation](https://developer.okta.com/docs/concepts/saml/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
