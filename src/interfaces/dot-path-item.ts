import * as vscode from "vscode";

export interface DotPathItem {
  rawPath: string;
  valuePath: string;
  uri: vscode.Uri;
  range: vscode.Range;
}

export interface DotPathResultItem extends DotPathItem {
  matchLength: number;
}
