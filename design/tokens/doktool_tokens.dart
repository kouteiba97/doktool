// GENERATED from design/system/tokens.json by gen_dart.py — do not edit by hand.
// DokTool design tokens for Flutter. Same values as the Admin Web CSS output (Lock L35).
import 'dart:ui' show FontFeature;
import 'package:flutter/material.dart';

@immutable
class DtColors extends ThemeExtension<DtColors> {
  const DtColors({required this.bg, required this.surface, required this.surfaceRaised, required this.surfaceSunken, required this.border, required this.borderStrong, required this.ink, required this.inkSecondary, required this.inkMuted, required this.brand, required this.brandHover, required this.brandStrong, required this.brandSoft, required this.onBrand, required this.teal, required this.tealStrong, required this.tealSoft, required this.onTeal, required this.navy, required this.onNavy, required this.success, required this.successSoft, required this.warning, required this.warningSoft, required this.critical, required this.criticalSoft, required this.info, required this.infoSoft, required this.sponsored, required this.sponsoredSoft, required this.focus, required this.glass, required this.glassBorder, required this.scrim, required this.skeleton, required this.viz3, required this.viz4, required this.viz5, required this.trace, required this.chartGrid, required this.chartAxis, required this.selection, required this.onNavySubtle, required this.paper, required this.paperInk, required this.paperRule});
  final Color bg;
  final Color surface;
  final Color surfaceRaised;
  final Color surfaceSunken;
  final Color border;
  final Color borderStrong;
  final Color ink;
  final Color inkSecondary;
  final Color inkMuted;
  final Color brand;
  final Color brandHover;
  final Color brandStrong;
  final Color brandSoft;
  final Color onBrand;
  final Color teal;
  final Color tealStrong;
  final Color tealSoft;
  final Color onTeal;
  final Color navy;
  final Color onNavy;
  final Color success;
  final Color successSoft;
  final Color warning;
  final Color warningSoft;
  final Color critical;
  final Color criticalSoft;
  final Color info;
  final Color infoSoft;
  final Color sponsored;
  final Color sponsoredSoft;
  final Color focus;
  final Color glass;
  final Color glassBorder;
  final Color scrim;
  final Color skeleton;
  final Color viz3;
  final Color viz4;
  final Color viz5;
  final Color trace;
  final Color chartGrid;
  final Color chartAxis;
  final Color selection;
  final Color onNavySubtle;
  final Color paper;
  final Color paperInk;
  final Color paperRule;
  static const light = DtColors(
    bg: Color(0xFFF4F7F9),
    surface: Color(0xFFFFFFFF),
    surfaceRaised: Color(0xFFF9FBFC),
    surfaceSunken: Color(0xFFECF1F4),
    border: Color(0xFFDAE3E9),
    borderStrong: Color(0xFF7D91A0),
    ink: Color(0xFF0F1F2D),
    inkSecondary: Color(0xFF4A5F70),
    inkMuted: Color(0xFF5F7383),
    brand: Color(0xFF0A5C78),
    brandHover: Color(0xFF084B62),
    brandStrong: Color(0xFF05435A),
    brandSoft: Color(0xFFE2EFF4),
    onBrand: Color(0xFFFFFFFF),
    teal: Color(0xFF0E6F66),
    tealStrong: Color(0xFF0A5750),
    tealSoft: Color(0xFFDDF1EE),
    onTeal: Color(0xFFFFFFFF),
    navy: Color(0xFF0B1F33),
    onNavy: Color(0xFFE6EDF2),
    success: Color(0xFF137034),
    successSoft: Color(0xFFDCF5E3),
    warning: Color(0xFFA14A05),
    warningSoft: Color(0xFFFDEFD3),
    critical: Color(0xFFB91C1C),
    criticalSoft: Color(0xFFFDE2E2),
    info: Color(0xFF0369A1),
    infoSoft: Color(0xFFE0F0FA),
    sponsored: Color(0xFF5B4A1F),
    sponsoredSoft: Color(0xFFF5ECD6),
    focus: Color(0xFF0A5C78),
    glass: Color(0xC7FFFFFF),
    glassBorder: Color(0x1A0F1F2D),
    scrim: Color(0x520B1F33),
    skeleton: Color(0xFFE6EDF1),
    viz3: Color(0xFFC2410C),
    viz4: Color(0xFF5F7383),
    viz5: Color(0xFF8A6A0B),
    trace: Color(0xFF0A5C78),
    chartGrid: Color(0xFFDAE3E9),
    chartAxis: Color(0xFF5F7383),
    selection: Color(0xFFE2EFF4),
    onNavySubtle: Color(0x1FE6EDF2),
    paper: Color(0xFFFFFFFF),
    paperInk: Color(0xFF0F1F2D),
    paperRule: Color(0xFFDAE3E9),
  );
  static const dark = DtColors(
    bg: Color(0xFF0C1620),
    surface: Color(0xFF121F2B),
    surfaceRaised: Color(0xFF182835),
    surfaceSunken: Color(0xFF0E1A24),
    border: Color(0xFF223446),
    borderStrong: Color(0xFF5C7891),
    ink: Color(0xFFE7EEF3),
    inkSecondary: Color(0xFFA7B8C5),
    inkMuted: Color(0xFF8FA2B2),
    brand: Color(0xFF56AFCF),
    brandHover: Color(0xFF74C0DA),
    brandStrong: Color(0xFFA6DBEB),
    brandSoft: Color(0xFF123243),
    onBrand: Color(0xFF06202B),
    teal: Color(0xFF4CBFB0),
    tealStrong: Color(0xFF8FDCCF),
    tealSoft: Color(0xFF11332F),
    onTeal: Color(0xFF04211D),
    navy: Color(0xFF16293C),
    onNavy: Color(0xFFE6EDF2),
    success: Color(0xFF4CCB7E),
    successSoft: Color(0xFF123324),
    warning: Color(0xFFF0B24E),
    warningSoft: Color(0xFF3A2A0F),
    critical: Color(0xFFF47C7C),
    criticalSoft: Color(0xFF3E1A1A),
    info: Color(0xFF63B8EE),
    infoSoft: Color(0xFF0F2A3D),
    sponsored: Color(0xFFE2C98A),
    sponsoredSoft: Color(0xFF33290F),
    focus: Color(0xFF74C0DA),
    glass: Color(0xBD121F2B),
    glassBorder: Color(0x17FFFFFF),
    scrim: Color(0x8C030A10),
    skeleton: Color(0xFF1E3040),
    viz3: Color(0xFFE08A5A),
    viz4: Color(0xFF8FA3B3),
    viz5: Color(0xFFD9B24C),
    trace: Color(0xFF56AFCF),
    chartGrid: Color(0xFF223446),
    chartAxis: Color(0xFF8FA2B2),
    selection: Color(0xFF123243),
    onNavySubtle: Color(0x1AE6EDF2),
    paper: Color(0xFFFFFFFF),
    paperInk: Color(0xFF0F1F2D),
    paperRule: Color(0xFFDAE3E9),
  );
  @override
  DtColors copyWith({Color? bg, Color? surface, Color? surfaceRaised, Color? surfaceSunken, Color? border, Color? borderStrong, Color? ink, Color? inkSecondary, Color? inkMuted, Color? brand, Color? brandHover, Color? brandStrong, Color? brandSoft, Color? onBrand, Color? teal, Color? tealStrong, Color? tealSoft, Color? onTeal, Color? navy, Color? onNavy, Color? success, Color? successSoft, Color? warning, Color? warningSoft, Color? critical, Color? criticalSoft, Color? info, Color? infoSoft, Color? sponsored, Color? sponsoredSoft, Color? focus, Color? glass, Color? glassBorder, Color? scrim, Color? skeleton, Color? viz3, Color? viz4, Color? viz5, Color? trace, Color? chartGrid, Color? chartAxis, Color? selection, Color? onNavySubtle, Color? paper, Color? paperInk, Color? paperRule}) => DtColors(bg: bg ?? this.bg, surface: surface ?? this.surface, surfaceRaised: surfaceRaised ?? this.surfaceRaised, surfaceSunken: surfaceSunken ?? this.surfaceSunken, border: border ?? this.border, borderStrong: borderStrong ?? this.borderStrong, ink: ink ?? this.ink, inkSecondary: inkSecondary ?? this.inkSecondary, inkMuted: inkMuted ?? this.inkMuted, brand: brand ?? this.brand, brandHover: brandHover ?? this.brandHover, brandStrong: brandStrong ?? this.brandStrong, brandSoft: brandSoft ?? this.brandSoft, onBrand: onBrand ?? this.onBrand, teal: teal ?? this.teal, tealStrong: tealStrong ?? this.tealStrong, tealSoft: tealSoft ?? this.tealSoft, onTeal: onTeal ?? this.onTeal, navy: navy ?? this.navy, onNavy: onNavy ?? this.onNavy, success: success ?? this.success, successSoft: successSoft ?? this.successSoft, warning: warning ?? this.warning, warningSoft: warningSoft ?? this.warningSoft, critical: critical ?? this.critical, criticalSoft: criticalSoft ?? this.criticalSoft, info: info ?? this.info, infoSoft: infoSoft ?? this.infoSoft, sponsored: sponsored ?? this.sponsored, sponsoredSoft: sponsoredSoft ?? this.sponsoredSoft, focus: focus ?? this.focus, glass: glass ?? this.glass, glassBorder: glassBorder ?? this.glassBorder, scrim: scrim ?? this.scrim, skeleton: skeleton ?? this.skeleton, viz3: viz3 ?? this.viz3, viz4: viz4 ?? this.viz4, viz5: viz5 ?? this.viz5, trace: trace ?? this.trace, chartGrid: chartGrid ?? this.chartGrid, chartAxis: chartAxis ?? this.chartAxis, selection: selection ?? this.selection, onNavySubtle: onNavySubtle ?? this.onNavySubtle, paper: paper ?? this.paper, paperInk: paperInk ?? this.paperInk, paperRule: paperRule ?? this.paperRule);
  @override
  DtColors lerp(ThemeExtension<DtColors>? other, double t) {
    if (other is! DtColors) return this;
    return DtColors(bg: Color.lerp(bg, other.bg, t)!, surface: Color.lerp(surface, other.surface, t)!, surfaceRaised: Color.lerp(surfaceRaised, other.surfaceRaised, t)!, surfaceSunken: Color.lerp(surfaceSunken, other.surfaceSunken, t)!, border: Color.lerp(border, other.border, t)!, borderStrong: Color.lerp(borderStrong, other.borderStrong, t)!, ink: Color.lerp(ink, other.ink, t)!, inkSecondary: Color.lerp(inkSecondary, other.inkSecondary, t)!, inkMuted: Color.lerp(inkMuted, other.inkMuted, t)!, brand: Color.lerp(brand, other.brand, t)!, brandHover: Color.lerp(brandHover, other.brandHover, t)!, brandStrong: Color.lerp(brandStrong, other.brandStrong, t)!, brandSoft: Color.lerp(brandSoft, other.brandSoft, t)!, onBrand: Color.lerp(onBrand, other.onBrand, t)!, teal: Color.lerp(teal, other.teal, t)!, tealStrong: Color.lerp(tealStrong, other.tealStrong, t)!, tealSoft: Color.lerp(tealSoft, other.tealSoft, t)!, onTeal: Color.lerp(onTeal, other.onTeal, t)!, navy: Color.lerp(navy, other.navy, t)!, onNavy: Color.lerp(onNavy, other.onNavy, t)!, success: Color.lerp(success, other.success, t)!, successSoft: Color.lerp(successSoft, other.successSoft, t)!, warning: Color.lerp(warning, other.warning, t)!, warningSoft: Color.lerp(warningSoft, other.warningSoft, t)!, critical: Color.lerp(critical, other.critical, t)!, criticalSoft: Color.lerp(criticalSoft, other.criticalSoft, t)!, info: Color.lerp(info, other.info, t)!, infoSoft: Color.lerp(infoSoft, other.infoSoft, t)!, sponsored: Color.lerp(sponsored, other.sponsored, t)!, sponsoredSoft: Color.lerp(sponsoredSoft, other.sponsoredSoft, t)!, focus: Color.lerp(focus, other.focus, t)!, glass: Color.lerp(glass, other.glass, t)!, glassBorder: Color.lerp(glassBorder, other.glassBorder, t)!, scrim: Color.lerp(scrim, other.scrim, t)!, skeleton: Color.lerp(skeleton, other.skeleton, t)!, viz3: Color.lerp(viz3, other.viz3, t)!, viz4: Color.lerp(viz4, other.viz4, t)!, viz5: Color.lerp(viz5, other.viz5, t)!, trace: Color.lerp(trace, other.trace, t)!, chartGrid: Color.lerp(chartGrid, other.chartGrid, t)!, chartAxis: Color.lerp(chartAxis, other.chartAxis, t)!, selection: Color.lerp(selection, other.selection, t)!, onNavySubtle: Color.lerp(onNavySubtle, other.onNavySubtle, t)!, paper: Color.lerp(paper, other.paper, t)!, paperInk: Color.lerp(paperInk, other.paperInk, t)!, paperRule: Color.lerp(paperRule, other.paperRule, t)!);
  }
}

/// Spacing scale (logical pixels).
abstract final class DtSpace {
  static const double 1 = 4.0; // Icon-to-text gap inside chips, badge padding.
  static const double 2 = 8.0; // Gap between inline controls, chip gaps, row internal vertical padding.
  static const double 3 = 12.0; // Input horizontal padding, list row padding on desktop.
  static const double 4 = 16.0; // Mobile page gutter, section padding, card/panel padding.
  static const double 5 = 20.0; // Glass panel padding, sheet content padding.
  static const double 6 = 24.0; // Gap between sections, desktop page gutter.
  static const double 8 = 32.0; // Between major blocks (summary → sections), dialog padding.
  static const double 10 = 40.0; // Top of a page below the top bar on desktop.
  static const double 12 = 48.0; // Empty-state vertical padding, welcome spacing.
  static const double 16 = 64.0; // Marketing/landing rhythm and sidebar collapsed width.
}

/// Corner radii.
abstract final class DtRadius {
  static const double sm = 6.0; // Badges, chips, inline inputs in rows, table cells editing.
  static const double md = 10.0; // Buttons, inputs, list rows, selection cards, result blocks.
  static const double lg = 14.0; // Glass panels, drawers, popovers, command palette.
  static const double xl = 20.0; // Bottom-sheet top corners, mobile search overlay.
  static const double full = 999.0; // Pills, avatars, segmented controls, the raised search tab.
}

/// Backdrop blur sigma source values for Clinical Glass (use sigma = value / 2).
abstract final class DtBlur {
  static const double glass = 16.0; // Top bar, bottom nav, search field, quick actions, floating controls.
  static const double strong = 24.0; // Command palette, bottom sheets and overlays over busy content.
}

/// Opacity tokens.
abstract final class DtOpacity {
  static const double disabled = 0.5; // Disabled controls; pointer-events none.
  static const double scrimStrong = 0.55; // Only for the restricted-document viewer backdrop; everything else uses
}

/// Stroke widths.
abstract final class DtBorder {
  static const double hairline = 1.0; // All dividers and glass borders.
  static const double control = 1.0; // Inputs and chips (border-strong); 2px on error/success states.
  static const double focus = 2.0; // Focus ring width, 2px offset.
}

/// Fixed sizes (controls, rows, bars).
abstract final class DtSize {
  static const double controlSm = 32.0; // Small buttons, dense table actions, admin filters.
  static const double control = 40.0; // Default desktop buttons and inputs.
  static const double controlLg = 48.0; // Mobile inputs and primary buttons, search field.
  static const double touchMin = 44.0; // Minimum touch target on any pointer:coarse device.
  static const double rowDense = 36.0; // Admin and desktop table rows.
  static const double row = 48.0; // List rows (search results, recents, settings).
  static const double topbar = 56.0; // Web top bar and admin console bar (48px) floor.
  static const double bottomnav = 64.0; // Mobile bottom navigation including label.
  static const double sidebar = 240.0; // Expanded web sidebar.
  static const double sidebarRail = 64.0; // Collapsed sidebar rail (tablet, or user-collapsed).
  static const double drawer = 480.0; // Right drawer (admin review, transaction detail).
  static const double drawerWide = 560.0; // Drawer at bp-wide and diff reviews.
  static const double content = 1120.0; // Clinical page max width.
  static const double reading = 760.0; // Clinical reading column max width.
  static const double dialog = 480.0; // Dialog width (confirmation, reason).
  static const double palette = 640.0; // Command palette width on desktop.
}

/// Motion: only these three durations and two curves (Lock L9).
abstract final class DtMotion {
  static const Duration fast = Duration(milliseconds: 120);
  static const Duration base = Duration(milliseconds: 180);
  static const Duration slow = Duration(milliseconds: 260);
  static const Curve easeOut = Cubic(0.2, 0.8, 0.2, 1);
  static const Curve easeInOut = Cubic(0.4, 0, 0.2, 1);
}

/// Type scale. Inter and JetBrains Mono are bundled as app fonts (Lock L19).
abstract final class DtType {
  static const sansFamily = 'Inter';
  static const monoFamily = 'JetBrainsMono';
  static const TextStyle display = TextStyle(fontFamily: sansFamily, fontSize: 28.0, height: 1.2143, fontWeight: FontWeight.w600, letterSpacing: -0.56);
  static const TextStyle title = TextStyle(fontFamily: sansFamily, fontSize: 20.0, height: 1.4000, fontWeight: FontWeight.w600, letterSpacing: -0.20);
  static const TextStyle heading = TextStyle(fontFamily: sansFamily, fontSize: 16.0, height: 1.5000, fontWeight: FontWeight.w600);
  static const TextStyle body = TextStyle(fontFamily: sansFamily, fontSize: 15.0, height: 1.4667, fontWeight: FontWeight.w400);
  static const TextStyle bodyStrong = TextStyle(fontFamily: sansFamily, fontSize: 15.0, height: 1.4667, fontWeight: FontWeight.w600);
  static const TextStyle label = TextStyle(fontFamily: sansFamily, fontSize: 13.0, height: 1.3846, fontWeight: FontWeight.w500);
  static const TextStyle caption = TextStyle(fontFamily: sansFamily, fontSize: 12.0, height: 1.3333, fontWeight: FontWeight.w400);
  static const TextStyle numeric = TextStyle(fontFamily: sansFamily, fontSize: 15.0, height: 1.4667, fontWeight: FontWeight.w500, fontFeatures: [FontFeature.tabularFigures()]);
  static const TextStyle result = TextStyle(fontFamily: sansFamily, fontSize: 36.0, height: 1.1111, fontWeight: FontWeight.w600, letterSpacing: -0.72, fontFeatures: [FontFeature.tabularFigures()]);
  static const TextStyle mono = TextStyle(fontFamily: monoFamily, fontSize: 13.0, height: 1.3846, fontWeight: FontWeight.w400, fontFeatures: [FontFeature.tabularFigures()]);
}

/// Builds the Material theme from tokens. Components read DtColors via Theme.of(context).extension<DtColors>()!.
ThemeData dtTheme(Brightness b) {
  final c = b == Brightness.light ? DtColors.light : DtColors.dark;
  return ThemeData(
    brightness: b,
    useMaterial3: true,
    fontFamily: DtType.sansFamily,
    scaffoldBackgroundColor: c.bg,
    splashFactory: NoSplash.splashFactory, // no ripples: motion rules (L9)
    colorScheme: ColorScheme(brightness: b, primary: c.brand, onPrimary: c.onBrand, secondary: c.teal, onSecondary: c.onTeal,
      error: c.critical, onError: c.onBrand, surface: c.surface, onSurface: c.ink),
    dividerColor: c.border,
    extensions: [c],
  );
}
