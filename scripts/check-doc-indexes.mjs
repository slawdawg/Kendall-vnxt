import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

const documents = [
  {
    label: "README",
    path: "README.md",
    relativeBase: ".",
  },
  {
    label: "architecture index",
    path: "docs/architecture/index.md",
    relativeBase: "docs/architecture",
  },
  {
    label: "Linux install index",
    path: "docs/linux-install/index.md",
    relativeBase: "docs/linux-install",
  },
  {
    label: "product requirements boundary",
    path: "docs/workflows/product-requirements-boundary.md",
    relativeBase: "docs/workflows",
  },
  {
    label: "story index",
    path: "docs/workflows/implementation-evidence-boundary.md",
    relativeBase: "docs/workflows",
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
  const backtickedReferences = Array.from(content.matchAll(/`([^`\n]+\.md(?:#[^`\n]+)?)`/g), (match) => match[1]).filter(
    (reference) => reference.includes("/") || reference.startsWith("docs"),
  );
  const linkReferences = Array.from(content.matchAll(/\[[^\]\n]+\]\(([^)\n]+\.md(?:#[^)\n]+)?)\)/g), (match) => match[1]);
  return [...new Set([...backtickedReferences, ...linkReferences])];
}

function markdownLabelReferences(content) {
  return Array.from(content.matchAll(/`([^`\n]+\.md(?:#[^`\n]+)?)`/g), (match) => match[1]);
}

function resolveReference(document, reference) {
  const [referencePath, anchor] = reference.split("#");
  const normalizedReference = normalize(referencePath);
  if (normalizedReference.startsWith("docs")) {
    return {
      displayPath: normalizedReference.replaceAll("\\", "/"),
      absolutePath: join(rootDir, normalizedReference),
      anchor,
    };
  }

  const displayPath = normalize(join(document.relativeBase, normalizedReference)).replaceAll("\\", "/");
  return {
    displayPath,
    absolutePath: join(rootDir, displayPath),
    anchor,
  };
}

function headingSlug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function documentHeadingSlugs(content) {
  return new Set(
    Array.from(content.matchAll(/^#{1,6}\s+(.+)$/gm), (match) => headingSlug(match[1])).filter(Boolean),
  );
}

function verifyMarkdownReferences(document, content) {
  const references = markdownReferences(content);
  for (const reference of references) {
    const resolved = resolveReference(document, reference);
    if (!existsSync(resolved.absolutePath)) {
      failures.push(`${document.path} references missing document: ${resolved.displayPath}`);
      continue;
    }
    if (resolved.anchor) {
      const targetContent = readFileSync(resolved.absolutePath, "utf8");
      const anchors = documentHeadingSlugs(targetContent);
      if (!anchors.has(resolved.anchor)) {
        failures.push(`${document.path} references missing anchor ${resolved.displayPath}#${resolved.anchor}`);
      }
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
  return markdownLabelReferences(section).filter((reference) => !reference.includes("/")).map((reference) => {
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

const storyIndex = loadedDocuments.get("docs/workflows/implementation-evidence-boundary.md") ?? "";
const approvalCheckpoints =
  loadedDocuments.get("docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md") ?? "";
const currentGapReview = loadedDocuments.get("docs/architecture/kendall-vnxt-current-gap-review-2026-06-08.md") ?? "";

const blockedStoryIndexRefs = new Set(storyReferencesFromSection(storyIndex, "Blocked Authority Evidence"));
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
  "Story 3.65",
  "Managed recipe policy report",
  "GitHub workflow policy report",
  "Safe backlog delivery-hygiene guidance",
  "Safe backlog report anchors",
  "Delivery readiness policy report",
  "Delivery readiness policy drift check",
  "Maintenance readiness drift check",
  "Maintenance readiness evidence links",
  "Core readiness drift checks",
  "Execution boundary drift check",
  "Execution evidence drift check",
  "Provider fixture policy drift check",
  "Process lifecycle policy drift check",
  "Maintenance action plan report",
  "Maintenance action evidence links",
  "Maintenance action plan drift check",
  "Authority readiness matrix report",
  "Authority readiness matrix drift check",
  "Development runway report",
  "Development runway drift check",
  "Development runway readiness checks",
  "Development runway PR batching policy",
  "Development runway evidence links",
  "Runtime evidence review report",
  "Runtime evidence review drift check",
  "Runtime review evidence links",
  "Verification execution plan groups",
  "Work-item review queue shortcuts",
  "Verification handoff checkpoints",
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
