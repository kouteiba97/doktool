import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// The vertical DokTool lockup (design/system/assets/Logos), light or dark with the theme.
class DtLogo extends StatelessWidget {
  const DtLogo({this.height = 150, super.key});

  final double height;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return SvgPicture.asset(
      dark ? 'assets/logos/doktool-logo-vertical-dark.svg' : 'assets/logos/doktool-logo-vertical.svg',
      height: height,
      semanticsLabel: 'DokTool',
    );
  }
}
