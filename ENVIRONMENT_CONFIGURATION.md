# Environment Configuration

## .env Files

### Mobile (Flutter) - .env

```
# API Configuration
API_BASE_URL=https://api.eduhub.com
API_TIMEOUT=30

# Feature Flags
ENABLE_DARK_MODE=false
ENABLE_OFFLINE_MODE=true

# Analytics
ANALYTICS_KEY=your_analytics_key
SENTRY_DSN=your_sentry_dsn

# Firebase (if using)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_API_KEY=your_api_key
```

### Web (React) - .env

```
# API
REACT_APP_API_BASE_URL=https://api.eduhub.com
REACT_APP_API_TIMEOUT=30000

# Authentication
REACT_APP_AUTH_PROVIDER=jwt
REACT_APP_TOKEN_KEY=eduhub_token

# Analytics & Monitoring
REACT_APP_SENTRY_DSN=your_sentry_dsn
REACT_APP_ANALYTICS_ID=your_analytics_id

# Feature Flags
REACT_APP_ENABLE_DARK_MODE=false
REACT_APP_ENABLE_STATS_EXPORT=true

# Environment
REACT_APP_ENVIRONMENT=development
```

### Backend (Node.js) - .env

```
# Server
NODE_ENV=production
PORT=3000
API_URL=https://api.eduhub.com

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=eduhub
DB_USER=eduhub_user
DB_PASSWORD=secure_password_here

# Redis (Cache/Sessions)
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your_super_secret_key_change_in_production
JWT_EXPIRE_IN=1h
REFRESH_JWT_EXPIRE_IN=7d

# Email (for OTP)
EMAIL_SERVICE=gmail
EMAIL_USER=noreply@eduhub.com
EMAIL_PASSWORD=app_specific_password

# File Storage
AWS_S3_BUCKET=eduhub-uploads
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Security
CORS_ORIGIN=https://admin.eduhub.com,https://app.eduhub.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging & Monitoring
LOG_LEVEL=info
SENTRY_DSN=your_sentry_dsn
```

---

## Configuration Loading Strategy

### Flutter
```dart
// Load from .env
class Config {
  static String get apiBaseUrl => 'https://api.eduhub.com';
  static int get apiTimeout => 30;
  static bool get enableOfflineMode => true;
}

// Use throughout the app
final response = await http.get(
  Uri.parse('${Config.apiBaseUrl}/students/profile'),
  headers: {'Authorization': 'Bearer $token'},
);
```

### React
```javascript
// Load from environment variables
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_TIMEOUT = process.env.REACT_APP_API_TIMEOUT;

// Create axios instance with config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});
```

### Backend
```javascript
// Load from .env using dotenv
require('dotenv').config();

const config = {
  database: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRE_IN,
  },
  redis: {
    url: process.env.REDIS_URL,
  },
};

module.exports = config;
```

---

## Production vs Development

### Development
```
- Local database (PostgreSQL on localhost)
- Mock API responses for offline testing
- Debug logging enabled
- Hot reload enabled
- No rate limiting
```

### Production
```
- Cloud database (AWS RDS)
- Real API with caching
- Minimal logging (errors only)
- Optimized bundles
- Rate limiting enabled
- HTTPS enforced
- CORS restricted
```

---

## Secrets Management

### Never commit secrets!

✅ Good:
```
DATABASE_URL=postgresql://user:password@prod-db.aws.com:5432/eduhub
```

❌ Bad:
```
// Hardcoded in code
const dbPassword = 'super_secret_123';
```

### Use environment variables or secret manager

**Option 1: GitHub Secrets (for CI/CD)**
```yaml
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  JWT_SECRET: ${{ secrets.JWT_SECRET }}
```

**Option 2: AWS Secrets Manager**
```javascript
const AWS = require('aws-sdk');
const client = new AWS.SecretsManager();

async function getSecret(secretName) {
  try {
    const data = await client.getSecretValue({ SecretId: secretName }).promise();
    return JSON.parse(data.SecretString);
  } catch (error) {
    console.error('Error retrieving secret:', error);
  }
}
```

---

## Configuration Validation

### At startup, validate all required configs

```javascript
// config-validator.js
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'REDIS_URL',
  'API_BASE_URL',
];

requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
});

console.log('✅ All required environment variables are set');
```

---

## Feature Flags

### Enable/disable features based on environment

```javascript
// featureFlags.js
const flags = {
  ENABLE_DARK_MODE: process.env.ENABLE_DARK_MODE === 'true',
  ENABLE_STATS_EXPORT: process.env.ENABLE_STATS_EXPORT === 'true',
  ENABLE_OFFLINE_MODE: process.env.ENABLE_OFFLINE_MODE === 'true',
  ENABLE_ANALYTICS: process.env.ENABLE_ANALYTICS === 'true',
};

export default flags;
```

### Usage

```javascript
// React
import flags from './featureFlags';

function Dashboard() {
  return (
    <>
      <StudentTable />
      {flags.ENABLE_STATS_EXPORT && <ExportButton />}
    </>
  );
}
```

---

## API Configuration

### Timeout & Retry Logic

```javascript
// api.js
const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL,
  timeout: 30000,
});

// Retry on network errors
api.interceptors.response.use(
  response => response,
  async error => {
    const config = error.config;

    if (!config || !config.retry) {
      config.retry = 0;
    }

    config.retry += 1;

    if (config.retry <= 3 && error.response?.status === 503) {
      await new Promise(resolve => setTimeout(resolve, 1000 * config.retry));
      return api(config);
    }

    return Promise.reject(error);
  }
);

export default api;
```

---

Proper configuration management ensures security, flexibility, and maintainability.
