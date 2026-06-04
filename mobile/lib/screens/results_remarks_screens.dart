// Flutter Mobile App – Results & Remarks Screens (Premium redesign)
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:intl/intl.dart';

import '../theme/app_theme.dart';

// ─── Results Screen ────────────────────────────────────────────────────────────

class ResultsScreen extends StatelessWidget {
  const ResultsScreen({super.key});

  int _asInt(dynamic v, {int fallback = 0}) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    return fallback;
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

  String _gradeForPercent(int p) {
    if (p >= 90) return 'A+';
    if (p >= 80) return 'A';
    if (p >= 70) return 'B+';
    if (p >= 60) return 'B';
    return 'C';
  }

  String _perfLabel(int p) {
    if (p >= 85) return 'Excellent';
    if (p >= 70) return 'Good';
    if (p >= 55) return 'Average';
    return 'Needs Work';
  }

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) {
      return const ColoredBox(
        color: AppTheme.backgroundColor,
        child: Center(child: Text('Please sign in again.',
          style: TextStyle(color: AppTheme.textSecondary, fontWeight: FontWeight.w600))),
      );
    }

    final topInset = MediaQuery.paddingOf(context).top;
    final studentStream =
        FirebaseFirestore.instance.collection('students').doc(uid).snapshots();

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: studentStream,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const ColoredBox(
            color: AppTheme.backgroundColor,
            child: Center(child: CircularProgressIndicator(color: AppTheme.primaryColor)),
          );
        }

        final data = snap.data?.data();
        final batch = (data?['batch'] as String?) ?? '';
        final stream = (data?['stream'] as String?) ?? (data?['courseOfStudy'] as String?) ?? '';
        final subtitle = batch.trim().isNotEmpty ? batch : (stream.trim().isNotEmpty ? stream : 'My academic results');

        final marksRaw = (data?['marks'] is List)
            ? (data!['marks'] as List).cast<dynamic>()
            : const <dynamic>[];
        final subjects = <_ResultSubject>[];
        int totalScore = 0, totalMax = 0, aGrades = 0;

        for (final m in marksRaw) {
          if (m is! Map) continue;
          final subj = (m['subject'] as String?) ?? '';
          if (subj.trim().isEmpty) continue;
          final score = _asInt(m['score']);
          final maxScore = _asInt(m['maxScore'], fallback: 100);
          final pct = maxScore > 0 ? ((score / maxScore) * 100).round() : 0;
          final grade = _gradeForPercent(pct);
          if (grade == 'A+' || grade == 'A') aGrades++;
          totalScore += score;
          totalMax += maxScore;
          subjects.add(_ResultSubject(
            name: subj, marks: score, maxMarks: maxScore,
            grade: grade, barColor: _colorForSubject(subj),
          ));
        }
        subjects.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
        final overallPercent = totalMax > 0 ? ((totalScore / totalMax) * 100).round() : 0;
        final perfLabel = _perfLabel(overallPercent);

        const headerH = 170.0;
        const overlap = 44.0;

        return ColoredBox(
          color: AppTheme.backgroundColor,
          child: SingleChildScrollView(
            padding: const EdgeInsets.only(bottom: AppTheme.spacingXL),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header
                SizedBox(
                  height: headerH + overlap + 28,
                  child: Stack(
                    children: [
                      ClipPath(
                        clipper: _WaveClipper(),
                        child: Container(
                          height: headerH,
                          width: double.infinity,
                          decoration: const BoxDecoration(gradient: AppTheme.purplePinkGradient),
                          padding: EdgeInsets.fromLTRB(20, topInset + 16, 20, 0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('My Results',
                                style: TextStyle(
                                  color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800,
                                  letterSpacing: -0.5,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(subtitle,
                                style: const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w500),
                              ),
                            ],
                          ),
                        ),
                      ),
                      Positioned(
                        left: 20, right: 20,
                        top: headerH - overlap,
                        child: Row(
                          children: [
                            Expanded(child: _MiniStat(value: '$overallPercent%', label: 'Overall')),
                            const SizedBox(width: 12),
                            Expanded(child: _MiniStat(value: totalScore.toString(), label: 'Total')),
                            const SizedBox(width: 12),
                            Expanded(child: _MiniStat(value: aGrades.toString(), label: 'A Grades')),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                // Body
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _PerformanceIndexCard(
                        progress: (overallPercent / 100).clamp(0.0, 1.0),
                        label: perfLabel,
                      ),
                      const SizedBox(height: 28),
                      const Text('Subject-wise Marks',
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800,
                          color: AppTheme.textPrimary, letterSpacing: -0.3),
                      ),
                      const SizedBox(height: 14),
                      if (subjects.isEmpty)
                        const Text('No marks yet.',
                          style: TextStyle(color: AppTheme.textSecondary, fontWeight: FontWeight.w600))
                      else
                        ...subjects.map((s) => Padding(
                          padding: const EdgeInsets.only(bottom: 14),
                          child: _ResultSubjectCard(subject: s),
                        )),
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

class _MiniStat extends StatelessWidget {
  final String value, label;
  const _MiniStat({required this.value, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
      decoration: BoxDecoration(
        color: AppTheme.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        boxShadow: const [AppTheme.shadowMedium],
        border: Border.all(color: AppTheme.borderColor, width: 0.8),
      ),
      child: Column(
        children: [
          Text(value,
            style: const TextStyle(
              fontSize: 20, fontWeight: FontWeight.w900, color: AppTheme.primaryColor,
            ),
          ),
          const SizedBox(height: 3),
          Text(label,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _PerformanceIndexCard extends StatelessWidget {
  final double progress;
  final String label;
  const _PerformanceIndexCard({required this.progress, required this.label});

  @override
  Widget build(BuildContext context) {
    Color labelColor = AppTheme.successColor;
    if (label == 'Good') labelColor = AppTheme.primaryColor;
    else if (label == 'Average') labelColor = AppTheme.warningColor;
    else if (label == 'Needs Work') labelColor = AppTheme.alertColor;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        boxShadow: const [AppTheme.shadowCard],
        border: Border.all(color: AppTheme.borderColor, width: 0.8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.show_chart_rounded, size: 18, color: AppTheme.textSecondary),
              const SizedBox(width: 8),
              const Expanded(
                child: Text('Performance Index',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.textPrimary),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: labelColor.withOpacity(0.10),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(label,
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: labelColor),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: progress, minHeight: 10,
              backgroundColor: AppTheme.borderColor,
              valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.primaryColor),
            ),
          ),
          const SizedBox(height: 8),
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('0', style: TextStyle(fontSize: 11, color: AppTheme.textSecondary, fontWeight: FontWeight.w600)),
              Text('100%', style: TextStyle(fontSize: 11, color: AppTheme.textSecondary, fontWeight: FontWeight.w600)),
            ],
          ),
        ],
      ),
    );
  }
}

class _ResultSubjectCard extends StatelessWidget {
  final _ResultSubject subject;
  const _ResultSubjectCard({required this.subject});

  @override
  Widget build(BuildContext context) {
    final pct = subject.maxMarks > 0 ? (subject.marks / subject.maxMarks) : 0.0;
    final pctText = (pct * 100).round();
    final gradeColor = subject.grade == 'A+' || subject.grade == 'A'
        ? AppTheme.successColor
        : subject.grade == 'B+' || subject.grade == 'B'
            ? AppTheme.warningColor
            : AppTheme.alertColor;

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
          Row(
            children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: subject.barColor.withOpacity(0.10),
                  borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                ),
                child: Icon(Icons.bookmark_border_rounded, size: 18, color: subject.barColor),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(subject.name,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppTheme.textPrimary),
                ),
              ),
              Text('${subject.marks}/${subject.maxMarks}',
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: AppTheme.textPrimary),
              ),
              const SizedBox(width: 10),
              _GradePill(text: subject.grade, color: gradeColor),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: pct.toDouble(), minHeight: 8,
              backgroundColor: AppTheme.borderColor,
              valueColor: AlwaysStoppedAnimation<Color>(subject.barColor),
            ),
          ),
          const SizedBox(height: 6),
          Text('$pctText% • Mid-Term',
            style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary, fontWeight: FontWeight.w600),
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
        color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(999),
      ),
      child: Text(text,
        style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w800),
      ),
    );
  }
}

class _ResultSubject {
  final String name, grade;
  final int marks, maxMarks;
  final Color barColor;
  const _ResultSubject({
    required this.name, required this.marks,
    required this.maxMarks, required this.grade, required this.barColor,
  });
}

// ─── Remarks Screen ────────────────────────────────────────────────────────────

enum _RemarkType { positive, alert, note }
enum _RemarkFilter { all, positive, negative, neutral }

class RemarksScreen extends StatefulWidget {
  const RemarksScreen({super.key});

  @override
  State<RemarksScreen> createState() => _RemarksScreenState();
}

class _RemarksScreenState extends State<RemarksScreen> {
  _RemarkFilter _filter = _RemarkFilter.all;

  DateTime? _asDateTime(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    return null;
  }

  List<_RemarkItemData> _remarksFromDoc(Map<String, dynamic>? student) {
    final raw = (student?['remarks'] is List)
        ? (student!['remarks'] as List).cast<dynamic>()
        : const <dynamic>[];
    final out = <_RemarkItemData>[];
    for (final r in raw) {
      if (r is! Map) continue;
      final msg = (r['message'] as String?) ?? '';
      if (msg.trim().isEmpty) continue;
      final type = (r['type'] as String?) ?? 'note';
      final mapped = type == 'positive'
          ? _RemarkType.positive
          : type == 'alert'
              ? _RemarkType.alert
              : _RemarkType.note;
      final dt = _asDateTime(r['date']);
      out.add(_RemarkItemData(
        type: mapped,
        date: dt != null ? DateFormat('dd MMMM yyyy').format(dt) : '—',
        sortDate: dt,
        message: msg,
        author: 'Admin',
      ));
    }
    out.sort((a, b) {
      final ad = a.sortDate, bd = b.sortDate;
      if (ad == null && bd == null) return 0;
      if (ad == null) return 1;
      if (bd == null) return -1;
      return bd.compareTo(ad);
    });
    return out;
  }

  List<_RemarkItemData> _filtered(List<_RemarkItemData> all) {
    switch (_filter) {
      case _RemarkFilter.all: return all;
      case _RemarkFilter.positive: return all.where((r) => r.type == _RemarkType.positive).toList();
      case _RemarkFilter.negative: return all.where((r) => r.type == _RemarkType.alert).toList();
      case _RemarkFilter.neutral: return all.where((r) => r.type == _RemarkType.note).toList();
    }
  }

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) {
      return const ColoredBox(
        color: AppTheme.backgroundColor,
        child: Center(child: Text('Please sign in again.',
          style: TextStyle(color: AppTheme.textSecondary, fontWeight: FontWeight.w600))),
      );
    }

    final topInset = MediaQuery.paddingOf(context).top;
    final studentStream =
        FirebaseFirestore.instance.collection('students').doc(uid).snapshots();
    const headerH = 170.0;
    const overlap = 44.0;

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: studentStream,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const ColoredBox(
            color: AppTheme.backgroundColor,
            child: Center(child: CircularProgressIndicator(color: AppTheme.primaryColor)),
          );
        }

        final remarks = _remarksFromDoc(snap.data?.data());
        final positiveCount = remarks.where((r) => r.type == _RemarkType.positive).length;
        final alertCount = remarks.where((r) => r.type == _RemarkType.alert).length;
        final noteCount = remarks.where((r) => r.type == _RemarkType.note).length;
        final visible = _filtered(remarks);
        final counts = <_RemarkFilter, int>{
          _RemarkFilter.all: remarks.length,
          _RemarkFilter.positive: positiveCount,
          _RemarkFilter.negative: alertCount,
          _RemarkFilter.neutral: noteCount,
        };

        return ColoredBox(
          color: AppTheme.backgroundColor,
          child: SingleChildScrollView(
            padding: const EdgeInsets.only(bottom: AppTheme.spacingXL),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header
                SizedBox(
                  height: headerH + overlap + 28,
                  child: Stack(
                    children: [
                      ClipPath(
                        clipper: _WaveClipper(),
                        child: Container(
                          height: headerH,
                          width: double.infinity,
                          decoration: const BoxDecoration(gradient: AppTheme.accentGradient),
                          padding: EdgeInsets.fromLTRB(20, topInset + 16, 20, 0),
                          child: const Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('My Remarks',
                                style: TextStyle(
                                  color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800,
                                  letterSpacing: -0.5,
                                ),
                              ),
                              SizedBox(height: 4),
                              Text('Feedback from teachers',
                                style: TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w500),
                              ),
                            ],
                          ),
                        ),
                      ),
                      Positioned(
                        left: 20, right: 20,
                        top: headerH - overlap,
                        child: Row(
                          children: [
                            Expanded(child: _MiniStat(value: positiveCount.toString(), label: 'Positive')),
                            const SizedBox(width: 12),
                            Expanded(child: _MiniStat(value: alertCount.toString(), label: 'Alerts')),
                            const SizedBox(width: 12),
                            Expanded(child: _MiniStat(value: noteCount.toString(), label: 'Notes')),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                // Body
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _FilterChips(
                        active: _filter,
                        onChanged: (f) => setState(() => _filter = f),
                        counts: counts,
                      ),
                      const SizedBox(height: 20),
                      if (visible.isEmpty)
                        const Text('No remarks yet.',
                          style: TextStyle(color: AppTheme.textSecondary, fontWeight: FontWeight.w600))
                      else
                        for (final item in visible) ...[
                          _RemarkCard(data: item),
                          const SizedBox(height: 14),
                        ],
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

class _FilterChips extends StatelessWidget {
  final _RemarkFilter active;
  final ValueChanged<_RemarkFilter> onChanged;
  final Map<_RemarkFilter, int> counts;

  const _FilterChips({required this.active, required this.onChanged, required this.counts});

  @override
  Widget build(BuildContext context) {
    Widget chip(_RemarkFilter f, String label) {
      final sel = f == active;
      final count = counts[f] ?? 0;
      final text = f == _RemarkFilter.all ? label : '$label ($count)';
      return GestureDetector(
        onTap: () => onChanged(f),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          margin: const EdgeInsets.only(right: 10),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
          decoration: BoxDecoration(
            gradient: sel ? AppTheme.headerGradient : null,
            color: sel ? null : AppTheme.white,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: sel ? Colors.transparent : AppTheme.borderColor, width: 1.2),
            boxShadow: sel ? AppTheme.glowPrimary : null,
          ),
          child: Text(text,
            style: TextStyle(
              fontSize: 12, fontWeight: FontWeight.w700,
              color: sel ? Colors.white : AppTheme.textSecondary,
            ),
          ),
        ),
      );
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          chip(_RemarkFilter.all, 'All'),
          chip(_RemarkFilter.positive, 'Positive'),
          chip(_RemarkFilter.negative, 'Negative'),
          chip(_RemarkFilter.neutral, 'Neutral'),
        ],
      ),
    );
  }
}

class _RemarkCard extends StatelessWidget {
  final _RemarkItemData data;
  const _RemarkCard({required this.data});

  @override
  Widget build(BuildContext context) {
    final spec = _RemarkTypeSpec.from(data.type);
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        border: Border.all(color: spec.borderColor, width: 1.2),
        boxShadow: const [AppTheme.shadowCard],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(width: 5, color: spec.color),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: spec.color.withOpacity(0.10),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(spec.icon, color: spec.color, size: 12),
                                const SizedBox(width: 5),
                                Text(spec.label,
                                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: spec.color),
                                ),
                              ],
                            ),
                          ),
                          const Spacer(),
                          Text(data.date,
                            style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text(data.message,
                        style: const TextStyle(
                          fontSize: 13, color: AppTheme.textPrimary,
                          fontWeight: FontWeight.w600, height: 1.5,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text('— ${data.author}',
                        style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary, fontWeight: FontWeight.w600),
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

class _RemarkItemData {
  final _RemarkType type;
  final String date, message, author;
  final DateTime? sortDate;
  const _RemarkItemData({
    required this.type, required this.date, required this.sortDate,
    required this.message, required this.author,
  });
}

class _RemarkTypeSpec {
  final String label;
  final Color color, borderColor;
  final IconData icon;
  const _RemarkTypeSpec({
    required this.label, required this.color, required this.borderColor, required this.icon,
  });

  factory _RemarkTypeSpec.from(_RemarkType type) {
    switch (type) {
      case _RemarkType.positive:
        return _RemarkTypeSpec(
          label: 'Positive', color: AppTheme.successColor,
          borderColor: AppTheme.successColor.withOpacity(0.25),
          icon: Icons.thumb_up_alt_rounded,
        );
      case _RemarkType.alert:
        return _RemarkTypeSpec(
          label: 'Alert', color: AppTheme.alertColor,
          borderColor: AppTheme.alertColor.withOpacity(0.25),
          icon: Icons.error_outline_rounded,
        );
      case _RemarkType.note:
        return _RemarkTypeSpec(
          label: 'Note', color: AppTheme.primaryColor,
          borderColor: AppTheme.primaryColor.withOpacity(0.22),
          icon: Icons.info_outline_rounded,
        );
    }
  }
}
