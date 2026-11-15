import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Enrollment tracking state reported by the native Android SDK.
enum TesterSwarmStatus {
  notEnrolled,
  tracking,
  disabled;

  static TesterSwarmStatus fromWire(String? value) {
    switch (value) {
      case 'TRACKING':
        return TesterSwarmStatus.tracking;
      case 'NOT_ENROLLED':
        return TesterSwarmStatus.notEnrolled;
      case 'DISABLED':
      default:
        return TesterSwarmStatus.disabled;
    }
  }
}

/// Optional Flutter facade for [TesterSwarm].
///
/// Integration requires zero Dart code; auto-init runs on Android via manifest
/// metadata (`dev.testerswarm.APP_KEY`). Non-Android platforms are safe no-ops.
abstract final class TesterSwarm {
  static const MethodChannel _channel = MethodChannel('dev.testerswarm/sdk');

  static bool get _isSupportedAndroid =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  /// Returns current SDK tracking status. Always returns [TesterSwarmStatus.disabled]
  /// on non-Android targets.
  static Future<TesterSwarmStatus> status() async {
    if (!_isSupportedAndroid) return TesterSwarmStatus.disabled;
    try {
      final raw = await _channel.invokeMethod<String>('status');
      return TesterSwarmStatus.fromWire(raw);
    } on MissingPluginException {
      return TesterSwarmStatus.disabled;
    }
  }

  /// Allows host apps to expose an opt-out toggle. No-op on non-Android targets.
  static Future<void> setEnabled(bool enabled) async {
    if (!_isSupportedAndroid) return;
    try {
      await _channel.invokeMethod<void>('setEnabled', {'enabled': enabled});
    } on MissingPluginException {
      // Safe no-op when running without Android embedding
    }
  }
}
