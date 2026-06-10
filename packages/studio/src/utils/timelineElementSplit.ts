// fallow-ignore-file dead-code
import type { TimelineElement } from "../player/store/playerStore";

export function canSplitElement(el: TimelineElement): boolean {
  return (
    !el.timelineLocked &&
    el.timingSource !== "implicit" &&
    !el.compositionSrc &&
    !!el.duration &&
    Number.isFinite(el.duration)
  );
}

export function buildPatchTarget(element: {
  domId?: string;
  selector?: string;
  selectorIndex?: number;
}) {
  if (element.domId) {
    return {
      id: element.domId,
      selector: element.selector,
      selectorIndex: element.selectorIndex,
    };
  }
  if (element.selector) {
    return { selector: element.selector, selectorIndex: element.selectorIndex };
  }
  return null;
}

export async function readFileContent(projectId: string, targetPath: string): Promise<string> {
  const response = await fetch(
    `/api/projects/${projectId}/files/${encodeURIComponent(targetPath)}`,
  );
  if (!response.ok) throw new Error(`Failed to read ${targetPath}`);
  const data = (await response.json()) as { content?: string };
  if (typeof data.content !== "string") throw new Error(`Missing file contents for ${targetPath}`);
  return data.content;
}
