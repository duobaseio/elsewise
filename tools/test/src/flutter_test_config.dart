import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';

import 'package:flutter_test/flutter_test.dart';

import 'test_scaffold.dart';

Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  TestWidgetsFlutterBinding.ensureInitialized();

  // The families FileIcon and its surroundings set in, read from the components package's install rather than
  // vendored a second time.
  for (final (family, file) in [
    (sans, 'work-sans/files/work-sans-latin-wght-normal.woff2'),
    (mono, 'jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'),
  ]) {
    final loader = FontLoader(family)
      ..addFont(File('$components/node_modules/@fontsource-variable/$file').readAsBytes().then(ByteData.sublistView));
    await loader.load();
  }

  goldenFileComparator = LocalFileComparator(
    // LocalFileComparator only uses the test's URI to find the directory the goldens live in, so a generically named
    // `test.dart` under that directory is enough.
    .parse('$relativePath/test/golden/${Platform.operatingSystem}/test.dart'),
  );

  await testMain();
}
