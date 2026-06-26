"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import type { PipelineStage } from "@kendall/contracts";
import type {
  PipelineFixturePacket,
  PipelineFixtureScenario,
  PipelineGoldenPathSnapshot,
  SourceBoundaryDeclarationV0,
  PipelineSourceRailItem,
} from "../../lib/pipeline-fixtures";
import { evaluateFixtureActionDecision } from "../../lib/pipeline-fixtures";
import { StageLane } from "./stage-lane";

const pipelineStages: PipelineStage[] = [
  "capture",
  "classify",
  "route",
  "shape",
  "human_gate",
  "execute",
  "review",
  "promote",
  "deliver",
  "learn",
];

const drawerTabs = [
  { id: "intent", label: "5 Whys" },
  { id: "sources", label: "Sources" },
  { id: "route", label: "Route" },
  { id: "stage", label: "Status" },
  { id: "gates", label: "Decision" },
  { id: "evidence", label: "Proof" },
  { id: "worker", label: "Workers" },
  { id: "memory", label: "Memory" },
  { id: "alpha", label: "Safety" },
  { id: "recovery", label: "Recovery" },
] as const;

type DrawerTabId = (typeof drawerTabs)[number]["id"];

export function PipelineCockpit({
  fixtureMode,
  goldenPathSnapshots,
  packets,
  scenarios,
  selectedPacket,
  sourceBoundaries,
  sources,
}: {
  fixtureMode: { label: string; summary: string; matrixRows: number; fixtureCatalogEntries: number };
  goldenPathSnapshots: PipelineGoldenPathSnapshot[];
  packets: PipelineFixturePacket[];
  scenarios: PipelineFixtureScenario[];
  selectedPacket: PipelineFixturePacket;
  sourceBoundaries: SourceBoundaryDeclarationV0[];
  sources: PipelineSourceRailItem[];
}) {
  const [selectedPacketId, setSelectedPacketId] = useState(selectedPacket.packetId);
  const [selectedGateActionId, setSelectedGateActionId] = useState<string | null>(null);
  const [selectedGateFixtureEventId, setSelectedGateFixtureEventId] = useState<string | null>(null);
  const [expandedGateActionId, setExpandedGateActionId] = useState<string | null>(null);
  const [selectedRecoveryActionId, setSelectedRecoveryActionId] = useState<string | null>(null);
  const [selectedRecoveryFixtureEventId, setSelectedRecoveryFixtureEventId] = useState<string | null>(null);
  const [expandedRecoveryActionId, setExpandedRecoveryActionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DrawerTabId>("intent");
  const [searchQuery, setSearchQuery] = useState("");
  const packetCardRefs = useRef(new Map<string, HTMLElement>());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const visiblePackets = useMemo(
    () =>
      normalizedSearchQuery.length === 0
        ? packets
        : packets.filter((packet) => searchablePacketText(packet).includes(normalizedSearchQuery)),
    [normalizedSearchQuery, packets]
  );
  const orderedPacketIds = useMemo(
    () => pipelineStages.flatMap((stage) => visiblePackets.filter((packet) => packet.currentStage === stage).map((packet) => packet.packetId)),
    [visiblePackets]
  );
  const visibleSelectedPacketId = orderedPacketIds.includes(selectedPacketId) ? selectedPacketId : orderedPacketIds[0] ?? selectedPacketId;
  const activePacket = useMemo(
    () => packets.find((packet) => packet.packetId === visibleSelectedPacketId) ?? selectedPacket,
    [packets, selectedPacket, visibleSelectedPacketId]
  );
  const activeGoldenSnapshot = useMemo(
    () => goldenPathSnapshots.find((snapshot) => snapshot.packetId === activePacket.packetId) ?? null,
    [activePacket.packetId, goldenPathSnapshots]
  );
  const activeSelectedGateActionId = activePacket.humanGateActions.some((action) => action.actionId === selectedGateActionId)
    ? selectedGateActionId
    : null;
  const activeSelectedGateFixtureEventId = activePacket.humanGateFixtureEvents.some((event) => event.eventId === selectedGateFixtureEventId)
    ? selectedGateFixtureEventId
    : null;
  const activeExpandedGateActionId = activePacket.humanGateActions.some((action) => action.actionId === expandedGateActionId)
    ? expandedGateActionId
    : null;
  const activeSelectedRecoveryActionId = activePacket.recoveryActions.some((action) => action.actionId === selectedRecoveryActionId)
    ? selectedRecoveryActionId
    : null;
  const activeSelectedRecoveryFixtureEventId = activePacket.recoveryFixtureEvents.some((event) => event.eventId === selectedRecoveryFixtureEventId)
    ? selectedRecoveryFixtureEventId
    : null;
  const activeExpandedRecoveryActionId = activePacket.recoveryActions.some((action) => action.actionId === expandedRecoveryActionId)
    ? expandedRecoveryActionId
    : null;
  const activeCount = packets.filter((packet) => packet.status === "active").length;
  const blockedGateCount = packets.filter((packet) => packet.currentStage === "human_gate").length;
  const topBlockedPacket = findTopBlockedPacket(packets);
  const globalRecoveryCount = packets.flatMap((packet) => packet.recoveryActions).filter((action) => action.availability === "available").length;
  const primaryLocalModelHealth = packets.find((packet) => packet.localModelHealth !== null)?.localModelHealth ?? null;
  const registerPacketCard = useCallback((packetId: string, node: HTMLElement | null) => {
    if (node) {
      packetCardRefs.current.set(packetId, node);
      return;
    }
    packetCardRefs.current.delete(packetId);
  }, []);
  const focusPacketCard = useCallback((packetId: string) => {
    requestAnimationFrame(() => {
      packetCardRefs.current.get(packetId)?.focus();
    });
  }, []);
  const movePacketFocus = useCallback(
    (packetId: string, direction: "previous" | "next") => {
      const currentIndex = orderedPacketIds.indexOf(packetId);
      if (currentIndex === -1 || orderedPacketIds.length === 0) {
        return;
      }
      const offset = direction === "next" ? 1 : -1;
      const nextIndex = (currentIndex + offset + orderedPacketIds.length) % orderedPacketIds.length;
      const nextPacketId = orderedPacketIds[nextIndex];
      setSelectedPacketId(nextPacketId);
      focusPacketCard(nextPacketId);
    },
    [focusPacketCard, orderedPacketIds]
  );
  const returnFocusToSelectedPacket = useCallback(() => {
    setActiveTab("intent");
    focusPacketCard(visibleSelectedPacketId);
  }, [focusPacketCard, visibleSelectedPacketId]);
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      const nextQuery = value.trim().toLowerCase();
      if (nextQuery.length === 0) {
        return;
      }
      const nextVisiblePackets = packets.filter((packet) => searchablePacketText(packet).includes(nextQuery));
      if (nextVisiblePackets.length > 0 && !nextVisiblePackets.some((packet) => packet.packetId === selectedPacketId)) {
        setSelectedPacketId(nextVisiblePackets[0].packetId);
      }
    },
    [packets, selectedPacketId]
  );
  const focusSearchFromShortcut = useCallback((event: {
    code: string;
    key: string;
    preventDefault: () => void;
    target: EventTarget | null;
  }) => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }
    const editableTarget = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
    if ((event.key === "/" || event.code === "Slash") && !editableTarget) {
      event.preventDefault();
      searchInputRef.current?.focus();
    }
  }, []);
  const handleCockpitKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    focusSearchFromShortcut(event);
  }, [focusSearchFromShortcut]);

  useEffect(() => {
    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      focusSearchFromShortcut(event);
    };
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown);
  }, [focusSearchFromShortcut]);

  return (
    <main className="grid max-w-full min-w-0 gap-4 overflow-x-hidden" aria-label="Pipeline cockpit" onKeyDown={handleCockpitKeyDown}>
      <section aria-label="Refined pipeline cockpit frame" className="grid max-w-full min-w-0 gap-3">
        <section
          aria-label="Cockpit first-frame hierarchy"
          className="grid min-h-[34rem] max-w-full min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-3 rounded-[0.5rem] border bg-[var(--surface)] p-3"
        >
          <section
            aria-label="Pipeline command strip"
            className="grid max-w-full min-w-0 gap-3 rounded-[0.5rem] border bg-[var(--panel)] p-3 lg:grid-cols-[minmax(0,1.35fr)_repeat(5,minmax(8.5rem,0.7fr))]"
          >
            <div aria-label="Operator command center" className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-[var(--accent)]">Chief-of-Staff cockpit</p>
                <span className="inline-flex rounded-full bg-[var(--background-elevated)] px-2 py-0.5 text-xs text-[var(--muted)]">
                  Current mode
                </span>
                <span className="inline-flex rounded-full bg-[var(--background-elevated)] px-2 py-0.5 text-xs text-[var(--muted)]">
                  Refined first frame
                </span>
                <span className="inline-flex rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-xs text-[var(--muted)]">
                  {fixtureMode.label}
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal">Pipeline cockpit</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
                {fixtureMode.summary}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                <span className="rounded-[0.375rem] bg-[var(--surface-strong)] px-2 py-1">Decision queue</span>
                <span className="rounded-[0.375rem] bg-[var(--surface-strong)] px-2 py-1">Source intelligence</span>
                <span className="rounded-[0.375rem] bg-[var(--surface-strong)] px-2 py-1">Stage board</span>
                <span className="rounded-[0.375rem] bg-[var(--surface-strong)] px-2 py-1">Active packet</span>
                <span className="rounded-[0.375rem] bg-[var(--surface-strong)] px-2 py-1">Worker / review / memory / recovery</span>
              </div>
              <label className="mt-3 block text-xs font-medium text-[var(--muted)]" htmlFor="pipeline-packet-search">
                Packet search
              </label>
              <input
                aria-label="Packet search"
                className="mt-1 w-full min-w-0 rounded-[0.375rem] border bg-[var(--surface)] px-2 py-1.5 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]"
                id="pipeline-packet-search"
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder="Search packets"
                ref={searchInputRef}
                type="search"
                value={searchQuery}
              />
            </div>
            <Metric label="Active packets" value={String(activeCount)} />
            <Metric label="Blocked gates" value={String(blockedGateCount)} />
            <Metric label="Provider approval" value="disabled" />
            <Metric label="Top blocked packet" value={topBlockedPacket?.title ?? "None"} />
            <Metric label="Global recovery" value={`${globalRecoveryCount} fixture-only`} />
          </section>

      {primaryLocalModelHealth ? (
        <section aria-label="Local GPU health" className="max-w-full min-w-0">
          <LocalGpuCard health={primaryLocalModelHealth} />
        </section>
      ) : null}

      <FixtureScenarioSelector scenarios={scenarios} />

      <GoldenPathLifecycle
        activePacketId={activePacket.packetId}
        onSelectPacket={setSelectedPacketId}
        snapshots={goldenPathSnapshots}
      />

      <section className="grid max-w-full min-w-0 gap-4 lg:grid-cols-[13.75rem_minmax(0,1fr)] xl:grid-cols-[13.75rem_minmax(0,1fr)_22.5rem]">
        <details aria-label="Pipeline source rail collapsed" className="min-w-0 rounded-[0.5rem] border bg-[var(--surface)] p-3 xl:hidden">
          <summary className="cursor-pointer text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]">
            Source rail collapsed
          </summary>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            {sources.length} sources available. Open to inspect source trust, evidence notes, and canonical roles.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {sources.map((source) => (
              <article key={source.id} className="min-w-0 rounded-[0.5rem] border bg-[var(--panel)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="break-words text-sm font-medium">{source.label}</h3>
                  <span className="shrink-0 rounded-full bg-[var(--background-elevated)] px-2 py-0.5 text-xs text-[var(--muted)]">
                    {source.state}
                  </span>
                </div>
                <p className="mt-2 break-words text-xs leading-5 text-[var(--muted)]">{source.summary}</p>
              </article>
            ))}
          </div>
        </details>

        <aside aria-label="Pipeline source rail" className="hidden min-w-0 rounded-[0.5rem] border bg-[var(--surface)] p-3 xl:block">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Source rail</h2>
            <span className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5 text-xs">{sources.length}</span>
          </div>
          <div className="mt-3 space-y-2">
            {sources.map((source) => (
              <article key={source.id} className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-medium">{source.label}</h3>
                  <span className="rounded-full bg-[var(--background-elevated)] px-2 py-0.5 text-xs text-[var(--muted)]">
                    {source.state}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{source.summary}</p>
                <dl className="mt-3 grid gap-2 text-xs">
                  <SourceField label="Packet refs" value={source.packetRefs.length > 0 ? source.packetRefs.join(", ") : "none"} />
                  <SourceField label="Evidence" value={source.evidenceNote} />
                  <SourceField label="Role" value={source.canonicalRole} />
                </dl>
              </article>
            ))}
          </div>
        </aside>

        <section
          aria-label="Pipeline board"
          className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-[0.5rem] border bg-[var(--background-elevated)] p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]"
          tabIndex={0}
        >
          <div className="flex min-w-max snap-x snap-mandatory gap-3">
            {pipelineStages.map((stage) => (
              <StageLane
                key={stage}
                name={stage}
                packets={visiblePackets.filter((packet) => packet.currentStage === stage)}
                selectedPacketId={activePacket.packetId}
                registerPacketCard={registerPacketCard}
                onMovePacketFocus={movePacketFocus}
                onReturnFocus={returnFocusToSelectedPacket}
                onSelectPacket={setSelectedPacketId}
              />
            ))}
          </div>
        </section>

        <div aria-label="Worker review memory recovery rail" className="grid min-w-0 gap-3 lg:col-span-2 xl:col-span-1">
          <div className="rounded-[0.5rem] border bg-[var(--surface)] p-3">
            <p className="text-xs font-semibold text-[var(--accent)]">Worker / review / memory / recovery</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Active packet context keeps worker state, Claude review, memory proposal, Human Gate, and recovery evidence in one rail.
            </p>
          </div>
          <ActivePacketDrawer
            activeTab={activeTab}
            expandedGateActionId={activeExpandedGateActionId}
            expandedRecoveryActionId={activeExpandedRecoveryActionId}
            onReturnFocus={returnFocusToSelectedPacket}
            packet={activePacket}
            snapshot={activeGoldenSnapshot}
            selectedGateActionId={activeSelectedGateActionId}
            selectedGateFixtureEventId={activeSelectedGateFixtureEventId}
            selectedRecoveryActionId={activeSelectedRecoveryActionId}
            selectedRecoveryFixtureEventId={activeSelectedRecoveryFixtureEventId}
            setExpandedGateActionId={setExpandedGateActionId}
            setExpandedRecoveryActionId={setExpandedRecoveryActionId}
            setSelectedGateActionId={setSelectedGateActionId}
            setSelectedGateFixtureEventId={setSelectedGateFixtureEventId}
            setSelectedRecoveryActionId={setSelectedRecoveryActionId}
            setSelectedRecoveryFixtureEventId={setSelectedRecoveryFixtureEventId}
            setActiveTab={setActiveTab}
          />
        </div>
      </section>

      <section aria-label="Pipeline evidence strip" className="grid gap-3 rounded-[0.5rem] border bg-[var(--panel)] p-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2 xl:col-span-4">
          <p className="text-xs font-semibold text-[var(--accent)]">Evidence runway</p>
        </div>
        <EvidenceGroup title="Evidence" values={activePacket.evidenceRefs.map((ref) => ref.label)} />
        <EvidenceGroup title="Artifacts" values={activePacket.artifactRefs.map((ref) => ref.label)} />
        <EvidenceGroup title="Lane cards" values={activePacket.laneCards.map((lane) => `${lane.label}: ${lane.status}`)} />
        <EvidenceGroup
          title="Memory"
          values={
            packets.flatMap((packet) =>
              packet.memoryProposals.map((proposal) => `${proposal.label}: ${proposal.status}; write-back blocked`)
            )
          }
        />
      </section>

      <section aria-label="Source Boundary Checklist" className="rounded-[0.5rem] border bg-[var(--panel)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[var(--accent)]">Source Boundary Checklist</p>
            <h2 className="mt-1 text-lg font-semibold">Canonicality and blocked operations</h2>
          </div>
          <span className="rounded-full bg-[var(--background-elevated)] px-2 py-1 text-xs text-[var(--muted)]">fixture-only</span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {sourceBoundaries.map((boundary) => <SourceBoundaryCard boundary={boundary} key={boundary.boundaryId} />)}
        </div>
      </section>
        </section>
      </section>
    </main>
  );
}

function FixtureScenarioSelector({ scenarios }: { scenarios: PipelineFixtureScenario[] }) {
  return (
    <section aria-label="Fixture scenario selector" className="min-w-0 rounded-[0.5rem] border bg-[var(--panel)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[var(--accent)]">Static fixture selector</p>
          <h2 className="mt-1 text-lg font-semibold">Failure and prototype scenarios</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Read-only static import mode. Scenario switching is validation context only; it does not mutate supervisor state or imply live execution.
            Mocked, synthetic, prototype-only, and bounded states stay labeled before any real runtime expansion.
          </p>
        </div>
        <span className="rounded-full bg-[var(--background-elevated)] px-2 py-1 text-xs text-[var(--muted)]">
          {scenarios.length} scenarios
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {scenarios.map((scenario) => (
          <article className="min-w-0 rounded-[0.5rem] border bg-[var(--surface)] p-3" key={scenario.scenarioId}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="break-words text-sm font-semibold">{scenario.label}</h3>
              <span className="max-w-[8rem] shrink rounded-full bg-[var(--panel-strong)] px-2 py-0.5 text-right text-xs text-[var(--muted)]" style={{ overflowWrap: "anywhere" }}>
                {scenario.fixtureLabel}
              </span>
            </div>
            <dl className="mt-3 grid gap-2 text-xs">
              <ScenarioField label="Selected packet" value={scenario.selectedPacketId ?? "none"} />
              <ScenarioField label="Current owner" value={scenario.currentOwner} />
              <ScenarioField label="Blocked reason" value={scenario.blockedReason} />
              <ScenarioField label="Next operator option" value={scenario.nextOperatorOption} />
              <ScenarioField label="Evidence refs" value={scenario.evidenceRefs.length > 0 ? scenario.evidenceRefs.join(", ") : "none"} />
              <ScenarioField label="Stop-line" value={scenario.stopLine} />
              <ScenarioField label="Rollback path" value={scenario.rollbackPath} />
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function ScenarioField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="mt-0.5 break-words" style={{ overflowWrap: "anywhere" }}>{value}</dd>
    </div>
  );
}

function GoldenPathLifecycle({
  activePacketId,
  onSelectPacket,
  snapshots,
}: {
  activePacketId: string;
  onSelectPacket: (packetId: string) => void;
  snapshots: PipelineGoldenPathSnapshot[];
}) {
  return (
    <section aria-label="Golden path lifecycle" className="min-w-0 rounded-[0.5rem] border bg-[var(--panel)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[var(--accent)]">Read-only golden path</p>
          <h2 className="mt-1 text-lg font-semibold">Packet lifecycle snapshots</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Local fixture selection only. Snapshot stepping updates the active drawer locally and does not mutate backend state, Work Packet persistence, providers, workers, GitHub, or Obsidian.
          </p>
        </div>
        <span className="rounded-full bg-[var(--background-elevated)] px-2 py-1 text-xs text-[var(--muted)]">
          {snapshots.length} snapshots
        </span>
      </div>
      <div className="mt-3 flex max-w-full min-w-0 gap-2 overflow-x-auto pb-1">
        {snapshots.map((snapshot) => (
          <button
            aria-label={`Golden path snapshot: ${snapshot.label}`}
            aria-pressed={activePacketId === snapshot.packetId}
            className={`w-[13rem] shrink-0 rounded-[0.5rem] border p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)] ${activePacketId === snapshot.packetId ? "border-[var(--accent)] bg-[var(--panel-strong)]" : "bg-[var(--surface)]"}`}
            key={snapshot.snapshotId}
            onClick={() => onSelectPacket(snapshot.packetId)}
            type="button"
          >
            <span className="text-xs font-semibold text-[var(--accent)]">{snapshot.label}</span>
            <span className="mt-1 block break-words text-sm font-semibold">{snapshot.whatPacketIs}</span>
            <span className="mt-2 block text-xs text-[var(--muted)]" style={{ overflowWrap: "anywhere" }}>Stage: {snapshot.currentStage}</span>
            <span className="mt-1 block text-xs text-[var(--muted)]" style={{ overflowWrap: "anywhere" }}>Owner: {snapshot.currentOwner}</span>
            <span className="mt-1 block break-words text-xs text-[var(--muted)]">Evidence: {snapshot.evidenceRef}</span>
            <span className="mt-1 block break-words text-xs text-[var(--muted)]">Next: {snapshot.nextAction}</span>
            <span className="mt-2 block break-words rounded-[0.375rem] bg-[var(--background-elevated)] px-2 py-1 text-xs">
              Decision consequence: {snapshot.decisionConsequence}
            </span>
            <span className="mt-2 block break-words text-xs text-[var(--muted)]">Why here: {snapshot.whyHere}</span>
            <span className="mt-1 block break-words text-xs text-[var(--muted)]">Needs operator: {snapshot.whatNeedsOperator}</span>
            <span className="mt-1 block break-words text-xs text-[var(--muted)]">What happens next: {snapshot.whatHappensNext}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ActivePacketDrawer({
  activeTab,
  expandedGateActionId,
  expandedRecoveryActionId,
  onReturnFocus,
  packet,
  snapshot,
  selectedGateActionId,
  selectedGateFixtureEventId,
  selectedRecoveryActionId,
  selectedRecoveryFixtureEventId,
  setExpandedGateActionId,
  setExpandedRecoveryActionId,
  setSelectedGateActionId,
  setSelectedGateFixtureEventId,
  setSelectedRecoveryActionId,
  setSelectedRecoveryFixtureEventId,
  setActiveTab,
}: {
  activeTab: DrawerTabId;
  expandedGateActionId: string | null;
  expandedRecoveryActionId: string | null;
  onReturnFocus: () => void;
  packet: PipelineFixturePacket;
  snapshot: PipelineGoldenPathSnapshot | null;
  selectedGateActionId: string | null;
  selectedGateFixtureEventId: string | null;
  selectedRecoveryActionId: string | null;
  selectedRecoveryFixtureEventId: string | null;
  setExpandedGateActionId: (actionId: string | null) => void;
  setExpandedRecoveryActionId: (actionId: string | null) => void;
  setSelectedGateActionId: (actionId: string | null) => void;
  setSelectedGateFixtureEventId: (eventId: string | null) => void;
  setSelectedRecoveryActionId: (actionId: string | null) => void;
  setSelectedRecoveryFixtureEventId: (eventId: string | null) => void;
  setActiveTab: (tab: DrawerTabId) => void;
}) {
  const focusDrawerTab = useCallback((tabId: DrawerTabId) => {
    requestAnimationFrame(() => {
      document.getElementById(`packet-drawer-tab-${tabId}`)?.focus();
    });
  }, []);
  const moveDrawerTab = useCallback(
    (tabId: DrawerTabId, direction: "previous" | "next" | "first" | "last") => {
      const currentIndex = drawerTabs.findIndex((tab) => tab.id === tabId);
      const nextIndex =
        direction === "first"
          ? 0
          : direction === "last"
            ? drawerTabs.length - 1
            : (currentIndex + (direction === "next" ? 1 : -1) + drawerTabs.length) % drawerTabs.length;
      const nextTab = drawerTabs[nextIndex];
      setActiveTab(nextTab.id);
      focusDrawerTab(nextTab.id);
    },
    [focusDrawerTab, setActiveTab]
  );

  return (
    <aside
      aria-label="Active packet drawer"
      className="min-w-0 rounded-[0.5rem] border bg-[var(--panel)] p-4 lg:col-span-2 xl:col-span-1"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onReturnFocus();
        }
      }}
    >
      <p className="text-xs font-semibold text-[var(--accent-2)]">Active packet drawer</p>
      <h2 className="mt-1 break-words text-lg font-semibold">{packet.title}</h2>
      <p className="mt-2 break-words text-sm leading-6 text-[var(--muted)]">{snapshot?.whatPacketIs ?? packet.summary}</p>
      <div aria-label="Packet drawer tabs" className="mt-4 flex flex-wrap gap-2" role="tablist">
        {drawerTabs.map((tab) => (
          <button
            aria-controls={`packet-drawer-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className={`rounded-[0.375rem] border px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)] ${activeTab === tab.id ? "border-[var(--accent)] bg-[var(--panel-strong)]" : "bg-[var(--surface)] text-[var(--muted)]"}`}
            id={`packet-drawer-tab-${tab.id}`}
            key={tab.id}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                moveDrawerTab(tab.id, "next");
              }
              if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                moveDrawerTab(tab.id, "previous");
              }
              if (event.key === "Home") {
                event.preventDefault();
                moveDrawerTab(tab.id, "first");
              }
              if (event.key === "End") {
                event.preventDefault();
                moveDrawerTab(tab.id, "last");
              }
            }}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <section
        aria-labelledby={`packet-drawer-tab-${activeTab}`}
        className="mt-4 rounded-[0.5rem] border bg-[var(--surface)] p-3"
        id={`packet-drawer-${activeTab}`}
        role="tabpanel"
      >
        {renderDrawerTab(
          activeTab,
          packet,
          snapshot,
          expandedGateActionId,
          expandedRecoveryActionId,
          selectedGateActionId,
          selectedGateFixtureEventId,
          selectedRecoveryActionId,
          selectedRecoveryFixtureEventId,
          setExpandedGateActionId,
          setExpandedRecoveryActionId,
          setSelectedGateActionId,
          setSelectedGateFixtureEventId,
          setSelectedRecoveryActionId,
          setSelectedRecoveryFixtureEventId
        )}
      </section>
    </aside>
  );
}

function renderDrawerTab(
  activeTab: DrawerTabId,
  packet: PipelineFixturePacket,
  snapshot: PipelineGoldenPathSnapshot | null,
  expandedGateActionId: string | null,
  expandedRecoveryActionId: string | null,
  selectedGateActionId: string | null,
  selectedGateFixtureEventId: string | null,
  selectedRecoveryActionId: string | null,
  selectedRecoveryFixtureEventId: string | null,
  setExpandedGateActionId: (actionId: string | null) => void,
  setExpandedRecoveryActionId: (actionId: string | null) => void,
  setSelectedGateActionId: (actionId: string | null) => void,
  setSelectedGateFixtureEventId: (eventId: string | null) => void,
  setSelectedRecoveryActionId: (actionId: string | null) => void,
  setSelectedRecoveryFixtureEventId: (eventId: string | null) => void
) {
  switch (activeTab) {
    case "intent":
      return <PacketFiveWhysPanel packet={packet} snapshot={snapshot} />;
    case "sources":
      return (
        <DrawerSection title="Sources">
          <p className="break-words text-xs leading-5 text-[var(--muted)]">{packet.sourceTrustSummary}</p>
          <RefList values={packet.sourceRefs.map((ref) => `${ref.label}; ${ref.sourceType}; ${ref.freshness}; ${ref.accessState}; summary-only ${String(ref.summaryOnly)}`)} />
        </DrawerSection>
      );
    case "route":
      return <RouteForkPanel packet={packet} />;
    case "stage":
      return (
        <DrawerSection title="Current stage">
          <FieldGrid
            fields={[
              ["Stage", packet.currentStage],
              ["Owner", packet.currentOwner],
              ["Source trust", packet.sourceTrustStates.join(", ")],
              ["Confidence", packet.confidenceLabel],
              ["Freshness", packet.freshnessLabel],
            ]}
          />
        </DrawerSection>
      );
    case "gates":
      return (
        <DrawerSection title="Human Gate context">
          <HumanGateConsequencePanel
            expandedGateActionId={expandedGateActionId}
            packet={packet}
            selectedGateActionId={selectedGateActionId}
            selectedGateFixtureEventId={selectedGateFixtureEventId}
            setExpandedGateActionId={setExpandedGateActionId}
            setSelectedGateActionId={setSelectedGateActionId}
            setSelectedGateFixtureEventId={setSelectedGateFixtureEventId}
          />
        </DrawerSection>
      );
    case "evidence":
      return (
        <DrawerSection title="Evidence links">
          <EvidenceDetailList
            items={[
              ...packet.sourceRefs.map((ref) => ({
                key: ref.refId,
                whatExists: ref.label,
                whyItMatters: sourceRefImportance(ref.sourceType, packet),
                whereFrom: `${ref.sourceType}; ${sourcePathLabel(ref)}`,
                retention: ref.summaryOnly ? "summary-only source ref" : "metadata source ref",
                state: `${ref.freshness}; ${ref.accessState}; ${packet.sourceTrustStates.join(", ")}`,
              })),
              ...packet.evidenceRefs.map((ref) => ({
                key: ref.refId,
                whatExists: ref.label,
                whyItMatters: evidenceRefImportance(ref.evidenceType, packet),
                whereFrom: ref.artifactPath ?? "fixture evidence ref",
                retention: ref.retentionClass,
                state: `payload retained ${String(ref.rawPayloadRetained)}; ${packet.fixtureKind}`,
              })),
              ...packet.artifactRefs.map((ref) => ({
                key: ref.refId,
                whatExists: ref.label,
                whyItMatters: artifactRefImportance(ref.artifactType, packet),
                whereFrom: ref.pathOrUrl ?? "artifact ref only",
                retention: "artifact metadata ref",
                state: ref.status,
              })),
            ]}
          />
          <h4 className="mt-4 text-xs font-semibold">Artifacts</h4>
          <RefList values={packet.artifactRefs.map((ref) => `${ref.label}; ${ref.artifactType}; ${ref.status}`)} />
        </DrawerSection>
      );
    case "worker":
      return (
        <DrawerSection title="Worker activity">
          {packet.localModelHealth ? <LocalGpuCard health={packet.localModelHealth} /> : null}
          {packet.hermesJob ? <HermesWorkerCard job={packet.hermesJob} /> : null}
          {packet.codexWorker ? <CodexWorkerCard worker={packet.codexWorker} /> : null}
          {packet.claudeReview ? <ClaudeReviewerCard review={packet.claudeReview} /> : null}
          <RefList values={packet.laneCards.map((lane) => `${lane.label}; ${lane.status}; ${lane.summary}`)} />
          <h4 className="mt-4 text-xs font-semibold">Review</h4>
          <RefList values={packet.reviewSummaries.map((review) => `${review.reviewer}; ${review.status}; ${review.summary}`)} />
        </DrawerSection>
      );
    case "memory":
      return (
        <DrawerSection title="Memory proposal">
          {packet.memoryProposals.length > 0 ? (
            <div className="grid gap-3">
              {packet.memoryProposals.map((proposal) => <MemoryProposalCard key={proposal.proposalId} packet={packet} proposal={proposal} />)}
            </div>
          ) : (
            <p className="text-xs leading-5 text-[var(--muted)]">No memory proposal for this packet. Obsidian is canonical and human-owned; LLM-Wiki is derived, disposable, and rebuildable.</p>
          )}
        </DrawerSection>
      );
    case "alpha":
      return (
        <DrawerSection title="Alpha action status">
          <AlphaMemorySourceStatusPanel packet={packet} />
        </DrawerSection>
      );
    case "recovery":
      return (
        <DrawerSection title="Recovery availability">
          <RecoveryDrawerPanel
            expandedRecoveryActionId={expandedRecoveryActionId}
            packet={packet}
            selectedRecoveryActionId={selectedRecoveryActionId}
            selectedRecoveryFixtureEventId={selectedRecoveryFixtureEventId}
            setExpandedRecoveryActionId={setExpandedRecoveryActionId}
            setSelectedRecoveryActionId={setSelectedRecoveryActionId}
            setSelectedRecoveryFixtureEventId={setSelectedRecoveryFixtureEventId}
          />
        </DrawerSection>
      );
  }
}

function PacketFiveWhysPanel({
  packet,
  snapshot,
}: {
  packet: PipelineFixturePacket;
  snapshot: PipelineGoldenPathSnapshot | null;
}) {
  const fiveWhys = buildPacketFiveWhys(packet, snapshot);
  return (
    <DrawerSection title="5 Whys">
      <div className="grid gap-3">
        <section aria-label="Packet at a glance" className="rounded-[0.5rem] bg-[var(--background-elevated)] p-3">
          <p className="text-xs font-semibold text-[var(--accent)]">At a glance</p>
          <p className="mt-1 break-words text-sm leading-6">{fiveWhys.nextMove}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PlainChip label="Stage" value={plainStageLabel(packet.currentStage)} />
            <PlainChip label="State" value={plainStatusLabel(packet.status)} />
            <PlainChip label="Owner" value={plainOwnerLabel(packet.currentOwner)} />
            <PlainChip label="Confidence" value={packet.confidenceLabel} />
          </div>
        </section>

        <dl className="grid gap-2">
          {fiveWhys.answers.map((answer) => (
            <div className="rounded-[0.5rem] border bg-[var(--panel)] p-3" key={answer.label}>
              <dt className="text-xs font-semibold text-[var(--muted)]">{answer.label}</dt>
              <dd className="mt-1 break-words text-sm leading-6" style={{ overflowWrap: "anywhere" }}>{answer.value}</dd>
            </div>
          ))}
        </dl>

        <details className="rounded-[0.5rem] border bg-[var(--surface)] p-3">
          <summary className="cursor-pointer text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]">
            Technical details
          </summary>
          <FieldGrid
            fields={[
              ["Packet ID", packet.packetId],
              ["Raw stage", packet.currentStage],
              ["Raw owner", packet.currentOwner],
              ["Raw status", packet.status],
              ["Priority", packet.priority],
              ["Last event", packet.lastEvent],
              ["Next allowed actions", allowedActionSummary(packet)],
              ["Risk flags", packet.riskFlags.join(", ")],
            ]}
          />
        </details>
      </div>
    </DrawerSection>
  );
}

function AlphaMemorySourceStatusPanel({ packet }: { packet: PipelineFixturePacket }) {
  const status = packet.alphaMemorySourceStatus;
  if (!status) {
    return (
      <p className="break-words text-xs leading-5 text-[var(--muted)]">
        No alpha memory/source status is attached to this packet. The cockpit remains fixture-backed and does not call live memory, source, provider, worker, GitHub, or mutation paths.
      </p>
    );
  }
  const authorityFlags = [
    ["Canonical mutation", status.canonicalMutationAllowed],
    ["Source mutation", status.sourceMutationAllowed],
    ["Provider calls", status.providerCallsAllowed],
    ["Worker launch", status.workerLaunchAllowed],
    ["GitHub calls", status.githubCallsAllowed],
    ["Network egress", status.networkEgressAllowed],
  ] as const;
  return (
    <div className="grid gap-3">
      <div className="rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
        <p className="text-xs font-semibold text-[var(--accent)]">Supervisor-owned alpha status</p>
        <FieldGrid
          fields={[
            ["Status id", status.statusId],
            ["Mode", status.operationMode],
            ["Decision", status.decisionState],
            ["Authority family", status.authorityFamily],
            ["Retention", status.retentionClass],
            ["Target", String(status.targetMetadata.targetKind ?? "not recorded")],
            ["Backup", status.backupPath],
            ["Rollback", status.rollbackPath],
            ["Audit summary", status.auditEventSummary],
          ]}
        />
      </div>
      <div className="rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
        <p className="text-xs font-semibold text-[var(--accent)]">Action consequence</p>
        <FieldGrid
          fields={[
            ["What would run", "dry-run or read-only preview only"],
            ["Destination state", status.decisionState === "blocked" ? "remain blocked for operator review" : "ready for Human Gate preview"],
            ["Resulting owner", status.decisionState === "blocked" ? "blocked" : "operator"],
            ["Evidence required", status.evidenceRefs.length > 0 ? status.evidenceRefs.join(", ") : "metadata status only"],
            ["Stop lines", "no canonical Obsidian write; no source mutation; no provider; no worker; no GitHub; no network"],
            ["Blocked reasons", status.blockedReasons.length > 0 ? status.blockedReasons.join(", ") : "none"],
          ]}
        />
      </div>
      <div className="rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
        <p className="text-xs font-semibold text-[var(--accent)]">Authority flags</p>
        <RefList values={authorityFlags.map(([label, allowed]) => `${label}: ${allowed ? "allowed" : "blocked"}`)} />
      </div>
      {status.llmWikiReadiness ? (
        <div className="rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
          <p className="text-xs font-semibold text-[var(--accent)]">LLM-Wiki derived readiness</p>
          <FieldGrid
            fields={[
              ["Decision", status.llmWikiReadiness.decisionState],
              ["Canonicality", status.llmWikiReadiness.canonicality],
              ["Retention", status.llmWikiReadiness.retentionClass],
              ["Boundary", status.llmWikiReadiness.boundarySummary],
              ["Allowed inputs", status.llmWikiReadiness.allowedInputs.length > 0 ? status.llmWikiReadiness.allowedInputs.join(", ") : "none"],
              ["Blocked reasons", status.llmWikiReadiness.blockedReasons.length > 0 ? status.llmWikiReadiness.blockedReasons.join(", ") : "none"],
              ["Next action", status.llmWikiReadiness.nextActions.join(" ")],
              ["Durable writes", status.llmWikiReadiness.durableWriteAllowed ? "allowed" : "blocked"],
            ]}
          />
        </div>
      ) : null}
      <div className="rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
        <p className="text-xs font-semibold text-[var(--accent)]">Source and recovery</p>
        <RefList values={[...status.sourceRefs.map((ref) => `source ref: ${ref}`), ...status.recoveryOptions.map((option) => `recovery: ${option}`)]} />
      </div>
      <button
        aria-disabled="true"
        className="cursor-not-allowed rounded-[0.375rem] border bg-[var(--panel)] px-2 py-1.5 text-left text-xs font-semibold opacity-70"
        disabled
        type="button"
      >
        Preview dry-run evidence
      </button>
    </div>
  );
}

function RouteForkPanel({ packet }: { packet: PipelineFixturePacket }) {
  const routeSummary = packet.routeSummary;
  return (
    <DrawerSection title="Route Fork Panel">
      <FieldGrid
        fields={[
          ["Selected route", packet.routeFork.selectedRoute],
          ["Recommended stage", routeSummary?.recommendation ?? packet.currentStage],
          ["Confidence", `${routeSummary?.confidenceScore ?? "unknown"} ${routeSummary?.confidenceBand ?? packet.confidenceLabel}`],
          ["Rejected routes", packet.routeFork.rejectedRoutes.join(", ")],
          ["Tags", packet.routeFork.tags.join(", ")],
          ["Source context", packet.routeFork.sourceContext],
          ["Reason codes", (routeSummary?.reasonCodes ?? packet.matrixRowIds).join(", ")],
        ]}
      />
      {packet.routeFork.lowConfidenceActions.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-xs font-semibold">Low-confidence route actions</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {packet.routeFork.lowConfidenceActions.map((action) => (
              <button
                aria-disabled="true"
                disabled
                key={action}
                className="cursor-not-allowed rounded-[0.375rem] border bg-[var(--background-elevated)] px-2 py-1 text-xs text-[var(--muted)] disabled:opacity-75"
                type="button"
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </DrawerSection>
  );
}

function HumanGateConsequencePanel({
  expandedGateActionId,
  packet,
  selectedGateActionId,
  selectedGateFixtureEventId,
  setExpandedGateActionId,
  setSelectedGateActionId,
  setSelectedGateFixtureEventId,
}: {
  expandedGateActionId: string | null;
  packet: PipelineFixturePacket;
  selectedGateActionId: string | null;
  selectedGateFixtureEventId: string | null;
  setExpandedGateActionId: (actionId: string | null) => void;
  setSelectedGateActionId: (actionId: string | null) => void;
  setSelectedGateFixtureEventId: (eventId: string | null) => void;
}) {
  const selectedEvent =
    packet.humanGateFixtureEvents.find((event) => event.eventId === selectedGateFixtureEventId && event.actionId === selectedGateActionId) ?? null;

  return (
    <div className="grid gap-3">
      {packet.humanGateActions.map((action) => {
        const fixtureEvent = packet.humanGateFixtureEvents.find((event) => event.actionId === action.actionId);
        const actionDecision = evaluateFixtureActionDecision(packet, action.actionId, "human_gate");
        const actionGuard = actionDecision.guard;
        const missingEvidenceRefs = missingHumanGateEvidenceRefs(packet, action);
        const canActivate = canActivateHumanGateAction(packet, action);
        const expanded = expandedGateActionId === action.actionId || selectedGateActionId === action.actionId;

        return (
          <details
            aria-expanded={expanded}
            className="rounded-[0.5rem] border bg-[var(--background-elevated)] p-3"
            key={action.actionId}
            onToggle={(event) => {
              setExpandedGateActionId(event.currentTarget.open ? action.actionId : null);
            }}
            open={expanded}
          >
            <summary className="cursor-pointer break-words text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]">
              Typed action {action.family}: {action.type} - {action.status}
            </summary>
            <div className="mt-3 grid gap-3">
              <div>
                <p className="text-xs font-semibold text-[var(--accent)]">Consequence preview</p>
                <FieldGrid
                  fields={[
                    ["Current state", `${packet.currentStage} / ${packet.currentOwner}`],
                    ["Proposed action", `${action.actionId}; ${action.label}; ${action.uiCopy}`],
                    ["Action family", action.family],
                    ["Authority level", authorityLevelLabel(action.authorityFamily)],
                    ["Authority family", action.authorityFamily],
                    ["Required evidence", action.requiredEvidenceRefs.join(", ")],
                    ["Missing evidence", missingEvidenceRefs.length > 0 ? missingEvidenceRefs.join(", ") : "none"],
                    ["Stop lines", action.stopLines.join(" | ")],
                    ["Destination stage", action.resultingStage],
                    ["Resulting owner", action.resultingOwner],
                    ["Rollback path", action.rollbackPath],
                    ["Audit event", action.auditEventType],
                    ["Fixture event", fixtureEvent ? `${fixtureEvent.eventId}; ${fixtureEvent.eventType}; ${fixtureEvent.summary}` : "missing fixture event"],
                    ["Guard classification", actionGuard?.classification ?? "none"],
                    ["Expected state", actionGuard?.expectedState ?? `${packet.currentStage}/${packet.currentOwner}/${packet.status}`],
                    ["Actual state", actionGuard?.actualState ?? `${packet.currentStage}/${packet.currentOwner}/${packet.status}`],
                    ["Primary risk prevented", actionGuard?.primaryRisk ?? "none"],
                    ["Safe next option", actionGuard?.safeNextOption ?? "none"],
                    ["Disabled reason", actionGuard?.disabledReason ?? action.disabledReason ?? gateEvidenceReason(packet, action.status)],
                  ]}
                />
              </div>
              {actionGuard ? <ActionGuardPanel guard={actionGuard} /> : null}
              <button
                aria-disabled={!canActivate}
                className="w-full rounded-[0.375rem] border bg-[var(--panel)] px-2 py-1.5 text-left text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]"
                disabled={!canActivate}
                onClick={() => {
                  if (canActivate && fixtureEvent) {
                    setExpandedGateActionId(action.actionId);
                    setSelectedGateActionId(action.actionId);
                    setSelectedGateFixtureEventId(fixtureEvent.eventId);
                  }
                }}
                type="button"
              >
                Preview fixture event
              </button>
            </div>
          </details>
        );
      })}

      {selectedEvent ? (
        <div className="rounded-[0.5rem] border border-[var(--accent)] bg-[var(--panel-strong)] p-3">
          <p className="text-xs font-semibold text-[var(--accent)]">Fixture event</p>
          <FieldGrid
            fields={[
              ["Event", `${selectedEvent.eventId}; ${selectedEvent.eventType}`],
              ["Summary", selectedEvent.summary],
              ["Preview transition", `${selectedEvent.fromStage}/${selectedEvent.fromOwner} -> ${selectedEvent.toStage}/${selectedEvent.toOwner}`],
              ["Evidence refs", selectedEvent.evidenceRefs.join(", ")],
              ["Audit event", selectedEvent.auditEventType],
            ]}
          />
        </div>
      ) : (
        <p className="break-words text-xs leading-5 text-[var(--muted)]">
          Preview fixture event by selecting an available action. Disabled, blocked, stale, complete, unknown, or missing-evidence actions cannot be activated.
        </p>
      )}
      <ActionGuardSummary guards={packet.actionGuardFixtures.filter((guard) => guard.actionSurface === "human_gate")} />
    </div>
  );
}

function RecoveryDrawerPanel({
  expandedRecoveryActionId,
  packet,
  selectedRecoveryActionId,
  selectedRecoveryFixtureEventId,
  setExpandedRecoveryActionId,
  setSelectedRecoveryActionId,
  setSelectedRecoveryFixtureEventId,
}: {
  expandedRecoveryActionId: string | null;
  packet: PipelineFixturePacket;
  selectedRecoveryActionId: string | null;
  selectedRecoveryFixtureEventId: string | null;
  setExpandedRecoveryActionId: (actionId: string | null) => void;
  setSelectedRecoveryActionId: (actionId: string | null) => void;
  setSelectedRecoveryFixtureEventId: (eventId: string | null) => void;
}) {
  const selectedEvent =
    packet.recoveryFixtureEvents.find((event) => event.eventId === selectedRecoveryFixtureEventId && event.actionId === selectedRecoveryActionId) ?? null;

  if (packet.recoveryActions.length === 0) {
    return <p className="break-words text-xs leading-5 text-[var(--muted)]">No matrix-backed recovery actions are relevant for this fixture state.</p>;
  }

  return (
    <div className="grid gap-3">
      {packet.recoveryActions.map((action) => {
        const fixtureEvent = packet.recoveryFixtureEvents.find((event) => event.actionId === action.actionId);
        const actionDecision = evaluateFixtureActionDecision(packet, action.actionId, "recovery");
        const actionGuard = actionDecision.guard;
        const missingEvidenceRefs = missingRecoveryEvidenceRefs(packet, action);
        const humanGateAction = packet.humanGateActions.find((gateAction) => gateAction.actionId === fixtureEvent?.humanGateActionId) ?? null;
        const requiresHumanGate = recoveryRequiresHumanGate(fixtureEvent);
        const canSelect = canSelectRecoveryAction(packet, action);
        const expanded = expandedRecoveryActionId === action.actionId || selectedRecoveryActionId === action.actionId;

        return (
          <details
            aria-expanded={expanded}
            className="rounded-[0.5rem] border bg-[var(--background-elevated)] p-3"
            key={action.actionId}
            onToggle={(event) => {
              setExpandedRecoveryActionId(event.currentTarget.open ? action.actionId : null);
            }}
            open={expanded}
          >
            <summary className="cursor-pointer break-words text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]">
              Recovery action {action.label}: {action.actionType} - {action.availability}
            </summary>
            <div className="mt-3 grid gap-3">
              <div>
                <p className="text-xs font-semibold text-[var(--accent)]">Recovery consequence</p>
                <FieldGrid
                  fields={[
                    ["Current state", `${packet.currentStage} / ${packet.currentOwner}`],
                    ["Known stage", packet.currentStage],
                    ["Recovery action", `${action.actionId}; ${action.actionType}; ${action.label}`],
                    ["Availability", action.availability],
                    ["Consequence", action.consequence],
                    ["Required evidence", action.evidenceRefs.join(", ")],
                    ["Missing evidence", missingEvidenceRefs.length > 0 ? missingEvidenceRefs.join(", ") : "none"],
                    ["Resulting stage", action.resultingStage],
                    ["Resulting owner", action.resultingOwner],
                    ["Audit event", fixtureEvent?.auditEventType ?? "missing fixture event"],
                    ["Recovery fixture event", fixtureEvent ? `${fixtureEvent.eventId}; ${fixtureEvent.eventType}; ${fixtureEvent.summary}` : "missing fixture event"],
                    ["Authority requirement", requiresHumanGate ? `Human Gate required${humanGateAction ? `: ${humanGateAction.type}` : ""}` : "none"],
                    ["Guard classification", actionGuard?.classification ?? "none"],
                    ["Expected state", actionGuard?.expectedState ?? `${packet.currentStage}/${packet.currentOwner}/${packet.status}`],
                    ["Actual state", actionGuard?.actualState ?? `${packet.currentStage}/${packet.currentOwner}/${packet.status}`],
                    ["Primary risk prevented", actionGuard?.primaryRisk ?? "none"],
                    ["Safe next option", actionGuard?.safeNextOption ?? "none"],
                    ["Disabled reason", actionGuard?.disabledReason ?? recoveryDisabledReason(packet, action, fixtureEvent, requiresHumanGate)],
                  ]}
                />
              </div>
              {actionGuard ? <ActionGuardPanel guard={actionGuard} /> : null}
              {requiresHumanGate ? (
                <div className="rounded-[0.375rem] border border-[var(--warning)] bg-[var(--panel)] px-2 py-1.5 text-xs">
                  <p className="font-semibold">Human Gate reference</p>
                  <p className="mt-1 break-words text-[var(--muted)]">
                    {humanGateAction
                      ? `${humanGateAction.family}: ${humanGateAction.type}; ${humanGateAction.uiCopy}`
                      : "Recovery requires Human Gate authority, but no matching typed action is present in this fixture."}
                  </p>
                </div>
              ) : null}
              <button
                aria-disabled={!canSelect}
                className="w-full rounded-[0.375rem] border bg-[var(--panel)] px-2 py-1.5 text-left text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]"
                disabled={!canSelect}
                onClick={() => {
                  if (canSelect && fixtureEvent) {
                    setExpandedRecoveryActionId(action.actionId);
                    setSelectedRecoveryActionId(action.actionId);
                    setSelectedRecoveryFixtureEventId(fixtureEvent.eventId);
                  }
                }}
                type="button"
              >
                Preview recovery event
              </button>
            </div>
          </details>
        );
      })}

      {selectedEvent ? (
        <div className="rounded-[0.5rem] border border-[var(--accent)] bg-[var(--panel-strong)] p-3">
          <p className="text-xs font-semibold text-[var(--accent)]">Recovery fixture event</p>
          <FieldGrid
            fields={[
              ["Event", `${selectedEvent.eventId}; ${selectedEvent.eventType}`],
              ["Summary", selectedEvent.summary],
              ["Preview transition", `${selectedEvent.fromStage}/${selectedEvent.fromOwner} -> ${selectedEvent.toStage}/${selectedEvent.toOwner}`],
              ["Evidence refs", selectedEvent.evidenceRefs.join(", ")],
              ["Audit event", selectedEvent.auditEventType],
            ]}
          />
        </div>
      ) : (
        <p className="break-words text-xs leading-5 text-[var(--muted)]">
          Preview recovery event by selecting an available fixture action. Authority-required selections show their Human Gate reference and guard metadata; blocked, stale, complete, missing-event, or missing or unavailable evidence actions stay visible but cannot execute recovery.
        </p>
      )}
      <ActionGuardSummary guards={packet.actionGuardFixtures.filter((guard) => guard.actionSurface === "recovery")} />
    </div>
  );
}

function ActionGuardPanel({ guard }: { guard: PipelineFixturePacket["actionGuardFixtures"][number] }) {
  return (
    <div className="rounded-[0.375rem] border border-[var(--warning)] bg-[var(--panel)] px-2 py-1.5 text-xs">
      <p className="font-semibold">Stale or unsafe action guard</p>
      <FieldGrid
        fields={[
          ["Guard", `${guard.guardId}; ${guard.classification}; ${guard.unsafeClass}`],
          ["Packet binding", `${guard.expectedPacketId} -> ${guard.actualPacketId}`],
          ["Action binding", `${guard.expectedActionId} -> ${guard.actualActionId}`],
          ["State changed", `${guard.expectedState} -> ${guard.actualState}`],
          ["Stop line", guard.stopLine],
          ["Safe next option", guard.safeNextOption],
          ["Known stage", `${guard.resultingStage} / ${guard.resultingOwner}`],
          ["Evidence refs", guard.evidenceRefs.join(", ")],
          ["Fixture event", guard.fixtureEventId ?? "none"],
          ["Primary risk prevented", guard.primaryRisk],
        ]}
      />
    </div>
  );
}

function ActionGuardSummary({ guards }: { guards: PipelineFixturePacket["actionGuardFixtures"] }) {
  if (guards.length === 0) {
    return null;
  }
  return (
    <div className="rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
      <p className="text-xs font-semibold text-[var(--accent)]">Deterministic guard cases</p>
      <RefList
        values={guards.map((guard) =>
          `${guard.classification}; ${guard.actionType}; ${guard.disabledReason}; state changed: ${guard.expectedState} -> ${guard.actualState}; stop line: ${guard.stopLine}; safe next option: ${guard.safeNextOption}; known stage: ${guard.resultingStage}/${guard.resultingOwner}; evidence refs: ${guard.evidenceRefs.join(", ")}; fixture event: ${guard.fixtureEventId ?? "none"}; primary risk: ${guard.primaryRisk}`
        )}
      />
    </div>
  );
}

function LocalGpuCard({ health }: { health: NonNullable<PipelineFixturePacket["localModelHealth"]> }) {
  const latency = health.lastLatencyMs === null || health.lastLatencyMs === undefined ? "unknown" : `${health.lastLatencyMs} ms`;
  const reachable = health.reachable === null ? "unknown" : health.reachable ? "reachable" : "unreachable";
  return (
    <article className="mb-3 rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--accent)]">Local GPU Card</p>
          <h4 className="mt-1 break-words text-sm font-semibold">Local model readiness</h4>
        </div>
        <span className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5 text-xs">{localModelStatusLabel(health.statusLabel)}</span>
      </div>
      <FieldGrid
        fields={[
          ["Provider", health.provider],
          ["Configured endpoint", health.endpointUrl ?? "not configured"],
          ["Approved endpoint", health.approvedEndpointUrl],
          ["Endpoint approval", health.endpointApproved ? "match" : "mismatch"],
          ["Configured model", health.modelId ?? "not configured"],
          ["Approved model", health.approvedModelId],
          ["Model approval", health.modelApproved ? "match" : "mismatch"],
          ["Reachability", reachable],
          ["Busy state", health.busyState],
          ["Allowed caller", health.allowedCaller],
          ["Latency", latency],
          ["Last failure", health.lastFailure ?? "none"],
          ["Call authority", `${health.callAuthorityState}; ${health.authoritySummary}`],
          ["Retention policy", health.retentionPolicy],
          ["Fallback path", health.fallbackPath],
          ["Boundary", health.noProbeBoundary],
        ]}
      />
    </article>
  );
}

function localModelStatusLabel(status: NonNullable<PipelineFixturePacket["localModelHealth"]>["statusLabel"]) {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "unavailable":
      return "Unavailable";
    case "busy":
      return "Busy";
    case "model_mismatch":
      return "Model mismatch";
    case "endpoint_mismatch":
      return "Endpoint mismatch";
    case "approval_required":
      return "Approval required";
  }
}

function HermesWorkerCard({ job }: { job: NonNullable<PipelineFixturePacket["hermesJob"]> }) {
  return (
    <article className="mb-3 rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--accent)]">Hermes Worker Card</p>
          <h4 className="mt-1 break-words text-sm font-semibold">Mocked worker containment</h4>
        </div>
        <span className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5 text-xs">{hermesStatusLabel(job.statusLabel)}</span>
      </div>
      <FieldGrid
        fields={[
          ["Job id", job.jobId],
          ["Packet id", job.packetId],
          ["Worker profile", job.workerProfile],
          ["Input refs", job.inputRefs.join(", ")],
          ["Allowed mounts", job.allowedMounts.join(", ")],
          ["Writable output dir", job.writableOutputDir],
          ["Network policy", job.networkPolicy],
          ["Credential policy", job.credentialPolicy],
          ["Source mutation policy", job.sourceMutationPolicy],
          ["Timeout", `${job.timeoutSeconds} seconds`],
          ["Expected output schema", job.expectedOutputSchema],
          ["Cleanup policy", job.cleanupPolicy],
          ["Kill switch", job.killSwitch],
          ["Execution mode", job.executionMode],
          ["Containment", job.containmentSummary],
          ["Boundary", job.boundarySummary],
        ]}
      />
    </article>
  );
}

function hermesStatusLabel(status: NonNullable<PipelineFixturePacket["hermesJob"]>["statusLabel"]) {
  switch (status) {
    case "mocked_ready":
      return "Mocked ready";
    case "mocked_timeout":
      return "Mocked timeout";
    case "blocked_containment":
      return "Blocked containment";
  }
}

function CodexWorkerCard({ worker }: { worker: NonNullable<PipelineFixturePacket["codexWorker"]> }) {
  return (
    <article className="mb-3 rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--accent)]">Codex Worker Card</p>
          <h4 className="mt-1 break-words text-sm font-semibold">Implementation worker lane</h4>
        </div>
        <span className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5 text-xs">{codexReadinessLabel(worker.readiness)}</span>
      </div>
      <FieldGrid
        fields={[
          ["Worker id", worker.workerId],
          ["Packet id", worker.packetId],
          ["Implementation role", worker.role],
          ["Readiness", worker.readiness],
          ["Attempt refs", worker.attemptRefs.join(", ")],
          ["Current state", worker.currentState],
          ["Blocked state", worker.blockedState],
          ["Retention policy", worker.retentionPolicy],
          ["Evidence ref", worker.evidenceRef],
          ["Reviewer boundary", worker.boundarySummary],
        ]}
      />
    </article>
  );
}

function ClaudeReviewerCard({ review }: { review: NonNullable<PipelineFixturePacket["claudeReview"]> }) {
  return (
    <article className="mb-3 rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--accent)]">Claude Reviewer Card</p>
          <h4 className="mt-1 break-words text-sm font-semibold">Reviewer / second opinion</h4>
        </div>
        <span className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5 text-xs">{claudeReviewStatusLabel(review.statusLabel)}</span>
      </div>
      <FieldGrid
        fields={[
          ["Review id", review.reviewId],
          ["Packet id", review.packetId],
          ["Review purpose", review.purpose],
          ["Allowed context", review.allowedContextRefs.join(", ")],
          ["Excluded context", review.excludedContextRefs.join(", ")],
          ["Retention policy", review.retentionPolicy],
          ["Expected findings schema", review.expectedFindingsSchema],
          ["Independence marker", review.independenceMarker],
          ["Cost/scarcity", review.costScarcity],
          ["Approval requirement", review.approvalRequirement],
          ["Execution mode", review.executionMode],
          ["Review status", review.statusLabel],
          ["Evidence ref", review.evidenceRef],
          ["Implementation boundary", review.boundarySummary],
        ]}
      />
    </article>
  );
}

function MemoryProposalCard({
  packet,
  proposal,
}: {
  packet: PipelineFixturePacket;
  proposal: PipelineFixturePacket["memoryProposals"][number];
}) {
  const decisionContext = proposal.decisionNeededContext ?? "none; proposal can remain review-gated";
  const contradictionBoundary = proposal.contradictionStatus === "confirmed" ? "Obsidian wins by default; proposal stays decision-needed and cannot auto-promote." : "No confirmed contradiction auto-promotes memory.";
  return (
    <article className="rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--accent)]">Memory Proposal Card</p>
          <h4 className="mt-1 break-words text-sm font-semibold">{proposal.label}</h4>
        </div>
        <span className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5 text-xs">{memoryProposalStatusLabel(proposal.status)}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{proposal.summary}</p>
      <FieldGrid
        fields={[
          ["Proposal id", proposal.proposalId],
          ["Packet id", proposal.packetId],
          ["Target path", proposal.targetVaultPath ?? "not selected"],
          ["Target folder", proposal.targetVaultFolder ?? "not selected"],
          ["Proposal type", proposal.proposalType],
          ["Source refs", proposal.sourceRefs.join(", ")],
          ["Source boundary labels", proposal.sourceRefs.map((refId) => memoryProposalSourceBoundaryLabel(refId, packet)).join(" | ")],
          ["Evidence refs", proposal.evidenceRefs.join(", ")],
          ["Suggested content", proposal.suggestedContentSummary],
          ["Patch summary", proposal.patchSummary ?? "summary only"],
          ["Sensitivity", proposal.sensitivity],
          ["Freshness", proposal.freshness],
          ["Contradiction", proposal.contradictionStatus],
          ["Confidence", proposal.confidence],
          ["Operator action", proposal.operatorAction],
          ["Decision context", decisionContext],
          ["Contradiction boundary", contradictionBoundary],
          ["Backup / recovery", proposal.backupRecoveryPath],
          ["Write-back status", `${proposal.writeBackStatus}; write-back allowed: ${proposal.writeBackAllowed ? "true" : "false"}`],
          ["Proposal-only boundary", "Obsidian is canonical and human-owned; LLM-Wiki is derived, disposable, and rebuildable; no durable vault update occurs in fixture mode."],
        ]}
      />
    </article>
  );
}

function memoryProposalSourceBoundaryLabel(refId: string, packet: PipelineFixturePacket) {
  const sourceRef = packet.sourceRefs.find((ref) => ref.refId === refId);
  if (!sourceRef) {
    return `${refId}; unresolved source boundary`;
  }
  return `${sourceRef.label}; ${sourceRefImportance(sourceRef.sourceType, packet)}; ${sourceRef.freshness}; ${sourceRef.accessState}; summary-only ${String(sourceRef.summaryOnly)}`;
}

function SourceBoundaryCard({ boundary }: { boundary: SourceBoundaryDeclarationV0 }) {
  return (
    <article className="rounded-[0.5rem] border bg-[var(--background-elevated)] p-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-[var(--accent)]">Boundary id</p>
          <h3 className="mt-1 break-words text-sm font-semibold">{boundary.label}</h3>
        </div>
        <span className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5">{boundary.boundaryId}</span>
      </div>
      <FieldGrid
        fields={[
          ["Canonicality", boundary.canonicality],
          ["Allowed reads", boundary.allowedReads.join(", ")],
          ["Allowed writes", boundary.allowedWrites.join(", ")],
          ["Retention class", boundary.retentionClass],
          ["Blocked operations", boundary.blockedOperations.join(", ")],
          ["Boundary summary", boundary.boundarySummary],
        ]}
      />
    </article>
  );
}

function memoryProposalStatusLabel(status: PipelineFixturePacket["memoryProposals"][number]["status"]) {
  switch (status) {
    case "not_applicable":
      return "Not applicable";
    case "proposed":
      return "Proposed";
    case "pending_human_approval":
      return "Pending review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "deferred":
      return "Deferred";
    case "edit_needed":
      return "Edit needed";
    case "stale":
      return "Stale";
    case "contradictory":
      return "Contradictory";
    case "blocked":
      return "Blocked";
  }
}

function codexReadinessLabel(readiness: NonNullable<PipelineFixturePacket["codexWorker"]>["readiness"]) {
  switch (readiness) {
    case "ready":
      return "Ready";
    case "active":
      return "Active";
    case "blocked":
      return "Blocked";
  }
}

function claudeReviewStatusLabel(status: NonNullable<PipelineFixturePacket["claudeReview"]>["statusLabel"]) {
  switch (status) {
    case "pending":
      return "Pending";
    case "skipped":
      return "Skipped";
    case "blocked":
      return "Blocked";
  }
}

function DrawerSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function FieldGrid({ fields }: { fields: [string, string][] }) {
  return (
    <dl className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 xl:grid-cols-1">
      {fields.map(([label, value]) => (
        <div className="min-w-0" key={label}>
          <dt className="text-[var(--muted)]">{label}</dt>
          <dd className="mt-1 break-words" style={{ overflowWrap: "anywhere" }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RefList({ values }: { values: string[] }) {
  if (values.length === 0) {
    return <p className="text-xs text-[var(--muted)]">No fixture refs available.</p>;
  }
  return (
    <ul className="grid gap-2 text-xs">
      {values.map((value, index) => (
        <li className="break-words rounded-[0.375rem] bg-[var(--background-elevated)] px-2 py-1" key={`${index}:${value}`}>
          {value}
        </li>
      ))}
    </ul>
  );
}

function canActivateHumanGateAction(
  packet: PipelineFixturePacket,
  action: PipelineFixturePacket["humanGateActions"][number]
) {
  const fixtureEvent = packet.humanGateFixtureEvents.find((event) => event.actionId === action.actionId);
  return (
    action.status === "available" &&
    action.requiredEvidenceRefs.length > 0 &&
    action.payload.packetId === packet.packetId &&
    action.payload.actionId === action.actionId &&
    evaluateFixtureActionDecision(packet, action.actionId, "human_gate").submitCapable &&
    missingHumanGateEvidenceRefs(packet, action).length === 0 &&
    fixtureEvent !== undefined &&
    fixtureEvent.toStage === action.resultingStage &&
    fixtureEvent.toOwner === action.resultingOwner &&
    fixtureEvent.evidenceRefs.length > 0 &&
    fixtureEvent.evidenceRefs.every((ref) => packet.evidenceRefs.some((evidenceRef) => evidenceRef.refId === ref))
  );
}

function authorityLevelLabel(authorityFamily: string) {
  return authorityFamily.split(".")[0] ?? authorityFamily;
}

function canSelectRecoveryAction(
  packet: PipelineFixturePacket,
  action: PipelineFixturePacket["recoveryActions"][number]
) {
  const fixtureEvent = packet.recoveryFixtureEvents.find((event) => event.actionId === action.actionId);
  return (
    action.availability === "available" &&
    missingRecoveryEvidenceRefs(packet, action).length === 0 &&
    fixtureEvent !== undefined &&
    fixtureEvent.toStage === action.resultingStage &&
    fixtureEvent.toOwner === action.resultingOwner &&
    fixtureEvent.evidenceRefs.length > 0 &&
    fixtureEvent.evidenceRefs.every((ref) => packet.evidenceRefs.some((evidenceRef) => evidenceRef.refId === ref))
  );
}

function blockingActionGuard(
  packet: PipelineFixturePacket,
  actionId: string,
  actionSurface: PipelineFixturePacket["actionGuardFixtures"][number]["actionSurface"]
) {
  return evaluateFixtureActionDecision(packet, actionId, actionSurface).guard;
}

function recoveryRequiresHumanGate(event: PipelineFixturePacket["recoveryFixtureEvents"][number] | null | undefined) {
  return Boolean(event?.requiresHumanGate);
}

function missingRecoveryEvidenceRefs(
  packet: PipelineFixturePacket,
  action: PipelineFixturePacket["recoveryActions"][number]
) {
  const packetEvidenceRefs = new Set(packet.evidenceRefs.map((ref) => ref.refId));
  return action.evidenceRefs.filter((ref) => !packetEvidenceRefs.has(ref));
}

function recoveryDisabledReason(
  packet: PipelineFixturePacket,
  action: PipelineFixturePacket["recoveryActions"][number],
  fixtureEvent: PipelineFixturePacket["recoveryFixtureEvents"][number] | undefined,
  requiresHumanGate: boolean
) {
  if (requiresHumanGate) {
    return "requires Human Gate authority before recovery execution";
  }
  if (!fixtureEvent) {
    return "missing recovery fixture event";
  }
  if (action.availability !== "available") {
    return recoveryEvidenceReason(packet, action.availability);
  }
  const missingEvidence = missingRecoveryEvidenceRefs(packet, action);
  if (missingEvidence.length > 0) {
    return `missing evidence: ${missingEvidence.join(", ")}`;
  }
  return "none";
}

function missingHumanGateEvidenceRefs(
  packet: PipelineFixturePacket,
  action: PipelineFixturePacket["humanGateActions"][number]
) {
  const packetEvidenceRefs = new Set(packet.evidenceRefs.map((ref) => ref.refId));
  return action.requiredEvidenceRefs.filter((ref) => !packetEvidenceRefs.has(ref));
}

function EvidenceDetailList({
  items,
}: {
  items: {
    key: string;
    whatExists: string;
    whyItMatters: string;
    whereFrom: string;
    retention: string;
    state: string;
  }[];
}) {
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <article className="rounded-[0.375rem] bg-[var(--background-elevated)] p-2 text-xs" key={item.key}>
          <dl className="grid gap-2">
            <EvidenceField label="What exists" value={item.whatExists} />
            <EvidenceField label="Why it matters" value={item.whyItMatters} />
            <EvidenceField label="Where it came from" value={item.whereFrom} />
            <EvidenceField label="Retention" value={item.retention} />
            <EvidenceField label="Evidence state" value={item.state} />
          </dl>
        </article>
      ))}
    </div>
  );
}

function EvidenceField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="mt-0.5 break-words" style={{ overflowWrap: "anywhere" }}>{value}</dd>
    </div>
  );
}

function sourceRefImportance(sourceType: string, packet: PipelineFixturePacket) {
  if (sourceType === "obsidian") {
    return "Obsidian is canonical and human-owned; it wins by default over derived memory.";
  }
  if (sourceType === "llm_wiki") {
    return "LLM-Wiki is derived, disposable, and rebuildable; it never overrules Obsidian.";
  }
  if (sourceType === "research" || packet.sourceTrustStates.includes("stale")) {
    return "Names source freshness so Kendall does not treat stale context as trusted memory.";
  }
  return "Anchors the packet decision to a summary-only source reference.";
}

function sourcePathLabel(ref: PipelineFixturePacket["sourceRefs"][number]) {
  if ("pathOrUrl" in ref && ref.pathOrUrl) {
    return ref.pathOrUrl;
  }
  return "summary ref only";
}

function evidenceRefImportance(evidenceType: string, packet: PipelineFixturePacket) {
  if (evidenceType === "fixture") {
    return `Proves the ${packet.fixtureKind} cockpit state without live runtime access.`;
  }
  return "Supports the recommended next action without exposing payload content.";
}

function artifactRefImportance(artifactType: string, packet: PipelineFixturePacket) {
  if (artifactType === "fixture") {
    return `Links the ${packet.currentStage} stage to the fixture catalog or matrix evidence.`;
  }
  return "Keeps generated work inspectable through an artifact reference.";
}

function gateEvidenceReason(packet: PipelineFixturePacket, availability: string) {
  if (availability === "available") {
    return "none; required fixture evidence is present";
  }
  return `active Human Gate authority is unavailable for ${packet.currentStage}; required fixture evidence remains visible`;
}

function recoveryEvidenceReason(packet: PipelineFixturePacket, availability: string) {
  if (availability === "available") {
    return "none; blocked packet evidence is present";
  }
  return `blocked or failed packet evidence is not present while status is ${packet.status}`;
}

function allowedActionSummary(packet: PipelineFixturePacket) {
  const actions = packet.humanGateActions.filter((action) => action.status === "available");
  if (actions.length === 0) {
    return "No available mutation; fixture inspection only.";
  }
  return actions.map((action) => `${action.family}: ${action.type}`).join(", ");
}

function buildPacketFiveWhys(packet: PipelineFixturePacket, snapshot: PipelineGoldenPathSnapshot | null) {
  const nextMove = snapshot?.whatNeedsOperator ?? packet.nextAction;
  return {
    nextMove,
    answers: [
      ["What is this?", snapshot?.whatPacketIs ?? packet.summary],
      ["Why is it here?", snapshot?.whyHere ?? plainStageReason(packet)],
      ["Why does it matter?", snapshot?.decisionConsequence ?? packet.requestedOutcome],
      ["Why does it need me?", snapshot?.whatNeedsOperator ?? plainOperatorNeed(packet)],
      ["What happens next?", snapshot?.whatHappensNext ?? packet.nextAction],
    ].map(([label, value]) => ({ label, value })),
  };
}

function plainStageReason(packet: PipelineFixturePacket) {
  if (packet.currentStage === "human_gate") {
    return "Kendall is waiting because a human decision is required before it can continue.";
  }
  if (packet.status === "blocked") {
    return `Kendall stopped here because ${packet.nextAction.toLowerCase()} is needed before the packet can move forward.`;
  }
  if (packet.sourceTrustStates.some((state) => state === "stale" || state === "contradictory" || state === "excluded")) {
    return "The packet is here because its sources need review before Kendall should trust the context.";
  }
  return `Kendall placed it in ${plainStageLabel(packet.currentStage)} because that is the next visible step in the workflow.`;
}

function plainOperatorNeed(packet: PipelineFixturePacket) {
  const availableAction = packet.humanGateActions.find((action) => action.status === "available");
  if (availableAction) {
    return `Choose whether to ${availableAction.label.toLowerCase()} after checking the proof.`;
  }
  if (packet.memoryProposals.length > 0) {
    return "Review the memory proposal before anything writes back to human-owned memory.";
  }
  if (packet.sourceTrustStates.some((state) => state === "stale" || state === "contradictory" || state === "excluded")) {
    return "Resolve the source trust issue so Kendall does not act on stale or conflicting context.";
  }
  return packet.nextAction;
}

function plainStageLabel(stage: PipelineStage) {
  const labels: Record<PipelineStage, string> = {
    capture: "Capture",
    classify: "Classify",
    route: "Route",
    shape: "Shape",
    human_gate: "Needs decision",
    execute: "Working",
    review: "Review",
    promote: "Promote",
    deliver: "Deliver",
    learn: "Learn",
  };
  return labels[stage];
}

function plainStatusLabel(status: PipelineFixturePacket["status"]) {
  const labels: Record<PipelineFixturePacket["status"], string> = {
    waiting: "Waiting",
    active: "In progress",
    blocked: "Needs help",
    complete: "Done",
    failed: "Failed",
    deferred: "Deferred",
  };
  return labels[status];
}

function plainOwnerLabel(owner: PipelineFixturePacket["currentOwner"]) {
  const labels: Record<PipelineFixturePacket["currentOwner"], string> = {
    kendall: "Kendall",
    operator: "You",
    hermes_worker_mock: "Hermes",
    codex_worker: "Codex",
    claude_reviewer: "Claude",
    github: "GitHub",
    memory_review: "Memory review",
    local_model: "Local model",
    blocked: "Blocked",
  };
  return labels[owner];
}

function PlainChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-w-0 max-w-full rounded-full bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--muted)]">
      <span className="shrink-0">{label}: </span>
      <span className="min-w-0 break-words" style={{ overflowWrap: "anywhere" }}>{value}</span>
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div aria-label={`${label}: ${value}`} className="min-w-0 rounded-[0.5rem] border bg-[var(--surface)] p-3">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 break-words text-xl font-semibold">{value}</p>
    </div>
  );
}

function SourceField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--muted)]">{label}</dt>
          <dd className="mt-0.5 break-words" style={{ overflowWrap: "anywhere" }}>{value}</dd>
    </div>
  );
}

function findTopBlockedPacket(packets: PipelineFixturePacket[]) {
  const priorityRank: Record<PipelineFixturePacket["priority"], number> = {
    urgent: 4,
    high: 3,
    normal: 2,
    low: 1,
  };
  return packets
    .filter((packet) => packet.status === "blocked" || packet.currentStage === "human_gate")
    .sort((left, right) => priorityRank[right.priority] - priorityRank[left.priority])[0];
}

function searchablePacketText(packet: PipelineFixturePacket) {
  return [
    packet.title,
    packet.packetId,
    packet.summary,
    packet.requestedOutcome,
    packet.currentStage,
    packet.currentOwner,
    packet.status,
    packet.priority,
    packet.riskLevel,
    packet.fixtureLabel,
    packet.nextAction,
    packet.confidenceLabel,
    packet.freshnessLabel,
    packet.sourceTrustStates.join(" "),
    packet.laneCards.map((lane) => `${lane.label} ${lane.status}`).join(" "),
  ].join(" ").toLowerCase();
}

function EvidenceGroup({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value, index) => (
          <span key={`${index}:${value}`} className="break-words rounded-full bg-[var(--background-elevated)] px-2 py-1 text-xs text-[var(--muted)]">
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
