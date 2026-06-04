import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

class FirebaseBackend {
  FirebaseBackend({
    FirebaseAuth? auth,
    FirebaseFirestore? firestore,
    FirebaseFunctions? functions,
  })  : _auth = auth ?? FirebaseAuth.instance,
        _firestore = firestore ?? FirebaseFirestore.instance,
        _functions = functions ?? FirebaseFunctions.instanceFor(region: 'asia-south1');

  final FirebaseAuth _auth;
  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  User? get currentUser => _auth.currentUser;

  String admissionAuthEmail(String admissionNumber) {
    final admission = admissionNumber.trim().toLowerCase();
    return '$admission@students.eduhub.local';
  }

  Future<UserCredential> signInWithAdmissionPassword({
    required String admissionNumber,
    required String password,
  }) {
    return _auth.signInWithEmailAndPassword(
      email: admissionAuthEmail(admissionNumber),
      password: password.trim(),
    );
  }

  Future<UserCredential> signInWithCustomToken({required String token}) {
    return _auth.signInWithCustomToken(token);
  }

  Future<String?> requestFirstLoginOtp({required String admissionNumber}) async {
    final callable = _functions.httpsCallable('requestFirstLoginOtp');
    final res = await callable.call(<String, dynamic>{
      'admissionNumber': admissionNumber.trim(),
    });

    final data = res.data;
    if (data is Map && data['emailMasked'] is String) {
      return data['emailMasked'] as String;
    }
    return null;
  }

  Future<String> completeFirstLogin({
    required String admissionNumber,
    required String otpCode,
    required String password,
  }) async {
    final callable = _functions.httpsCallable('completeFirstLogin');
    final res = await callable.call(<String, dynamic>{
      'admissionNumber': admissionNumber.trim(),
      'otpCode': otpCode.trim(),
      'password': password,
    });

    final data = res.data;
    if (data is Map && data['customToken'] is String) {
      return data['customToken'] as String;
    }

    throw FirebaseFunctionsException(
      code: 'internal',
      message: 'Invalid response from server.',
    );
  }

  Future<String?> requestPasswordResetOtp({required String admissionNumber}) async {
    final callable = _functions.httpsCallable('requestPasswordResetOtp');
    final res = await callable.call(<String, dynamic>{
      'admissionNumber': admissionNumber.trim(),
    });

    final data = res.data;
    if (data is Map && data['emailMasked'] is String) {
      return data['emailMasked'] as String;
    }
    return null;
  }

  Future<void> resetPasswordWithOtp({
    required String admissionNumber,
    required String otpCode,
    required String newPassword,
  }) async {
    final callable = _functions.httpsCallable('resetPasswordWithOtp');
    await callable.call(<String, dynamic>{
      'admissionNumber': admissionNumber.trim(),
      'otpCode': otpCode.trim(),
      'newPassword': newPassword,
    });
  }

  Future<String?> requestEmailVerificationOtp({required String email}) async {
    final callable = _functions.httpsCallable('requestEmailVerificationOtp');
    final res = await callable.call(<String, dynamic>{
      'email': email.trim(),
    });
    final data = res.data;
    if (data is Map && data['emailMasked'] is String) {
      return data['emailMasked'] as String;
    }
    return null;
  }

  Future<void> verifyEmailWithOtp({
    required String email,
    required String otpCode,
  }) async {
    final callable = _functions.httpsCallable('verifyEmailWithOtp');
    await callable.call(<String, dynamic>{
      'email': email.trim(),
      'otpCode': otpCode.trim(),
    });
  }

  Future<String?> requestPasswordResetOtpByEmail({required String email}) async {
    final callable = _functions.httpsCallable('requestPasswordResetOtpByEmail');
    final res = await callable.call(<String, dynamic>{
      'email': email.trim(),
    });
    final data = res.data;
    if (data is Map && data['emailMasked'] is String) {
      return data['emailMasked'] as String;
    }
    return null;
  }

  Future<void> resetPasswordWithOtpByEmail({
    required String email,
    required String otpCode,
    required String newPassword,
  }) async {
    final callable = _functions.httpsCallable('resetPasswordWithOtpByEmail');
    await callable.call(<String, dynamic>{
      'email': email.trim(),
      'otpCode': otpCode.trim(),
      'newPassword': newPassword,
    });
  }

  Future<bool> mustChangePasswordForCurrentUser() async {
    final user = _auth.currentUser;
    if (user == null) return false;

    final snap = await _firestore.collection('students').doc(user.uid).get();
    final data = snap.data();
    if (data == null) return false;
    final value = data['mustChangePassword'];
    return value is bool ? value : false;
  }

  Future<void> studentChangePassword({required String newPassword}) async {
    final callable = _functions.httpsCallable('studentChangePassword');
    await callable.call(<String, dynamic>{
      'newPassword': newPassword,
    });
  }

  Future<void> signOut() {
    return _auth.signOut();
  }
}
