import 'dart:math';

/// Clamp targets, from packages/components/src/elsewise.css. Each is that theme's
/// `--surface-2` — the hardest surface a file icon can land on, being the
/// darkest of the light theme's and the lightest of the dark theme's. Clearing
/// the bar there clears it on `--surface` and `--background` too; clamping to
/// `--background` instead would land ~12% short on dark.
const themes = [
  (name: 'light', background: '#fcfaf6', ink: '#1c2430', darken: true),
  (name: 'dark', background: '#232a34', ink: '#e9e4d8', darken: false),
];

/// WCAG 2.1 non-text contrast (1.4.11): the bar every tint has to clear.
const minContrast = 3.0;

/// Below this OKLCH chroma a color carries no hue to preserve, so it is treated
/// as ink rather than clamped. Catches the pure blacks and whites; the near-
/// grays just above it (stylelint #263238, .rego #7d9199) still clamp.
const achromaticChroma = 0.04;

Map<String, int> resolveTints(Map<String, dynamic> doc) {
  final counts = {'inverted': 0, 'clamped': 0, 'unmoved': 0};
  for (final section in doc.values) {
    for (final spec in (section as Map<String, dynamic>).values) {
      final color = (spec as Map<String, dynamic>)['color'] as Map<String, dynamic>?;
      if (color == null) {
        continue;
      }
      for (final theme in themes) {
        final before = color[theme.name] as String;
        final (after, treatment) = tint(before, theme.background, theme.ink, darken: theme.darken);
        color[theme.name] = after;
        counts[treatment] = counts[treatment]! + 1;
      }
    }
  }
  return counts;
}

/// One theme's tint for [hex], and which treatment produced it.
(String, String) tint(String hex, String background, String ink, {required bool darken}) {
  final (_, chroma, _) = oklchFromHex(hex);
  if (chroma < achromaticChroma) {
    return (ink, hex.toLowerCase() == ink ? 'unmoved' : 'inverted');
  }
  if (contrastOf(hex, background) >= minContrast) {
    return (hex, 'unmoved');
  }
  return (clampToBackground(hex, background, darken: darken), 'clamped');
}

/// Moves [hex]'s OKLCH lightness — and only its lightness — until the color
/// clears [minContrast] against [background]: down on a light theme, up on a
/// dark one. Hue is never touched; chroma only ever drops to stay in sRGB's
/// gamut (see [hexFromOklch]), never to buy contrast.
String clampToBackground(String hex, String background, {required bool darken}) {
  final backgroundLuminance = _luminanceOf(background);
  bool clears(String candidate) => _contrast(_luminanceOf(candidate), backgroundLuminance) >= minContrast;

  final (lightness, chroma, hue) = oklchFromHex(hex);

  // Contrast against a fixed background rises monotonically as lightness moves
  // away from it, so bisecting between the brand lightness and the far end
  // finds the smallest move that clears. That far end — black on the light
  // theme, white on the dark one — always clears, which makes it well-posed.
  var low = darken ? 0.0 : lightness;
  var high = darken ? lightness : 1.0;
  for (var step = 0; step < 24; step++) {
    final mid = (low + high) / 2;
    if (clears(hexFromOklch(mid, chroma, hue)) == darken) {
      low = mid;
    } else {
      high = mid;
    }
  }
  var moved = darken ? low : high;
  var result = hexFromOklch(moved, chroma, hue);

  // Rounding to 8 bits can drop the bisected color a hair back under the bar.
  while (!clears(result) && moved > 0 && moved < 1) {
    moved = (moved + (darken ? -0.004 : 0.004)).clamp(0.0, 1.0);
    result = hexFromOklch(moved, chroma, hue);
  }
  return result;
}

/// OKLCH → `#rrggbb`. Chroma is reduced — hue and lightness held — until the
/// color fits sRGB, because clipping the channels instead would swing the hue.
String hexFromOklch(double lightness, double chroma, double hue) {
  var fitted = chroma;
  if (!_inGamut(_linearFromOklch(lightness, chroma, hue))) {
    var low = 0.0;
    var high = chroma;
    for (var step = 0; step < 20; step++) {
      final mid = (low + high) / 2;
      if (_inGamut(_linearFromOklch(lightness, mid, hue))) {
        low = mid;
      } else {
        high = mid;
      }
    }
    fitted = low;
  }
  final buffer = StringBuffer('#');
  for (final channel in _linearFromOklch(lightness, fitted, hue)) {
    buffer.write((_gamma(channel.clamp(0.0, 1.0)) * 255).round().toRadixString(16).padLeft(2, '0'));
  }
  return buffer.toString();
}

/// `#rrggbb` → OKLCH (lightness 0–1, chroma, hue in degrees).
(double, double, double) oklchFromHex(String hex) {
  final rgb = _rgbOf(hex).map(_inverseGamma).toList();
  final l = _cbrt(0.4122214708 * rgb[0] + 0.5363325363 * rgb[1] + 0.0514459929 * rgb[2]);
  final m = _cbrt(0.2119034982 * rgb[0] + 0.6806995451 * rgb[1] + 0.1073969566 * rgb[2]);
  final s = _cbrt(0.0883024619 * rgb[0] + 0.2817188376 * rgb[1] + 0.6299787005 * rgb[2]);
  final lightness = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  final a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  final b = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return (lightness, sqrt(a * a + b * b), (atan2(b, a) * 180 / pi + 360) % 360);
}

/// WCAG 2.1 contrast ratio between a hex color and a background hex.
double contrastOf(String hex, String background) => _contrast(_luminanceOf(hex), _luminanceOf(background));

/// OKLCH → linear sRGB, ungamutted: components can fall outside 0–1.
List<double> _linearFromOklch(double lightness, double chroma, double hue) {
  final a = chroma * cos(hue * pi / 180);
  final b = chroma * sin(hue * pi / 180);
  final l = pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3).toDouble();
  final m = pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3).toDouble();
  final s = pow(lightness - 0.0894841775 * a - 1.2914855480 * b, 3).toDouble();
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

/// Whether linear sRGB components sit inside the gamut, within rounding slack.
bool _inGamut(List<double> linear) => linear.every((c) => c >= -1e-6 && c <= 1 + 1e-6);

/// WCAG relative luminance of a hex color.
double _luminanceOf(String hex) {
  final rgb = _rgbOf(hex).map(_inverseGamma).toList();
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

double _contrast(double a, double b) => (max(a, b) + 0.05) / (min(a, b) + 0.05);

/// `#rrggbb` → the three sRGB components, 0–1.
List<double> _rgbOf(String hex) {
  final digits = hex.startsWith('#') ? hex.substring(1) : hex;
  return [for (var i = 0; i < 6; i += 2) int.parse(digits.substring(i, i + 2), radix: 16) / 255];
}

double _inverseGamma(double c) => c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4).toDouble();

double _gamma(double c) => c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1 / 2.4).toDouble() - 0.055;

double _cbrt(double x) => x < 0 ? -pow(-x, 1 / 3).toDouble() : pow(x, 1 / 3).toDouble();
