# Architecture & Integration Guide

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    EDUHUB ECOSYSTEM                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐          ┌──────────────┐               │
│  │ Mobile App   │          │ Admin Web    │               │
│  │ (Flutter)    │  ⟷ API   │ Dashboard    │               │
│  │              │◄────────►│ (React)      │               │
│  └──────────────┘          └──────────────┘               │
│         │                         │                        │
│         └────────────┬────────────┘                        │
│                      ▼                                      │
│          ┌─────────────────────┐                           │
│          │  API Gateway        │                           │
│          │  (JWT Auth)         │                           │
│          └─────────────────────┘                           │
│                      │                                      │
│         ┌────────────┴────────────┐                        │
│         ▼                          ▼                        │
│    ┌──────────────┐         ┌──────────────┐              │
│    │ PostgreSQL   │         │ Redis Cache  │              │
│    │ Database     │         │              │              │
│    └──────────────┘         └──────────────┘              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔐 Authentication & Authorization

### Role-Based Access Control (RBAC)

```
Student:
├── Read: Own profile, own marks, own remarks, own fees status
├── Action: View only (no editing)
└── Restriction: Cannot see other students' data

Admin:
├── Read: All students, all data, financial reports
├── Action: Create, Read, Update, Delete (with confirmations)
├── Restriction: Cannot edit student marks directly
└── Special: Access to financial dashboard & analytics

Finance Officer:
├── Read: Financial data, fee collection, payments
├── Action: Record income/expenditure, generate reports
└── Restriction: Cannot edit student data or academic marks
```

### Token Management

```javascript
// JWT Payload Structure
{
  "sub": "user_id",
  "role": "admin|student|finance_officer",
  "iat": 1234567890,
  "exp": 1234571490,
  "aud": "eduhub-app"
}

// Refresh Token Flow
1. Access Token (1 hour validity)
2. Refresh Token (7 days validity)
3. On expiry → Use Refresh Token to get new Access Token
4. Refresh Token blacklist on logout
```

---

## 📱 Mobile App Data Flow

### Network Optimization

```
Single Data Fetch Strategy:
  on_app_launch() {
    fetch_student_profile()      ─→ Cache in SharedPreferences
    fetch_marks()                ─→ Cache in SQLite
    fetch_remarks()              ─→ Cache in SQLite
    fetch_fees_status()          ─→ Cache in SharedPreferences
  }

  on_screen_refresh() {
    Show cached_data immediately (skeleton loader)
    Fetch fresh data in background
    Update UI if different
  }
```

### State Management

```dart
class StudentProvider extends ChangeNotifier {
  Student? _student;
  List<Subject> _marks = [];
  List<Remark> _remarks = [];
  bool _isLoading = false;

  Future<void> loadStudentData() async {
    _isLoading = true;
    notifyListeners();

    try {
      // Parallel fetch
      final results = await Future.wait([
        api.fetchStudentProfile(),
        api.fetchMarks(),
        api.fetchRemarks(),
      ]);

      _student = results[0];
      _marks = results[1];
      _remarks = results[2];
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
```

---

## 💻 Web Admin Dashboard Data Flow

### Component Hierarchy

```
App
├── Sidebar (Navigation)
├── TopBar (User Info, Logout)
└── MainContent
    ├── Dashboard
    │   ├── SummaryCards
    │   ├── RecentActivityFeed
    │   └── FeeCollectionProgress
    ├── StudentManagement
    │   ├── Filters (Search, Year, Stream)
    │   ├── StudentTable
    │   └── Pagination
    ├── Accounts
    │   ├── SummaryCards (Total, Collected, Pending)
    │   └── CollectionProgressChart
    └── Statistics
        ├── DailyTracker
        ├── SummaryCards (Monthly)
        └── TrendChart
```

### State Management (React)

```javascript
// Using Context + useReducer for simplicity
const AppContext = createContext();

const initialState = {
  auth: { user: null, token: null },
  students: [],
  selectedStudent: null,
  filters: { year: 'all', stream: 'all', search: '' },
  isLoading: false,
  error: null,
};

function appReducer(state, action) {
  switch(action.type) {
    case 'FETCH_STUDENTS_START':
      return { ...state, isLoading: true };
    case 'FETCH_STUDENTS_SUCCESS':
      return { ...state, students: action.payload, isLoading: false };
    case 'SET_FILTER':
      return { ...state, filters: { ...state.filters, ...action.payload } };
    default:
      return state;
  }
}
```

---

## 🗄️ Database Schema (PostgreSQL)

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student', 'admin', 'finance') DEFAULT 'student',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

### Students Table
```sql
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  admission_number VARCHAR(50) UNIQUE NOT NULL,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  stream VARCHAR(50) NOT NULL, -- Science, Commerce, Arts
  year INT NOT NULL, -- 1, 2, 3
  date_of_birth DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_students_admission ON students(admission_number);
CREATE INDEX idx_students_year_stream ON students(year, stream);
```

### Results Table
```sql
CREATE TABLE subjects (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  max_marks INT DEFAULT 100
);

CREATE TABLE results (
  id UUID PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id),
  marks DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT marks_range CHECK (marks >= 0 AND marks <= 100)
);

CREATE INDEX idx_results_student ON results(student_id);
CREATE INDEX idx_results_subject ON results(subject_id);
```

### Remarks Table
```sql
CREATE TABLE remarks (
  id UUID PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('attendance', 'performance', 'assignment', 'other'),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_remarks_student ON remarks(student_id);
CREATE INDEX idx_remarks_date ON remarks(created_at);
```

### Fees Table
```sql
CREATE TABLE fees (
  id UUID PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  total_amount DECIMAL(10,2) NOT NULL,
  paid_amount DECIMAL(10,2) DEFAULT 0,
  status ENUM('pending', 'partial', 'paid') DEFAULT 'pending',
  due_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fees_status ON fees(status);
CREATE INDEX idx_fees_student ON fees(student_id);
```

### Finance Transactions
```sql
CREATE TABLE finance_transactions (
  id UUID PRIMARY KEY,
  type ENUM('income', 'expenditure') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  description TEXT,
  transaction_date DATE NOT NULL,
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_finance_date ON finance_transactions(transaction_date);
CREATE INDEX idx_finance_type ON finance_transactions(type);
```

---

## 🔒 Security Implementation

### Password Security
```javascript
// Hashing with bcrypt
const password = 'user_password';
const hash = await bcrypt.hash(password, 10); // 10 rounds

// Verification
const isValid = await bcrypt.compare(password, hash);
```

### Session Management
```javascript
// Logout: Blacklist refresh token
async function logout(userId, refreshToken) {
  await redis.setex(
    `blacklist:${refreshToken}`,
    7 * 24 * 60 * 60, // 7 days
    userId
  );
}

// Check if token is blacklisted
async function isTokenBlacklisted(token) {
  const exists = await redis.exists(`blacklist:${token}`);
  return exists === 1;
}
```

### Rate Limiting
```javascript
// Prevent brute force attacks
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts, try again later'
});

app.post('/api/auth/login', loginLimiter, (req, res) => {
  // Login logic
});
```

---

## 📊 Analytics & Reporting

### Key Metrics to Track

```
Student Dashboard:
├── Login frequency
├── Feature usage (marks, remarks, fees)
├── Session duration
└── Device type distribution

Admin Dashboard:
├── Student enrollment trends
├── Fee collection rate
├── Mark distribution
├── Attendance patterns
└── System performance

Finance Dashboard:
├── Daily income/expenditure
├── Outstanding fees
├── Payment patterns
└── Month-over-month trends
```

---

## 🚀 Deployment Checklist

### Pre-Deployment
- [ ] All tests passing (unit, integration, e2e)
- [ ] Security audit completed
- [ ] Performance testing done
- [ ] Database backups configured
- [ ] Error logging setup (Sentry/LogRocket)
- [ ] Analytics configured

### Database
- [ ] Migrations applied
- [ ] Indexes created
- [ ] Backup strategy in place
- [ ] Connection pooling configured

### Backend
- [ ] Environment variables set
- [ ] HTTPS/SSL configured
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] Logging and monitoring setup

### Frontend (Web)
- [ ] Production build tested
- [ ] Asset compression enabled
- [ ] Caching headers configured
- [ ] CDN setup for static assets

### Mobile
- [ ] Signed APK/IPA generated
- [ ] Version number bumped
- [ ] Privacy policy added
- [ ] App store screenshots prepared

---

## 🔄 CI/CD Pipeline

### GitHub Actions Example

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install dependencies
        run: npm install
      - name: Run tests
        run: npm test
      - name: Build
        run: npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to production
        run: |
          npm install
          npm run build
          # Deploy command here (Vercel, AWS, etc.)
```

---

## 📞 API Error Handling

### Standard Error Response

```json
{
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Invalid email or password",
    "statusCode": 401,
    "timestamp": "2025-03-15T10:30:00Z"
  }
}
```

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Data retrieved successfully |
| 201 | Created | Student record created |
| 400 | Bad Request | Invalid input data |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Database connection failed |

---

## 📈 Monitoring & Logging

### Application Logs

```
Format: [TIMESTAMP] [LEVEL] [SERVICE] [REQUEST_ID] [MESSAGE]
Example: [2025-03-15 10:30:45] [INFO] [API] [req_123abc] User login successful
```

### Metrics to Monitor

```
Backend:
├── API response time
├── Database query time
├── Error rate
├── Active connections
└── Server CPU/Memory

Frontend:
├── Page load time
├── Core Web Vitals
├── JavaScript errors
├── API call success rate
└── User interactions
```

---

Designed with simplicity, security, and performance in mind.
cd c:\Users\DELL\Desktop\app hda\web