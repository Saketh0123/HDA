import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../services/firebase_backend.dart';
import '../theme/app_theme.dart';
import 'main_shell.dart';

enum _UiState { signIn, forgotPassword }

// ─── Beautiful Center Dialog ──────────────────────────────────────────────────
Future<void> showBeautifulDialog(
  BuildContext context, {
  required IconData icon,
  required Color iconColor,
  required String title,
  required String message,
  String buttonLabel = 'OK',
}) {
  return showDialog(
    context: context,
    barrierDismissible: true,
    builder: (_) => Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64, height: 64,
              decoration: BoxDecoration(
                color: iconColor.withOpacity(0.10),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: iconColor, size: 32),
            ),
            const SizedBox(height: 18),
            Text(title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppTheme.textPrimary),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 10),
            Text(message,
              style: const TextStyle(fontSize: 14, color: AppTheme.textSecondary, height: 1.5),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.of(context, rootNavigator: true).pop(),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryColor,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  elevation: 0,
                ),
                child: Text(buttonLabel,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
class LoginScreen extends StatefulWidget {
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with SingleTickerProviderStateMixin {
  final _admissionCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  final _newPassCtrl = TextEditingController();
  final _confirmPassCtrl = TextEditingController();
  final _backend = FirebaseBackend();

  _UiState _state = _UiState.signIn;
  bool _loading = false;
  bool _obscure = true;
  bool _otpSent = false;
  String? _maskedEmail;

  late AnimationController _anim;
  late Animation<double> _fade;
  late Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(vsync: this, duration: const Duration(milliseconds: 600));
    _fade = CurvedAnimation(parent: _anim, curve: Curves.easeOut);
    _slide = Tween<Offset>(begin: const Offset(0, 0.06), end: Offset.zero)
        .animate(CurvedAnimation(parent: _anim, curve: Curves.easeOut));
    _anim.forward();
  }

  @override
  void dispose() {
    _anim.dispose();
    _admissionCtrl.dispose(); _passwordCtrl.dispose();
    _emailCtrl.dispose(); _otpCtrl.dispose();
    _newPassCtrl.dispose(); _confirmPassCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.sizeOf(context).height;
    return Scaffold(
      resizeToAvoidBottomInset: true,
      body: Container(
        decoration: const BoxDecoration(gradient: AppTheme.indigoGradient),
        child: SafeArea(
          child: SingleChildScrollView(
            child: FadeTransition(
              opacity: _fade,
              child: SlideTransition(
                position: _slide,
                child: Column(
                  children: [
                    // ── Top brand section ──────────────────────────────────
                    SizedBox(
                      height: h * 0.32,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          // Golden "HDA" circle
                          Container(
                            width: 88, height: 88,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(color: AppTheme.goldenColor, width: 3),
                              color: Colors.white.withOpacity(0.06),
                              boxShadow: [
                                BoxShadow(
                                  color: AppTheme.goldenColor.withOpacity(0.4),
                                  blurRadius: 24, offset: const Offset(0, 6),
                                ),
                              ],
                            ),
                            child: const Center(
                              child: Text('HDA',
                                style: TextStyle(
                                  fontSize: 24, fontWeight: FontWeight.w900,
                                  color: AppTheme.goldenColor, letterSpacing: 2,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          const Text('HYDERABAD DEFENCE ACADEMY',
                            style: TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w800,
                              color: Colors.white, letterSpacing: 1.5,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 6),
                          Text(_getSubtitle(),
                            style: TextStyle(fontSize: 12, color: Colors.white.withOpacity(0.6)),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                    // ── White card ─────────────────────────────────────────
                    Container(
                      width: double.infinity,
                      constraints: BoxConstraints(minHeight: h * 0.62),
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.only(
                          topLeft: Radius.circular(36),
                          topRight: Radius.circular(36),
                        ),
                      ),
                      padding: const EdgeInsets.fromLTRB(28, 36, 28, 32),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(_getTitle(),
                            style: const TextStyle(
                              fontSize: 26, fontWeight: FontWeight.w800,
                              color: AppTheme.indigoDeep,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 28),
                          AnimatedSwitcher(
                            duration: const Duration(milliseconds: 220),
                            child: _buildForm(),
                          ),
                          const SizedBox(height: 24),
                          _IndigoButton(
                            label: _btnLabel(),
                            loading: _loading,
                            onPressed: _loading ? null : _handlePrimary,
                          ),
                          if (_state != _UiState.signIn) ...[
                            const SizedBox(height: 14),
                            TextButton(
                              onPressed: _loading ? null : _back,
                              child: const Text('← Back to Sign In',
                                style: TextStyle(color: AppTheme.primaryColor, fontWeight: FontWeight.w600),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _back() {
    setState(() {
      _state = _UiState.signIn;
      _otpSent = false; _maskedEmail = null;
      _passwordCtrl.clear(); _otpCtrl.clear();
      _emailCtrl.clear(); _newPassCtrl.clear(); _confirmPassCtrl.clear();
    });
    _anim.forward(from: 0);
  }

  String _getTitle() {
    if (_state == _UiState.signIn) return 'Welcome';
    return _otpSent ? 'Verify & Reset' : 'Forgot Password';
  }

  String _getSubtitle() {
    if (_state == _UiState.signIn) return 'Sign in with your Admission No & password';
    return _otpSent ? 'Enter OTP sent to your email' : 'Enter your registered email';
  }

  String _btnLabel() {
    if (_state == _UiState.signIn) return 'Sign In';
    return _otpSent ? 'Reset Password' : 'Send OTP';
  }

  Widget _buildForm() {
    if (_state == _UiState.signIn) {
      return Column(
        key: const ValueKey('signin'),
        children: [
          _Field(ctrl: _admissionCtrl, hint: 'Admission Number',
            icon: Icons.badge_outlined, caps: TextCapitalization.characters),
          const SizedBox(height: 14),
          _Field(
            ctrl: _passwordCtrl, hint: 'Password',
            icon: Icons.lock_outline_rounded, obscure: _obscure,
            suffix: IconButton(
              icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                color: AppTheme.textSecondary, size: 20),
              onPressed: () => setState(() => _obscure = !_obscure),
            ),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: _loading ? null : () {
                setState(() { _state = _UiState.forgotPassword; _otpSent = false; });
                _anim.forward(from: 0);
              },
              child: const Text('Forgot password?',
                style: TextStyle(color: AppTheme.primaryColor, fontWeight: FontWeight.w600, fontSize: 13),
              ),
            ),
          ),
        ],
      );
    }
    return Column(
      key: const ValueKey('forgot'),
      children: [
        _Field(ctrl: _emailCtrl, hint: 'Registered email',
          icon: Icons.email_outlined, keyboard: TextInputType.emailAddress),
        if (_otpSent) ...[
          const SizedBox(height: 14),
          _Field(ctrl: _otpCtrl, hint: 'OTP Code',
            icon: Icons.lock_clock_outlined, keyboard: TextInputType.number),
          const SizedBox(height: 14),
          _Field(ctrl: _newPassCtrl, hint: 'New Password',
            icon: Icons.lock_outline_rounded, obscure: _obscure),
          const SizedBox(height: 14),
          _Field(ctrl: _confirmPassCtrl, hint: 'Confirm Password',
            icon: Icons.lock_outline_rounded, obscure: _obscure),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _loading ? null : _sendOtp,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('Resend OTP',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
              ),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppTheme.primaryColor,
                side: const BorderSide(color: AppTheme.primaryColor, width: 1.5),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ),
        ],
      ],
    );
  }

  Future<void> _handlePrimary() async {
    if (_state == _UiState.signIn) { await _signIn(); return; }
    if (_otpSent) { await _resetPass(); } else { await _sendOtp(); }
  }

  Future<void> _signIn() async {
    final adm = _admissionCtrl.text.trim();
    final pwd = _passwordCtrl.text.trim();
    if (adm.isEmpty || pwd.isEmpty) { _dialog('Missing Fields', 'Please enter Admission No and password.', Icons.warning_amber_rounded, AppTheme.warningColor); return; }
    setState(() => _loading = true);
    try {
      await _backend.signInWithAdmissionPassword(admissionNumber: adm, password: pwd);
      if (!mounted) return;
      final must = await _backend.mustChangePasswordForCurrentUser();
      if (!mounted) return;
      if (must) {
        Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => VerifyEmailScreen(backend: _backend)));
        return;
      }
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const MainShell()));
    } on FirebaseAuthException catch (e) {
      if (!mounted) return;
      if (e.code == 'user-not-found') { _dialog('Not Found', 'Admission number not found. Contact admin.', Icons.person_off_outlined, AppTheme.alertColor); return; }
      if (e.code == 'wrong-password' || e.code == 'invalid-credential') { _dialog('Wrong Password', 'Incorrect password. Please try again.', Icons.lock_outline_rounded, AppTheme.alertColor); return; }
      _dialog('Error', e.message ?? e.code, Icons.error_outline_rounded, AppTheme.alertColor);
    } catch (e) {
      if (!mounted) return;
      _dialog('Error', e.toString(), Icons.error_outline_rounded, AppTheme.alertColor);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _sendOtp() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) { _dialog('Missing Email', 'Please enter your registered email.', Icons.email_outlined, AppTheme.warningColor); return; }
    setState(() => _loading = true);
    try {
      final masked = await _backend.requestPasswordResetOtpByEmail(email: email);
      if (!mounted) return;
      setState(() { _otpSent = true; _maskedEmail = masked; });
      await showBeautifulDialog(context,
        icon: Icons.mark_email_read_outlined,
        iconColor: AppTheme.successColor,
        title: 'OTP Sent!',
        message: 'A verification code has been sent to ${masked ?? email}. Please check your inbox.',
        buttonLabel: 'Got it',
      );
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      final msg = (e.message ?? '').toLowerCase();
      if (msg.contains('not found') || msg.contains('not registered') ||
          msg.contains('no user') || e.code == 'not-found') {
        await showBeautifulDialog(context,
          icon: Icons.person_off_outlined,
          iconColor: AppTheme.alertColor,
          title: 'Unregistered Email',
          message: 'This email is not linked to any student account. Please use your registered email.',
          buttonLabel: 'OK',
        );
      } else {
        _dialog('Failed', e.message ?? 'Failed to send OTP.', Icons.error_outline_rounded, AppTheme.alertColor);
      }
    } catch (e) {
      if (!mounted) return;
      _dialog('Error', e.toString(), Icons.error_outline_rounded, AppTheme.alertColor);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resetPass() async {
    final email = _emailCtrl.text.trim();
    final otp = _otpCtrl.text.trim();
    final pass = _newPassCtrl.text.trim();
    final conf = _confirmPassCtrl.text.trim();
    if (email.isEmpty || otp.isEmpty || pass.isEmpty || conf.isEmpty) { _dialog('Missing Fields', 'Please fill all fields.', Icons.warning_amber_rounded, AppTheme.warningColor); return; }
    if (pass.length < 8) { _dialog('Weak Password', 'Password must be at least 8 characters.', Icons.lock_outline_rounded, AppTheme.warningColor); return; }
    if (pass != conf) { _dialog('Mismatch', 'Passwords do not match.', Icons.lock_outline_rounded, AppTheme.alertColor); return; }
    setState(() => _loading = true);
    try {
      await _backend.resetPasswordWithOtpByEmail(email: email, otpCode: otp, newPassword: pass);
      if (!mounted) return;
      await showBeautifulDialog(context,
        icon: Icons.check_circle_outline_rounded,
        iconColor: AppTheme.successColor,
        title: 'Password Reset!',
        message: 'Your password has been updated successfully. Please sign in.',
        buttonLabel: 'Sign In',
      );
      if (mounted) _back();
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      _dialog('Failed', e.message ?? 'Failed to reset password.', Icons.error_outline_rounded, AppTheme.alertColor);
    } catch (e) {
      if (!mounted) return;
      _dialog('Error', e.toString(), Icons.error_outline_rounded, AppTheme.alertColor);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _dialog(String title, String msg, IconData icon, Color color) {
    showBeautifulDialog(context, icon: icon, iconColor: color, title: title, message: msg);
  }
}

// ─── Shared field widget ──────────────────────────────────────────────────────
class _Field extends StatelessWidget {
  final TextEditingController ctrl;
  final String hint;
  final IconData icon;
  final bool obscure;
  final Widget? suffix;
  final TextInputType? keyboard;
  final TextCapitalization caps;

  const _Field({
    required this.ctrl, required this.hint, required this.icon,
    this.obscure = false, this.suffix, this.keyboard,
    this.caps = TextCapitalization.none,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: ctrl, obscureText: obscure,
      keyboardType: keyboard, textCapitalization: caps,
      style: const TextStyle(fontSize: 15, color: AppTheme.textPrimary, fontWeight: FontWeight.w500),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: AppTheme.textHint, fontSize: 14),
        prefixIcon: Icon(icon, color: AppTheme.primaryColor, size: 20),
        suffixIcon: suffix,
        filled: true, fillColor: AppTheme.surfaceColor,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 17),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppTheme.borderColor, width: 1.5),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppTheme.borderColor, width: 1.5),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppTheme.primaryColor, width: 2),
        ),
      ),
    );
  }
}

// ─── Indigo gradient button ───────────────────────────────────────────────────
class _IndigoButton extends StatelessWidget {
  final String label;
  final bool loading;
  final VoidCallback? onPressed;
  const _IndigoButton({required this.label, required this.loading, this.onPressed});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onPressed,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        height: 54,
        decoration: BoxDecoration(
          gradient: onPressed != null ? AppTheme.headerGradient : null,
          color: onPressed == null ? AppTheme.borderColor : null,
          borderRadius: BorderRadius.circular(16),
          boxShadow: onPressed != null
              ? [BoxShadow(color: AppTheme.primaryColor.withOpacity(0.4), blurRadius: 18, offset: const Offset(0, 6))]
              : null,
        ),
        child: Center(
          child: loading
              ? const SizedBox(width: 22, height: 22,
                  child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
              : Text(label,
                  style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800, letterSpacing: 0.4)),
        ),
      ),
    );
  }
}

// ─── Verify Email Screen ──────────────────────────────────────────────────────
class VerifyEmailScreen extends StatefulWidget {
  const VerifyEmailScreen({super.key, required this.backend});
  final FirebaseBackend backend;
  @override
  State<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends State<VerifyEmailScreen> {
  final _emailCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  bool _loading = false, _otpSent = false;
  String? _masked;

  @override
  void dispose() { _emailCtrl.dispose(); _otpCtrl.dispose(); super.dispose(); }

  Future<void> _back() async {
    try { await widget.backend.signOut(); } catch (_) {}
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => LoginScreen()), (r) => false,
    );
  }

  Future<void> _send() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) return;
    setState(() => _loading = true);
    try {
      final m = await widget.backend.requestEmailVerificationOtp(email: email);
      if (!mounted) return;
      setState(() { _otpSent = true; _masked = m; });
      await showBeautifulDialog(context,
        icon: Icons.mark_email_read_outlined, iconColor: AppTheme.successColor,
        title: 'OTP Sent!', message: 'Check your inbox at ${m ?? email}.',
        buttonLabel: 'Got it',
      );
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      await showBeautifulDialog(context,
        icon: Icons.error_outline_rounded, iconColor: AppTheme.alertColor,
        title: 'Error', message: e.message ?? 'Failed to send OTP.',
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _verify() async {
    setState(() => _loading = true);
    try {
      await widget.backend.verifyEmailWithOtp(email: _emailCtrl.text.trim(), otpCode: _otpCtrl.text.trim());
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => ChangePasswordScreen(backend: widget.backend)));
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      await showBeautifulDialog(context, icon: Icons.error_outline_rounded, iconColor: AppTheme.alertColor, title: 'Error', message: e.message ?? 'Verification failed.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(
        backgroundColor: AppTheme.indigoDeep,
        elevation: 0,
        leading: IconButton(onPressed: _loading ? null : _back, icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white)),
        title: const Text('Verify Email', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 8),
            _Field(ctrl: _emailCtrl, hint: 'Email address', icon: Icons.email_outlined, keyboard: TextInputType.emailAddress),
            if (_otpSent) ...[
              const SizedBox(height: 14),
              _Field(ctrl: _otpCtrl, hint: 'OTP Code', icon: Icons.lock_clock_outlined, keyboard: TextInputType.number),
            ],
            const SizedBox(height: 24),
            _IndigoButton(
              label: _otpSent ? 'Verify OTP' : 'Send OTP',
              loading: _loading,
              onPressed: _loading ? null : (_otpSent ? _verify : _send),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Change Password Screen ───────────────────────────────────────────────────
class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key, required this.backend});
  final FirebaseBackend backend;
  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _p1 = TextEditingController();
  final _p2 = TextEditingController();
  bool _saving = false, _obscure = true;

  @override
  void dispose() { _p1.dispose(); _p2.dispose(); super.dispose(); }

  Future<void> _save() async {
    if (_p1.text.trim().length < 8) {
      await showBeautifulDialog(context, icon: Icons.lock_outline_rounded, iconColor: AppTheme.warningColor, title: 'Weak Password', message: 'Password must be at least 8 characters.');
      return;
    }
    if (_p1.text != _p2.text) {
      await showBeautifulDialog(context, icon: Icons.lock_outline_rounded, iconColor: AppTheme.alertColor, title: 'Mismatch', message: 'Passwords do not match.');
      return;
    }
    setState(() => _saving = true);
    try {
      await widget.backend.studentChangePassword(newPassword: _p1.text.trim());
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const MainShell()));
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      await showBeautifulDialog(context, icon: Icons.error_outline_rounded, iconColor: AppTheme.alertColor, title: 'Error', message: e.message ?? 'Failed.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(
        backgroundColor: AppTheme.indigoDeep, elevation: 0,
        title: const Text('Set New Password', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Field(ctrl: _p1, hint: 'New Password', icon: Icons.lock_outline_rounded, obscure: _obscure,
              suffix: IconButton(icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined, color: AppTheme.textSecondary, size: 20), onPressed: () => setState(() => _obscure = !_obscure))),
            const SizedBox(height: 14),
            _Field(ctrl: _p2, hint: 'Confirm Password', icon: Icons.lock_outline_rounded, obscure: _obscure),
            const SizedBox(height: 28),
            _IndigoButton(label: _saving ? 'Saving…' : 'Save Password', loading: _saving, onPressed: _saving ? null : _save),
          ],
        ),
      ),
    );
  }
}
