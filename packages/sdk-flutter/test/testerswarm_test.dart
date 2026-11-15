import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:testerswarm/testerswarm.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('dev.testerswarm/sdk');

  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('returns disabled on non-Android platforms without invoking channel',
      () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    var called = false;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (_) async {
      called = true;
      return 'TRACKING';
    });

    final status = await TesterSwarm.status();
    await TesterSwarm.setEnabled(false);

    expect(status, TesterSwarmStatus.disabled);
    expect(called, isFalse);
  });

  test('delegates status and setEnabled to Android MethodChannel', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final calls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      if (call.method == 'status') return 'TRACKING';
      return null;
    });

    final status = await TesterSwarm.status();
    await TesterSwarm.setEnabled(false);

    expect(status, TesterSwarmStatus.tracking);
    expect(calls.map((c) => c.method), ['status', 'setEnabled']);
    expect(calls.last.arguments, {'enabled': false});
  });
}
