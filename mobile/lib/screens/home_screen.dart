// Flutter Mobile App – Home Screen (Premium redesign)
import 'dart:ui';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../theme/app_theme.dart';

class HomeScreen extends StatefulWidget {
  /// Called when the user taps "View all" — parent (MainShell) switches to Results tab.
  final VoidCallback? onViewAllResults;
  const HomeScreen({super.key, this.onViewAllResults});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {

  // ── Notifications state ────────────────────────────────────────────────
  bool _hasNewNotification = true; // badge indicator

  void _showNotifications(BuildContext context, List<_NotificationItem> notifs) async {
    await showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _NotificationsSheet(notifications: notifs),
    );
    if (mounted && _hasNewNotification) {
      setState(() => _hasNewNotification = false);
    }
  }

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inDays == 0) return 'Today';
    if (diff.inDays == 1) return 'Yesterday';
    return '${diff.inDays} days ago';
  }

  List<_NotificationItem> _getNotifications(Map<String, dynamic>? student) {
    if (student == null) return [];
    final notifs = <_NotificationItem>[];
    final now = DateTime.now();

    final remarks = (student['remarks'] is List) ? (student['remarks'] as List).cast<dynamic>() : [];
    for (final r in remarks) {
      if (r is! Map) continue;
      final dt = r['date'] is Timestamp ? (r['date'] as Timestamp).toDate() : null;
      if (dt != null) {
        final diff = now.difference(dt).inDays;
        if (diff <= 7) {
          final type = (r['type'] as String?) ?? 'note';
          final color = type == 'positive' ? AppTheme.successColor : type == 'alert' ? AppTheme.alertColor : AppTheme.primaryColor;
          notifs.add(_NotificationItem(Icons.chat_bubble_outline_rounded, color, 'New Remark', 'Your teacher left a new remark.', _timeAgo(dt), dt));
        }
      }
    }

    final updatedAt = student['updatedAt'] is Timestamp ? (student['updatedAt'] as Timestamp).toDate() : null;
    if (updatedAt != null) {
      final diff = now.difference(updatedAt).inDays;
      if (diff <= 7) {
        notifs.add(_NotificationItem(Icons.update_rounded, AppTheme.accentColor, 'Profile / Results Updated', 'Recent changes to your profile or marks.', _timeAgo(updatedAt), updatedAt));
      }
    }

    final createdAt = student['createdAt'] is Timestamp ? (student['createdAt'] as Timestamp).toDate() : null;
    if (createdAt != null) {
      final diff = now.difference(createdAt).inDays;
      if (diff <= 30) {
        notifs.add(_NotificationItem(Icons.celebration_rounded, AppTheme.goldenColor, 'Welcome to HDA Portal', 'Your dashboard is now active.', _timeAgo(createdAt), createdAt));
      }
    }

    notifs.sort((a, b) => b.date.compareTo(a.date));
    return notifs;
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  String _greetingForNow() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  int _asInt(dynamic v, {int fallback = 0}) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    return fallback;
  }

  String _yearLabel(String year) =>
      year == '2' ? '2nd Year' : year == '1' ? '1st Year' : year;

  String _gradeForPercent(int p) {
    if (p >= 90) return 'A+';
    if (p >= 80) return 'A';
    if (p >= 70) return 'B+';
    if (p >= 60) return 'B';
    return 'C';
  }

  Color _colorForSubject(String s) {
    switch (s.toLowerCase()) {
      case 'physics': return AppTheme.primaryColor;
      case 'chemistry': return AppTheme.accentColor;
      case 'mathematics': return const Color(0xFFA855F7);
      case 'biology': return AppTheme.warningColor;
      default: return AppTheme.primaryColor;
    }
  }

  @override
  Widget build(BuildContext context) {
    final topInset = MediaQuery.paddingOf(context).top;
    final uid = FirebaseAuth.instance.currentUser?.uid;

    if (uid == null) {
      return const ColoredBox(
        color: AppTheme.backgroundColor,
        child: Center(
          child: Text('Please sign in again.',
            style: TextStyle(color: AppTheme.textSecondary, fontWeight: FontWeight.w600)),
        ),
      );
    }

    final studentStream =
        FirebaseFirestore.instance.collection('students').doc(uid).snapshots();
    final feesStream =
        FirebaseFirestore.instance.collection('fees').doc(uid).snapshots();

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: studentStream,
      builder: (context, studentSnap) {
        if (studentSnap.connectionState == ConnectionState.waiting) {
          return const ColoredBox(
            color: AppTheme.backgroundColor,
            child: Center(child: CircularProgressIndicator(color: AppTheme.primaryColor)),
          );
        }

        final student = studentSnap.data?.data();
        final name = ((student?['name'] as String?) ?? '').trim().isNotEmpty
            ? (student!['name'] as String).trim()
            : 'Student';
        final admissionNumber = (student?['admissionNumber'] as String?) ?? '';
        final stream = (student?['stream'] as String?) ??
            (student?['courseOfStudy'] as String?) ?? '';
        final year = (student?['year'] as String?) ?? '';
        final batch = (student?['batch'] as String?) ?? '';
        final photoUrl = (student?['photoUrl'] as String?) ?? '';
        final photoUpdatedAt = student?['photoUpdatedAt'];

        String cacheBustedUrl(String url, Object? version) {
          final u = url.trim();
          if (!u.startsWith('http')) return u;
          if (version == null) return u;
          final v = Uri.encodeComponent(version.toString());
          return u.contains('?') ? '$u&v=$v' : '$u?v=$v';
        }

        final effectivePhotoUrl = photoUrl.trim().isNotEmpty
          ? cacheBustedUrl(photoUrl, photoUpdatedAt)
          : '';

        final marks = (student?['marks'] is List)
            ? (student!['marks'] as List).cast<dynamic>()
            : const <dynamic>[];

        int totalScore = 0, totalMax = 0;
        final subjectPerf = <_SubjectPerf>[];
        for (final m in marks) {
          if (m is! Map) continue;
          final subj = (m['subject'] as String?) ?? '';
          if (subj.trim().isEmpty) continue;
          final score = _asInt(m['score']);
          final maxScore = _asInt(m['maxScore'], fallback: 100);
          totalScore += score;
          totalMax += maxScore;
          final pct = maxScore > 0 ? ((score / maxScore) * 100).round() : 0;
          subjectPerf.add(_SubjectPerf(
            name: subj, marks: score, maxMarks: maxScore,
            grade: _gradeForPercent(pct), barColor: _colorForSubject(subj),
          ));
        }
        subjectPerf.sort((a, b) {
          final ap = a.maxMarks > 0 ? a.marks / a.maxMarks : 0;
          final bp = b.maxMarks > 0 ? b.marks / b.maxMarks : 0;
          return bp.compareTo(ap);
        });
        final topSubjects = subjectPerf.take(3).toList();
        final overallPercent =
            totalMax > 0 ? ((totalScore / totalMax) * 100).round() : 0;

        final remarks = (student?['remarks'] is List)
            ? (student!['remarks'] as List).cast<dynamic>()
            : const <dynamic>[];
        Map? latestRemark;
        DateTime? latestAt;
        for (final r in remarks) {
          if (r is! Map) continue;
          final ts = r['date'];
          DateTime? dt;
          if (ts is Timestamp) dt = ts.toDate();
          if (dt == null) continue;
          if (latestAt == null || dt.isAfter(latestAt)) {
            latestAt = dt;
            latestRemark = r;
          }
        }
        final latestRemarkMsg = (latestRemark?['message'] as String?) ?? '';
        final latestRemarkMeta = latestAt != null
            ? 'By Admin • ${DateFormat('dd MMM').format(latestAt)}'
            : 'No remarks yet';

        final programBits = <String>[];
        if (stream.trim().isNotEmpty) programBits.add(stream);
        if (year.trim().isNotEmpty) programBits.add(_yearLabel(year));
        if (batch.trim().isNotEmpty) programBits.add(batch);
        final program = programBits.isNotEmpty ? programBits.join(' • ') : '—';
        final notifs = _getNotifications(student);

        // No longer need fees data — removed fees card
        return ColoredBox(
          color: AppTheme.backgroundColor,
          child: SingleChildScrollView(
            padding: const EdgeInsets.only(bottom: AppTheme.spacingXL),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Expanded Personal Details Header ──────────────────────────
                _HomeHeader(
                  topInset: topInset,
                  greeting: _greetingForNow(),
                  name: name,
                  program: program,
                  admissionNumber: admissionNumber,
                  overallPercent: overallPercent,
                  photoUrl: effectivePhotoUrl,
                  stream: stream,
                  year: year,
                  batch: batch,
                  onBellTap: () => _showNotifications(context, notifs),
                  hasNewNotification: _hasNewNotification && notifs.isNotEmpty,
                ),
                // ── Body ────────────────────────────────────────────────────
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Marks overview card (full width)
                      _OverviewCard(
                        icon: Icons.menu_book_rounded,
                        gradient: AppTheme.headerGradient,
                        title: 'Latest Marks',
                        value: totalMax > 0 ? '$totalScore/$totalMax' : '—',
                        footnote: totalMax > 0 ? '$overallPercent% overall' : 'No marks yet',
                        footnoteColor: totalMax > 0 ? AppTheme.successColor : AppTheme.textSecondary,
                      ),
                      const SizedBox(height: 28),
                      const _SectionLabel('Latest Remark'),
                      const SizedBox(height: 14),
                      _RemarkCard(
                        message: latestRemarkMsg.isNotEmpty ? latestRemarkMsg : 'No remarks yet.',
                        meta: latestRemarkMeta,
                      ),
                      const SizedBox(height: 28),
                      Row(
                        children: [
                          const Expanded(child: _SectionLabel('Subject Performance')),
                          GestureDetector(
                            onTap: widget.onViewAllResults,
                            child: const Text('View all  ›',
                              style: TextStyle(
                                color: AppTheme.primaryColor, fontSize: 12, fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      topSubjects.isEmpty
                          ? const Text('No marks yet.',
                              style: TextStyle(color: AppTheme.textSecondary, fontWeight: FontWeight.w600))
                          : _SubjectPerformanceCard(subjects: topSubjects),
                      const SizedBox(height: 12),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _NotificationItem {
  final IconData icon;
  final Color color;
  final String title, subtitle, time;
  final DateTime date;
  _NotificationItem(this.icon, this.color, this.title, this.subtitle, this.time, this.date);
}

// ─── Notifications Sheet ──────────────────────────────────────────────────────
class _NotificationsSheet extends StatelessWidget {
  final List<_NotificationItem> notifications;
  const _NotificationsSheet({required this.notifications});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40, height: 4,
              decoration: BoxDecoration(
                color: AppTheme.borderColor,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
          const SizedBox(height: 20),
          const Text('Notifications',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppTheme.textPrimary),
          ),
          const SizedBox(height: 16),
          if (notifications.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Text('No new notifications.', style: TextStyle(color: AppTheme.textSecondary)),
            )
          else
            ...notifications.map((n) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _NotifTile(icon: n.icon, color: n.color, title: n.title, subtitle: n.subtitle, time: n.time),
            )),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _NotifTile extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title, subtitle, time;
  const _NotifTile({required this.icon, required this.color, required this.title, required this.subtitle, required this.time});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.surfaceColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.borderColor),
      ),
      child: Row(
        children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
                const SizedBox(height: 2),
                Text(subtitle, style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary, height: 1.4)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(time, style: const TextStyle(fontSize: 10, color: AppTheme.textSecondary, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}

// ─── Hero Header ──────────────────────────────────────────────────────────────

class _HomeHeader extends StatelessWidget {
  final double topInset;
  final String greeting, name, program, admissionNumber, photoUrl;
  final String stream, year, batch;
  final int overallPercent;
  final VoidCallback? onBellTap;
  final bool hasNewNotification;

  const _HomeHeader({
    required this.topInset,
    required this.greeting,
    required this.name,
    required this.program,
    required this.admissionNumber,
    required this.overallPercent,
    required this.photoUrl,
    this.stream = '',
    this.year = '',
    this.batch = '',
    this.onBellTap,
    this.hasNewNotification = false,
  });

  @override
  Widget build(BuildContext context) {
    final screenH = MediaQuery.sizeOf(context).height;
    // Header takes ~55% of screen height for prominent personal details
    final headerH = screenH * 0.55;

    return Container(
      width: double.infinity,
      height: headerH,
      decoration: const BoxDecoration(
        gradient: AppTheme.indigoGradient,
        borderRadius: BorderRadius.only(
          bottomLeft: Radius.circular(36),
          bottomRight: Radius.circular(36),
        ),
      ),
      padding: EdgeInsets.fromLTRB(24, topInset + 20, 24, 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Greeting row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('$greeting 👋',
                style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 13, fontWeight: FontWeight.w500),
              ),
              GestureDetector(
                onTap: onBellTap,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Container(
                      width: 40, height: 40,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.12),
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white.withOpacity(0.3)),
                      ),
                      child: const Icon(Icons.notifications_none_rounded, color: Colors.white, size: 20),
                    ),
                    if (hasNewNotification)
                      Positioned(
                        top: -2, right: -2,
                        child: Container(
                          width: 12, height: 12,
                          decoration: BoxDecoration(
                            color: AppTheme.goldenColor,
                            shape: BoxShape.circle,
                            border: Border.all(color: AppTheme.indigoDeep, width: 1.5),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(name,
            style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: -0.5),
          ),
          const SizedBox(height: 20),
          // Large profile card inside header
          Expanded(
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.10),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: Colors.white.withOpacity(0.18), width: 1.2),
              ),
              child: Row(
                children: [
                  // Square avatar 40% width
                  Expanded(
                    flex: 40,
                    child: AspectRatio(
                      aspectRatio: 1,
                      child: Container(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.white.withOpacity(0.3), width: 2),
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(14),
                          child: _StudentAvatarSquare(
                            photoUrl: photoUrl,
                            width: double.infinity,
                            height: double.infinity,
                            fit: BoxFit.contain,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  // Details & Yellow circle 60% width
                  Expanded(
                    flex: 60,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (admissionNumber.isNotEmpty)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                            margin: const EdgeInsets.only(bottom: 12),
                            decoration: BoxDecoration(
                              color: AppTheme.goldenColor.withOpacity(0.20),
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(color: AppTheme.goldenColor.withOpacity(0.5)),
                            ),
                            child: Text('#$admissionNumber',
                              style: const TextStyle(fontSize: 16, color: AppTheme.goldenColor, fontWeight: FontWeight.w800),
                            ),
                          ),
                        if (stream.trim().isNotEmpty)
                          _DetailRow(Icons.school_outlined, stream),
                        if (year.trim().isNotEmpty)
                          _DetailRow(Icons.calendar_today_outlined,
                            year == '1' ? '1st Year' : year == '2' ? '2nd Year' : year),
                        if (batch.trim().isNotEmpty)
                          _DetailRow(Icons.group_outlined, batch),
                        if (stream.isEmpty && year.isEmpty && batch.isEmpty)
                          const Text('—', style: TextStyle(color: Colors.white60)),
                        const SizedBox(height: 16),
                        Container(
                          width: 64, height: 64,
                          decoration: BoxDecoration(
                            gradient: AppTheme.goldGradient,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(color: AppTheme.goldenColor.withOpacity(0.45), blurRadius: 10, offset: const Offset(0, 4)),
                            ],
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text('$overallPercent%',
                                style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900),
                              ),
                              const Text('Score',
                                style: TextStyle(fontSize: 11, color: Colors.white70, fontWeight: FontWeight.w700),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final IconData icon;
  final String text;
  const _DetailRow(this.icon, this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: Colors.white60, size: 16),
          const SizedBox(width: 8),
          Flexible(
            child: Text(text,
              style: const TextStyle(fontSize: 16, color: Colors.white, fontWeight: FontWeight.w600),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}




class _WaveClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final path = Path();
    path.lineTo(0, size.height - 30);
    path.quadraticBezierTo(size.width / 2, size.height + 10, size.width, size.height - 30);
    path.lineTo(size.width, 0);
    path.close();
    return path;
  }

  @override
  bool shouldReclip(_WaveClipper old) => false;
}

// ─── Student Avatar ───────────────────────────────────────────────────────────
// Renders the student's photo from a URL, with a gradient fallback.

class _StudentAvatar extends StatelessWidget {
  final String photoUrl;
  final double size;

  const _StudentAvatar({required this.photoUrl, this.size = 52});

  @override
  Widget build(BuildContext context) {
    final url = photoUrl.trim();
    final ImageProvider? imageProvider = url.startsWith('http') ? NetworkImage(url) : null;

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: imageProvider == null ? AppTheme.headerGradient : null,
        color: imageProvider != null ? AppTheme.borderColor : null,
        boxShadow: AppTheme.glowPrimary,
      ),
      child: ClipOval(
        child: imageProvider != null
            ? Stack(
                fit: StackFit.expand,
                children: [
                  ImageFiltered(
                    imageFilter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
                    child: Image(
                      image: imageProvider,
                      fit: BoxFit.cover,
                      alignment: Alignment.center,
                    ),
                  ),
                  Image(
                    image: imageProvider,
                    fit: BoxFit.contain,
                    alignment: Alignment.center,
                    width: size,
                    height: size,
                    errorBuilder: (_, __, ___) => _fallbackIcon(size),
                  ),
                ],
              )
            : _fallbackIcon(size),
      ),
    );
  }

  Widget _fallbackIcon(double sz) {
    return Container(
      width: sz, height: sz,
      decoration: const BoxDecoration(gradient: AppTheme.headerGradient),
      child: Icon(Icons.person_rounded, color: Colors.white, size: sz * 0.52),
    );
  }
}

// ─── Student Avatar Square ────────────────────────────────────────────────────
// Square version for the new header card layout.

class _StudentAvatarSquare extends StatelessWidget {
  final String photoUrl;
  final double? width, height;
  final BoxFit fit;

  const _StudentAvatarSquare({
    required this.photoUrl,
    this.width,
    this.height,
    this.fit = BoxFit.contain,
  });

  @override
  Widget build(BuildContext context) {
    final url = photoUrl.trim();
    final ImageProvider? imageProvider = url.startsWith('http') ? NetworkImage(url) : null;

    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        gradient: imageProvider == null ? AppTheme.headerGradient : null,
      ),
      child: imageProvider != null
          ? Stack(
              fit: StackFit.expand,
              children: [
                ImageFiltered(
                  imageFilter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                  child: Image(
                    image: imageProvider,
                    fit: BoxFit.cover,
                    alignment: Alignment.center,
                  ),
                ),
                Image(
                  image: imageProvider,
                  fit: fit,
                  alignment: Alignment.center,
                  errorBuilder: (_, __, ___) => _fallback(),
                ),
              ],
            )
          : _fallback(),
    );
  }

  Widget _fallback() {
    return Container(
      width: width, height: height,
      decoration: const BoxDecoration(gradient: AppTheme.headerGradient),
      child: Center(
        child: Icon(Icons.person_rounded, color: Colors.white, size: (width ?? 100) * 0.52),
      ),
    );
  }
}

// ─── Profile Card ─────────────────────────────────────────────────────────────

class _ProfileCard extends StatelessWidget {
  final String program, admissionId, photoUrl;
  final int scorePercent;

  const _ProfileCard({
    required this.program,
    required this.admissionId,
    required this.scorePercent,
    required this.photoUrl,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppTheme.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusXL),
        boxShadow: const [AppTheme.shadowMedium],
        border: Border.all(color: AppTheme.borderColor, width: 0.8),
      ),
      child: Row(
        children: [
          // Avatar – show student photo if available, else gradient icon
          _StudentAvatar(photoUrl: photoUrl, size: 56),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(program,
                  style: const TextStyle(
                    fontSize: 12, color: AppTheme.textSecondary, fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 3),
                Text(admissionId,
                  style: const TextStyle(
                    fontSize: 13, color: AppTheme.primaryColor, fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
          // Score badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              gradient: AppTheme.headerGradient,
              borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
              boxShadow: AppTheme.glowPrimary,
            ),
            child: Column(
              children: [
                Text('$scorePercent%',
                  style: const TextStyle(
                    color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                const Text('Score',
                  style: TextStyle(fontSize: 10, color: Colors.white70, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Section Label ───────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(text,
      style: const TextStyle(
        fontSize: 17, fontWeight: FontWeight.w800,
        color: AppTheme.textPrimary, letterSpacing: -0.3,
      ),
    );
  }
}

// ─── Overview Card ────────────────────────────────────────────────────────────

class _OverviewCard extends StatelessWidget {
  final IconData icon;
  final Gradient gradient;
  final String title, value, footnote;
  final Color footnoteColor;

  const _OverviewCard({
    required this.icon,
    required this.gradient,
    required this.title,
    required this.value,
    required this.footnote,
    required this.footnoteColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppTheme.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        boxShadow: const [AppTheme.shadowCard],
        border: Border.all(color: AppTheme.borderColor, width: 0.8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42, height: 42,
            decoration: BoxDecoration(
              gradient: gradient,
              borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
            ),
            child: Icon(icon, color: Colors.white, size: 20),
          ),
          const SizedBox(height: 14),
          Text(title,
            style: const TextStyle(
              fontSize: 11, color: AppTheme.textSecondary, fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 5),
          Text(value,
            style: const TextStyle(
              fontSize: 20, color: AppTheme.textPrimary, fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(Icons.trending_up_rounded, size: 13, color: footnoteColor),
              const SizedBox(width: 4),
              Flexible(
                child: Text(footnote,
                  style: TextStyle(fontSize: 11, color: footnoteColor, fontWeight: FontWeight.w600),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Fee Card ─────────────────────────────────────────────────────────────────

class _FeeCard extends StatelessWidget {
  final String label, note;
  final double progress;
  final bool paid;

  const _FeeCard({
    required this.label, required this.note,
    required this.progress, required this.paid,
  });

  @override
  Widget build(BuildContext context) {
    final color = paid ? AppTheme.successColor : AppTheme.primaryColor;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppTheme.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        boxShadow: const [AppTheme.shadowCard],
        border: Border.all(color: AppTheme.borderColor, width: 0.8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42, height: 42,
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
            ),
            child: Icon(Icons.credit_card_rounded, color: color, size: 20),
          ),
          const SizedBox(height: 14),
          const Text('Fee Status',
            style: TextStyle(fontSize: 11, color: AppTheme.textSecondary, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 5),
          Text(label,
            style: const TextStyle(fontSize: 20, color: AppTheme.textPrimary, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: progress, minHeight: 7,
              backgroundColor: AppTheme.borderColor,
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
          const SizedBox(height: 7),
          Text(note,
            style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

// ─── Remark Card ─────────────────────────────────────────────────────────────

class _RemarkCard extends StatelessWidget {
  final String message, meta;
  const _RemarkCard({required this.message, required this.meta});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        boxShadow: const [AppTheme.shadowCard],
        border: Border.all(color: AppTheme.borderColor, width: 0.8),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                width: 5,
                decoration: const BoxDecoration(gradient: AppTheme.accentGradient),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 38, height: 38,
                        decoration: BoxDecoration(
                          color: AppTheme.accentColor.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                        ),
                        child: const Icon(Icons.chat_bubble_outline_rounded,
                            color: AppTheme.accentColor, size: 18),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(message,
                              style: const TextStyle(
                                fontSize: 13, color: AppTheme.textPrimary,
                                fontWeight: FontWeight.w600, height: 1.45,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(meta,
                              style: const TextStyle(
                                fontSize: 11, color: AppTheme.textSecondary, fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Subject Performance ──────────────────────────────────────────────────────

class _SubjectPerf {
  final String name, grade;
  final int marks, maxMarks;
  final Color barColor;
  const _SubjectPerf({
    required this.name, required this.marks,
    required this.maxMarks, required this.grade, required this.barColor,
  });
}

class _SubjectPerformanceCard extends StatelessWidget {
  final List<_SubjectPerf> subjects;
  const _SubjectPerformanceCard({required this.subjects});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        boxShadow: const [AppTheme.shadowCard],
        border: Border.all(color: AppTheme.borderColor, width: 0.8),
      ),
      child: Column(
        children: [
          for (int i = 0; i < subjects.length; i++) ...[
            _SubjectRow(subject: subjects[i]),
            if (i != subjects.length - 1)
              const Divider(height: 1, color: AppTheme.dividerColor),
          ],
        ],
      ),
    );
  }
}

class _SubjectRow extends StatelessWidget {
  final _SubjectPerf subject;
  const _SubjectRow({required this.subject});

  @override
  Widget build(BuildContext context) {
    final progress = subject.maxMarks > 0
        ? (subject.marks / subject.maxMarks).clamp(0.0, 1.0)
        : 0.0;
    final gradeColor = subject.grade == 'A+' || subject.grade == 'A'
        ? AppTheme.successColor
        : subject.grade == 'B+' || subject.grade == 'B'
            ? AppTheme.warningColor
            : AppTheme.alertColor;

    return Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 34, height: 34,
                decoration: BoxDecoration(
                  color: subject.barColor.withOpacity(0.10),
                  borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                ),
                child: Icon(Icons.bookmark_border_rounded, size: 17, color: subject.barColor),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(subject.name,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textPrimary),
                ),
              ),
              Text('${subject.marks}/${subject.maxMarks}',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppTheme.textPrimary),
              ),
              const SizedBox(width: 10),
              _GradePill(text: subject.grade, color: gradeColor),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: progress, minHeight: 6,
              backgroundColor: AppTheme.borderColor,
              valueColor: AlwaysStoppedAnimation<Color>(subject.barColor),
            ),
          ),
        ],
      ),
    );
  }
}

class _GradePill extends StatelessWidget {
  final String text;
  final Color color;
  const _GradePill({required this.text, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(text,
        style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w800),
      ),
    );
  }
}
