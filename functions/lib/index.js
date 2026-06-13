"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminUploadProfilePhoto = exports.addStatisticsEntry = exports.updateFees = exports.addStudentRemark = exports.updateStudentMarks = exports.setUserRole = exports.studentChangePassword = exports.resetPasswordWithOtpByEmail = exports.requestPasswordResetOtpByEmail = exports.verifyEmailWithOtp = exports.requestEmailVerificationOtp = exports.adminDeleteStudent = exports.adminMigrateStudents = exports.adminCreateAdmission = exports.adminUpsertStudent = exports.resetPasswordWithOtp = exports.requestPasswordResetOtp = exports.completeFirstLogin = exports.requestFirstLoginOtp = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const params_1 = require("firebase-functions/params");
const firebase_functions_1 = require("firebase-functions");
const admin = __importStar(require("firebase-admin"));
const nodemailer_1 = __importDefault(require("nodemailer"));
// For best latency in India, deploy callable functions in Mumbai.
(0, v2_1.setGlobalOptions)({ region: 'asia-south1' });
// SMTP configuration for email OTP.
// These are stored as Firebase/Cloud Secrets (Blaze required).
const SMTP_HOST = (0, params_1.defineSecret)('SMTP_HOST');
const SMTP_PORT = (0, params_1.defineSecret)('SMTP_PORT');
const SMTP_USER = (0, params_1.defineSecret)('SMTP_USER');
const SMTP_PASS = (0, params_1.defineSecret)('SMTP_PASS');
const SMTP_FROM = (0, params_1.defineSecret)('SMTP_FROM');
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
const DEFAULT_STUDENT_PASSWORD = 'HDA@2026';
function admissionAuthEmail(admissionNumber) {
    // Students sign in using Admission Number + password.
    // We store a pseudo email in Firebase Auth so email/password auth works.
    return `${admissionNumber.toLowerCase()}@students.eduhub.local`;
}
async function allocateNextAdmissionNumber() {
    const counterRef = db.collection('counters').doc('admissions');
    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        const data = snap.exists ? snap.data() : {};
        const current = data?.next;
        const next = typeof current === 'number' && Number.isFinite(current) && current > 0 ? current : 1;
        const releasedRaw = Array.isArray(data?.released) ? data.released : [];
        const released = releasedRaw
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n > 0)
            .sort((a, b) => a - b);
        // Prefer re-using deleted admission numbers.
        if (released.length > 0) {
            const sequence = released.shift();
            tx.set(counterRef, { released, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            return sequence;
        }
        tx.set(counterRef, { next: next + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return next;
    });
    const admissionNumber = `HDA${String(result).padStart(4, '0')}`;
    return { admissionNumber, sequence: result };
}
function requireAuth(context) {
    if (!context.auth?.uid) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    return { uid: context.auth.uid, token: context.auth.token ?? {} };
}
function requireAdmin(context) {
    const { uid, token } = requireAuth(context);
    if (token.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Admin role required.');
    }
    return { uid, token };
}
function assertString(value, field) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new https_1.HttpsError('invalid-argument', `${field} must be a non-empty string.`);
    }
    return value.trim();
}
function assertNumber(value, field) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new https_1.HttpsError('invalid-argument', `${field} must be a number.`);
    }
    return value;
}
function assertIntInRange(value, field, min, max) {
    const n = assertNumber(value, field);
    if (!Number.isInteger(n) || n < min || n > max) {
        throw new https_1.HttpsError('invalid-argument', `${field} must be an integer between ${min} and ${max}.`);
    }
    return n;
}
function assertNonNegative(value, field) {
    const n = assertNumber(value, field);
    if (n < 0) {
        throw new https_1.HttpsError('invalid-argument', `${field} must be a positive number.`);
    }
    return n;
}
async function writeAuditLog(params) {
    await db.collection('logs').add({
        action: params.action,
        adminId: params.adminId,
        studentId: params.studentId ?? null,
        metadata: params.metadata ?? null,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
}
function maskEmail(email) {
    const [user, domain] = email.split('@');
    if (!domain)
        return '***';
    const prefix = user.slice(0, Math.min(2, user.length));
    return `${prefix}***@${domain}`;
}
// ---------------------------------------------------------------------------
// AUTH: First-time login flow (Admission Number -> Email OTP -> set password)
// ---------------------------------------------------------------------------
// Data contract for pending login codes:
// firstLoginCodes/{admissionNumber}
// { codeHash, expiresAt, attempts, emailMasked, createdAt }
function hashCode(code) {
    // Simple SHA-256 using Node crypto (no external deps)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(code).digest('hex');
}
function hashString(value) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(value).digest('hex');
}
function generateOtp() {
    // 6-digit numeric
    const n = Math.floor(100000 + Math.random() * 900000);
    return String(n);
}
function getAcademicBatch(date = new Date()) {
    const year = date.getFullYear();
    return `${year}-${year + 1}`;
}
function normalizeAndValidateBatch(input) {
    const raw = typeof input === 'string' ? input.trim() : '';
    const value = raw || getAcademicBatch();
    if (!/^\d{4}-\d{4}$/.test(value)) {
        throw new https_1.HttpsError('invalid-argument', 'batch must be in format YYYY-YYYY (example: 2025-2026).');
    }
    const [a, b] = value.split('-').map((n) => Number(n));
    if (!Number.isFinite(a) || !Number.isFinite(b) || b !== a + 1) {
        throw new https_1.HttpsError('invalid-argument', 'batch must be a valid range like 2025-2026.');
    }
    return value;
}
function nextAcademicBatch(batch) {
    const value = normalizeAndValidateBatch(batch);
    const [a] = value.split('-').map((n) => Number(n));
    const nextStart = a + 1;
    return `${nextStart}-${nextStart + 1}`;
}
async function getTransporter() {
    const host = SMTP_HOST.value()?.trim();
    const portRaw = SMTP_PORT.value()?.trim();
    const user = SMTP_USER.value()?.trim();
    const pass = SMTP_PASS.value()?.trim();
    const from = SMTP_FROM.value()?.trim();
    if (!host || !portRaw || !user || !pass || !from) {
        throw new https_1.HttpsError('failed-precondition', 'Email OTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM as Functions secrets.');
    }
    const port = Number(portRaw);
    if (!Number.isFinite(port) || port <= 0) {
        throw new https_1.HttpsError('failed-precondition', 'Invalid SMTP_PORT secret.');
    }
    const secure = port === 465;
    return {
        transporter: nodemailer_1.default.createTransport({
            host,
            port,
            secure,
            auth: { user, pass },
        }),
        from,
    };
}
async function sendMailOrThrow(transporter, mail) {
    try {
        await transporter.sendMail(mail);
    }
    catch (err) {
        firebase_functions_1.logger.error('SMTP sendMail failed', {
            code: err?.code,
            responseCode: err?.responseCode,
            command: err?.command,
            message: err?.message,
        });
        // Most common Gmail SMTP issue: wrong app password / revoked app password.
        if (err?.code === 'EAUTH' || err?.responseCode === 535) {
            throw new https_1.HttpsError('failed-precondition', 'Email service login failed (Gmail rejected credentials). Please check SMTP_USER and SMTP_PASS (Gmail App Password) secrets, then redeploy functions.');
        }
        throw new https_1.HttpsError('internal', 'Failed to send OTP email. Please try again later.');
    }
}
exports.requestFirstLoginOtp = (0, https_1.onCall)({ secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM] }, async (request) => {
    const { admissionNumber } = request.data ?? {};
    const admission = assertString(admissionNumber, 'admissionNumber');
    // Admission lookup must be indexed on students.admissionNumber.
    const snap = await db
        .collection('students')
        .where('admissionNumber', '==', admission)
        .limit(1)
        .get();
    if (snap.empty) {
        throw new https_1.HttpsError('not-found', 'Admission number not found.');
    }
    const studentDoc = snap.docs[0];
    const student = studentDoc.data();
    const email = assertString(student.email, 'student.email');
    const otp = generateOtp();
    const codeHash = hashCode(otp);
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000));
    await db.collection('firstLoginCodes').doc(admission).set({
        codeHash,
        expiresAt,
        attempts: 0,
        emailMasked: maskEmail(email),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    const { transporter, from } = await getTransporter();
    await sendMailOrThrow(transporter, {
        from,
        to: email,
        subject: 'Your HDA verification code',
        text: `Your HDA verification code is: ${otp}. It expires in 10 minutes.`,
    });
    return { ok: true, emailMasked: maskEmail(email) };
});
exports.completeFirstLogin = (0, https_1.onCall)(async (request) => {
    const { admissionNumber, otpCode, password } = request.data ?? {};
    const admission = assertString(admissionNumber, 'admissionNumber');
    const otp = assertString(otpCode, 'otpCode');
    const newPassword = assertString(password, 'password');
    if (newPassword.length < 8) {
        throw new https_1.HttpsError('invalid-argument', 'Password must be at least 8 characters.');
    }
    const codeRef = db.collection('firstLoginCodes').doc(admission);
    const codeSnap = await codeRef.get();
    if (!codeSnap.exists) {
        throw new https_1.HttpsError('failed-precondition', 'No OTP request found. Please request a new code.');
    }
    const codeData = codeSnap.data();
    const expiresAt = codeData.expiresAt;
    const attempts = codeData.attempts ?? 0;
    if (attempts >= 5) {
        throw new https_1.HttpsError('resource-exhausted', 'Too many attempts. Please request a new code.');
    }
    if (expiresAt.toMillis() < Date.now()) {
        throw new https_1.HttpsError('deadline-exceeded', 'OTP expired. Please request a new code.');
    }
    const otpHash = hashCode(otp);
    if (otpHash !== codeData.codeHash) {
        await codeRef.set({ attempts: attempts + 1 }, { merge: true });
        throw new https_1.HttpsError('invalid-argument', 'Invalid OTP code.');
    }
    // Find student by admissionNumber
    const snap = await db
        .collection('students')
        .where('admissionNumber', '==', admission)
        .limit(1)
        .get();
    if (snap.empty) {
        throw new https_1.HttpsError('not-found', 'Admission number not found.');
    }
    const studentDoc = snap.docs[0];
    const student = studentDoc.data();
    const realEmail = assertString(student.email, 'student.email');
    const authEmail = admissionAuthEmail(admission);
    // Create / update Auth user
    let userRecord;
    try {
        userRecord = await admin.auth().getUserByEmail(authEmail);
        userRecord = await admin.auth().updateUser(userRecord.uid, { password: newPassword });
    }
    catch (e) {
        if (e?.code === 'auth/user-not-found') {
            userRecord = await admin.auth().createUser({ email: authEmail, password: newPassword });
        }
        else {
            firebase_functions_1.logger.error('Auth error', e);
            throw new https_1.HttpsError('internal', 'Failed to create account.');
        }
    }
    await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'student' });
    // Ensure student document ID is uid (1 read after login)
    const uid = userRecord.uid;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const existingStudentByUid = await db.collection('students').doc(uid).get();
    if (!existingStudentByUid.exists) {
        // Copy any existing admission-based student doc into uid doc.
        const merged = {
            ...student,
            admissionNumber: admission,
            email: realEmail,
            authEmail,
            createdAt: student.createdAt ?? now,
            updatedAt: now,
        };
        await db.runTransaction(async (tx) => {
            tx.set(db.collection('students').doc(uid), merged, { merge: true });
            // keep the old doc, but mark migrated to prevent confusion
            tx.set(studentDoc.ref, { migratedToUid: uid, updatedAt: now }, { merge: true });
        });
    }
    else {
        await db
            .collection('students')
            .doc(uid)
            .set({ admissionNumber: admission, email: realEmail, authEmail, updatedAt: now }, { merge: true });
    }
    // Clean up OTP doc
    await codeRef.delete();
    // Helpful for immediate sign-in without knowing the real email.
    const customToken = await admin.auth().createCustomToken(uid);
    return { ok: true, uid, authEmail, customToken };
});
// ---------------------------------------------------------------------------
// AUTH: Forgot password flow (Admission Number -> Email OTP -> set new password)
// ---------------------------------------------------------------------------
// Data contract for pending reset codes:
// passwordResetCodes/{admissionNumber}
// { codeHash, expiresAt, attempts, emailMasked, createdAt }
exports.requestPasswordResetOtp = (0, https_1.onCall)({ secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM] }, async (request) => {
    const { admissionNumber } = request.data ?? {};
    const admission = assertString(admissionNumber, 'admissionNumber');
    const snap = await db
        .collection('students')
        .where('admissionNumber', '==', admission)
        .limit(1)
        .get();
    if (snap.empty) {
        throw new https_1.HttpsError('not-found', 'Admission number not found.');
    }
    const studentDoc = snap.docs[0];
    const student = studentDoc.data();
    const email = assertString(student.email, 'student.email');
    const otp = generateOtp();
    const codeHash = hashCode(otp);
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000));
    await db.collection('passwordResetCodes').doc(admission).set({
        codeHash,
        expiresAt,
        attempts: 0,
        emailMasked: maskEmail(email),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    const { transporter, from } = await getTransporter();
    await sendMailOrThrow(transporter, {
        from,
        to: email,
        subject: 'Your HDA password reset code',
        text: `Your HDA password reset code is: ${otp}. It expires in 10 minutes.`,
    });
    return { ok: true, emailMasked: maskEmail(email) };
});
exports.resetPasswordWithOtp = (0, https_1.onCall)(async (request) => {
    const { admissionNumber, otpCode, newPassword } = request.data ?? {};
    const admission = assertString(admissionNumber, 'admissionNumber');
    const otp = assertString(otpCode, 'otpCode');
    const password = assertString(newPassword, 'newPassword');
    if (password.length < 8) {
        throw new https_1.HttpsError('invalid-argument', 'Password must be at least 8 characters.');
    }
    const codeRef = db.collection('passwordResetCodes').doc(admission);
    const codeSnap = await codeRef.get();
    if (!codeSnap.exists) {
        throw new https_1.HttpsError('failed-precondition', 'No OTP request found. Please request a new code.');
    }
    const codeData = codeSnap.data();
    const expiresAt = codeData.expiresAt;
    const attempts = codeData.attempts ?? 0;
    if (attempts >= 5) {
        throw new https_1.HttpsError('resource-exhausted', 'Too many attempts. Please request a new code.');
    }
    if (expiresAt.toMillis() < Date.now()) {
        throw new https_1.HttpsError('deadline-exceeded', 'OTP expired. Please request a new code.');
    }
    const otpHash = hashCode(otp);
    if (otpHash !== codeData.codeHash) {
        await codeRef.set({ attempts: attempts + 1 }, { merge: true });
        throw new https_1.HttpsError('invalid-argument', 'Invalid OTP code.');
    }
    const authEmail = admissionAuthEmail(admission);
    let userRecord;
    try {
        userRecord = await admin.auth().getUserByEmail(authEmail);
    }
    catch (e) {
        if (e?.code === 'auth/user-not-found') {
            throw new https_1.HttpsError('failed-precondition', 'Account not created yet. Use first-time login.');
        }
        firebase_functions_1.logger.error('Auth error', e);
        throw new https_1.HttpsError('internal', 'Failed to reset password.');
    }
    await admin.auth().updateUser(userRecord.uid, { password });
    await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'student' });
    await codeRef.delete();
    return { ok: true, uid: userRecord.uid };
});
// ---------------------------------------------------------------------------
// ADMIN: Provision / update student profile (pre-login or post-login)
// ---------------------------------------------------------------------------
exports.adminUpsertStudent = (0, https_1.onCall)(async (request) => {
    const { uid: adminId } = requireAdmin(request);
    const admissionNumber = assertString(request.data?.admissionNumber, 'admissionNumber');
    const name = assertString(request.data?.name, 'name');
    const email = assertString(request.data?.email, 'email');
    const stream = assertString(request.data?.stream, 'stream');
    const year = assertString(request.data?.year, 'year');
    const profilePic = typeof request.data?.profilePic === 'string' ? request.data.profilePic : null;
    // If uid is provided, write directly to students/{uid}. Otherwise pre-provision
    // students/{admissionNumber} and migrate on first login.
    const targetUid = typeof request.data?.uid === 'string' && request.data.uid.trim() ? request.data.uid.trim() : null;
    const docId = targetUid ?? admissionNumber;
    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('students').doc(docId).set({
        name,
        nameLower: name.toLowerCase(),
        email,
        admissionNumber,
        admissionNumberLower: admissionNumber.toLowerCase(),
        stream,
        courseOfStudy: stream,
        year,
        profilePic,
        updatedAt: now,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await writeAuditLog({ action: 'adminUpsertStudent', adminId, studentId: docId, metadata: { admissionNumber } });
    return { ok: true, id: docId };
});
// ---------------------------------------------------------------------------
// ADMIN: New admission (generate admission number + default password)
// ---------------------------------------------------------------------------
exports.adminCreateAdmission = (0, https_1.onCall)(async (request) => {
    const { uid: adminId } = requireAdmin(request);
    const fullName = assertString(request.data?.fullName, 'fullName');
    const fatherName = assertString(request.data?.fatherName, 'fatherName');
    const courseOfStudy = assertString(request.data?.courseOfStudy, 'courseOfStudy');
    const year = assertString(request.data?.year, 'year');
    const batch = normalizeAndValidateBatch(request.data?.batch);
    const gender = assertString(request.data?.gender, 'gender');
    const phoneNumber = typeof request.data?.phoneNumber === 'string' && request.data.phoneNumber.trim()
        ? request.data.phoneNumber.trim()
        : null;
    if (gender !== 'male' && gender !== 'female') {
        throw new https_1.HttpsError('invalid-argument', 'gender must be "male" or "female".');
    }
    if (year !== '1' && year !== '2') {
        throw new https_1.HttpsError('invalid-argument', 'year must be "1" or "2".');
    }
    if (!['TECHNICAL', 'EAPCET', 'NDA', 'CEC'].includes(courseOfStudy.toUpperCase())) {
        throw new https_1.HttpsError('invalid-argument', 'courseOfStudy must be one of: TECHNICAL, EAPCET, NDA, CEC.');
    }
    const normalizedCourse = courseOfStudy.toUpperCase();
    const { admissionNumber, sequence } = await allocateNextAdmissionNumber();
    const authEmail = admissionAuthEmail(admissionNumber);
    let userRecord;
    try {
        // Clean up duplicate auth user if any
        try {
            const existingUser = await admin.auth().getUserByEmail(authEmail);
            firebase_functions_1.logger.info('Deleting existing orphan auth user for admission number', { email: authEmail, uid: existingUser.uid });
            await admin.auth().deleteUser(existingUser.uid);
        }
        catch (err) {
            if (err.code !== 'auth/user-not-found')
                throw err;
        }
        userRecord = await admin.auth().createUser({ email: authEmail, password: DEFAULT_STUDENT_PASSWORD });
    }
    catch (e) {
        firebase_functions_1.logger.error('Failed to create Auth user for admission, rolling back sequence allocation', e);
        // ROLLBACK: Release the sequence back to the pool
        try {
            const counterRef = db.collection('counters').doc('admissions');
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(counterRef);
                const data = snap.exists ? snap.data() : {};
                const releasedRaw = Array.isArray(data?.released) ? data.released : [];
                const released = releasedRaw.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
                const nextVal = typeof data?.next === 'number' ? data.next : 1;
                if (sequence === nextVal - 1) {
                    tx.set(counterRef, { next: nextVal - 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                }
                else if (!released.includes(sequence)) {
                    released.push(sequence);
                    released.sort((a, b) => a - b);
                    tx.set(counterRef, { released, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                }
            });
        }
        catch (rollbackErr) {
            firebase_functions_1.logger.error('Rollback of sequence allocation failed', rollbackErr);
        }
        throw new https_1.HttpsError('internal', 'Failed to create student account.');
    }
    await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'student' });
    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('students').doc(userRecord.uid).set({
        admissionNumber,
        admissionNumberLower: admissionNumber.toLowerCase(),
        admissionSequence: sequence,
        name: fullName,
        nameLower: fullName.toLowerCase(),
        fatherName,
        courseOfStudy: normalizedCourse,
        stream: normalizedCourse,
        year,
        batch,
        gender,
        phoneNumber,
        email: null,
        emailLower: null,
        emailVerifiedAt: null,
        authEmail,
        mustChangePassword: true,
        createdBy: adminId,
        createdAt: now,
        updatedAt: now,
    }, { merge: true });
    // Ensure the student appears immediately in Fees filters/list.
    // This does NOT change accounts totals; accounts are updated via updateFees deltas.
    await db.collection('fees').doc(userRecord.uid).set({
        totalFees: 0,
        paidAmount: 0,
        pendingAmount: 0,
        feeStatus: 'none',
        lastUpdated: now,
        studentName: fullName,
        studentNameLower: fullName.toLowerCase(),
        admissionNumber,
        year,
        batch,
        courseOfStudy: normalizedCourse,
        stream: normalizedCourse,
    }, { merge: true });
    await writeAuditLog({
        action: 'adminCreateAdmission',
        adminId,
        studentId: userRecord.uid,
        metadata: { admissionNumber, courseOfStudy, year, batch, gender },
    });
    return { ok: true, uid: userRecord.uid, admissionNumber };
});
// ---------------------------------------------------------------------------
// ADMIN: Academic migration (batch + stream)
//   - PROMOTE: Year 1 -> Year 2
//   - COMPLETE: Year 2 -> status=completed
// Also updates fees/{studentId}.year so filters stay consistent.
// ---------------------------------------------------------------------------
exports.adminMigrateStudents = (0, https_1.onCall)(async (request) => {
    const { uid: adminId } = requireAdmin(request);
    const batch = normalizeAndValidateBatch(request.data?.batch);
    const streamRaw = assertString(request.data?.stream, 'stream').toUpperCase();
    const action = assertString(request.data?.action, 'action').toUpperCase();
    const allowedStreams = ['ALL', 'TECHNICAL', 'EAPCET', 'NDA', 'CEC'];
    if (!allowedStreams.includes(streamRaw)) {
        throw new https_1.HttpsError('invalid-argument', 'stream must be one of: ALL, TECHNICAL, EAPCET, NDA, CEC.');
    }
    if (action !== 'PROMOTE' && action !== 'COMPLETE') {
        throw new https_1.HttpsError('invalid-argument', 'action must be PROMOTE or COMPLETE.');
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    const fromYear = action === 'PROMOTE' ? '1' : '2';
    const toYear = action === 'PROMOTE' ? '2' : '2';
    const toBatch = action === 'PROMOTE' ? nextAcademicBatch(batch) : batch;
    // Query by batch only (robust against year stored as number vs string
    // and stream stored in stream vs courseOfStudy).
    const snap = await db.collection('students').where('batch', '==', batch).get();
    if (snap.empty) {
        await writeAuditLog({
            action: 'adminMigrateStudents',
            adminId,
            metadata: { batch, stream: streamRaw, action, updated: 0 },
        });
        return { ok: true, updated: 0 };
    }
    const completed = action === 'COMPLETE';
    const updatedIds = [];
    // Batch write (max 500 ops per commit). We update up to 2 docs per student (students + fees).
    const CHUNK_SIZE = 200;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const slice = docs.slice(i, i + CHUNK_SIZE);
        const batchWrite = db.batch();
        for (const d of slice) {
            const data = d.data();
            const docYear = data?.year;
            const yearValue = typeof docYear === 'number' ? String(docYear) : typeof docYear === 'string' ? docYear.trim() : '';
            if (yearValue !== fromYear)
                continue;
            const docStreamRaw = typeof data?.stream === 'string'
                ? data.stream
                : typeof data?.courseOfStudy === 'string'
                    ? data.courseOfStudy
                    : '';
            const docStream = String(docStreamRaw || '').trim().toUpperCase();
            if (streamRaw !== 'ALL' && docStream !== streamRaw)
                continue;
            const studentRef = db.collection('students').doc(d.id);
            const feesRef = db.collection('fees').doc(d.id);
            const studentUpdate = {
                year: toYear,
                batch: toBatch,
                updatedAt: now,
            };
            if (action === 'PROMOTE') {
                studentUpdate.promotedAt = now;
                studentUpdate.promotedBy = adminId;
                studentUpdate.status = admin.firestore.FieldValue.delete();
            }
            else {
                studentUpdate.status = 'completed';
                studentUpdate.completedAt = now;
                studentUpdate.completedBy = adminId;
            }
            batchWrite.update(studentRef, studentUpdate);
            // Keep fees filters aligned with student year/status.
            const feesUpdate = {
                year: toYear,
                batch: toBatch,
                lastUpdated: now,
            };
            if (streamRaw !== 'ALL') {
                feesUpdate.stream = streamRaw;
                feesUpdate.courseOfStudy = streamRaw;
            }
            if (completed) {
                feesUpdate.studentStatus = 'completed';
                feesUpdate.studentCompletedAt = now;
            }
            else {
                feesUpdate.studentStatus = admin.firestore.FieldValue.delete();
                feesUpdate.studentCompletedAt = admin.firestore.FieldValue.delete();
            }
            batchWrite.set(feesRef, feesUpdate, { merge: true });
            updatedIds.push(d.id);
        }
        await batchWrite.commit();
    }
    await writeAuditLog({
        action: 'adminMigrateStudents',
        adminId,
        metadata: { batch, toBatch, stream: streamRaw, action, updated: updatedIds.length, fromYear, toYear },
    });
    return { ok: true, updated: updatedIds.length, batch, toBatch, stream: streamRaw, fromYear, toYear };
});
// ---------------------------------------------------------------------------
// ADMIN: Delete student + fees
//   - Deletes students/{studentId} and fees/{studentId}
//   - Decrements accounts/summary totals based on the removed fees doc
// NOTE: This does not delete the Firebase Auth user.
// ---------------------------------------------------------------------------
exports.adminDeleteStudent = (0, https_1.onCall)(async (request) => {
    const { uid: adminId } = requireAdmin(request);
    const studentId = assertString(request.data?.studentId, 'studentId');
    const studentRef = db.collection('students').doc(studentId);
    const feesRef = db.collection('fees').doc(studentId);
    const accountsRef = db.collection('accounts').doc('summary');
    const counterRef = db.collection('counters').doc('admissions');
    // Linked docs (best-effort cleanup)
    const emailVerificationCodeRef = db.collection('emailVerificationCodes').doc(studentId);
    const removed = await db.runTransaction(async (tx) => {
        const [studentSnap, feesSnap, counterSnap] = await Promise.all([
            tx.get(studentRef),
            tx.get(feesRef),
            tx.get(counterRef),
        ]);
        const student = studentSnap.exists ? studentSnap.data() : null;
        const fees = feesSnap.exists ? feesSnap.data() : null;
        const admissionNumber = typeof student?.admissionNumber === 'string' && student.admissionNumber.trim()
            ? student.admissionNumber.trim()
            : typeof fees?.admissionNumber === 'string' && fees.admissionNumber.trim()
                ? fees.admissionNumber.trim()
                : null;
        const admissionSequence = typeof student?.admissionSequence === 'number' ? student.admissionSequence : null;
        const totalFees = typeof fees?.totalFees === 'number' ? fees.totalFees : 0;
        const paidAmount = typeof fees?.paidAmount === 'number' ? fees.paidAmount : 0;
        const pendingAmount = typeof fees?.pendingAmount === 'number'
            ? fees.pendingAmount
            : Math.max(0, Number(totalFees || 0) - Number(paidAmount || 0));
        if (totalFees || paidAmount || pendingAmount) {
            tx.set(accountsRef, {
                totalBudget: admin.firestore.FieldValue.increment(-totalFees),
                totalCollected: admin.firestore.FieldValue.increment(-paidAmount),
                totalPending: admin.firestore.FieldValue.increment(-pendingAmount),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        // Release admission sequence back to the pool so it can be reused.
        // If it was the last sequence (next - 1), decrement next instead of releasing it.
        if (typeof admissionSequence === 'number' && Number.isInteger(admissionSequence) && admissionSequence > 0) {
            const counterData = counterSnap.exists ? counterSnap.data() : {};
            const nextVal = typeof counterData.next === 'number' ? counterData.next : 1;
            if (admissionSequence === nextVal - 1) {
                const newNext = nextVal - 1;
                const releasedRaw = Array.isArray(counterData?.released) ? counterData.released : [];
                const released = releasedRaw
                    .map((n) => Number(n))
                    .filter((n) => Number.isInteger(n) && n > 0 && n < newNext);
                released.sort((a, b) => a - b);
                tx.set(counterRef, { next: newNext, released, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            }
            else {
                const releasedRaw = Array.isArray(counterData?.released) ? counterData.released : [];
                const released = releasedRaw
                    .map((n) => Number(n))
                    .filter((n) => Number.isInteger(n) && n > 0);
                if (!released.includes(admissionSequence)) {
                    released.push(admissionSequence);
                }
                released.sort((a, b) => a - b);
                tx.set(counterRef, { released, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            }
        }
        // Delete linked one-off OTP/code docs (ignore if missing).
        tx.delete(emailVerificationCodeRef);
        if (admissionNumber) {
            tx.delete(db.collection('firstLoginCodes').doc(admissionNumber));
            tx.delete(db.collection('passwordResetCodes').doc(admissionNumber));
        }
        // If the student has an email saved, delete the reset-by-email code doc too.
        const emailLower = typeof student?.emailLower === 'string' ? student.emailLower.trim().toLowerCase() : '';
        if (emailLower) {
            const emailHash = hashString(emailLower);
            tx.delete(db.collection('passwordResetEmailCodes').doc(emailHash));
        }
        tx.delete(feesRef);
        tx.delete(studentRef);
        return { admissionNumber, admissionSequence, totalFees, paidAmount, pendingAmount };
    });
    // Best-effort: delete Firebase Auth user (so the same admission can be recreated cleanly).
    let authDeleted = false;
    try {
        await admin.auth().deleteUser(studentId);
        authDeleted = true;
    }
    catch (e) {
        // Ignore "not found" or invalid uid scenarios.
        if (e?.code !== 'auth/user-not-found' && e?.code !== 'auth/invalid-uid') {
            firebase_functions_1.logger.warn('adminDeleteStudent: failed to delete auth user', { studentId, code: e?.code, message: e?.message });
        }
    }
    // Best-effort: delete profile photo from Storage (path used by adminUploadProfilePhoto).
    let photoDeleted = false;
    try {
        const appOptions = admin.app().options;
        const projectId = appOptions?.projectId || process.env.GCLOUD_PROJECT || 'hdaapp-38a02';
        const configuredBucket = typeof appOptions?.storageBucket === 'string' ? appOptions.storageBucket.trim() : '';
        const bucketName = (configuredBucket || `${projectId}.firebasestorage.app`).replace(/^gs:\/\//, '');
        await admin.storage().bucket(bucketName).file(`students/${studentId}/profile.jpg`).delete({ ignoreNotFound: true });
        photoDeleted = true;
    }
    catch (e) {
        firebase_functions_1.logger.warn('adminDeleteStudent: failed to delete profile photo', { studentId, code: e?.code, message: e?.message });
    }
    // Best-effort: delete audit logs referencing this student.
    let logsDeleted = 0;
    try {
        const snap = await db.collection('logs').where('studentId', '==', studentId).get();
        if (!snap.empty) {
            const docs = snap.docs;
            const CHUNK = 400;
            for (let i = 0; i < docs.length; i += CHUNK) {
                const slice = docs.slice(i, i + CHUNK);
                const batch = db.batch();
                for (const d of slice)
                    batch.delete(d.ref);
                await batch.commit();
                logsDeleted += slice.length;
            }
        }
    }
    catch (e) {
        firebase_functions_1.logger.warn('adminDeleteStudent: failed to delete logs', { studentId, code: e?.code, message: e?.message });
    }
    // If this was the last student, reset admin panel finance/test data to zero.
    // This keeps Accounts/Statistics clean after you delete all test students.
    let resetPerformed = false;
    let statisticsCleared = 0;
    try {
        const countSnap = await db.collection('students').count().get();
        const remaining = Number(countSnap?.data()?.count ?? 0);
        if (Number.isFinite(remaining) && remaining === 0) {
            // Remove the summary doc: UI treats missing as 0.
            await db.collection('accounts').doc('summary').delete();
            // Clear statistics entries.
            const statsSnap = await db.collection('statistics').get();
            if (!statsSnap.empty) {
                const docs = statsSnap.docs;
                const CHUNK = 400;
                for (let i = 0; i < docs.length; i += CHUNK) {
                    const slice = docs.slice(i, i + CHUNK);
                    const batch = db.batch();
                    for (const d of slice)
                        batch.delete(d.ref);
                    await batch.commit();
                    statisticsCleared += slice.length;
                }
            }
            // Reset admission counter so new admissions start from HDA0001 again.
            await db.collection('counters').doc('admissions').set({ next: 1, released: [], updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            resetPerformed = true;
        }
    }
    catch (e) {
        firebase_functions_1.logger.warn('adminDeleteStudent: failed to reset admin finance data', { code: e?.code, message: e?.message });
    }
    await writeAuditLog({
        action: 'adminDeleteStudent',
        adminId,
        studentId,
        metadata: { ...removed, authDeleted, photoDeleted, logsDeleted, resetPerformed, statisticsCleared },
    });
    return {
        ok: true,
        removed: { ...removed, authDeleted, photoDeleted, logsDeleted, resetPerformed, statisticsCleared },
    };
});
// ---------------------------------------------------------------------------
// STUDENT: Verify email (OTP to student-provided email)
// ---------------------------------------------------------------------------
// emailVerificationCodes/{uid}
// { emailLower, codeHash, expiresAt, attempts, createdAt }
exports.requestEmailVerificationOtp = (0, https_1.onCall)({ secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM] }, async (request) => {
    const { uid, token } = requireAuth(request);
    if (token.role !== 'student') {
        throw new https_1.HttpsError('permission-denied', 'Student role required.');
    }
    const email = assertString(request.data?.email, 'email');
    const emailLower = email.trim().toLowerCase();
    if (!emailLower.includes('@')) {
        throw new https_1.HttpsError('invalid-argument', 'email must be a valid email address.');
    }
    // Enforce unique email per student (required for reset-by-email to be unambiguous).
    const existing = await db.collection('students').where('emailLower', '==', emailLower).limit(1).get();
    if (!existing.empty && existing.docs[0].id !== uid) {
        throw new https_1.HttpsError('already-exists', 'Email is already used by another student. Please use a different email.');
    }
    const otp = generateOtp();
    const codeHash = hashCode(otp);
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000));
    await db.collection('emailVerificationCodes').doc(uid).set({
        emailLower,
        codeHash,
        expiresAt,
        attempts: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    const { transporter, from } = await getTransporter();
    await sendMailOrThrow(transporter, {
        from,
        to: emailLower,
        subject: 'Verify your email for HDA',
        text: `Your HDA email verification code is: ${otp}. It expires in 10 minutes.`,
    });
    return { ok: true, emailMasked: maskEmail(emailLower) };
});
exports.verifyEmailWithOtp = (0, https_1.onCall)(async (request) => {
    const { uid, token } = requireAuth(request);
    if (token.role !== 'student') {
        throw new https_1.HttpsError('permission-denied', 'Student role required.');
    }
    const email = assertString(request.data?.email, 'email');
    const emailLower = email.trim().toLowerCase();
    if (!emailLower.includes('@')) {
        throw new https_1.HttpsError('invalid-argument', 'email must be a valid email address.');
    }
    // Enforce unique email per student.
    const existing = await db.collection('students').where('emailLower', '==', emailLower).limit(1).get();
    if (!existing.empty && existing.docs[0].id !== uid) {
        throw new https_1.HttpsError('already-exists', 'Email is already used by another student. Please use a different email.');
    }
    const otp = assertString(request.data?.otpCode, 'otpCode');
    const codeRef = db.collection('emailVerificationCodes').doc(uid);
    const codeSnap = await codeRef.get();
    if (!codeSnap.exists) {
        throw new https_1.HttpsError('failed-precondition', 'No OTP request found. Please request a new code.');
    }
    const codeData = codeSnap.data();
    const expiresAt = codeData.expiresAt;
    const attempts = codeData.attempts ?? 0;
    if (attempts >= 5) {
        throw new https_1.HttpsError('resource-exhausted', 'Too many attempts. Please request a new code.');
    }
    if (expiresAt.toMillis() < Date.now()) {
        throw new https_1.HttpsError('deadline-exceeded', 'OTP expired. Please request a new code.');
    }
    if (codeData.emailLower !== emailLower) {
        throw new https_1.HttpsError('invalid-argument', 'Email does not match OTP request.');
    }
    const otpHash = hashCode(otp);
    if (otpHash !== codeData.codeHash) {
        await codeRef.set({ attempts: attempts + 1 }, { merge: true });
        throw new https_1.HttpsError('invalid-argument', 'Invalid OTP code.');
    }
    await db.collection('students').doc(uid).set({
        email: emailLower,
        emailLower,
        emailVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await codeRef.delete();
    return { ok: true };
});
// ---------------------------------------------------------------------------
// AUTH: Forgot password by EMAIL (Email -> OTP -> set new password)
// ---------------------------------------------------------------------------
// passwordResetEmailCodes/{emailHash}
// { emailLower, uid, codeHash, expiresAt, attempts, createdAt }
exports.requestPasswordResetOtpByEmail = (0, https_1.onCall)({ secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM] }, async (request) => {
    const email = assertString(request.data?.email, 'email');
    const emailLower = email.trim().toLowerCase();
    if (!emailLower.includes('@')) {
        throw new https_1.HttpsError('invalid-argument', 'email must be a valid email address.');
    }
    // Use limit(2) to detect duplicates and prevent resetting the wrong account.
    const snap = await db.collection('students').where('emailLower', '==', emailLower).limit(2).get();
    if (snap.empty) {
        // Throw a not-found error so unregistered emails are rejected.
        throw new https_1.HttpsError('not-found', 'This email is not registered with any student account.');
    }
    if (snap.size > 1) {
        throw new https_1.HttpsError('failed-precondition', 'This email is linked to multiple students. Please contact admin to assign unique emails before using email reset.');
    }
    const studentDoc = snap.docs[0];
    const student = studentDoc.data();
    const uid = studentDoc.id;
    const otp = generateOtp();
    const codeHash = hashCode(otp);
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000));
    const emailHash = hashString(emailLower);
    await db.collection('passwordResetEmailCodes').doc(emailHash).set({
        emailLower,
        uid,
        codeHash,
        expiresAt,
        attempts: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    const { transporter, from } = await getTransporter();
    await sendMailOrThrow(transporter, {
        from,
        to: emailLower,
        subject: 'Your HDA password reset code',
        text: `Your HDA password reset code is: ${otp}. It expires in 10 minutes.`,
    });
    return { ok: true, emailMasked: maskEmail(emailLower) };
});
exports.resetPasswordWithOtpByEmail = (0, https_1.onCall)(async (request) => {
    const email = assertString(request.data?.email, 'email');
    const emailLower = email.trim().toLowerCase();
    if (!emailLower.includes('@')) {
        throw new https_1.HttpsError('invalid-argument', 'email must be a valid email address.');
    }
    const otp = assertString(request.data?.otpCode, 'otpCode');
    const password = assertString(request.data?.newPassword, 'newPassword');
    if (password.length < 8) {
        throw new https_1.HttpsError('invalid-argument', 'Password must be at least 8 characters.');
    }
    if (password === DEFAULT_STUDENT_PASSWORD) {
        throw new https_1.HttpsError('invalid-argument', 'New password cannot be the default password.');
    }
    const emailHash = hashString(emailLower);
    const codeRef = db.collection('passwordResetEmailCodes').doc(emailHash);
    const codeSnap = await codeRef.get();
    if (!codeSnap.exists) {
        throw new https_1.HttpsError('failed-precondition', 'No OTP request found. Please request a new code.');
    }
    const codeData = codeSnap.data();
    const expiresAt = codeData.expiresAt;
    const attempts = codeData.attempts ?? 0;
    if (attempts >= 5) {
        throw new https_1.HttpsError('resource-exhausted', 'Too many attempts. Please request a new code.');
    }
    if (expiresAt.toMillis() < Date.now()) {
        throw new https_1.HttpsError('deadline-exceeded', 'OTP expired. Please request a new code.');
    }
    if (codeData.emailLower !== emailLower) {
        throw new https_1.HttpsError('invalid-argument', 'Email does not match OTP request.');
    }
    const otpHash = hashCode(otp);
    if (otpHash !== codeData.codeHash) {
        await codeRef.set({ attempts: attempts + 1 }, { merge: true });
        throw new https_1.HttpsError('invalid-argument', 'Invalid OTP code.');
    }
    const uid = assertString(codeData.uid, 'uid');
    await admin.auth().updateUser(uid, { password });
    await admin.auth().setCustomUserClaims(uid, { role: 'student' });
    await db.collection('students').doc(uid).set({
        mustChangePassword: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await codeRef.delete();
    return { ok: true };
});
// ---------------------------------------------------------------------------
// STUDENT: Change password after first login
// ---------------------------------------------------------------------------
exports.studentChangePassword = (0, https_1.onCall)(async (request) => {
    const { uid, token } = requireAuth(request);
    if (token.role !== 'student') {
        throw new https_1.HttpsError('permission-denied', 'Student role required.');
    }
    const newPassword = assertString(request.data?.newPassword, 'newPassword');
    if (newPassword.length < 8) {
        throw new https_1.HttpsError('invalid-argument', 'Password must be at least 8 characters.');
    }
    if (newPassword === DEFAULT_STUDENT_PASSWORD) {
        throw new https_1.HttpsError('invalid-argument', 'New password cannot be the default password.');
    }
    await admin.auth().updateUser(uid, { password: newPassword });
    await db.collection('students').doc(uid).set({
        mustChangePassword: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true };
});
// ---------------------------------------------------------------------------
// ADMIN: Role assignment (bootstrap via CLI or initial admin)
// ---------------------------------------------------------------------------
exports.setUserRole = (0, https_1.onCall)(async (request) => {
    const { uid } = requireAdmin(request);
    const targetUid = assertString(request.data?.targetUid, 'targetUid');
    const role = assertString(request.data?.role, 'role');
    if (role !== 'admin' && role !== 'student') {
        throw new https_1.HttpsError('invalid-argument', 'role must be "admin" or "student".');
    }
    await admin.auth().setCustomUserClaims(targetUid, { role });
    await writeAuditLog({ action: 'setUserRole', adminId: uid, studentId: targetUid, metadata: { role } });
    return { ok: true };
});
// ---------------------------------------------------------------------------
// ADMIN: Secure operations with validation + audit logging
// ---------------------------------------------------------------------------
exports.updateStudentMarks = (0, https_1.onCall)(async (request) => {
    const { uid: adminId } = requireAdmin(request);
    const studentId = assertString(request.data?.studentId, 'studentId');
    const marks = request.data?.marks;
    const subjectOnly = typeof request.data?.subject === 'string' ? request.data.subject : null;
    const ref = db.collection('students').doc(studentId);
    if (Array.isArray(marks) && marks.length > 0) {
        const sanitized = marks.map((m, idx) => {
            const subject = assertString(m?.subject, `marks[${idx}].subject`);
            const score = assertIntInRange(m?.score, `marks[${idx}].score`, 0, 100);
            const maxScore = assertIntInRange(m?.maxScore ?? 100, `marks[${idx}].maxScore`, 1, 100);
            if (score > maxScore) {
                throw new https_1.HttpsError('invalid-argument', `marks[${idx}].score cannot exceed maxScore.`);
            }
            return { subject, score, maxScore };
        });
        await ref.set({
            marks: sanitized,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        await writeAuditLog({ action: 'updateStudentMarks', adminId, studentId, metadata: { mode: 'replace', count: sanitized.length } });
        return { ok: true };
    }
    if (!subjectOnly || !subjectOnly.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'Provide either marks[] or subject/score to update a single subject.');
    }
    const subject = assertString(subjectOnly, 'subject');
    const score = assertIntInRange(request.data?.score, 'score', 0, 100);
    const maxScore = assertIntInRange(request.data?.maxScore ?? 100, 'maxScore', 1, 100);
    if (score > maxScore) {
        throw new https_1.HttpsError('invalid-argument', 'score cannot exceed maxScore.');
    }
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const prev = snap.exists ? snap.data() : null;
        const prevMarks = Array.isArray(prev?.marks) ? prev.marks : [];
        const nextMarks = [
            ...prevMarks.filter((m) => typeof m?.subject === 'string' && m.subject !== subject),
            { subject, score, maxScore },
        ];
        tx.set(ref, {
            marks: nextMarks,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
    await writeAuditLog({ action: 'updateStudentMarks', adminId, studentId, metadata: { mode: 'upsertSubject', subject } });
    return { ok: true };
});
exports.addStudentRemark = (0, https_1.onCall)(async (request) => {
    const { uid: adminId } = requireAdmin(request);
    const studentId = assertString(request.data?.studentId, 'studentId');
    const message = assertString(request.data?.message, 'message');
    const type = request.data?.type;
    const remarkType = type === 'positive' || type === 'alert' || type === 'note' ? type : 'note';
    const remark = {
        type: remarkType,
        message,
        by: adminId,
        // Firestore does not allow serverTimestamp() sentinels inside arrayUnion().
        date: admin.firestore.Timestamp.now(),
    };
    await db.collection('students').doc(studentId).set({
        remarks: admin.firestore.FieldValue.arrayUnion(remark),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await writeAuditLog({ action: 'addStudentRemark', adminId, studentId, metadata: { type: remarkType } });
    return { ok: true };
});
exports.updateFees = (0, https_1.onCall)(async (request) => {
    try {
        const { uid: adminId } = requireAdmin(request);
        const studentId = assertString(request.data?.studentId, 'studentId');
        const totalFees = assertNonNegative(request.data?.totalFees, 'totalFees');
        const paidAmount = assertNonNegative(request.data?.paidAmount, 'paidAmount');
        const cautionary = assertNonNegative(request.data?.cautionDeposit ?? 0, 'cautionDeposit');
        const receiptNo = typeof request.data?.receiptNo === 'string' ? request.data.receiptNo.trim() : '';
        if (paidAmount > totalFees) {
            throw new https_1.HttpsError('invalid-argument', 'paidAmount cannot exceed totalFees.');
        }
        const pendingAmount = totalFees - paidAmount;
        const feeStatus = pendingAmount === 0 ? 'full' : paidAmount > 0 ? 'half' : 'none';
        const historyEntry = request.data?.paymentEntry;
        const paymentEntry = historyEntry
            ? {
                amount: assertNonNegative(historyEntry.amount, 'paymentEntry.amount'),
                method: typeof historyEntry.method === 'string' ? historyEntry.method : 'unknown',
                transactionId: typeof historyEntry.transactionId === 'string' && historyEntry.transactionId.trim()
                    ? historyEntry.transactionId.trim()
                    : null,
                cautionDeposit: cautionary,
                receiptNo: receiptNo || null,
                // Firestore does not allow serverTimestamp() sentinels inside arrayUnion().
                // Use a concrete Timestamp value instead.
                at: admin.firestore.Timestamp.now(),
            }
            : null;
        const feesRef = db.collection('fees').doc(studentId);
        const accountsRef = db.collection('accounts').doc('summary');
        const studentRef = db.collection('students').doc(studentId);
        await db.runTransaction(async (tx) => {
            const studentSnap = await tx.get(studentRef);
            const student = studentSnap.exists ? studentSnap.data() : null;
            const prevFeesSnap = await tx.get(feesRef);
            const prev = prevFeesSnap.exists ? prevFeesSnap.data() : null;
            const prevTotal = typeof prev?.totalFees === 'number' ? prev.totalFees : 0;
            const prevPaid = typeof prev?.paidAmount === 'number' ? prev.paidAmount : 0;
            const prevPending = typeof prev?.pendingAmount === 'number' ? prev.pendingAmount : prevTotal - prevPaid;
            const prevCaution = typeof prev?.cautionDeposit === 'number' ? prev.cautionDeposit : 0;
            const prevCautionUsed = typeof prev?.cautionDepositUsed === 'number' ? prev.cautionDepositUsed : 0;
            const deltaBudget = (totalFees - prevTotal) + cautionary;
            const deltaCollected = (paidAmount - prevPaid) + cautionary;
            const deltaPending = (totalFees - paidAmount) - (prevTotal - prevPaid);
            const feesUpdate = {
                totalFees,
                paidAmount,
                pendingAmount,
                feeStatus,
                cautionDeposit: prevCaution + cautionary,
                cautionDepositRemaining: (prevCaution + cautionary) - prevCautionUsed,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                studentName: typeof student?.name === 'string' ? student.name : null,
                studentNameLower: typeof student?.name === 'string' ? String(student.name).toLowerCase() : null,
                admissionNumber: typeof student?.admissionNumber === 'string' ? student.admissionNumber : null,
                year: typeof student?.year === 'string' ? student.year : null,
                batch: typeof student?.batch === 'string' ? student.batch : null,
                courseOfStudy: typeof student?.courseOfStudy === 'string' ? student.courseOfStudy : null,
                stream: typeof student?.stream === 'string'
                    ? student.stream
                    : typeof student?.courseOfStudy === 'string'
                        ? student.courseOfStudy
                        : null,
            };
            if (paymentEntry) {
                feesUpdate.paymentHistory = admin.firestore.FieldValue.arrayUnion(paymentEntry);
            }
            tx.set(feesRef, feesUpdate, { merge: true });
            tx.set(accountsRef, {
                totalBudget: admin.firestore.FieldValue.increment(deltaBudget),
                totalCollected: admin.firestore.FieldValue.increment(deltaCollected),
                totalPending: admin.firestore.FieldValue.increment(deltaPending),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        });
        await writeAuditLog({ action: 'updateFees', adminId, studentId, metadata: { totalFees, paidAmount, pendingAmount } });
        return { ok: true, pendingAmount };
    }
    catch (err) {
        // If it's already a HttpsError, keep it as-is.
        if (err?.constructor?.name === 'HttpsError') {
            throw err;
        }
        firebase_functions_1.logger.error('updateFees failed (unexpected)', {
            message: err?.message,
            name: err?.name,
            code: err?.code,
            stack: err?.stack,
        });
        const message = typeof err?.message === 'string' && err.message.trim() ? err.message.trim() : 'Unexpected error while updating fees.';
        throw new https_1.HttpsError('internal', message);
    }
});
exports.addStatisticsEntry = (0, https_1.onCall)(async (request) => {
    const { uid: adminId } = requireAdmin(request);
    const date = assertString(request.data?.date, 'date');
    const expenditure = assertNonNegative(request.data?.expenditure ?? 0, 'expenditure');
    const income = assertNonNegative(request.data?.income ?? 0, 'income');
    const isIncome = request.data?.isIncome === true;
    const category = typeof request.data?.category === 'string' && request.data.category.trim()
        ? request.data.category.trim()
        : 'Other';
    const note = typeof request.data?.note === 'string' ? request.data.note.trim() : '';
    const source = typeof request.data?.source === 'string' ? request.data.source.trim() : '';
    const studentHtno = typeof request.data?.studentHtno === 'string' ? request.data.studentHtno.trim() : '';
    const studentName = typeof request.data?.studentName === 'string' ? request.data.studentName.trim() : '';
    const paymentMode = typeof request.data?.paymentMode === 'string' ? request.data.paymentMode.trim() : 'Cash';
    const utrRef = typeof request.data?.utrRef === 'string' ? request.data.utrRef.trim() : '';
    const spentOn = typeof request.data?.spentOn === 'string' ? request.data.spentOn.trim() : '';
    const fromDeposit = request.data?.fromDeposit === true;
    const studentId = typeof request.data?.studentId === 'string' ? request.data.studentId.trim() : '';
    const docData = {
        date,
        expenditure,
        income,
        isIncome,
        category,
        note,
        paymentMode,
        utrRef,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (isIncome) {
        docData.source = source;
        docData.studentHtno = studentHtno;
        docData.studentName = studentName;
    }
    else {
        docData.spentOn = spentOn;
        docData.fromDeposit = fromDeposit;
        if (fromDeposit) {
            docData.studentId = studentId;
            docData.studentHtno = studentHtno;
            docData.studentName = studentName;
        }
    }
    const newDocRef = db.collection('statistics').doc();
    if (fromDeposit && studentId) {
        const feesRef = db.collection('fees').doc(studentId);
        await db.runTransaction(async (tx) => {
            const feesSnap = await tx.get(feesRef);
            if (!feesSnap.exists) {
                throw new https_1.HttpsError('not-found', 'Fees document for student not found.');
            }
            const feesData = feesSnap.data();
            const cautionDeposit = typeof feesData?.cautionDeposit === 'number' ? feesData.cautionDeposit : 0;
            const cautionDepositUsed = typeof feesData?.cautionDepositUsed === 'number' ? feesData.cautionDepositUsed : 0;
            const currentRemaining = cautionDeposit - cautionDepositUsed;
            if (expenditure > currentRemaining) {
                throw new https_1.HttpsError('failed-precondition', `Insufficient remaining cautionary deposit. Available: ₹${currentRemaining}`);
            }
            const nextUsed = cautionDepositUsed + expenditure;
            const nextRemaining = cautionDeposit - nextUsed;
            tx.set(feesRef, {
                cautionDepositUsed: nextUsed,
                cautionDepositRemaining: nextRemaining,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            tx.set(newDocRef, docData);
        });
    }
    else {
        await newDocRef.set(docData);
    }
    await writeAuditLog({
        action: 'addStatisticsEntry',
        adminId,
        metadata: { date, expenditure, income, isIncome, category, source, studentHtno, id: newDocRef.id, fromDeposit },
    });
    return { ok: true, id: newDocRef.id };
});
exports.adminUploadProfilePhoto = (0, https_1.onCall)(async (request) => {
    const { uid: adminId } = requireAdmin(request);
    const studentId = assertString(request.data?.studentId, 'studentId');
    const base64Data = assertString(request.data?.base64, 'base64');
    // Extract content type and base64 string
    const match = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!match || match.length !== 3) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid base64 string.');
    }
    const contentType = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    const appOptions = admin.app().options;
    const projectId = appOptions?.projectId || process.env.GCLOUD_PROJECT || 'hdaapp-38a02';
    // Prefer the configured default bucket. In modern Firebase projects this is often
    // `${projectId}.firebasestorage.app` (a real GCS bucket name).
    const configuredBucket = typeof appOptions?.storageBucket === 'string' ? appOptions.storageBucket.trim() : '';
    const bucketName = (configuredBucket || `${projectId}.firebasestorage.app`).replace(/^gs:\/\//, '');
    const bucket = admin.storage().bucket(bucketName);
    const file = bucket.file(`students/${studentId}/profile.jpg`);
    const token = crypto.randomUUID();
    try {
        await file.save(buffer, {
            resumable: false,
            metadata: {
                contentType,
                metadata: {
                    firebaseStorageDownloadTokens: token,
                },
            },
        });
    }
    catch (err) {
        const msg = typeof err?.message === 'string' ? err.message : '';
        const code = err?.code;
        // When Firebase Storage is not enabled yet, the default bucket may not exist.
        if (code === 404 || /bucket does not exist/i.test(msg)) {
            throw new https_1.HttpsError('failed-precondition', 'Firebase Storage is not set up for this project. Open Firebase Console → Storage → Get started (create the default bucket), then try uploading again.');
        }
        console.error('adminUploadProfilePhoto failed', { studentId, adminId, err });
        throw new https_1.HttpsError('internal', 'Failed to upload photo. Please try again.');
    }
    const encodedPath = encodeURIComponent(file.name);
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
    await writeAuditLog({ action: 'adminUploadProfilePhoto', adminId, studentId });
    return { url: downloadUrl };
});
