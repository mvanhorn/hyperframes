import { useCallback, useRef } from "react";
import type { TimelineElement } from "../player";
import { usePlayerStore } from "../player";
import { saveProjectFilesWithHistory } from "../utils/studioFileHistory";
import { getTimelineElementLabel, collectHtmlIds } from "../utils/studioHelpers";
import { canSplitElement, buildPatchTarget, readFileContent } from "../utils/timelineElementSplit";
import type { RecordEditInput } from "./useTimelineEditing";

interface UseRazorSplitOptions {
  projectId: string | null;
  activeCompPath: string | null;
  showToast: (message: string, tone?: "error" | "info") => void;
  writeProjectFile: (path: string, content: string) => Promise<void>;
  recordEdit: (input: RecordEditInput) => Promise<void>;
  domEditSaveTimestampRef: React.MutableRefObject<number>;
  reloadPreview: () => void;
}

function generateSplitId(existingIds: string[], baseId: string): string {
  let newId = `${baseId}-split`;
  let suffix = 2;
  while (existingIds.includes(newId)) {
    newId = `${baseId}-split-${suffix++}`;
  }
  return newId;
}

async function splitHtmlElement(
  projectId: string,
  targetPath: string,
  patchTarget: NonNullable<ReturnType<typeof buildPatchTarget>>,
  splitTime: number,
  newId: string,
): Promise<{ ok: boolean; content?: string }> {
  const response = await fetch(
    `/api/projects/${projectId}/file-mutations/split-element/${encodeURIComponent(targetPath)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: patchTarget, splitTime, newId }),
    },
  );
  if (!response.ok) throw new Error("Split request failed");
  return (await response.json()) as { ok: boolean; changed?: boolean; content?: string };
}

async function splitGsapAnimations(
  projectId: string,
  targetPath: string,
  originalId: string,
  newId: string,
  splitTime: number,
  elementStart: number,
  elementDuration: number,
): Promise<string | null> {
  const response = await fetch(
    `/api/projects/${projectId}/gsap-mutations/${encodeURIComponent(targetPath)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "split-animations",
        originalId,
        newId,
        splitTime,
        elementStart,
        elementDuration,
      }),
    },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { ok?: boolean; after?: string };
  return data.ok && data.after ? data.after : null;
}

// fallow-ignore-next-line complexity
async function executeSplit(
  pid: string,
  element: TimelineElement,
  splitTime: number,
  activeCompPath: string | null,
): Promise<{ targetPath: string; originalContent: string; patchedContent: string }> {
  const patchTarget = buildPatchTarget(element);
  if (!patchTarget) throw new Error("Clip is missing a patchable target.");

  const targetPath = element.sourceFile || activeCompPath || "index.html";
  const originalContent = await readFileContent(pid, targetPath);
  const newId = generateSplitId(collectHtmlIds(originalContent), element.domId || "clip");

  const splitResult = await splitHtmlElement(pid, targetPath, patchTarget, splitTime, newId);
  if (!splitResult.ok) throw new Error("Failed to split clip.");

  let patchedContent =
    typeof splitResult.content === "string" ? splitResult.content : originalContent;

  if (element.domId) {
    const gsapContent = await splitGsapAnimations(
      pid,
      targetPath,
      element.domId,
      newId,
      splitTime,
      element.start,
      element.duration,
    );
    if (gsapContent) patchedContent = gsapContent;
  }

  return { targetPath, originalContent, patchedContent };
}

export function useRazorSplit({
  projectId,
  activeCompPath,
  showToast,
  writeProjectFile,
  recordEdit,
  domEditSaveTimestampRef,
  reloadPreview,
}: UseRazorSplitOptions) {
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  const handleRazorSplit = useCallback(
    // fallow-ignore-next-line complexity
    async (element: TimelineElement, splitTime: number) => {
      const pid = projectIdRef.current;
      if (!pid || !canSplitElement(element)) return;
      if (splitTime <= element.start || splitTime >= element.start + element.duration) return;

      try {
        const { targetPath, originalContent, patchedContent } = await executeSplit(
          pid,
          element,
          splitTime,
          activeCompPath,
        );

        domEditSaveTimestampRef.current = Date.now();
        await saveProjectFilesWithHistory({
          projectId: pid,
          label: "Split timeline clip",
          kind: "timeline",
          files: { [targetPath]: patchedContent },
          readFile: async () => originalContent,
          writeFile: writeProjectFile,
          recordEdit,
        });

        reloadPreview();
        showToast(`Split ${getTimelineElementLabel(element)} at ${splitTime.toFixed(2)}s`, "info");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to split timeline clip";
        showToast(message, "error");
      }
    },
    [
      activeCompPath,
      recordEdit,
      showToast,
      writeProjectFile,
      domEditSaveTimestampRef,
      reloadPreview,
    ],
  );

  const handleRazorSplitAll = useCallback(
    async (splitTime: number) => {
      const pid = projectIdRef.current;
      if (!pid) return;
      const { elements } = usePlayerStore.getState();
      const splittable = elements.filter(
        (el) => canSplitElement(el) && splitTime > el.start && splitTime < el.start + el.duration,
      );
      for (const element of splittable) {
        await handleRazorSplit(element, splitTime);
      }
    },
    [handleRazorSplit],
  );

  return { handleRazorSplit, handleRazorSplitAll };
}
