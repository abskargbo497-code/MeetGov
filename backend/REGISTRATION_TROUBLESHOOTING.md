# Registration Troubleshooting Guide

## Quick Fix Checklist

### ✅ Step 1: Ensure Database Tables Exist
```bash
cd backend
npm run db:setup
```

### ✅ Step 2: Test Registration Script
```bash
npm run test:registration
```

If this fails, the issue is with the database setup, not the API.

### ✅ Step 3: Verify Backend Server is Running
```bash
npm run dev
```

You should see:
```
MySQL connection established successfully
Server running on http://0.0.0.0:3000
```

### ✅ Step 4: Test Registration Endpoint

**Using cURL:**
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

**Using Postman:**
- Method: POST
- URL: `http://localhost:3000/api/auth/register`
- Headers: `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "name": "Test User",
  "email": "test@example.com",
  "password": "password123",
  "role": "admin"
}
```

## Common Error Messages & Solutions

### ❌ Error: "Table 'meet_gov.users' doesn't exist"

**Solution:**
```bash
npm run db:setup
```

**Verify:**
```bash
mysql -u root -p
USE meet_gov;
SHOW TABLES;
DESCRIBE users;
```

---

### ❌ Error: "Validation failed"

**Check the error details in response:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "msg": "Name is required",
      "param": "name"
    }
  ]
}
```

**Common validation errors:**
- Name is required → Include `name` field
- Email invalid → Use valid email format (user@domain.com)
- Password too short → Use at least 6 characters

---

### ❌ Error: "User with this email already exists"

**Solution:** Use a different email address

**Check existing users:**
```sql
SELECT * FROM users WHERE email = 'test@example.com';
```

---

### ❌ Error: "Cannot connect to MySQL"

**Check:**
1. MySQL server is running
2. `.env` file has correct credentials:
   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=meet_gov
   ```
3. MySQL user has permissions:
   ```sql
   GRANT ALL PRIVILEGES ON meet_gov.* TO 'root'@'localhost';
   FLUSH PRIVILEGES;
   ```

---

### ❌ Error: "Access denied for user"

**Solution:** 
1. Check MySQL username and password in `.env`
2. Verify MySQL user exists:
   ```sql
   SELECT User, Host FROM mysql.user;
   ```
3. Reset MySQL password if needed:
   ```sql
   ALTER USER 'root'@'localhost' IDENTIFIED BY 'new_password';
   FLUSH PRIVILEGES;
   ```

---

## Testing Steps

### 1. Test Database Connection
```bash
npm run db:create
```

Should show: `✓ Database 'meet_gov' is ready`

### 2. Test Table Creation
```bash
npm run db:sync
```

Should show all tables synced.

### 3. Test Registration Logic
```bash
npm run test:registration
```

Should show: `✅ All registration tests passed!`

### 4. Test API Endpoint
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.com","password":"123456"}'
```

Should return success with user data and tokens.

## Debugging Registration in Code

### Check Backend Logs
When registration fails, check the backend console for:
- Database errors
- Validation errors
- Stack traces

### Enable Detailed Logging
In `backend/src/database/connection.js`, temporarily enable logging:
```javascript
logging: console.log, // Instead of false
```

### Check User Model
Verify `User` model is imported correctly:
```javascript
import User from '../models/User.js';
```

### Verify Password Hashing
Check that the `beforeCreate` hook is working:
```javascript
// In User.js model
hooks: {
  beforeCreate: async (user) => {
    if (user.password_hash) {
      user.password_hash = await bcrypt.hash(user.password_hash, 10);
    }
  },
}
```

## Frontend Registration Issues

If registration works in Postman but not in frontend:

1. **Check API URL**
   ```javascript
   // Should be: http://localhost:3000/api/auth/register
   const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
   ```

2. **Check CORS**
   Backend should allow frontend origin in `server.js`

3. **Check Request Format**
   Frontend should send:
   ```javascript
   {
     name: "...",
     email: "...",
     password: "...",
     role: "..." // optional
   }
   ```

## Still Having Issues?

1. **Check all prerequisites:**
   - ✅ MySQL is running
   - ✅ Database exists
   - ✅ Tables are created
   - ✅ Backend server is running
   - ✅ `.env` file is configured

2. **Run test script:**
   ```bash
   npm run test:registration
   ```

3. **Check server logs** for specific error messages

4. **Verify database manually:**
   ```sql
   USE meet_gov;
   SELECT * FROM users;
   DESCRIBE users;
   ```

---

**Most Common Issue:** Database tables don't exist  
**Solution:** Run `npm run db:setup`

