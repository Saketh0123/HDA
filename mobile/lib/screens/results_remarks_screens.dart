// Flutter Mobile App – Results & Remarks Screens (Weekly Test redesign)
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:intl/intl.dart';

import '../theme/app_theme.dart';

// ─── Data models ──────────────────────────────────────────────────────────────

class _WeeklyTest {
  final String name;
  final DateTime? date;
  final List<_TestSubject> subjects;
  const _WeeklyTest({required this.name, this.date, required this.subjects});

  int get totalScore => subjects.fold(0, (s, e) => s + e.score);
  int get totalMax => subjects.fold(0, (s, e) => s + e.maxScore);
  double get percent => totalMax > 0 ? totalScore / totalMax : 0.0;
}

class _TestSubject {
  final String name;
  final int score, maxScore;
  const _TestSubject({required this.name, required this.score, required this.maxScore});
}

// ─── Results Screen ────────────────────────────────────────────────────────────

class ResultsScreen extends StatelessWidget {
  const ResultsScreen({super.key});

  int _asInt(dynamic v, {int fallback = 0}) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    return fallback;
  }

  String _gradeForPercent(int p) {
    if (p >= 90) return 'A+';
    if (p >= 80) return 'A';
    if (p >= 70) return 'B+';
    if (p >= 60) return 'B';
    return 'C';
  }

  String _perfLabel(double idx) {
    if (idx >= 0.85) return 'Excellent';
    if (idx >= 0.70) return 'Good';
    if (idx >= 0.55) return 'Average';
    return 'Needs Work';
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

  List<_WeeklyTest> _parseTests(Map<String, dynamic>? data) {
    // Try weeklyTests first
    final rawTests = data?['weeklyTests'];
    if (rawTests is List && rawTests.isNotEmpty) {
      final out = <_WeeklyTest>[];
      for (final t in rawTests) {
        if (t is! Map) continue;
        final name = (t['name'] as String?) ?? 'Weekly Test';
        DateTime? date;
        if (t['date'] is Timestamp) date = (t['date'] as Timestamp).toDate();
        final rawSubjects = t['subjects'];
        final subjects = <_TestSubject>[];
        if (rawSubjects is List) {
          for (final s in rawSubjects) {
            if (s is! Map) continue;
            subjects.add(_TestSubject(
              name: (s['subject'] as String?) ?? '',
              score: _asInt(s['score']),
              maxScore: _asInt(s['maxScore'], fallback: 100),
            ));
          }
        }
        if (subjects.isNotEmpty) {
          out.add(_WeeklyTest(name: name, date: date, subjects: subjects));
        }
      }
      if (out.isNotEmpty) return out;
    }
    // Fallback: treat student['marks'] as a single test
    final marksRaw = (data?['marks'] is List)
        ? (data!['marks'] as List).cast<dynamic>()
        : const <dynamic>[];
    final subjects = <_TestSubject>[];
    for (final m in marksRaw) {
      if (m is! Map) continue;
      final subj = (m['subject'] as String?) ?? '';
      if (subj.trim().isEmpty) continue;
      subjects.add(_TestSubject(
        name: subj,
        score: _asInt(m['score']),
        maxScore: _asInt(m['maxScore'], fallback: 100),
      ));
    }
    if (subjects.isEmpty) return [];
    return [_WeeklyTest(name: 'Weekly Test 1', date: null, subjects: subjects)];
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

        final tests = _parseTests(data);

        // Overall % = average of all test percentages
        final overallPercent = tests.isEmpty
            ? 0
            : (tests.fold<double>(0, (s, t) => s + t.percent * 100) / tests.length).round();
        final examCount = tests.length;

        // Performance Index = 70% marks + 30% review sentiment
        final remarks = (data?['remarks'] is List)
            ? (data!['remarks'] as List).cast<dynamic>()
            : const <dynamic>[];
        double reviewScore = 0.5; // neutral baseline
        if (remarks.isNotEmpty) {
          int pos = 0, neg = 0;
          for (final r in remarks) {
            final t = (r is Map) ? ((r['type'] as String?) ?? '') : '';
            if (t == 'positive') pos++;
            if (t == 'alert') neg++;
          }
          final total = remarks.length;
          reviewScore = (0.5 + (pos - neg) / (total * 2)).clamp(0.0, 1.0);
        }
        final marksScore = overallPercent / 100.0;
        final perfIndex = (marksScore * 0.7 + reviewScore * 0.3).clamp(0.0, 1.0);
        final perfLabel = _perfLabel(perfIndex);

        const headerH = 170.0;
        const overlap = 44.0;

        return ColoredBox(
          color: AppTheme.backgroundColor,
          child: SingleChildScrollView(
            padding: const EdgeInsets.only(bottom: AppTheme.spacingXL),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Header ─────────────────────────────────────────────────
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
                            Expanded(child: _MiniStat(value: examCount.toString(), label: 'Exams')),
                            const SizedBox(width: 12),
                            Expanded(child: _MiniStat(
                              value: examCount > 0 ? _gradeForPercent(overallPercent) : '—',
                              label: 'Grade',
                            )),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                // ── Body ───────────────────────────────────────────────────
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _PerformanceIndexCard(
                        progress: perfIndex,
                        label: perfLabel,
                      ),
                      const SizedBox(height: 28),
                      // ── Weekly Test Cards ─────────────────────────────
                      if (tests.isEmpty)
                        const Text('No test results yet.',
                          style: TextStyle(color: AppTheme.textSecondary, fontWeight: FontWeight.w600))
                      else
                        ...tests.asMap().entries.map((entry) {
                          final idx = entry.key;
                          final test = entry.value;
                          final isLatest = idx == tests.length - 1;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 14),
                            child: _WeeklyTestCard(
                              test: test,
                              isLatest: isLatest,
                              colorForSubject: _colorForSubject,
                              onTap: () => Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => _WeeklyTestDetailScreen(
                                    test: test,
                                    colorForSubject: _colorForSubject,
                                  ),
                                ),
                              ),
                            ),
                          );
                        }),
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

// ─── Weekly Test Card ─────────────────────────────────────────────────────────

class _WeeklyTestCard extends StatelessWidget {
  final _WeeklyTest test;
  final bool isLatest;
  final Color Function(String) colorForSubject;
  final VoidCallback onTap;

  const _WeeklyTestCard({
    required this.test,
    required this.isLatest,
    required this.colorForSubject,
    required this.onTap,
  });

  String _grade(int p) {
    if (p >= 90) return 'A+';
    if (p >= 80) return 'A';
    if (p >= 70) return 'B+';
    if (p >= 60) return 'B';
    return 'C';
  }

  @override
  Widget build(BuildContext context) {
    final pct = (test.percent * 100).round();
    final grade = _grade(pct);
    final gradeColor = (grade == 'A+' || grade == 'A')
        ? AppTheme.successColor
        : (grade == 'B+' || grade == 'B')
            ? AppTheme.warningColor
            : AppTheme.alertColor;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          color: AppTheme.white,
          borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
          border: Border.all(
            color: isLatest ? AppTheme.goldenColor : AppTheme.borderColor,
            width: isLatest ? 2.0 : 0.8,
          ),
          boxShadow: isLatest
              ? [BoxShadow(color: AppTheme.goldenColor.withOpacity(0.25), blurRadius: 12, offset: const Offset(0, 4))]
              : const [AppTheme.shadowCard],
        ),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Title row
              Row(
                children: [
                  Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      gradient: isLatest ? AppTheme.goldGradient : AppTheme.headerGradient,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.assignment_outlined, color: Colors.white, size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(test.name,
                          style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w800, color: AppTheme.textPrimary,
                          ),
                        ),
                        if (test.date != null)
                          Text(DateFormat('dd MMM yyyy').format(test.date!),
                            style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
                          ),
                      ],
                    ),
                  ),
                  // Grade pill
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: gradeColor.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(grade,
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: gradeColor),
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (isLatest)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppTheme.goldenColor.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: AppTheme.goldenColor, width: 1),
                      ),
                      child: const Text('Latest',
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppTheme.goldenColor),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 14),
              // Score summary
              Row(
                children: [
                  Text('${test.totalScore}/${test.totalMax}',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: AppTheme.textPrimary),
                  ),
                  const Spacer(),
                  Text('$pct%',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: gradeColor),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: test.percent,
                  minHeight: 8,
                  backgroundColor: AppTheme.borderColor,
                  valueColor: AlwaysStoppedAnimation<Color>(
                    isLatest ? AppTheme.goldenColor : AppTheme.primaryColor,
                  ),
                ),
              ),
              const SizedBox(height: 10),
              // Subject chips
              Wrap(
                spacing: 6, runSpacing: 6,
                children: test.subjects.take(3).map((s) => Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: colorForSubject(s.name).withOpacity(0.08),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text('${s.name}: ${s.score}/${s.maxScore}',
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: colorForSubject(s.name)),
                  ),
                )).toList(),
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Text('Tap to view details',
                    style: TextStyle(fontSize: 11, color: AppTheme.primaryColor.withOpacity(0.7), fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(width: 4),
                  Icon(Icons.arrow_forward_ios_rounded, size: 10, color: AppTheme.primaryColor.withOpacity(0.7)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Weekly Test Detail Screen ────────────────────────────────────────────────

class _WeeklyTestDetailScreen extends StatelessWidget {
  final _WeeklyTest test;
  final Color Function(String) colorForSubject;

  const _WeeklyTestDetailScreen({
    required this.test,
    required this.colorForSubject,
  });

  String _grade(int p) {
    if (p >= 90) return 'A+';
    if (p >= 80) return 'A';
    if (p >= 70) return 'B+';
    if (p >= 60) return 'B';
    return 'C';
  }

  @override
  Widget build(BuildContext context) {
    final topInset = MediaQuery.paddingOf(context).top;
    final pct = (test.percent * 100).round();
    final grade = _grade(pct);

    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: Column(
        children: [
          // Header
          Container(
            width: double.infinity,
            padding: EdgeInsets.fromLTRB(20, topInset + 16, 20, 24),
            decoration: const BoxDecoration(
              gradient: AppTheme.purplePinkGradient,
              borderRadius: BorderRadius.only(
                bottomLeft: Radius.circular(28),
                bottomRight: Radius.circular(28),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                GestureDetector(
                  onTap: () => Navigator.of(context).pop(),
                  child: Container(
                    width: 36, height: 36,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.15),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 16),
                  ),
                ),
                const SizedBox(height: 16),
                Text(test.name,
                  style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900),
                ),
                if (test.date != null)
                  Text(DateFormat('dd MMMM yyyy').format(test.date!),
                    style: const TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    _DetailStat(value: '$pct%', label: 'Score'),
                    const SizedBox(width: 12),
                    _DetailStat(value: grade, label: 'Grade'),
                    const SizedBox(width: 12),
                    _DetailStat(value: '${test.totalScore}/${test.totalMax}', label: 'Marks'),
                  ],
                ),
              ],
            ),
          ),
          // Subject bar chart
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                const Text('Subject-wise Marks',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppTheme.textPrimary),
                ),
                const SizedBox(height: 16),
                ...test.subjects.map((s) {
                  final sPct = s.maxScore > 0 ? (s.score / s.maxScore) : 0.0;
                  final sG = _grade((sPct * 100).round());
                  final sGColor = (sG == 'A+' || sG == 'A')
                      ? AppTheme.successColor
                      : (sG == 'B+' || sG == 'B') ? AppTheme.warningColor : AppTheme.alertColor;
                  final color = colorForSubject(s.name);
                  return Container(
                    margin: const EdgeInsets.only(bottom: 14),
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: AppTheme.white,
                      borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
                      border: Border.all(color: AppTheme.borderColor, width: 0.8),
                      boxShadow: const [AppTheme.shadowCard],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 36, height: 36,
                              decoration: BoxDecoration(
                                color: color.withOpacity(0.10),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Icon(Icons.bookmark_border_rounded, color: color, size: 18),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(s.name,
                                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppTheme.textPrimary),
                              ),
                            ),
                            Text('${s.score}/${s.maxScore}',
                              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppTheme.textPrimary),
                            ),
                            const SizedBox(width: 10),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: sGColor.withOpacity(0.12),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(sG,
                                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: sGColor),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        // Bar
                        LayoutBuilder(builder: (ctx, box) {
                          return Stack(
                            children: [
                              Container(
                                width: box.maxWidth,
                                height: 36,
                                decoration: BoxDecoration(
                                  color: AppTheme.borderColor,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              ),
                              Container(
                                width: box.maxWidth * sPct,
                                height: 36,
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    colors: [color.withOpacity(0.7), color],
                                  ),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                alignment: Alignment.centerRight,
                                padding: const EdgeInsets.only(right: 10),
                                child: sPct > 0.15
                                    ? Text('${(sPct * 100).round()}%',
                                        style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800))
                                    : null,
                              ),
                            ],
                          );
                        }),
                      ],
                    ),
                  );
                }),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailStat extends StatelessWidget {
  final String value, label;
  const _DetailStat({required this.value, required this.label});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.15),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: [
          Text(value,
            style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900),
          ),
          Text(label,
            style: const TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

// ─── Wave Clipper ─────────────────────────────────────────────────────────────

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

// ─── Mini Stat ────────────────────────────────────────────────────────────────

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
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: AppTheme.primaryColor),
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

// ─── Performance Index Card ───────────────────────────────────────────────────

class _PerformanceIndexCard extends StatelessWidget {
  final double progress;
  final String label;
  const _PerformanceIndexCard({required this.progress, required this.label});

  @override
  Widget build(BuildContext context) {
    Color labelColor = AppTheme.successColor;
    if (label == 'Good') {
      labelColor = AppTheme.primaryColor;
    } else if (label == 'Average') {
      labelColor = AppTheme.warningColor;
    } else if (label == 'Needs Work') {
      labelColor = AppTheme.alertColor;
    }

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
          const SizedBox(height: 6),
          const Text('Based on test scores & teacher reviews',
            style: TextStyle(fontSize: 11, color: AppTheme.textSecondary),
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
  String? _viewingImage; // base64 currently in lightbox

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
      final imageBase64 = (r['imageBase64'] as String?);
      out.add(_RemarkItemData(
        type: mapped,
        date: dt != null ? DateFormat('dd MMMM yyyy').format(dt) : '—',
        sortDate: dt,
        message: msg,
        author: 'Admin',
        imageBase64: imageBase64,
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

        return Stack(
          children: [
            ColoredBox(
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
                              _RemarkCard(
                                data: item,
                                onImageTap: (b64) => setState(() => _viewingImage = b64),
                              ),
                              const SizedBox(height: 14),
                            ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // Image lightbox
            if (_viewingImage != null)
              GestureDetector(
                onTap: () => setState(() => _viewingImage = null),
                child: Container(
                  color: Colors.black.withOpacity(0.80),
                  child: Center(
                    child: GestureDetector(
                      onTap: () {}, // prevent closing when tapping image
                      child: Container(
                        margin: const EdgeInsets.all(28),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Padding(
                              padding: const EdgeInsets.fromLTRB(16, 16, 8, 0),
                              child: Row(
                                children: [
                                  const Icon(Icons.photo_camera_outlined, color: AppTheme.alertColor, size: 20),
                                  const SizedBox(width: 8),
                                  const Expanded(
                                    child: Text('Evidence Photo',
                                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: AppTheme.textPrimary),
                                    ),
                                  ),
                                  IconButton(
                                    onPressed: () => setState(() => _viewingImage = null),
                                    icon: const Icon(Icons.close_rounded, color: AppTheme.textSecondary),
                                  ),
                                ],
                              ),
                            ),
                            ClipRRect(
                              borderRadius: const BorderRadius.only(
                                bottomLeft: Radius.circular(20),
                                bottomRight: Radius.circular(20),
                              ),
                              child: Image.memory(
                                base64Decode(_viewingImage!.contains(',')
                                    ? _viewingImage!.split(',').last
                                    : _viewingImage!),
                                fit: BoxFit.contain,
                                width: double.infinity,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
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

class _RemarkCard extends StatefulWidget {
  final _RemarkItemData data;
  final void Function(String base64) onImageTap;
  const _RemarkCard({required this.data, required this.onImageTap});

  @override
  State<_RemarkCard> createState() => _RemarkCardState();
}

class _RemarkCardState extends State<_RemarkCard> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1000),
      vsync: this,
    );
    _animation = Tween<double>(begin: 1.0, end: 0.2).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );

    if (widget.data.type == _RemarkType.alert && widget.data.imageBase64 != null) {
      _controller.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final spec = _RemarkTypeSpec.from(widget.data.type);
    final shouldBlink = widget.data.type == _RemarkType.alert && widget.data.imageBase64 != null;

    Widget badge = Container(
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
    );

    if (shouldBlink) {
      badge = FadeTransition(opacity: _animation, child: badge);
    }

    Widget leftBar = Container(width: 5, color: spec.color);
    if (shouldBlink) {
      leftBar = FadeTransition(opacity: _animation, child: leftBar);
    }

    Widget? imageArea;
    if (widget.data.type == _RemarkType.alert && widget.data.imageBase64 != null) {
      imageArea = GestureDetector(
        onTap: () => widget.onImageTap(widget.data.imageBase64!),
        child: Container(
          height: 120,
          width: double.infinity,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: spec.borderColor, width: 1.5),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(9),
            child: Stack(
              fit: StackFit.expand,
              children: [
                Image.memory(
                  base64Decode(widget.data.imageBase64!.contains(',')
                      ? widget.data.imageBase64!.split(',').last
                      : widget.data.imageBase64!),
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const Center(
                    child: Icon(Icons.broken_image_outlined, color: AppTheme.textSecondary),
                  ),
                ),
                Positioned(
                  bottom: 6, right: 6,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.black54,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.zoom_in_rounded, color: Colors.white, size: 12),
                        SizedBox(width: 3),
                        Text('View', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );

      if (shouldBlink) {
        imageArea = FadeTransition(opacity: _animation, child: imageArea);
      }
    }

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
              leftBar,
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          badge,
                          const Spacer(),
                          Text(widget.data.date,
                            style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text(widget.data.message,
                        style: const TextStyle(
                          fontSize: 13, color: AppTheme.textPrimary,
                          fontWeight: FontWeight.w600, height: 1.5,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text('— ${widget.data.author}',
                        style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary, fontWeight: FontWeight.w600),
                      ),
                      if (imageArea != null) ...[
                        const SizedBox(height: 12),
                        imageArea,
                      ],
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
  final String? imageBase64;
  const _RemarkItemData({
    required this.type, required this.date, required this.sortDate,
    required this.message, required this.author, this.imageBase64,
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
