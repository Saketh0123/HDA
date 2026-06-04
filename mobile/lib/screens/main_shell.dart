import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'home_screen.dart';
import 'results_remarks_screens.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: IndexedStack(
        index: _index,
        children: [
          HomeScreen(onViewAllResults: () => setState(() => _index = 1)),
          const ResultsScreen(),
          const RemarksScreen(),
        ],
      ),
      bottomNavigationBar: _BottomNav(
        index: _index,
        onChanged: (next) => setState(() => _index = next),
      ),
    );
  }
}

class _BottomNav extends StatelessWidget {
  final int index;
  final ValueChanged<int> onChanged;

  const _BottomNav({required this.index, required this.onChanged});

  static const _items = [
    _NavItem(label: 'Home', icon: Icons.home_outlined, activeIcon: Icons.home_rounded),
    _NavItem(label: 'Results', icon: Icons.bar_chart_outlined, activeIcon: Icons.bar_chart_rounded),
    _NavItem(label: 'Remarks', icon: Icons.chat_bubble_outline_rounded, activeIcon: Icons.chat_bubble_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.paddingOf(context).bottom;
    return Container(
      decoration: const BoxDecoration(
        color: AppTheme.white,
        border: Border(top: BorderSide(color: AppTheme.borderColor, width: 1)),
        boxShadow: [
          BoxShadow(
            color: Color.fromRGBO(108, 71, 255, 0.06),
            blurRadius: 20,
            offset: Offset(0, -4),
          ),
        ],
      ),
      child: Padding(
        padding: EdgeInsets.only(top: 8, bottom: bottomPad + 8, left: 12, right: 12),
        child: Row(
          children: List.generate(_items.length, (i) {
            final item = _items[i];
            final active = i == index;
            return Expanded(
              child: GestureDetector(
                onTap: () => onChanged(i),
                behavior: HitTestBehavior.opaque,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  curve: Curves.easeInOut,
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: active ? AppTheme.primaryColor.withOpacity(0.10) : Colors.transparent,
                    borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        active ? item.activeIcon : item.icon,
                        size: 24,
                        color: active ? AppTheme.primaryColor : AppTheme.textSecondary,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        item.label,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                          color: active ? AppTheme.primaryColor : AppTheme.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}

class _NavItem {
  final String label;
  final IconData icon;
  final IconData activeIcon;
  const _NavItem({required this.label, required this.icon, required this.activeIcon});
}
