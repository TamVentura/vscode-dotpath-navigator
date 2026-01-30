import * as vscode from "vscode";
import { DotPathItem } from "./interfaces/dot-path-item";
import { queryItems } from "./query-items";
import { parseDotPath } from "./stringify-dotpath";
import { walkDotPath } from "./walkers/walk-dotpath";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("dotpathNavigator.search", searchDotPath),
  );
}

async function searchDotPath() {
  const editor = vscode.window.activeTextEditor;

  // initial query from selection or clipboard
  let initialQuery = "";

  if (editor && !editor.selection.isEmpty) {
    initialQuery = editor.document.getText(editor.selection).trim();
  } else {
    try {
      initialQuery = (await vscode.env.clipboard.readText()).trim();
    } catch {}
  }
  let items: DotPathItem[] = (await walkDotPath()) || [];

  // QuickPick
  const quickPickPanel = vscode.window.createQuickPick<vscode.QuickPickItem>();
  quickPickPanel.placeholder = "Enter dotpath or partial (e.g. c.d)";
  quickPickPanel.matchOnDescription = true;

  quickPickPanel.value = initialQuery;
  quickPickPanel.items = queryItems(initialQuery, items);

  quickPickPanel.onDidChangeValue(
    (val) => (quickPickPanel.items = queryItems(val, items)),
  );
  quickPickPanel.onDidAccept(async () => {
    const sel = quickPickPanel.selectedItems[0];
    if (!sel) {
      quickPickPanel.hide();
      return;
    }
    if (sel.label.startsWith("Create: ") && sel.detail) {
      const result = JSON.parse(sel.detail);
      result.parent = parseDotPath(result.parent);
      await createDotPath(result);
    } else {
      const target = items.find(
        (i) =>
          i.rawPath === sel.label &&
          i.uri.fsPath === sel.description?.replace("In ", ""),
      );
      if (target) navigateTo(target);
    }
    quickPickPanel.hide();
  });

  quickPickPanel.show();
}

async function createDotPath(info: { parent: DotPathItem; missing: string[] }) {
  const { parent, missing } = info;
  if (missing.length === 0) return;

  const doc = await vscode.workspace.openTextDocument(parent.uri);
  const editor = await vscode.window.showTextDocument(doc);
  const langId = doc.languageId;

  if (langId === "json" || langId === "jsonc") {
    await createDotPathJson(editor, parent.range, missing);
  } else if (
    langId === "typescript" ||
    langId === "javascript" ||
    langId === "typescriptreact" ||
    langId === "javascriptreact"
  ) {
    await createDotPathTs(editor, parent.range, missing);
  }
}

/**
 * Creates nested object structure for JSON files.
 * Given missing ["b", "c"], generates: "b": { "c": {$0} }
 */
async function createDotPathJson(
  editor: vscode.TextEditor,
  parentRange: vscode.Range,
  missing: string[],
): Promise<void> {
  if (missing.length === 0) return;
  const doc = editor.document;
  const indent = detectIndent(doc);

  // Find insertion point (before closing brace) and check if comma needed
  const insertInfo = findObjectInsertInfo(doc, parentRange.start);
  if (!insertInfo) return;

  const parentLine = doc.lineAt(parentRange.start.line).text;
  const baseIndent = parentLine.match(/^(\s*)/)?.[1] || "";
  const innerIndent = baseIndent + indent;

  let snippet = insertInfo.needsComma ? ",\n" : "\n";
  for (let i = 0; i < missing.length; i++) {
    const key = missing[i];
    const currentIndent = innerIndent + indent.repeat(i);
    const isLast = i === missing.length - 1;
    if (isLast) {
      snippet += `${currentIndent}"${key}": "$0"`;
    } else {
      snippet += `${currentIndent}"${key}": {`;
    }
  }
  for (let i = missing.length - 2; i >= 0; i--) {
    const currentIndent = innerIndent + indent.repeat(i);
    snippet += `\n${currentIndent}}`;
  }
  snippet += `\n${baseIndent}`;

  await editor.insertSnippet(
    new vscode.SnippetString(snippet),
    insertInfo.position,
  );
}

/**
 * Creates nested object structure for TS/JS files.
 * Given missing ["b", "c"], generates: b: { c: {$0} }
 */
async function createDotPathTs(
  editor: vscode.TextEditor,
  parentRange: vscode.Range,
  missing: string[],
): Promise<void> {
  if (missing.length === 0) return;
  const doc = editor.document;
  const indent = detectIndent(doc);

  // Find insertion point (before closing brace) and check if comma needed
  const insertInfo = findObjectInsertInfo(doc, parentRange.start);
  if (!insertInfo) return;

  let snippet = insertInfo.needsComma ? ",\n" : "\n";
  for (let i = 0; i < missing.length; i++) {
    const key = missing[i];
    const currentIndent = indent.repeat(i);
    const isLast = i === missing.length - 1;
    const keyStr = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;
    if (isLast) {
      snippet += `${currentIndent}${keyStr}: '$0',`;
    } else {
      snippet += `${currentIndent}${keyStr}: {\n`;
    }
  }
  for (let i = missing.length - 2; i >= 0; i--) {
    const currentIndent = indent.repeat(i);
    snippet += `\n${currentIndent}},`;
  }

  await editor.insertSnippet(
    new vscode.SnippetString(snippet),
    insertInfo.position,
  );
}

/**
 * Finds the insertion position (before closing brace) and whether a comma is needed.
 */
function findObjectInsertInfo(
  doc: vscode.TextDocument,
  keyPos: vscode.Position,
): { position: vscode.Position; needsComma: boolean } | null {
  const text = doc.getText();
  const startOffset = doc.offsetAt(keyPos);

  // Find the opening bracket
  const openBraceIdx = text.indexOf("{", startOffset);
  if (openBraceIdx === -1) return null;

  // Find matching closing bracket
  let depth = 1;
  let lastIndexText = -1;
  for (let i = openBraceIdx + 1; i < text.length; i++) {
    if (
      text[i] !== "\n" &&
      text[i] !== " " &&
      text[i] !== "\t" &&
      text[i] !== "\r" &&
      text[i] !== "}" &&
      text[i] !== "]"
    )
      lastIndexText = i;
    if (text[i] === "{" || text[i] === "[") depth++;
    else if (text[i] === "}" || text[i] === "]") {
      depth--;
      if (depth === 0) {
        break;
      }
    }
  }
  if (lastIndexText === -1) return null;

  let needsComma = text[lastIndexText] !== ",";

  return { position: doc.positionAt(lastIndexText + 1), needsComma };
}

function detectIndent(doc: vscode.TextDocument): string {
  for (let i = 0; i < Math.min(doc.lineCount, 100); i++) {
    const line = doc.lineAt(i).text;
    const match = line.match(/^(\s+)/);
    if (match && match[1].length > 0) {
      return match[1].includes("\t") ? "\t" : match[1];
    }
  }
  return "  ";
}

function navigateTo(it: DotPathItem) {
  vscode.window.showTextDocument(it.uri).then((ed) => {
    ed.selection = new vscode.Selection(it.range.start, it.range.start);
    ed.revealRange(it.range, vscode.TextEditorRevealType.InCenter);
  });
}

export function deactivate() {}
