import { Node as JsonNode, parseTree } from "jsonc-parser";
import { Range, TextDocument } from "vscode";
import { DotPathItem } from "../interfaces/dot-path-item";

export function walkJson(doc: TextDocument): DotPathItem[] {
  const res: DotPathItem[] = [];
  const text = doc.getText();
  const root = parseTree(text);
  if (!root) return res;

  function walk(node: JsonNode, path: string[]): DotPathItem[] {
    if (node.type === "object" && node.children) {
      // Each child is a 'property' node: [keyNode, valueNode]
      for (const prop of node.children) {
        const keyNode = prop.children?.[0];
        const valueNode = prop.children?.[1];
        if (!keyNode) continue;

        const key = String(keyNode.value);
        const newPath = [...path, key];

        // keyNode.offset is the exact character offset of THIS key (handles duplicates correctly)
        const pos = doc.positionAt(keyNode.offset);

        res.push({
          rawPath: newPath.join("."),
          valuePath: newPath.join("."),
          uri: doc.uri,
          range: new Range(pos, pos),
        });

        if (valueNode) res.push(...walk(valueNode, newPath));
      }
    } else if (node.type === "array" && node.children) {
      // Optional: traverse arrays (indexes added to the path). Remove if you don't want numeric segments.
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        res.push(...walk(child, [...path, String(i)]));
      }
    }
    return res;
  }

  return walk(root, []);
}
