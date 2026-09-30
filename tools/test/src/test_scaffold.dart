import 'dart:io';

import 'package:flutter/widgets.dart';

/// The package root, whether tests run from `tools/` or the repository root.
final relativePath = Directory('assets/file-icons').existsSync() ? '.' : '${Directory.current.path}/tools';

final components = '$relativePath/../packages/components';

const sans = 'Work Sans';
const mono = 'JetBrains Mono';

/// packages/components/src/elsewise.css, :root and the dark variant. `surface` is `--surface-2`, the hardest surface
/// a file icon lands on and the one `tints.dart` resolves against.
typedef TestTheme = ({String name, Color background, Color surface, Color ink, Color muted, Color border});

class TestScaffold extends StatelessWidget {
  static const List<TestTheme> themes = [
    (
      name: 'light',
      background: Color(0xFFFFFFFF),
      surface: Color(0xFFFCFAF6),
      ink: Color(0xFF1C2430),
      muted: Color(0xFF5F5A4C),
      border: Color(0xFFF1ECDF),
    ),
    (
      name: 'dark',
      background: Color(0xFF14181F),
      surface: Color(0xFF232A34),
      ink: Color(0xFFE9E4D8),
      muted: Color(0xFFB3AC9A),
      border: Color(0xFF2C333E),
    ),
  ];

  final TestTheme theme;
  final Widget child;

  const new({required this.theme, required this.child, super.key});

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: .ltr,
    child: DefaultTextStyle(
      style: TextStyle(fontFamily: sans, fontSize: 12, color: theme.ink),
      child: Container(
        color: theme.background,
        padding: const .all(16),
        alignment: .topLeft,
        child: child,
      ),
    ),
  );
}
