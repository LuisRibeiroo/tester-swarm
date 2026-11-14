import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:testerloop_flutter_example/main.dart';

void main() {
  const channel = MethodChannel('io.testerloop/sdk');

  testWidgets('imports testerloop package and simulates 12x14 lifecycle',
      (tester) async {
    var enabled = true;
    var wireStatus = 'NOT_ENROLLED';
    final calls = <String>[];

    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call.method);
      if (call.method == 'setEnabled') {
        final args = call.arguments as Map<Object?, Object?>;
        enabled = args['enabled'] == true;
        wireStatus = enabled ? 'TRACKING' : 'DISABLED';
        return null;
      }
      if (call.method == 'status') {
        return enabled ? wireStatus : 'DISABLED';
      }
      return null;
    });

    try {
      await tester.pumpWidget(const TesterLoopExampleApp());
      await tester.pumpAndSettle();

      expect(find.text('Bridge status: notEnrolled'), findsOneWidget);

      // Simulate Hub Intent -> Handshake
      wireStatus = 'TRACKING';
      await tester.tap(find.byKey(const Key('simulate_step_btn')));
      await tester.pumpAndSettle();
      expect(find.text('Bridge status: tracking'), findsOneWidget);

      // Opt-out toggles native SDK to disabled
      await tester.tap(find.byKey(const Key('sdk_opt_out_switch')));
      await tester.pumpAndSettle();
      expect(find.text('Bridge status: disabled'), findsOneWidget);
      expect(
          calls, containsAllInOrder(['status', 'status', 'setEnabled', 'status']));
    } finally {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null);
    }
  }, variant: TargetPlatformVariant.only(TargetPlatform.android));
}
