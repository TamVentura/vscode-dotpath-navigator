import { Range, Uri } from "vscode";
import { DotPathItem } from "./interfaces/dot-path-item";

export function stringifyDotPath(dotPath: DotPathItem) {
  const result: any = {};
  result.uri = dotPath.uri.path;
  result.range = dotPath.range;
  result.valuePath = dotPath.valuePath;
  result.rawPath = dotPath.rawPath;
  return JSON.stringify(result);
}

export function parseDotPath(text: string): DotPathItem {
  const obj = JSON.parse(text);
  const uri = Uri.parse(obj.uri);
  const range = new Range(
    obj.range[0].line,
    obj.range[0].character,
    obj.range[1].line,
    obj.range[1].character,
  );
  const valuePath = obj.valuePath;
  const rawPath = obj.rawPath;
  return { uri, range, valuePath, rawPath };
}
