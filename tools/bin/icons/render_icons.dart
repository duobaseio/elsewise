// Renders every icon and letterform in assets/languages.json onto Elsewise's
// light and dark surfaces, so contrast can be eye-tested in a browser. Each
// tinted entry also carries its measured ratio against the surface it sits on.
// Run: dart run bin/icons/render_icons.dart
import 'dart:convert';
import 'dart:io';
import 'dart:math';

const out = '.dart_tool/icon-contrast.html';

// styles.css, :root and .dark.
const themes = [
  (name: 'light', bg: '#ffffff', surface: '#fefdfb', fg: '#1c2430', muted: '#5f5a4c', border: '#f1ecdf'),
  (name: 'dark', bg: '#14181f', surface: '#1b2129', fg: '#e9e4d8', muted: '#b3ac9a', border: '#2c333e'),
];

// Anything under 3:1 against the surface is called out — the threshold the
// icon pipeline has always held tints to.
const minContrast = 3.0;

void main() {
  // Script lives in bin/icons/; resolve assets against the package root.
  final root = File.fromUri(Platform.script).parent.parent.parent.absolute.path;
  final doc = jsonDecode(File('$root/assets/languages.json').readAsStringSync()) as Map<String, dynamic>;

  final entries = <({String key, String section, Map<String, dynamic> spec})>[];
  for (final section in doc.keys) {
    (doc[section] as Map<String, dynamic>).forEach((key, spec) {
      entries.add((key: key, section: section, spec: spec as Map<String, dynamic>));
    });
  }

  String kindOf(Map<String, dynamic> s) => s.containsKey('slug')
      ? 'slug'
      : s.containsKey('devicon')
      ? 'devicon'
      : s.containsKey('phosphor')
      ? 'phosphor'
      : 'letterform';

  final threshold = minContrast.toStringAsFixed(0);
  final note =
      '${entries.length} entries — ratio is against the surface behind the mark; '
      'under $threshold:1 is flagged.';

  final buffer = StringBuffer()
    ..writeln('<!doctype html><meta charset="utf-8"><title>Icon contrast</title>')
    ..writeln('<style>$css</style>')
    ..writeln('<header><h1>Icon contrast</h1><p>$note</p></header>')
    ..writeln('<div class="panels">');

  for (final theme in themes) {
    buffer
      ..writeln('<section class="${theme.name}" style="${vars(theme)}">')
      ..writeln('<h2>${theme.name}</h2>');
    for (final kind in ['slug', 'devicon', 'phosphor', 'letterform']) {
      final group = entries.where((e) => kindOf(e.spec) == kind).toList()
        ..sort((a, b) => a.key.toLowerCase().compareTo(b.key.toLowerCase()));
      buffer.writeln('<h3>$kind <span>${group.length}</span></h3><div class="grid">');
      for (final entry in group) {
        buffer.writeln(cell(root, entry.key, entry.spec, kind, theme.name, theme.surface));
      }
      buffer.writeln('</div>');
    }
    buffer.writeln('</section>');
  }
  buffer.writeln('</div>');

  File('$root/$out')
    ..createSync(recursive: true)
    ..writeAsStringSync(buffer.toString());
  print('rendered ${entries.length} entries -> tools/$out');
}

/// The theme's tokens as inline custom properties.
String vars(({String bg, String border, String fg, String muted, String name, String surface}) theme) => [
  '--bg:${theme.bg}',
  '--surface:${theme.surface}',
  '--fg:${theme.fg}',
  '--muted:${theme.muted}',
  '--border:${theme.border}',
].join(';');

/// One tile: the mark as it would paint, its key, and its measured ratio.
String cell(String root, String key, Map<String, dynamic> spec, String kind, String theme, String surface) {
  // `color` is a per-theme pair; null means the language carries none.
  final color = (spec['color'] as Map<String, dynamic>?)?[theme] as String?;
  final (mark, missing) = switch (kind) {
    'slug' => (tinted(read(root, 'simple-icons', spec['slug'] as String), color ?? 'currentColor'), false),
    'devicon' => (sized(read(root, 'dev-icons', spec['devicon'] as String)), false),
    'phosphor' => (tinted(phosphor(root, spec['phosphor'] as String), color ?? 'currentColor'), false),
    _ => ('<span class="letters" style="color:${color ?? 'currentColor'}">${spec['letterform']}</span>', color == null),
  };

  final ratio = color == null ? null : contrast(color, surface);
  final badge = ratio == null
      ? '<span class="badge none">${missing ? 'no color' : '—'}</span>'
      : '<span class="badge${ratio < minContrast ? ' bad' : ''}">${ratio.toStringAsFixed(1)}</span>';
  final flag = ratio != null && ratio < minContrast ? ' flag' : '';
  final label = escape(key);
  return '<div class="cell$flag"><div class="mark">$mark</div><div class="key">$label</div>$badge</div>';
}

String read(String root, String folder, String name) {
  final file = File('$root/assets/icons/$folder/$name.svg');
  return file.existsSync() ? file.readAsStringSync() : '<svg viewBox="0 0 24 24"><title>missing</title></svg>';
}

/// The regular-weight paths out of a Phosphor def module.
String phosphor(String root, String name) {
  final pascal = name.split('-').map((w) => w[0].toUpperCase() + w.substring(1)).join();
  final file = File('$root/../apps/web/node_modules/@phosphor-icons/react/dist/defs/$pascal.es.js');
  if (!file.existsSync()) {
    return '<svg viewBox="0 0 256 256"><title>missing</title></svg>';
  }
  final source = file.readAsStringSync();
  final start = source.indexOf('"regular"');
  final block = start < 0 ? source : source.substring(start, nextWeight(source, start));
  final paths = RegExp(r'd:\s*"([^"]+)"').allMatches(block).map((m) => '<path d="${m.group(1)}"/>').join();
  return '<svg viewBox="0 0 256 256">$paths</svg>';
}

int nextWeight(String source, int start) {
  final next = RegExp(
    r'\[\s*"(bold|duotone|fill|light|thin|regular)"',
  ).allMatches(source).map((m) => m.start).firstWhere((i) => i > start, orElse: () => source.length);
  return next;
}

/// Paints an untinted single-path mark; `fill` is inherited by the paths.
String tinted(String svg, String color) =>
    svg.replaceFirst('<svg', '<svg fill="$color" width="20" height="20"').replaceAll(RegExp('<title>.*?</title>'), '');

String sized(String svg) => svg.replaceFirst('<svg', '<svg width="20" height="20"');

String escape(String s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/// WCAG relative-luminance contrast between two #rrggbb colors.
double contrast(String a, String b) {
  final (la, lb) = (luminance(a), luminance(b));
  return (max(la, lb) + 0.05) / (min(la, lb) + 0.05);
}

double luminance(String hex) {
  final value = int.parse(hex.replaceFirst('#', ''), radix: 16);
  final channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff].map((c) {
    final s = c / 255;
    return s <= 0.03928 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4).toDouble();
  }).toList();
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

const css = '''
body { margin: 0; font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; background: #6b7280; }
header { padding: 16px 20px; background: #fff; color: #1c2430; }
header h1 { margin: 0 0 4px; font-size: 15px; }
header p { margin: 0; color: #5f5a4c; }
.panels { display: grid; grid-template-columns: 1fr 1fr; }
section { background: var(--bg); color: var(--fg); padding: 12px 16px 32px; }
h2 { position: sticky; top: 0; margin: 0 -16px 8px; padding: 8px 16px; background: var(--bg);
     font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
h3 { margin: 20px 0 8px; font-size: 12px; font-weight: 600; color: var(--muted); }
h3 span { opacity: .6; font-weight: 400; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 4px; }
.cell { display: grid; grid-template-columns: 20px 1fr auto; align-items: center; gap: 8px;
        padding: 5px 8px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); }
.cell.flag { border-color: #d4553f; }
.mark { display: flex; width: 20px; height: 20px; }
.mark svg { width: 20px; height: 20px; }
.letters { font: 600 11px/20px ui-monospace, monospace; letter-spacing: -.02em; }
.key { font-family: ui-monospace, monospace; font-size: 11px; color: var(--muted);
       overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { font-size: 10px; color: var(--muted); opacity: .7; font-variant-numeric: tabular-nums; }
.badge.bad { color: #d4553f; opacity: 1; font-weight: 600; }
.badge.none { opacity: .35; }
''';
