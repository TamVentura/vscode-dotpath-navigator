import path from "path";
import { QuickPickItem } from "vscode";
import { DotPathItem, DotPathResultItem } from "./interfaces/dot-path-item";
import { stringifyDotPath } from "./stringify-dotpath";

export function queryItems(query: string, items: DotPathItem[]) {
  const segs = query.split(".").filter((s) => s);
  const lastFrag = segs.pop() || "";
  const prefix = segs;
  const list: QuickPickItem[] = [];

  if (prefix.length > 0) {
    // children mode
    const nextSet: DotPathResultItem[] = [];
    items.forEach((it) => {
      const parts = it.rawPath.split(".");
      let matchLength = 0;
      // slide over parts to match prefix sequence
      for (let k = 0; k + prefix.length < parts.length; k++) {
        let match = true;
        for (let i = 0; i < prefix.length; i++) {
          if (parts[k + i] !== prefix[i]) {
            match = false;
            break;
          }
          matchLength = k;
        }
        if (!match) continue;
        // found prefix at parts[k..k+prefix.length-1]
        const candidate = parts[k + prefix.length];
        if (!lastFrag || candidate.startsWith(lastFrag)) {
          nextSet.push({ ...it, matchLength });
        }
      }
    });
    const sorted = Array.from(nextSet).sort((a, b) => {
      return b.matchLength - a.matchLength;
    });
    list.push(
      ...sorted.map((seg) => ({
        label: seg.rawPath,
        description: seg.uri.fsPath,
      })),
    );
  } else {
    // fuzzy suffix match
    const scored: Array<{ item: DotPathItem; score: number }> = [];
    items.forEach((it) => {
      const parts = it.rawPath.split(".");
      // try matching entire segs sequence as suffix
      if (segs.length > 0) return; // not in fuzzy when prefix present
      // only one seg: lastFrag
      const idx = parts.findIndex((_, i) =>
        parts.slice(i).join(".").startsWith(lastFrag),
      );
      if (idx >= 0) {
        const score = parts.length - idx;
        scored.push({ item: it, score });
      }
    });
    scored.sort((a, b) => a.score - b.score);
    scored.forEach((s) =>
      list.push({
        label: s.item.rawPath,
        description: path.basename(s.item.uri.fsPath),
      }),
    );
  }
  // create option last
  if (query) {
    const info = findCreateInfo(items, query);
    if (info.length > 0)
      info.forEach((infoEntry) => {
        list.push({
          label: `Create: ${query}`,
          description: `In ${infoEntry.parent.uri.path}`,
          detail: JSON.stringify({
            parent: stringifyDotPath(infoEntry.parent),
            missing: infoEntry.missing,
          }),
        });
      });
  }
  return list;
}

function findCreateInfo(
  items: DotPathItem[],
  q: string,
): { parent: DotPathItem; missing: string[] }[] {
  const parts = q.split(".");
  let results: { parent: DotPathItem; missing: string[] }[] = [];

  for (let i = parts.length - 1; i > 0; i--) {
    const key = parts.slice(0, i).join(".");
    const matches = items.filter((it) => it.rawPath === key);

    for (const match of matches) {
      const result = { parent: match, missing: parts.slice(i) };
      const existingResult = results.find(
        (r) => r.parent.uri.path === result.parent.uri.path,
      );
      if (
        existingResult &&
        existingResult.missing.length > result.missing.length
      ) {
        const existingIndex = results.findIndex((r) => r === existingResult);
        results[existingIndex] = result;
      } else if (!existingResult) {
        results.push(result);
      }
    }
  }

  const key = parts.join(".");
  const matches = items.filter((it) => it.rawPath === key);
  if (matches.length > 0) {
    for (const match of matches) {
      results = results.filter((r) => r.parent.uri.path !== match.uri.path);
    }
  }
  return results;
}
