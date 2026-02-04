import {
  ObjectLiteralExpression,
  Project,
  SourceFile,
  StringLiteral,
  ts,
} from "ts-morph";
import { Range, TextDocument } from "vscode";
import { DotPathItem } from "../interfaces/dot-path-item";

export async function walkTs(doc: TextDocument): Promise<DotPathItem[]> {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipFileDependencyResolution: true,
  });
  const source = project.createSourceFile(doc.uri.fsPath, doc.getText());
  const importMap: Record<string, string> = {};
  source.getImportDeclarations().forEach((imp) => {
    const moduleSpecifier = imp.getModuleSpecifierValue();
    imp
      .getNamedImports()
      .forEach((n) => (importMap[n.getName()] = moduleSpecifier));
    const namespaceImport = imp.getNamespaceImport();
    if (namespaceImport) importMap[namespaceImport.getText()] = moduleSpecifier;
  });
  const result: DotPathItem[] = [];

  result.push(...handleVariables(source, doc));

  result.push(...handleClasses(source, doc));

  result.push(...handleDefaultExport(source, doc));

  return result;
}

function handle(
  originalDocument: TextDocument,
  node: ObjectLiteralExpression,
  pathRaw: string[],
  pathVal: string[],
) {
  const result: DotPathItem[] = [];
  const properties = node.getProperties().filter(p => p.isKind(ts.SyntaxKind.PropertyAssignment));

  for (let i = 0; i < properties.length; i++) {
    const prop = properties[i];
    const propertyAssignment = prop as import("ts-morph").PropertyAssignment;
    let raw = propertyAssignment.getName();
    let val = raw;
    const nodeName = propertyAssignment.getNameNode();
    if (nodeName.isKind(ts.SyntaxKind.ComputedPropertyName)) {
      const expr = nodeName.getExpression();
      const txt = expr.getText();
      raw = `[${txt}]`;
      if (expr.isKind(ts.SyntaxKind.StringLiteral))
        val = (expr as StringLiteral).getLiteralText();
      else if (expr.isKind(ts.SyntaxKind.PropertyAccessExpression)) {
        const [en, mem] = txt.split(".");
        // lazy: store raw only, valuePath uses mem
        val = mem;
      } else val = txt;
    }
    const nodePathRaw = [...pathRaw, raw],
      nodePathVal = [...pathVal, val];

    const keyPos = originalDocument.positionAt(nodeName.getStart());
    const propEndOffset = propertyAssignment.getEnd();
    const propEndPos = originalDocument.positionAt(propEndOffset);

    // 1. Determine start position
    let startPos;
    if (i > 0) {
      const prevProp = properties[i - 1] as import("ts-morph").PropertyAssignment;
      const prevEndPos = originalDocument.positionAt(prevProp.getEnd());
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
      const nextProp = properties[i + 1] as import("ts-morph").PropertyAssignment;
      const nextKeyPos = originalDocument.positionAt(nextProp.getNameNode().getStart());
      if (nextKeyPos.line === propEndPos.line) {
        // Next property on same line - end at comma (find it in text)
        const text = originalDocument.getText();
        let commaIdx = propEndOffset;
        while (commaIdx < text.length && text[commaIdx] !== ',') commaIdx++;
        if (text[commaIdx] === ',') commaIdx++; // include comma
        endPos = originalDocument.positionAt(commaIdx);
      } else {
        // No next on same line - end of line
        endPos = originalDocument.lineAt(propEndPos.line).range.end;
      }
    } else {
      // Last property - end of line
      endPos = originalDocument.lineAt(propEndPos.line).range.end;
    }

    const keyEndPos = originalDocument.positionAt(nodeName.getEnd());
    result.push({
      rawPath: nodePathRaw.join("."),
      valuePath: nodePathVal.join("."),
      uri: originalDocument.uri,
      range: new Range(startPos, endPos),
      keyRange: new Range(keyPos, keyEndPos),
    });

    const init = propertyAssignment.getInitializer();
    if (init && init.isKind(ts.SyntaxKind.ObjectLiteralExpression))
      result.push(...handle(
        originalDocument,
        init as ObjectLiteralExpression,
        nodePathRaw,
        nodePathVal,
      ));
  }
  return result;
}

function handleDefaultExport(
  source: SourceFile,
  originalDocument: TextDocument,
) {
  const result: DotPathItem[] = [];
  source.getExportAssignments().forEach((exp) => {
    const expression = exp.getExpression();
    if (expression && expression.isKind(ts.SyntaxKind.ObjectLiteralExpression))
      result.push(
        ...handle(
          originalDocument,
          expression as ObjectLiteralExpression,
          [],
          [],
        ),
      );
  });
  return result;
}

function handleClasses(source: SourceFile, originalDocument: TextDocument) {
  const result: DotPathItem[] = [];
  source.getClasses().forEach((cls) => {
    const ClassName = cls.getName() || "<anon>";
    cls.getProperties().forEach((prop) => {
      const init = prop.getInitializer();
      if (init && init.isKind(ts.SyntaxKind.ObjectLiteralExpression))
        result.push(
          ...handle(
            originalDocument,
            init as ObjectLiteralExpression,
            [ClassName, prop.getName()],
            [ClassName, prop.getName()],
          ),
        );
    });
  });
  return result;
}

function handleVariables(source: SourceFile, originalDocument: TextDocument) {
  const result: DotPathItem[] = [];
  source.getVariableStatements().forEach((st) =>
    st.getDeclarations().forEach((dec) => {
      const declarationName = dec.getName();
      const init = dec.getInitializer();
      if (init && init.isKind(ts.SyntaxKind.ObjectLiteralExpression))
        result.push(
          ...handle(
            originalDocument,
            init as ObjectLiteralExpression,
            [declarationName],
            [declarationName],
          ),
        );
    }),
  );
  return result;
}
