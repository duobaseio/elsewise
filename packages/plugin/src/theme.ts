import * as z from 'zod';

export type Theme = z.infer<typeof Theme>;
export type ThemeVariant = z.infer<typeof ThemeVariant>;
export type Color = z.infer<typeof Color>;
export type TextStyle = z.infer<typeof TextStyle>;

/**
 * A theme for the interface, editor and terminal.
 */
export const Theme = z.lazy(() =>
  z
    .object({
      /**
       * The theme's display name. Cannot be blank.
       */
      name: z.string().regex(/\S/),
      light: ThemeVariant.optional(),
      dark: ThemeVariant.optional(),
    })
    .refine((theme) => theme.light !== undefined || theme.dark !== undefined, {
      error: 'A theme has a light variant, a dark variant, or both',
    }),
);

/**
 * A theme's colors in light or dark mode.
 *
 * An unspecified color defaults to the Elsewise theme's.
 */
export const ThemeVariant = z.lazy(() =>
  z.object({
    /**
     * The interface's colors.
     */
    interface: z
      .object({
        // Fields
        background: Color,
        surface: Color,
        'surface-2': Color,
        popover: Color,
        scrim: Color,

        // Ink
        foreground: Color,
        'text-2': Color,
        'text-3': Color,
        disabled: Color,
        inverse: Color,

        // Lines
        border: Color,
        input: Color,
        ring: Color,

        // Actions
        'primary-hover': Color,
        'secondary-hover': Color,
        'destructive-hover': Color,
        'destructive-foreground': Color,
        link: Color,
        'link-hover': Color,

        // State layers
        'layer-hover': Color,
        'layer-selected': Color,
        'layer-selected-inactive': Color,
        'layer-selection': Color,

        // Skeleton
        skeleton: Color,

        // Semantic voices
        success: Color,
        'success-wash': Color,
        'success-line': Color,
        info: Color,
        'info-wash': Color,
        'info-line': Color,
        warning: Color,
        'warning-fill': Color,
        'warning-wash': Color,
        'warning-line': Color,
        'match-wash': Color,
        error: Color,
        'error-wash': Color,
        'error-line': Color,

        // Charts
        'chart-1': Color,
        'chart-2': Color,
        'chart-3': Color,
        'chart-4': Color,
        'chart-5': Color,
      })
      .partial()
      .default({}),

    /**
     * The editor's colors and syntax highlighting.
     */
    editor: z
      .object({
        background: Color,
        foreground: Color,
        caret: Color,
        selection: Color,
        selectionMatch: Color,
        activeLine: Color,
        gutterBackground: Color,
        gutterForeground: Color,
        gutterBorder: Color,
        visualGuide: Color,
        bracketMatch: Color,
        bracketMismatch: Color,
        searchMatch: Color,
        searchMatchSelected: Color,
        searchMatchSelectedBorder: Color,
        panelBackground: Color,
        tooltipBackground: Color,
        completionHovered: Color,
        completionSelected: Color,

        // Diagnostics
        error: Color,
        warning: Color,
        info: Color,
        hint: Color,
        unnecessary: Color,

        /**
         * The syntax highlighting tokens.
         */
        tokens: z
          .object({
            comment: TextStyle,
            docComment: TextStyle,
            punctuation: TextStyle,
            bracket: TextStyle,
            operator: TextStyle,
            keyword: TextStyle,
            controlKeyword: TextStyle,
            importKeyword: TextStyle,
            declarationKeyword: TextStyle,
            modifier: TextStyle,
            function: TextStyle,
            method: TextStyle,
            macro: TextStyle,
            builtin: TextStyle,
            type: TextStyle,
            class: TextStyle,
            namespace: TextStyle,
            annotation: TextStyle,
            meta: TextStyle,
            variable: TextStyle,
            parameter: TextStyle,
            property: TextStyle,
            attribute: TextStyle,
            tag: TextStyle,
            constant: TextStyle,
            self: TextStyle,
            label: TextStyle,
            string: TextStyle,
            escape: TextStyle,
            regexp: TextStyle,
            number: TextStyle,
            boolean: TextStyle,
            invalid: TextStyle,
            heading: TextStyle,
            link: TextStyle,
            emphasis: TextStyle,
            strong: TextStyle,
            strikethrough: TextStyle,
            code: TextStyle,
            quote: TextStyle,
            list: TextStyle,
            rule: TextStyle,
            inserted: TextStyle,
            deleted: TextStyle,
            changed: TextStyle,
          })
          .partial(),
      })
      .partial()
      .default({}),

    /**
     * The terminal's colors.
     */
    terminal: z
      .object({
        background: Color,
        foreground: Color,
        cursor: Color,
        cursorAccent: Color,
        selection: Color,
        black: Color,
        red: Color,
        green: Color,
        yellow: Color,
        blue: Color,
        magenta: Color,
        cyan: Color,
        white: Color,
        brightBlack: Color,
        brightRed: Color,
        brightGreen: Color,
        brightYellow: Color,
        brightBlue: Color,
        brightMagenta: Color,
        brightCyan: Color,
        brightWhite: Color,
      })
      .partial()
      .default({}),
  }),
);

/**
 * A color in hexadecimal, e.g. `#fff`, `#1c2430` or `#1c243073`, or as `rgb()` or `rgba()` with comma-separated
 * numbers, e.g. `rgba(28, 36, 48, 0.45)`.
 */
export const Color = z
  .string()
  .regex(
    /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:\d*\.)?\d+\s*)?\))$/i,
  );

/**
 * How text is drawn.
 */
export const TextStyle = z.union([
  Color.transform((color) => ({ color })),
  z
    .object({
      color: Color,
      bold: z.boolean(),
      italic: z.boolean(),
      underline: z.boolean(),
      strikethrough: z.boolean(),
    })
    .partial(),
]);
