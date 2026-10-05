// Screen-reader checks the framework guidelines do not make (design/system/20, TalkBack audit of
// 5 October 2026): a control announced as a button can be activated, and a text field says what
// it is for.
import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

/// Every enabled node announced as a button carries a tap action. A `Semantics(button: true,
/// excludeSemantics: true)` wrapper drops the action of the InkWell below it unless it passes
/// `onTap` itself — TalkBack then reads « button » and cannot press it.
const AccessibilityGuideline buttonsHaveTapAction = _ButtonsHaveTapAction();

/// Every text field has a label (the visible label above it, given to the field's semantics).
const AccessibilityGuideline textFieldsAreLabelled = _TextFieldsAreLabelled();

abstract class _SemanticsWalk extends AccessibilityGuideline {
  const _SemanticsWalk();

  Evaluation check(SemanticsNode node, SemanticsData data);

  @override
  FutureOr<Evaluation> evaluate(WidgetTester tester) {
    var result = const Evaluation.pass();
    void visit(SemanticsNode node) {
      node.visitChildren((child) {
        visit(child);
        return true;
      });
      if (node.isMergedIntoParent || node.isInvisible || node.flagsCollection.isHidden) return;
      result += check(node, node.getSemanticsData());
    }

    for (final view in tester.binding.renderViews) {
      visit(view.owner!.semanticsOwner!.rootSemanticsNode!);
    }
    return result;
  }
}

class _ButtonsHaveTapAction extends _SemanticsWalk {
  const _ButtonsHaveTapAction();

  @override
  String get description => 'Buttons can be activated by a screen reader';

  @override
  Evaluation check(SemanticsNode node, SemanticsData data) {
    final flags = data.flagsCollection;
    final disabled = flags.isEnabled == ui.Tristate.isFalse;
    // The selected tab of a group is a state, not an action.
    final currentChoice = flags.isSelected == ui.Tristate.isTrue && flags.isInMutuallyExclusiveGroup;
    if (!flags.isButton || disabled || currentChoice || data.hasAction(ui.SemanticsAction.tap)) {
      return const Evaluation.pass();
    }
    return Evaluation.fail('$node « ${data.label} »: announced as a button but has no tap action.');
  }
}

class _TextFieldsAreLabelled extends _SemanticsWalk {
  const _TextFieldsAreLabelled();

  @override
  String get description => 'Text fields have a label';

  @override
  Evaluation check(SemanticsNode node, SemanticsData data) {
    if (!data.flagsCollection.isTextField || data.label.trim().isNotEmpty || data.hint.trim().isNotEmpty) {
      return const Evaluation.pass();
    }
    return Evaluation.fail('$node: text field without a label.');
  }
}
