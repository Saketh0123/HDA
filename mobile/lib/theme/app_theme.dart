// Premium Theme – White background, vibrant violet + teal accents
import 'package:flutter/material.dart';

class AppTheme {
  // ─── Core Palette ─────────────────────────────────────────────────────────
  static const Color primaryColor    = Color(0xFF4338CA); // Indigo 700 (matches admin dashboard)
  static const Color primaryLight    = Color(0xFF6366F1); // Indigo 500
  static const Color primaryDark     = Color(0xFF312E81); // Indigo 900
  static const Color indigoDeep      = Color(0xFF1E1B4B); // Admin sidebar indigo
  static const Color goldenColor     = Color(0xFFD4AF37); // Premium gold
  static const Color goldenLight     = Color(0xFFFFD700); // Bright gold
  static const Color accentColor     = Color(0xFF00C9B1); // Teal/mint
  static const Color accentLight     = Color(0xFF33D9C5); // Light teal
  static const Color successColor    = Color(0xFF22C55E); // Green
  static const Color alertColor      = Color(0xFFEF4444); // Red
  static const Color warningColor    = Color(0xFFF59E0B); // Amber

  // ─── Background & Surface ─────────────────────────────────────────────────
  static const Color backgroundColor = Color(0xFFFFFFFF); // Pure white
  static const Color surfaceColor    = Color(0xFFF7F8FC); // Very light grey
  static const Color cardColor       = Color(0xFFFFFFFF); // White cards
  static const Color white           = Color(0xFFFFFFFF);

  // ─── Text ─────────────────────────────────────────────────────────────────
  static const Color textPrimary     = Color(0xFF0F0F23); // Near-black
  static const Color textSecondary   = Color(0xFF6B7080); // Muted grey
  static const Color textHint        = Color(0xFFB0B4C2); // Placeholder

  // ─── Borders & Dividers ───────────────────────────────────────────────────
  static const Color borderColor     = Color(0xFFEAECF4); // Soft border
  static const Color dividerColor    = Color(0xFFF0F1F8); // Ultra-light

  // ─── Gradients ────────────────────────────────────────────────────────────
  static const LinearGradient headerGradient = LinearGradient(
    colors: [Color(0xFF4338CA), Color(0xFF312E81)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient indigoGradient = LinearGradient(
    colors: [Color(0xFF1E1B4B), Color(0xFF312E81)],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  static const LinearGradient accentGradient = LinearGradient(
    colors: [Color(0xFF4338CA), Color(0xFF00C9B1)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient purplePinkGradient = LinearGradient(
    colors: [Color(0xFF4338CA), Color(0xFF6366F1)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient goldGradient = LinearGradient(
    colors: [Color(0xFFD4AF37), Color(0xFFFFD700)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  // ─── Spacing ──────────────────────────────────────────────────────────────
  static const double spacingXS  = 4.0;
  static const double spacingSM  = 8.0;
  static const double spacingMD  = 16.0;
  static const double spacingLG  = 24.0;
  static const double spacingXL  = 32.0;
  static const double spacingXXL = 48.0;

  // ─── Border Radius ────────────────────────────────────────────────────────
  static const double radiusXS     = 6.0;
  static const double radiusSmall  = 10.0;
  static const double radiusMedium = 14.0;
  static const double radiusLarge  = 20.0;
  static const double radiusXL     = 28.0;
  static const double radiusFull   = 999.0;

  // ─── Shadows ──────────────────────────────────────────────────────────────
  static const BoxShadow shadowSubtle = BoxShadow(
    color: Color.fromRGBO(108, 71, 255, 0.08),
    blurRadius: 12,
    offset: Offset(0, 4),
  );

  static const BoxShadow shadowMedium = BoxShadow(
    color: Color.fromRGBO(108, 71, 255, 0.14),
    blurRadius: 24,
    offset: Offset(0, 8),
  );

  static const BoxShadow shadowCard = BoxShadow(
    color: Color.fromRGBO(15, 15, 35, 0.06),
    blurRadius: 20,
    offset: Offset(0, 4),
  );

  static List<BoxShadow> get glowPrimary => [
    BoxShadow(
      color: primaryColor.withOpacity(0.35),
      blurRadius: 20,
      offset: const Offset(0, 8),
    ),
  ];

  static List<BoxShadow> get glowAccent => [
    BoxShadow(
      color: accentColor.withOpacity(0.35),
      blurRadius: 20,
      offset: const Offset(0, 8),
    ),
  ];

  // ─── Light Theme ──────────────────────────────────────────────────────────
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      primaryColor: primaryColor,
      scaffoldBackgroundColor: backgroundColor,
      colorScheme: const ColorScheme.light(
        primary: primaryColor,
        secondary: accentColor,
        surface: cardColor,
        error: alertColor,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: backgroundColor,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          color: textPrimary,
          fontSize: 18,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.3,
        ),
        iconTheme: IconThemeData(color: textPrimary),
      ),
      textTheme: const TextTheme(
        displayLarge: TextStyle(
          fontSize: 32,
          fontWeight: FontWeight.w800,
          color: textPrimary,
          letterSpacing: -0.5,
        ),
        displayMedium: TextStyle(
          fontSize: 26,
          fontWeight: FontWeight.w700,
          color: textPrimary,
          letterSpacing: -0.3,
        ),
        titleLarge: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: textPrimary,
          letterSpacing: -0.2,
        ),
        titleMedium: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w600,
          color: textPrimary,
        ),
        bodyLarge: TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w400,
          color: textPrimary,
          height: 1.5,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w400,
          color: textPrimary,
          height: 1.5,
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w400,
          color: textSecondary,
        ),
        labelSmall: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: textSecondary,
          letterSpacing: 0.3,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primaryColor,
          foregroundColor: white,
          elevation: 0,
          shadowColor: Colors.transparent,
          padding: const EdgeInsets.symmetric(horizontal: spacingLG, vertical: 15),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusMedium),
          ),
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.2,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surfaceColor,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMedium),
          borderSide: const BorderSide(color: borderColor, width: 1.5),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMedium),
          borderSide: const BorderSide(color: borderColor, width: 1.5),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMedium),
          borderSide: const BorderSide(color: primaryColor, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMedium),
          borderSide: const BorderSide(color: alertColor, width: 1.5),
        ),
        hintStyle: const TextStyle(color: textHint, fontSize: 14),
        labelStyle: const TextStyle(color: textSecondary, fontSize: 14),
      ),
      dividerTheme: const DividerThemeData(color: dividerColor, thickness: 1),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: textPrimary,
        contentTextStyle: const TextStyle(color: white, fontSize: 13),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusSmall)),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  static ThemeData get darkTheme => ThemeData.dark().copyWith(
        colorScheme: const ColorScheme.dark(primary: primaryColor),
      );
}
