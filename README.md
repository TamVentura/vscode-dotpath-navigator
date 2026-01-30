# Dotpath Navigator

Jump quickly to nested properties in JSON or TS/JS files by typing a dot-path (or partial path), even across multiple files.

## Features

- **Instant navigation**: Type any full or partial dot-path (e.g. `a.b.c` or `c.d`), and select from a filtered list of matching properties.
- **Children mode**: After typing a dot (e.g. `actions.`), see only the next-level keys under that prefix, filtered as you type.
- **Computed keys**: Handles `[Enum.Member]` and `[CONST]` by matching either their raw names, last identifiers, or—even lazily—their string values.
- **Cross-file search**: Configure additional files (e.g. translation JSONs) via settings, and jump directly into them.
- **Create missing paths**: When only one insertion point is valid, a **Create** option will insert the missing object hierarchy and place your cursor at the new property.

## Usage

1. **Open** any JSON or TS/JS file.
2. **Press** <kbd>Ctrl+Alt+O</kbd> (default) or run the **Dotpath Navigator: Search** command.
3. **Type** a dot-path or partial key:

   - **Suffix/fuzzy** mode: No dot prefix (e.g. `conf`) shows matches ending in that fragment.
   - **Children mode**: With at least one dot (e.g. `actions.e`), only keys immediately under `actions` are listed.

4. **Select** an entry to jump there, or choose **Create: your.path** to auto-insert missing branches.

## Configuration

Add patterns for files you want the extension to always search (e.g. translation files) in your **settings.json**:

```jsonc
{
  "dotpathNavigator.extraFiles": [
    "src/i18n/**/*.json", // all JSON under src/i18n
    "translations/**/*.json" // or any glob pattern
  ],
  "keybindings": [
    {
      "command": "dotpathNavigator.search",
      "key": "ctrl+alt+o",
      "when": "editorTextFocus"
    }
  ]
}
```

- **Glob patterns** follow VS Code’s `files.exclude` syntax. The extension will parse and include each matching file alongside your active document when searching.

## Extension Settings

- **`dotpathNavigator.extraFiles`**: _string\[]_ — Glob patterns for extra files to index (default: `[]`).

## Known Limitations

- Computed-key value resolution is performed lazily and may require the enum or constant to be declared or imported in your file.

---

_Powered by ts-morph and VS Code QuickPick APIs._
