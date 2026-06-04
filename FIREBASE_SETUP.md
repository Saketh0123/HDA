# Firebase Backend Setup (EduHub)

This repo now includes a Firebase backend (Auth + Firestore + Cloud Functions) and client wiring for:
- Flutter mobile app (`mobile/`)
- React admin dashboard (`web/`)

The code is committed to the workspace; you only need to create/configure a Firebase project and plug in config values.

---

## 0) Prerequisites

Install:
- Node.js (recommended **v20** for Cloud Functions)
- Firebase CLI: `npm i -g firebase-tools`
- Flutter SDK + Android Studio (for running the mobile app)

Login:
- `firebase login`

---

## 1) Create Firebase Project

1. Go to Firebase Console → **Add project**.
2. Enable:
   - **Authentication**
   - **Cloud Firestore**
   - **Cloud Functions**

---

## 2) Configure Firebase CLI for this repo

In the repo root:

1. Edit `.firebaserc` and set:
   - `YOUR_FIREBASE_PROJECT_ID` → your Firebase project id

2. (Optional) confirm CLI project:
   - `firebase use --add`

---

## 3) Firestore Rules + Indexes

These are already added:
- `firestore.rules`
- `firestore.indexes.json`

Deploy them:

- `firebase deploy --only firestore:rules,firestore:indexes`

Rules behavior:
- All reads/writes require authentication
- Students: read **only** their own `students/{uid}` and `fees/{uid}`
- Admins: full access to students/fees/accounts/statistics/logs
- Default deny for everything else

---

## 4) Cloud Functions

### Install & build

- `cd functions`
- `npm install`
- `npm run build`

### Deploy

From repo root:
- `firebase deploy --only functions`

### Email OTP (required for first-time student login)

The function `requestFirstLoginOtp` sends OTP via email. You must configure SMTP.

Set these environment variables as **secrets/config** (recommended):
- `SMTP_HOST`
- `SMTP_PORT` (465 for secure, 587 for STARTTLS)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

If you use Firebase Functions secrets:
- `firebase functions:secrets:set SMTP_HOST`
- `firebase functions:secrets:set SMTP_PORT`
- `firebase functions:secrets:set SMTP_USER`
- `firebase functions:secrets:set SMTP_PASS`
- `firebase functions:secrets:set SMTP_FROM`

Then redeploy functions.

---

## 5) Authentication Model

### Roles via Custom Claims

Backend enforces roles using custom claims:
- `role: "student"`
- `role: "admin"`

Cloud Functions enforce admin-only access for admin operations.

### Student login uses Admission Number

Students sign in as:
- username = **Admission Number**
- password = their password

Implementation detail:
- Firebase Auth email is a **pseudo email**: `${admissionNumber}@students.eduhub.local`
- Real email is stored in Firestore on the student document as `email`

First-time flow:
1. Student enters admission number
2. Cloud Function sends OTP to the student’s **real email**
3. Student enters OTP and sets password
4. App signs in using pseudo email + password

---

## 6) Bootstrap: Create the FIRST Admin

You need at least one admin user with claim `role=admin`.

Recommended safe approach:
1. Create a Firebase Auth user (email/password) in the Console.
2. Set custom claims via Admin SDK locally using a service account key.

### Steps

1. Firebase Console → Project Settings → Service accounts → **Generate new private key**
2. Save JSON to your machine (do NOT commit it)
3. Create a local script using Admin SDK to set claims:

```js
// tools/setAdminClaim.js (example)
// node tools/setAdminClaim.js <uid>
```

If you want, I can add this helper script into the repo.

After claims set, re-login in the dashboard so the token refreshes.

---

## 7) Provision Students (so admission-number first login works)

Before a student can first-time login, an admin must create their record containing at least:
- `admissionNumber`
- `email` (real email, used for OTP)
- `name`
- `stream`
- `year`

You can do this via Cloud Function:
- `adminUpsertStudent`

This writes a student document into:
- `students/{admissionNumber}` (pre-login)

On first login, the system migrates data into:
- `students/{uid}` (the optimized 1-read-per-session doc)

---

## 8) Flutter Mobile Setup

### Configure Firebase files

Run FlutterFire (recommended):

- `dart pub global activate flutterfire_cli`
- `cd mobile`
- `flutterfire configure`

This will generate/overwrite:
- `mobile/lib/firebase_options.dart`
- platform config like `android/app/google-services.json` etc.

### Run

- `cd mobile`
- `flutter pub get`
- `flutter run`

Note (Windows): If you run the **Windows desktop** target, enable Developer Mode for symlinks.

---

## 9) Admin Web Dashboard Setup

1. Copy env file:
- `cd web`
- Copy `.env.example` → `.env`

2. Fill in Firebase Web config from Firebase Console → Project Settings → Web app.

3. Run:
- `npm install`
- `npm start`

Admin access is granted only if the ID token includes `role: "admin"`.

---

## 10) Emulator (Local Development)

From repo root:
- `firebase emulators:start`

Web supports emulators via:
- `.env` → `REACT_APP_USE_FIREBASE_EMULATORS=true`

---

## 11) Security Notes

- Firestore rules default deny everything not explicitly allowed.
- Students cannot write any student/fees data.
- Admin mutations happen through Cloud Functions and are audited in `logs`.
- Add App Check for production hardening (recommended).

---

## Backend Entry Points

- Firestore rules: `firestore.rules`
- Indexes: `firestore.indexes.json`
- Cloud Functions: `functions/src/index.ts`
- Flutter Firebase calls: `mobile/lib/services/firebase_backend.dart`
- Web Firebase init: `web/src/firebase.js`
- Web callable wrappers: `web/src/api/adminFunctions.js`
