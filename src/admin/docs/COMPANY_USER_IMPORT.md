# Company User Import Feature Documentation

## Overview

The Company User Import feature allows administrators to bulk import users into a company from a CSV file. The system intelligently handles updates, inserts, and validates for duplicates with detailed error reporting.

**Endpoint:** `POST /admin/companies/:id/import-user`

**Authentication:** Required (Admin)

---

## CSV File Format

### Required Columns
- `first_name` - User's first name (required)
- `last_name` - User's last name (required)
- `email` - User's email address (required, must be unique)

### Optional Columns
- `password` - User's password (optional if company has default password configured)

### Example CSV
```csv
first_name,last_name,email,password
John,Doe,john@example.com,SecurePass123
Jane,Smith,jane@example.com,SecurePass456
Admin,User,admin@example.com,AdminPass789
```

---

## Request

### Headers
```
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

### Body
```
multipart/form-data:
- file: <CSV file>
```

### cURL Example
```bash
curl -X POST "http://localhost:3000/admin/companies/comp_123/import-user" \
  -H "Authorization: Bearer your_token" \
  -F "file=@users.csv"
```

---

## Response Scenarios

### ✅ Scenario 1: Successful Import (Mixed Insert & Update)

**Status:** `201 Created`

**Description:** CSV file is valid with no duplicates. Contains 3 new users and 2 existing users to update.

**Response:**
```json
{
  "id": "log_123456",
  "company_id": "comp_123",
  "meta": {
    "total_active_users_before_upload": 5,
    "total_active_users_after_upload": 10,
    "total_users_processed": 5,
    "total_users_updated": 2,
    "total_users_inserted": 3,
    "import_timestamp": "2024-12-14T10:30:45.000Z"
  },
  "summary": {
    "total_processed": 5,
    "total_updated": 2,
    "total_inserted": 3,
    "updated_entries": [
      {
        "email": "john@example.com",
        "name": "John Doe"
      },
      {
        "email": "jane@example.com",
        "name": "Jane Smith"
      }
    ]
  }
}
```

---

### ❌ Scenario 2: CSV Contains Duplicate Emails

**Status:** `400 Bad Request`

**Description:** The same email address appears multiple times within the CSV file itself.

**Response:**
```json
{
  "statusCode": 400,
  "message": "3 email(s) appear multiple times in your CSV file. Please remove duplicates and try again.",
  "error": "Bad Request",
  "response": {
    "error": "Duplicate entries found in CSV file",
    "duplicate_count": 3,
    "duplicates": [
      {
        "email": "john@example.com",
        "occurrences": 2
      },
      {
        "email": "jane@example.com",
        "occurrences": 3
      },
      {
        "email": "admin@example.com",
        "occurrences": 2
      }
    ],
    "message": "3 email(s) appear multiple times in your CSV file. Please remove duplicates and try again."
  }
}
```

**Action Required:**
- Remove duplicate entries from CSV
- Keep only one instance of each email
- Re-upload the cleaned CSV file

---

### ❌ Scenario 3: Emails Already Exist in Other Companies

**Status:** `400 Bad Request`

**Description:** Email addresses in the CSV are already registered in different companies. System prevents creating duplicate global emails.

**Response:**
```json
{
  "statusCode": 400,
  "message": "3 email address(es) already exist in another company. Please use different email addresses or contact support.",
  "error": "Bad Request",
  "response": {
    "error": "Duplicate emails in other companies",
    "duplicate_count": 3,
    "duplicates": [
      "alfasigma@example.com",
      "user2@example.com",
      "user3@example.com"
    ],
    "message": "3 email address(es) already exist in another company. Please use different email addresses or contact support."
  }
}
```

**Action Required:**
- Use different email addresses for new users
- Or contact administrator to resolve email conflicts
- Cannot import these entries as-is due to email uniqueness constraint

---

### ❌ Scenario 4: New Users Missing Passwords

**Status:** `400 Bad Request`

**Description:** New user entries don't have passwords in CSV and company doesn't have a default password configured.

**Response:**
```json
{
  "statusCode": 400,
  "message": "5 new user(s) are missing passwords. New users must have a password in CSV or a default password configured for the company. Users without passwords: john@example.com, jane@example.com, admin@example.com and 2 more",
  "error": "Bad Request"
}
```

**Action Required:**
- Add passwords to CSV for new users, OR
- Configure a default password in company settings, OR
- Manually add passwords after import

**Example CSV with passwords:**
```csv
first_name,last_name,email,password
John,Doe,john@example.com,TempPass123
Jane,Smith,jane@example.com,TempPass456
```

---

### ❌ Scenario 5: Invalid File Format

**Status:** `400 Bad Request`

**Description:** Uploaded file is not a valid CSV file.

**Response:**
```json
{
  "statusCode": 400,
  "message": "Invalid file format. Only CSV file is allowed.",
  "error": "Bad Request"
}
```

**Action Required:**
- Ensure file has `.csv` extension
- Verify MIME type is `text/csv` or `application/csv`
- Use proper CSV format with correct encoding (UTF-8)

---

### ❌ Scenario 6: Empty CSV File

**Status:** `400 Bad Request`

**Description:** CSV file is empty or has missing required columns.

**Response:**
```json
{
  "statusCode": 400,
  "message": "CSV file is empty or has invalid data.",
  "error": "Bad Request"
}
```

**Action Required:**
- Verify CSV has headers: `first_name`, `last_name`, `email`
- Ensure CSV has at least one data row
- Check file encoding and formatting

---

### ❌ Scenario 7: Missing Required CSV Columns

**Status:** `400 Bad Request`

**Description:** CSV file is missing required columns (`first_name`, `last_name`, `email`).

**Response:**
```json
{
  "statusCode": 400,
  "message": "CSV file is empty or has invalid data.",
  "error": "Bad Request"
}
```

**Required CSV Headers:**
```csv
first_name,last_name,email
```

---

### ❌ Scenario 8: Company Not Found

**Status:** `404 Not Found`

**Description:** The company ID in URL doesn't exist.

**Response:**
```json
{
  "statusCode": 404,
  "message": "Company with ID comp_invalid not found",
  "error": "Not Found"
}
```

**Action Required:**
- Verify the company ID is correct
- Ensure company exists in the system

---

## Import Behavior & Logic

### User Update Logic
- If email exists in the current company → **UPDATE** user data
- User becomes active (`is_active: true`)
- Password updated only if provided in CSV
- All other users in company marked as inactive before import

### User Insert Logic
- If email doesn't exist in current company → **INSERT** new user
- User created as active (`is_active: true`)
- Password required (from CSV or company default)

### Duplicate Handling
1. **CSV Duplicates** → Error (rejected before processing)
2. **Current Company Duplicates** → Update existing user
3. **Other Company Duplicates** → Error (cannot create duplicate global email)

---

## Best Practices

### 1. **Prepare CSV Carefully**
```csv
first_name,last_name,email,password
John,Doe,john.doe@example.com,TempPassword123
Jane,Smith,jane.smith@example.com,TempPassword456
```
- Use full email addresses
- Ensure unique emails
- Double-check names for accuracy

### 2. **Handle Inactive Users**
Before importing, understand that:
- All current users in company will be marked **inactive**
- Only users in CSV will be marked **active** after import
- Use this as a deprovisioning mechanism

### 3. **Password Strategy**
**Option A: Include in CSV**
```csv
first_name,last_name,email,password
John,Doe,john@example.com,SecurePass123
```

**Option B: Configure Company Default**
- Set default password in company settings
- Leave password column empty in CSV

**Option C: Manual Setup**
- Import without passwords (if allowed)
- Send password reset links to users

### 4. **Verify Before Upload**
```bash
# Check CSV has required columns
head -1 users.csv  # Should show: first_name,last_name,email,password

# Count unique emails
cut -d',' -f3 users.csv | sort | uniq -c | grep -v "^[[:space:]]*1 "
# If no output = all unique (good)

# Validate CSV syntax
file users.csv  # Should output: ASCII text
```

### 5. **Handle Errors Systematically**
1. Read error response carefully
2. Identify problematic entries
3. Fix and re-upload
4. No partial imports - either all succeed or all fail

---

## Response Structure

All successful imports return:

```json
{
  "id": "log_id",
  "company_id": "company_id",
  "meta": {
    "total_active_users_before_upload": number,
    "total_active_users_after_upload": number,
    "total_users_processed": number,
    "total_users_updated": number,
    "total_users_inserted": number,
    "import_timestamp": "ISO-8601 datetime"
  },
  "summary": {
    "total_processed": number,
    "total_updated": number,
    "total_inserted": number,
    "updated_entries": [
      {
        "email": "user@example.com",
        "name": "Full Name"
      }
    ]
  }
}
```

---

## Troubleshooting Guide

| Issue | Cause | Solution |
|-------|-------|----------|
| 3+ emails already exist | Duplicate emails in system | Use different emails or remove from CSV |
| Email appears multiple times in CSV | Data entry error | Remove duplicates from CSV, keep one instance |
| New users missing passwords | No password in CSV + no company default | Add passwords to CSV or configure company default |
| File format invalid | Wrong extension/MIME type | Use `.csv` file with proper CSV formatting |
| 400 Bad Request (generic) | Malformed CSV or missing columns | Check headers: `first_name`, `last_name`, `email` |
| 404 Not Found | Invalid company ID | Verify company ID is correct |
| 500 Internal Server Error | Server issue | Contact support, check server logs |

---

## Performance Considerations

- **Batch Processing:** Users processed in chunks of 500 for optimal performance
- **Concurrent Operations:** Up to 8 concurrent password hashing operations
- **Large Files:** Tested with 10,000+ user imports
- **Database:** Single query for existing users, optimized bulk updates/inserts

---

## Security Notes

- ✅ Parameterized queries prevent SQL injection
- ✅ Passwords hashed with bcrypt (10 salt rounds)
- ✅ Company-scoped imports (users can only be imported into authorized company)
- ✅ Email uniqueness enforced globally
- ✅ All operations logged with timestamp

---

## API Response Codes

| Code | Meaning | Action |
|------|---------|--------|
| `201` | Created | Success - users imported |
| `400` | Bad Request | Check error details, fix and retry |
| `401` | Unauthorized | Verify authentication token |
| `403` | Forbidden | Insufficient permissions |
| `404` | Not Found | Company doesn't exist |
| `422` | Unprocessable Entity | Validation error |
| `500` | Server Error | Contact support |

---

## Example Integration (Frontend)

```typescript
async importUsers(companyId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(
      `/admin/companies/${companyId}/import-user`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      }
    );

    if (!response.ok) {
      const error = await response.json();

      // Handle specific errors
      if (error.response?.duplicates) {
        console.error('Duplicate emails:', error.response.duplicates);
        // Show user which emails are duplicates
      }

      throw new Error(error.message);
    }

    const result = await response.json();
    console.log(`Import successful!`);
    console.log(`Updated: ${result.summary.total_updated} users`);
    console.log(`Inserted: ${result.summary.total_inserted} users`);

    return result;
  } catch (error) {
    console.error('Import failed:', error.message);
    throw error;
  }
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-12-14 | Initial release with detailed error reporting |

---

## Support

For issues or questions regarding the Company User Import feature:
1. Review this documentation
2. Check the Troubleshooting Guide
3. Contact the Development Team
4. Check server logs for detailed error information

