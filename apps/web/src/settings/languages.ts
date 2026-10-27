const SNIPPETS = import.meta.glob<string>('./previews/*', { query: '?raw', import: 'default', eager: true });

export interface Language {
  /**
   * CodeMirror's name for the language, which the settings are keyed by.
   */
  readonly name: string;
  /**
   * The language's label, e.g. `JavaScript/JSX`.
   */
  readonly label: string;
  /**
   * The path of the preview, for the language to be found by.
   */
  readonly path: string;
  /**
   * The preview's code.
   */
  readonly preview: string;
}

const JAVASCRIPT = language('JavaScript', 'jsx.jsx', 'JavaScript/JSX');
const TYPESCRIPT = language('TypeScript', 'tsx.tsx', 'TypeScript/TSX');
const SQL = language('SQL', 'sql.sql');

export const LANGUAGES: Readonly<Record<string, Language>> = {
  C: language('C', 'c.c'),
  'C#': language('C#', 'csharp.cs'),
  'C++': language('C++', 'cpp.cpp'),
  CSS: language('CSS', 'css.css'),
  Dart: language('Dart', 'dart.dart'),
  Go: language('Go', 'go.go'),
  Groovy: language('Groovy', 'groovy.groovy'),
  Haskell: language('Haskell', 'haskell.hs'),
  HTML: language('HTML', 'html.html'),
  Java: language('Java', 'java.java'),
  JavaScript: JAVASCRIPT,
  JSX: JAVASCRIPT,
  JSON: language('JSON', 'json.json'),
  Kotlin: language('Kotlin', 'kotlin.kt'),
  Lua: language('Lua', 'lua.lua'),
  Markdown: language('Markdown', 'markdown.md'),
  'Objective-C': language('Objective-C', 'objective-c.m'),
  Perl: language('Perl', 'perl.pl'),
  PHP: language('PHP', 'php.php'),
  ProtoBuf: language('ProtoBuf', 'protobuf.proto'),
  Python: language('Python', 'python.py'),
  Ruby: language('Ruby', 'ruby.rb'),
  Rust: language('Rust', 'rust.rs'),
  SQL,
  MySQL: SQL,
  'MariaDB SQL': SQL,
  'MS SQL': SQL,
  PLSQL: SQL,
  PostgreSQL: SQL,
  SQLite: SQL,
  CQL: SQL,
  Swift: language('Swift', 'swift.swift'),
  TOML: language('TOML', 'toml.toml'),
  TypeScript: TYPESCRIPT,
  TSX: TYPESCRIPT,
  XML: language('XML', 'xml.xml'),
  YAML: language('YAML', 'yaml.yaml'),
};

function language(name: string, path: string, label = name): Language {
  const preview = SNIPPETS[`./previews/${path}`];
  if (preview === undefined) {
    throw new Error(`No preview at ${path}`);
  }
  return { name, label, path, preview };
}
