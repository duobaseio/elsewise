import 'dart:convert';
import 'dart:io';

import 'package:elsewise_tool/src/tints.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'package:flutter_test/flutter_test.dart';

import '../test_scaffold.dart';

typedef Entry = ({String key, String kind, Map<String, dynamic> spec});

const kinds = ['slug', 'devicon', 'phosphor', 'letterform'];

const columns = 6;
const cell = Size(148, 26);
const gap = 4.0;
const heading = 28.0;
const flagged = Color(0xFFD4553F);

void main() {
  final entries = readEntries();

  for (final theme in TestScaffold.themes) {
    for (final kind in kinds) {
      testWidgets('${theme.name} $kind', (tester) async {
        final group = entries.where((e) => e.kind == kind).toList()
          ..sort((a, b) => a.key.toLowerCase().compareTo(b.key.toLowerCase()));
        final loaders = {for (final entry in group) entry.key: ?loader(entry)};

        final rows = (group.length / columns).ceil();
        tester.view.physicalSize =
            Size(columns * (cell.width + gap) - gap + 32, heading + rows * (cell.height + gap) - gap + 32) *
            tester.view.devicePixelRatio;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(
          TestScaffold(
            theme: theme,
            child: Column(
              crossAxisAlignment: .start,
              children: [
                SizedBox(
                  height: heading,
                  child: Text('$kind · ${group.length}', style: TextStyle(color: theme.muted)),
                ),
                Wrap(
                  spacing: gap,
                  runSpacing: gap,
                  children: [for (final entry in group) Tile(entry: entry, loader: loaders[entry.key], theme: theme)],
                ),
              ],
            ),
          ),
        );

        await expectLater(find.byType(TestScaffold), matchesGoldenFile('file-icons/${theme.name}/$kind.png'));
      });
    }
  }
}

List<Entry> readEntries() {
  final doc = jsonDecode(File('$relativePath/assets/languages.json').readAsStringSync()) as Map<String, dynamic>;
  return [
    for (final section in doc.values)
      for (final MapEntry(:key, :value) in (section as Map<String, dynamic>).entries)
        (key: key, kind: kinds.firstWhere((value as Map<String, dynamic>).containsKey), spec: value),
  ];
}

SvgStringLoader? loader(Entry entry) => switch (entry.kind) {
  'slug' => SvgStringLoader(asset('simple-icons', entry.spec['slug'] as String)),
  'devicon' => SvgStringLoader(asset('dev-icons', entry.spec['devicon'] as String)),
  'phosphor' => SvgStringLoader(phosphor(entry.spec['phosphor'] as String)),
  _ => null,
};

String asset(String folder, String name) => File('$relativePath/assets/file-icons/$folder/$name.svg').readAsStringSync();

String phosphor(String name) {
  final pascal = name.split('-').map((w) => w[0].toUpperCase() + w.substring(1)).join();
  final source = File('$components/node_modules/@phosphor-icons/react/dist/defs/$pascal.es.js').readAsStringSync();
  final start = source.indexOf('"regular"');
  final end = RegExp(r'\[\s*"(bold|duotone|fill|light|thin)"')
      .allMatches(source)
      .map((m) => m.start)
      .firstWhere((i) => i > start, orElse: () => source.length);
  final paths = RegExp(r'd:\s*"([^"]+)"').allMatches(source.substring(start, end)).map((m) => '<path d="${m[1]}"/>');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${paths.join()}</svg>';
}

/// One entry: its mark, its key, and its measured ratio against the surface.
class Tile extends StatelessWidget {
  final Entry entry;
  final SvgStringLoader? loader;
  final TestTheme theme;

  const new({required this.entry, required this.loader, required this.theme, super.key});

  @override
  Widget build(BuildContext context) {
    final hex = (entry.spec['color'] as Map<String, dynamic>?)?[theme.name] as String?;
    final tint = hex == null ? null : Color(0xFF000000 | int.parse(hex.substring(1), radix: 16));
    final ratio = hex == null ? null : contrastOf(hex, '#${(theme.surface.toARGB32() & 0xFFFFFF).toRadixString(16)}');
    final bad = ratio != null && ratio < minContrast;

    return Container(
      width: cell.width,
      height: cell.height,
      padding: const .symmetric(horizontal: 6),
      decoration: BoxDecoration(
        color: theme.surface,
        border: .all(color: bad ? flagged : theme.border),
        borderRadius: .circular(6),
      ),
      child: Row(
        children: [
          SizedBox.square(
            dimension: 16,
            child: switch (entry.kind) {
              'devicon' => SvgPicture(loader!, width: 16, height: 16),
              'slug' || 'phosphor' => SvgPicture(
                loader!,
                width: 16,
                height: 16,
                colorFilter: ColorFilter.mode(tint ?? theme.ink, .srcIn),
              ),
              _ => _Letter(
                letters: entry.spec['letterform'] as String,
                color: tint ?? theme.ink,
                border: tint?.withValues(alpha: 0.45) ?? theme.border,
              ),
            },
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              entry.key,
              maxLines: 1,
              overflow: .ellipsis,
              style: TextStyle(fontFamily: mono, fontSize: 10, color: theme.muted),
            ),
          ),
          Text(
            ratio?.toStringAsFixed(1) ?? '—',
            style: TextStyle(
              fontSize: 10,
              fontVariations: [FontVariation.weight(bad ? 600 : 400)],
              color: bad ? flagged : theme.muted.withValues(alpha: ratio == null ? 0.35 : 0.7),
            ),
          ),
        ],
      ),
    );
  }
}

class const _Letter({required final String letters, required final Color color, required final Color border})
    extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final size = letters.length >= 3 ? 5.75 : 8.5;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: .all(color: border),
        borderRadius: .circular(3),
      ),
      child: OverflowBox(
        maxWidth: .infinity,
        child: Center(
          child: Text(
            letters,
            softWrap: false,
            style: TextStyle(
              fontSize: size,
              height: 1,
              letterSpacing: -0.025 * size,
              fontVariations: const [.weight(500)],
              color: color,
            ),
          ),
        ),
      ),
    );
  }
}
