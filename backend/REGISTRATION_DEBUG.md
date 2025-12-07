# Registration Debugging Guide

## Common Registration Failures

### 1. Database Table Doesn't Exist
**Error:** `Table 'meet_gov.users' doesn't exist`

**Solution:**
```bash
cd backend
npm run db:setup
```

### 2. Validation Errors
**Error:** `Validation failed` with error array

**Check:**
- Name is provided and not empty
- Email is valid format
- Password is at least 6 characters
- Role is one of: admin, official, secretary (optional)

### 3. Duplicate Email
**Error:** `User with this email already exists`

**Solution:** Use a different email address

### 4. Password Hashing Issue
**Error:** Password not being hashed correctly

**Check:** User model hooks are properly set up

### 5. Database Connection Error
**Error:** Connection timeout or refused

**Solution:** 
- Verify MySQL is running
- Check .env credentials
- Test connection: `npm run db:create`

## Testing Registration

### Using cURL:
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123",
    "role": "admin"
  }'
```

### Using Postman:
- Method: POST
- URL: `http://localhost:3000/api/auth/register`
- Headers: `Content-Type: application/json`
- Body (JSON):
```json
{
  "name": "Test User",
  "email": "test@example.com",
  "password": "password123",
  "role": "admin"
}
```

## Check Server Logs

Look for error messages in the backend console when registration fails.

