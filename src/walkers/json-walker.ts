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
      const properties = node.children.filter(p => p.children?.[0]);

      for (let i = 0; i < properties.length; i++) {
        const prop = properties[i];
        const keyNode = prop.children![0];
        const valueNode = prop.children?.[1];

        const key = String(keyNode.value);
        const newPath = [...path, key];

        const keyPos = doc.positionAt(keyNode.offset);
        const propEndOffset = prop.offset + prop.length;
        const propEndPos = doc.positionAt(propEndOffset);

        // 1. Determine start position
        let startPos;
        if (i > 0) {
          const prevProp = properties[i - 1];
          const prevEndPos = doc.positionAt(prevProp.offset + prevProp.length);
          if (prevEndPos.line === keyPos.line) {
            // Previous property on same line - start after it (includes comma)
            startPos = prevEndPos;
          } else {
            // No previous on same line - start of line
            startPos = keyPos.with(keyPos.line, 0);
          }
        } else {
          startPos = keyPos.with(keyPos.line, 0);
        }

        // 2. Determine end position
        let endPos;
        if (i < properties.length - 1) {
          const nextProp = properties[i + 1];
          const nextKeyNode = nextProp.children![0];
          const nextKeyPos = doc.positionAt(nextKeyNode.offset);
          if (nextKeyPos.line === propEndPos.line) {
            // Next property on same line - end at comma (find it in text)
            let commaIdx = propEndOffset;
            while (commaIdx < text.length && text[commaIdx] !== ',') commaIdx++;
            if (text[commaIdx] === ',') commaIdx++; // include comma
            endPos = doc.positionAt(commaIdx);
          } else {
            // No next on same line - end of line
            endPos = doc.lineAt(propEndPos.line).range.end;
          }
        } else {
          // Last property - end of line
          endPos = doc.lineAt(propEndPos.line).range.end;
        }

        const keyEndPos = doc.positionAt(keyNode.offset + keyNode.length);
        res.push({
          rawPath: newPath.join("."),
          valuePath: newPath.join("."),
          uri: doc.uri,
          range: new Range(startPos, endPos),
          keyRange: new Range(keyPos, keyEndPos),
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
