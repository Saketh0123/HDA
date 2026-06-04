# EduHub - Student Management System - Setup & Development Guide

## 📁 Project Structure

```
eduhub/
├── DESIGN_SYSTEM.md           # Design tokens & color palette
├── shared-design-tokens.js    # JavaScript design tokens
├── mobile/                     # Flutter mobile app
│   ├── lib/
│   │   ├── main.dart          # App entry point
│   │   ├── theme/
│   │   │   └── app_theme.dart  # Flutter theme configuration
│   │   └── screens/
│   │       ├── login_screen.dart
│   │       ├── home_screen.dart
│   │       └── results_remarks_screens.dart
│   └── pubspec.yaml           # Flutter dependencies
├── web/                        # React admin dashboard
│   ├── public/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── index.jsx
│   │   ├── pages/
│   │   ├── components/
│   │   └── styles/
│   ├── package.json
│   ├── tailwind.config.js
│   └── postcss.config.js
└── docs/                       # Documentation
```

---

## 🚀 Getting Started

### Prerequisites
- **Mobile**: Flutter SDK 3.0+, Xcode/Android Studio
- **Web**: Node.js 16+, npm/yarn
- **Both**: Git, VS Code or IDE

---

## 📱 Mobile App Setup (Flutter)

### Installation

```bash
cd mobile
flutter pub get
```

### Run on Emulator/Device

```bash
# iOS (macOS only)
flutter run -d ios

# Android
flutter run -d android

# Web (preview)
flutter run -d chrome
```

### Build for Production

```bash
# iOS
flutter build ios

# Android
flutter build appbundle

# APK
flutter build apk
```

### Project Structure

```
lib/
├── main.dart                 # Entry point
├── theme/
│   └── app_theme.dart        # Centralized theme configuration
├── screens/
│   ├── login_screen.dart     # 3-step login/signup flow
│   ├── home_screen.dart      # Dashboard with profile & summary
│   └── results_remarks_screens.dart
├── models/                   # Data models (Student, Subject, etc.)
├── services/                 # API & local storage
└── widgets/                  # Reusable UI components
```

### Key Features

#### Login Flow (3 Steps)
1. **Admission Number** → Entry point
2. **Verification** → OTP + Date of Birth validation
3. **Password Creation** → Strong password requirements

#### Home Screen
- Profile card with student info
- Summary cards (Latest Marks, Fees Status, Recent Remark)
- Bottom navigation (Home | Results | Remarks)
- Cached UI for instant loading

#### Results Screen
- Overall performance percentage
- Subject-wise marks with progress bars
- Color-coded based on performance (Green ≥ 80%, Yellow ≥ 60%, Red < 60%)

#### Remarks Screen
- Timeline view of remarks
- Categorized by type (Assignment, Attendance, Performance, etc.)
- Icon + Color coding for quick recognition

### Performance Optimization
- Single data fetch per session (caching with `SharedPreferences`)
- Skeleton loaders during data fetch
- Lazy loading for long lists
- Image optimization (cached_network_image)

### Security Features
- ✅ No editing capabilities for students
- ✅ OTP verification on login
- ✅ No access to other students' data
- ✅ Secure password storage (bcrypt on backend)
- ✅ Session timeout after 30 minutes

---

## 💻 Web Admin Dashboard Setup (React)

### Installation

```bash
cd web
npm install
```

### Run Development Server

```bash
npm start
```

The app will open at `http://localhost:3000`

### Build for Production

```bash
npm run build
```

### Project Structure

```
src/
├── App.jsx                   # Main routing component
├── index.jsx                 # Entry point
├── pages/
│   ├── Dashboard.jsx
│   ├── StudentManagement.jsx
│   ├── Results.jsx
│   ├── Remarks.jsx
│   ├── Fees.jsx
│   ├── Accounts.jsx (Finance Overview)
│   └── Statistics.jsx
├── components/
│   ├── Sidebar.jsx
│   ├── TopBar.jsx
│   ├── Card.jsx
│   ├── Table.jsx
│   └── Chart.jsx
├── hooks/
│   ├── useAuth.js
│   └── useApi.js
├── services/
│   └── api.js
└── styles/
    └── index.css
```

### Key Features

#### Dashboard Overview
- 3 summary cards (Total Students, Avg Grade, Pending Fees)
- Recent activity feed
- Fee collection progress bar

#### Student Management
- **Filters**: Search (Name/Hall Ticket), Year, Stream
- **Pagination**: 10–20 students per page
- **Lazy Loading**: Load on-demand to minimize server load
- **Actions**: View, Edit, Add Remarks

#### Accounts Section (Finance)
- **Summary Cards**: Total Fees, Collected, Pending (color-coded)
- **Progress Indicator**: Fee collection % with visual bar
- **Breakdown**: Paid vs Pending students

#### Statistics & Analytics
- **Daily Tracking**: Input fields for income/expenditure
- **Summary Cards**: Monthly income, expenditure, net balance
- **Monthly Trend Graph**: Line/Bar chart showing income & expenditure over time
- **Data Export**: Generate reports as CSV/PDF (integration-ready)

#### Admin Controls
- 🔐 **Admin-only authentication** (email + password)
- ✏️ **Edit functionality** with confirmation dialogs
- 🗑️ **Soft delete** (no permanent removal without confirmation)
- 📊 **Role-based access** (only admins access financial data)
- 🔔 **Audit logs** for all financial transactions

### Performance Features
- Pagination mandatory for large datasets
- Filters applied before data fetch
- Server-side sorting
- Client-side caching for reduced API calls
- Skeleton loaders while fetching

### Security Features
- ✅ JWT authentication
- ✅ Role-based access control
- ✅ HTTPS enforcement
- ✅ CSRF token validation
- ✅ Financial data encryption
- ✅ Admin activity logging
- ✅ No sensitive data in URLs

---

## 🎨 Design System Implementation

### Colors in Code

**React (Tailwind)**
```jsx
// Primary
className="bg-blue-600"     // #2563EB
className="hover:bg-blue-700"

// Success
className="text-green-500"  // #10B981

// Alert
className="text-red-500"    // #EF4444
```

**Flutter (Dart)**
```dart
Container(
  color: AppTheme.primaryColor,     // #2563EB
  child: ...
)
```

### Typography

**React**
```jsx
<h1 className="text-h1 font-bold">Page Title</h1>
<p className="text-body text-gray-700">Body text</p>
```

**Flutter**
```dart
Text(
  'Page Title',
  style: TextStyle(
    fontSize: 32,
    fontWeight: FontWeight.w700,
  ),
)
```

### Spacing (8pt Grid)

```
4px:  xs
8px:  sm
16px: md
24px: lg
32px: xl
48px: xxl
```

### Border Radius

- Buttons & inputs: 8px
- Cards: 12–16px

---

## 🔐 Security Architecture

### Frontend (Client-Side)
- ✅ Input validation before submission
- ✅ XSS protection via escaped output
- ✅ CSRF tokens in form submissions
- ✅ Secure password input (no logging)
- ✅ Session token rotation

### Backend Integration (Requirements)
- ✅ JWT tokens with 1-hour expiry
- ✅ Refresh token mechanism
- ✅ Rate limiting (10 req/min per user)
- ✅ SQL injection prevention (parameterized queries)
- ✅ CORS properly configured
- ✅ Sensitive endpoints require admin role
- ✅ All financial operations logged

---

## 📊 API Structure (Expected)

### Authentication
```
POST   /api/auth/login       (email, password)
POST   /api/auth/refresh     (refresh_token)
POST   /api/auth/logout
```

### Students
```
GET    /api/students?page=1&limit=20&year=1&stream=science
GET    /api/students/:id
POST   /api/students         (admin only)
PUT    /api/students/:id     (admin only)
DELETE /api/students/:id     (soft delete, admin only)
```

### Results
```
GET    /api/results/:studentId
POST   /api/results          (admin only)
PUT    /api/results/:id      (admin only)
```

### Finance (Accounts)
```
GET    /api/finance/summary
GET    /api/finance/daily?date=YYYY-MM-DD
POST   /api/finance/daily    (admin only)
GET    /api/finance/monthly?month=2025-03
```

---

## 🧪 Testing Recommendations

### Mobile (Flutter)
- Unit tests for theme configuration
- Widget tests for screens & components
- Integration tests for navigation flow

### Web (React)
- Component tests using React Testing Library
- API mocking with MSW (Mock Service Worker)
- E2E tests with Cypress/Playwright

---

## 📈 Performance Benchmarks

### Mobile App
- ✅ App launch: < 2 seconds
- ✅ Screen transition: < 300ms
- ✅ Data fetch: < 2 seconds
- ✅ Bundle size: < 30MB (APK)

### Web Dashboard
- ✅ Page load: < 2 seconds
- ✅ Time to interactive: < 3 seconds
- ✅ API response: < 1 second
- ✅ Bundle size: < 200KB (gzipped)

---

## 🚀 Deployment

### Mobile
- **iOS**: TestFlight → App Store
- **Android**: Google Play Console

### Web
- **Hosting**: Vercel, Netlify, or AWS S3 + CloudFront
- **CI/CD**: GitHub Actions for automated tests & deployment
- **Database**: PostgreSQL with proper indexing
- **Cache**: Redis for session management

---

## 📝 Development Workflow

### 1. Branch Naming
```
feature/add-student-filter
bugfix/login-validation
hotfix/payment-calculation
```

### 2. Commit Messages
```
feat: Add student search filter
fix: Resolve OTP verification bug
docs: Update API documentation
```

### 3. Pull Request Checklist
- ✅ Code reviewed by team member
- ✅ All tests passing
- ✅ No console errors/warnings
- ✅ Design system followed
- ✅ Performance metrics acceptable

---

## 🔗 Integration With Backend

### Authentication Flow
```
1. User submits credentials → /auth/login
2. Backend validates → returns JWT + Refresh Token
3. Store JWT in secure storage
4. Use JWT for all subsequent API calls
5. On expiry → use Refresh Token to get new JWT
```

### Data Flow (Mobile)
```
User Action → API Call → Cache Response → Update UI
```

### Data Flow (Web)
```
User Interaction → Validate → API Call → Update State → Re-render
```

---

## ❓ FAQ

**Q: Can students edit their marks?**
A: No. The mobile app has read-only access. Students cannot modify any data.

**Q: How long does a session last?**
A: 30 minutes of inactivity triggers automatic logout for security.

**Q: Can admins delete students?**
A: Yes, but only soft delete (data preserved). Confirmation dialog required.

**Q: Is financial data end-to-end encrypted?**
A: Yes. All sensitive financial data is encrypted in transit and at rest.

---

## 📞 Support & Contribution

For issues, feature requests, or contributions:
1. Create an issue on GitHub
2. Follow the pull request template
3. Ensure all tests pass
4. Request code review

---

Generated with ❤️ for clean, modern, minimal design.
