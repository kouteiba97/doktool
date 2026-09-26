import 'package:flutter/material.dart';

import '../theme/doktool_tokens.dart';
import 'tokens.dart';

/// Loading rows (section 22: skeleton rows, never a spinner, for lists).
class SkeletonRows extends StatelessWidget {
  const SkeletonRows({this.count = 6, super.key});

  final int count;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Semantics(
      label: MaterialLocalizations.of(context).refreshIndicatorSemanticLabel,
      child: Column(
        children: [
          for (var index = 0; index < count; index++)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: DtSpace.s4, vertical: DtSpace.s3),
              child: Row(
                children: [
                  Container(
                    width: DtSpace.s5,
                    height: DtSpace.s5,
                    decoration: BoxDecoration(color: colors.skeleton, borderRadius: BorderRadius.circular(DtRadius.sm)),
                  ),
                  const SizedBox(width: DtSpace.s3),
                  Expanded(
                    child: FractionallySizedBox(
                      alignment: AlignmentDirectional.centerStart,
                      widthFactor: 0.5 + (index % 3) * 0.15,
                      child: Container(
                        height: DtSpace.s3,
                        decoration: BoxDecoration(
                          color: colors.skeleton,
                          borderRadius: BorderRadius.circular(DtRadius.sm),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
