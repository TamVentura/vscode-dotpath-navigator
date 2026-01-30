import { TextDocument, window, workspace } from "vscode";
import { DotPathItem } from "../interfaces/dot-path-item";
import { walkJson } from "./json-walker";
import { walkTs } from "./ts-walker";

export async function walkDotPath() {
  const editor = window.activeTextEditor;
  const doc = editor?.document;
  let searchCurrentFile = false;
  let currentUri: string = "";
  if (doc) {
    const isJson = ["json", "jsonc"].includes(doc.languageId);
    const isTs = [
      "typescript",
      "typescriptreact",
      "javascript",
      "javascriptreact",
    ].includes(doc.languageId);
    searchCurrentFile = true;
    if (!isJson && !isTs) {
      searchCurrentFile = false;
    }
  }

  const extraFiles: TextDocument[] = await getExtraFiles(
    doc ? doc.uri.toString() : currentUri,
  );

  const result: DotPathItem[] = [];

  if (doc && searchCurrentFile === true) {
    result.push(...(await walkDotPathOnFile(doc)));
  }

  for (const extraFile of extraFiles) {
    result.push(...(await walkDotPathOnFile(extraFile)));
  }

  return result;
}

async function getExtraFiles(currentUri: string): Promise<TextDocument[]> {
  const files: TextDocument[] = [];
  const patterns = workspace
    .getConfiguration("dotpathNavigator")
    .get<string[]>("extraFiles", []);
  for (const pat of patterns) {
    for (const uri of await workspace.findFiles(pat)) {
      if (uri.toString() === currentUri) continue;
      const extDoc = await workspace.openTextDocument(uri);

      if (
        ![
          "json",
          "jsonc",
          "typescript",
          "typescriptreact",
          "javascript",
          "javascriptreact",
        ].includes(extDoc.languageId)
      )
        continue;
      files.push(extDoc);
    }
  }
  return files;
}

async function walkDotPathOnFile(file: TextDocument) {
  return ["json", "jsonc"].includes(file.languageId)
    ? walkJson(file)
    : await walkTs(file);
}
