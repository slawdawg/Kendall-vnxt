import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

const documents = [
  {
    label: "architecture index",
    path: "docs/architecture/index.md",
    relativeBase: "docs/architecture",
  },
  {
    label: "PRD index",
    path: "docs/prds/index.md",
    relativeBase: "docs/prds",
  },
  {
    label: "story index",
    path: "docs/stories/index.md",
    relativeBase: "docs/stories",
  },
  {
    label: "execution authority approval checkpoints",
    path: "docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md",
    relativeBase: "docs/architecture",
  },
  {
    label: "current gap review",
    path: "docs/architecture/kendall-vnxt-current-gap-review-2026-06-08.md",
    relativeBase: "docs/architecture",
  },
  {
    label: "fresh VM handoff",
    path: "docs/handoffs/codex-fresh-vm-orientation-2026-06-08.md",
    relativeBase: "docs/handoffs",
  },
];

const failures = [];
const successes = [];

function readDocument(document) {
  const absolutePath = join(rootDir, document.path);
  if (!existsSync(absolutePath)) {
    failures.push(`Missing required ${document.label}: ${document.path}`);
    return "";
  }

  successes.push(`Found ${document.label}.`);
  return readFileSync(absolutePath, "utf8");
}

function markdownReferences(content) {
  return Array.from(content.matchAll(/`([^`\n]+\.md)`/g), (match) => match[1]);
}

function resolveReference(document, reference) {
  const normalizedReference = normalize(reference);
  if (normalizedReference.startsWith("docs")) {
    return {
      displayPath: normalizedReference.replaceAll("\\", "/"),
      absolutePath: join(rootDir, normalizedReference),
    };
  }

  const displayPath = normalize(join(document.relativeBase, normalizedReference)).replaceAll("\\", "/");
  return {
    displayPath,
    absolutePath: join(rootDir, displayPath),
  };
}

function verifyMarkdownReferences(document, content) {
  const references = markdownReferences(content);
  for (const reference of references) {
    const resolved = resolveReference(document, reference);
    if (!existsSync(resolved.absolutePath)) {
      failures.push(`${document.path} references missing document: ${resolved.displayPath}`);
    }
  }

  successes.push(`${document.path} references ${references.length} existing Markdown documents.`);
}

function extractSection(content, heading) {
  const headingPrefix = `## ${heading}`;
  const startIndex = content.indexOf(headingPrefix);
  if (startIndex === -1) {
    return "";
  }

  const sectionStart = content.indexOf("\n", startIndex);
  if (sectionStart === -1) {
    return "";
  }

  const nextHeadingIndex = content.indexOf("\n## ", sectionStart + 1);
  return content.slice(sectionStart + 1, nextHeadingIndex === -1 ? undefined : nextHeadingIndex);
}

function storyReferencesFromSection(content, heading) {
  const section = extractSection(content, heading);
  return markdownReferences(section).map((reference) => {
    const basename = reference.split(/[\\/]/).pop();
    return basename ?? reference;
  });
}

const loadedDocuments = new Map();
for (const document of documents) {
  const content = readDocument(document);
  loadedDocuments.set(document.path, content);
  if (content) {
    verifyMarkdownReferences(document, content);
  }
}

const storyIndex = loadedDocuments.get("docs/stories/index.md") ?? "";
const approvalCheckpoints =
  loadedDocuments.get("docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md") ?? "";
const currentGapReview = loadedDocuments.get("docs/architecture/kendall-vnxt-current-gap-review-2026-06-08.md") ?? "";
const freshVmHandoff = loadedDocuments.get("docs/handoffs/codex-fresh-vm-orientation-2026-06-08.md") ?? "";

const blockedStoryIndexRefs = new Set(storyReferencesFromSection(storyIndex, "Blocked Pending Explicit Approval"));
const approvalCheckpointRefs = new Set(
  storyReferencesFromSection(approvalCheckpoints, "Current Blocked Execution Stories"),
);

for (const story of blockedStoryIndexRefs) {
  if (!approvalCheckpointRefs.has(story)) {
    failures.push(`Story index blocked story is missing from approval checkpoints: ${story}`);
  }
}

for (const story of approvalCheckpointRefs) {
  if (!blockedStoryIndexRefs.has(story)) {
    failures.push(`Approval checkpoint blocked story is missing from story index: ${story}`);
  }
}

if (blockedStoryIndexRefs.size === 0) {
  failures.push("Story index has no blocked execution-authority stories.");
} else {
  successes.push(`Blocked authority story list is consistent across ${blockedStoryIndexRefs.size} stories.`);
}

for (const currentGapText of [
  "Updated: 2026-06-09",
  "Story 3.40",
  "Managed recipe policy report",
  "Runbook managed recipe check-chain alignment",
  "stable controls-page report anchors",
  "larger coherent slices",
]) {
  if (!currentGapReview.includes(currentGapText)) {
    failures.push(`Current gap review must mention current safe-work evidence: ${currentGapText}`);
  }
}

if (currentGapReview.includes("Updated: 2026-06-08 after execution-authority Stories 2.1-2.8")) {
  failures.push("Current gap review must not retain stale Story 2.1-2.8-only update framing.");
}

for (const handoffText of ["larger coherent slices", "static drift checks", "Do not start blocked Ollama or subscription-agent authority stories"]) {
  if (!freshVmHandoff.includes(handoffText)) {
    failures.push(`Fresh VM handoff must mention current continuation guidance: ${handoffText}`);
  }
}

if (freshVmHandoff.includes("the next product slice should be the next explicit BMad story chosen by the operator")) {
  failures.push("Fresh VM handoff must not point continuation at stale explicit-BMad-story-only guidance.");
}

for (const message of successes) {
  console.log(`OK: ${message}`);
}

if (failures.length > 0) {
  for (const message of failures) {
    console.error(`FAIL: ${message}`);
  }
  process.exit(1);
}

console.log("Documentation index checks passed.");
