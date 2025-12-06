# API Authentication Guide - MeetGov

## Overview

MeetGov uses **JWT (JSON Web Tokens)** for authentication. This guide explains how to authenticate API requests and includes examples for testing.

---

## Authentication Flow

1. **Register/Login** → Get `accessToken` and `refreshToken`
2. **Protected Requests** → Include `accessToken` in Authorization header
3. **Token Expires** → Use `refreshToken` to get new `accessToken`

---

## Public Routes (No Authentication Required)

These routes can be accessed without a token:

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh access token
- `GET /health` - Health check

---

## Protected Routes (Authentication Required)

All other routes require a valid JWT token in the Authorization header:

- `GET /api/auth/me` - Get current user profile
- `GET /api/meetings` - List meetings
- `POST /api/meetings` - Create meeting
- `GET /api/tasks` - List tasks
- `POST /api/tasks` - Create task
- `GET /api/analytics/*` - Analytics endpoints
- `POST /api/transcription/*` - Transcription endpoints
- And all other `/api/*` routes (except `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`)

---

## Step-by-Step: Getting Started

### Step 1: Register a User

**Request:**
```bash
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "official",
  "department": "IT"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com",
      "role": "official",
      "department": "IT"
    },

  }    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Save the `accessToken` and `refreshToken` for subsequent requests!**

---

### Step 2: Login (Alternative to Register)

**Request:**
```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com",
      "role": "official"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### Step 3: Make Protected API Calls

Include the `accessToken` in the **Authorization** header using the **Bearer** format:

**Header Format:**
```
Authorization: Bearer <accessToken>
```

**Example Request:**
```bash
GET http://localhost:3000/api/meetings
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "meetings": [...]
  }
}
```

---

## Testing Examples

### Using cURL

#### 1. Register
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "role": "official"
  }'
```

#### 2. Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

#### 3. Get User Profile (Protected)
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

#### 4. Get Meetings (Protected)
```bash
curl -X GET http://localhost:3000/api/meetings \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

#### 5. Create Task (Protected)
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Review meeting minutes",
    "description": "Review and approve generated minutes",
    "meeting_id": 1,
    "assigned_to": 2,
    "priority": "high",
    "deadline": "2024-12-25T23:59:59Z"
  }'
```

---

### Using Postman

#### Setup:

1. **Create a new request** → Set method to `POST`
2. **URL:** `http://localhost:3000/api/auth/login`
3. **Headers:**
   - `Content-Type: application/json`
4. **Body (raw JSON):**
   ```json
   {
     "email": "john@example.com",
     "password": "password123"
   }
   ```
5. **Send request** → Copy the `accessToken` from response

#### For Protected Routes:

1. **Create a new request** → Set method to `GET` (or POST, PUT, DELETE)
2. **URL:** `http://localhost:3000/api/meetings`
3. **Headers:**
   - `Authorization: Bearer <paste-your-access-token-here>`
   - `Content-Type: application/json`
4. **Send request**

#### Postman Environment Variables (Recommended):

Create a Postman environment and set:
- `baseUrl`: `http://localhost:3000`
- `accessToken`: (set after login)

Then use in requests:
- URL: `{{baseUrl}}/api/meetings`
- Authorization: `Bearer {{accessToken}}`

---

### Using JavaScript (Fetch API)

```javascript
// 1. Login
const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'john@example.com',
    password: 'password123',
  }),
});

const loginData = await loginResponse.json();
const accessToken = loginData.data.accessToken;

// 2. Make protected request
const meetingsResponse = await fetch('http://localhost:3000/api/meetings', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
});

const meetingsData = await meetingsResponse.json();
console.log(meetingsData);
```

---

### Using Axios

```javascript
import axios from 'axios';

// 1. Login
const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
  email: 'john@example.com',
  password: 'password123',
});

const accessToken = loginResponse.data.data.accessToken;

// 2. Create axios instance with default auth header
const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
});

// 3. Make protected requests
const meetingsResponse = await api.get('/meetings');
const tasksResponse = await api.post('/tasks', {
  title: 'New Task',
  // ...
});
```

---

### Using React (Frontend Example)

```javascript
// utils/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Try to refresh token
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const response = await axios.post('http://localhost:3000/api/auth/refresh', {
            refreshToken,
          });
          const newAccessToken = response.data.data.accessToken;
          localStorage.setItem('accessToken', newAccessToken);
          // Retry original request
          error.config.headers.Authorization = `Bearer ${newAccessToken}`;
          return axios.request(error.config);
        } catch (refreshError) {
          // Redirect to login
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
```

---

## Token Refresh

When your `accessToken` expires, use the `refreshToken` to get a new one:

**Request:**
```bash
POST http://localhost:3000/api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

## Error Responses

### Missing Token (401)
```json
{
  "success": false,
  "message": "Access token required",
  "error": "Authorization header missing"
}
```

### Invalid Token Format (401)
```json
{
  "success": false,
  "message": "Invalid authorization format",
  "error": "Authorization header must be in format: Bearer <token>"
}
```

### Expired Token (403)
```json
{
  "success": false,
  "message": "Token expired",
  "error": "Your access token has expired. Please refresh or login again"
}
```

### Invalid Token (403)
```json
{
  "success": false,
  "message": "Invalid token",
  "error": "The provided token is invalid or malformed"
}
```

---

## Environment Variables

Ensure your `.env` file contains:

```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
```

**⚠️ Important:** Change these secrets in production!

---

## Testing Checklist

- [ ] Register a new user
- [ ] Login with credentials
- [ ] Make protected request with token
- [ ] Verify 401 error without token
- [ ] Verify 403 error with invalid token
- [ ] Test token refresh flow
- [ ] Test token expiration handling

---

## Troubleshooting

### "Access token required"
- **Issue:** Token not included in request
- **Solution:** Add `Authorization: Bearer <token>` header

### "Invalid authorization format"
- **Issue:** Token format is incorrect
- **Solution:** Ensure format is exactly `Bearer <token>` (with space)

### "Token expired"
- **Issue:** Access token has expired
- **Solution:** Use refresh token to get new access token, or login again

### "Invalid token"
- **Issue:** Token is malformed or signed with wrong secret
- **Solution:** Login again to get a new token

---

## Security Best Practices

1. **Never expose tokens** in client-side code (browser console, logs)
2. **Use HTTPS** in production
3. **Store tokens securely** (httpOnly cookies or secure storage)
4. **Rotate secrets** regularly
5. **Set appropriate token expiration** times
6. **Implement rate limiting** on auth endpoints
7. **Log failed authentication attempts** (implemented in middleware)

---

## Additional Notes

- Access tokens expire after **1 hour** (configurable via `JWT_EXPIRES_IN`)
- Refresh tokens expire after **7 days** (configurable via `JWT_REFRESH_EXPIRES_IN`)
- Tokens are stateless - no database lookup required for verification
- User information is embedded in the token payload

---

**Last Updated:** 2024
**Version:** 1.0

