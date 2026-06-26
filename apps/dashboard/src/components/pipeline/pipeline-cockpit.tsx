"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { PipelineStage } from "@kendall/contracts";
import type { PipelineFixturePacket } from "../../lib/pipeline-fixtures";

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

const codexUsageVisibleKey = "kendall.dashboard.usage.codex.visible";
const claudeUsageVisibleKey = "kendall.dashboard.usage.claude.visible";

function readStoredUsageVisible(key: string) {
  try {
    return window.localStorage.getItem(key) !== "false";
  } catch {
    return true;
  }
}

const priorityRank: Record<PipelineFixturePacket["priority"], number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

type SelectedMapItem =
  | { type: "packet"; id: string }
  | { type: "stage"; id: PipelineStage }
  | null;

type ConnectorPath = {
  d: string;
  id: string;
};

export function PipelineCockpit({
  fixtureMode,
  packets,
  selectedPacket,
}: {
  fixtureMode: { label: string; summary: string; matrixRows: number; fixtureCatalogEntries: number };
  packets: PipelineFixturePacket[];
  selectedPacket: PipelineFixturePacket;
}) {
  const [selectedItem, setSelectedItem] = useState<SelectedMapItem>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedStage, setFocusedStage] = useState<PipelineStage>("capture");
  const [compactRouteMap, setCompactRouteMap] = useState(false);
  const [usageVisibility, setUsageVisibility] = useState({ claude: true, codex: true });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const routeMapRef = useRef<HTMLElement | null>(null);
  const routeRowRef = useRef<HTMLDivElement | null>(null);
  const stageButtonRefs = useRef(new Map<PipelineStage, HTMLButtonElement>());
  const stageStationRefs = useRef(new Map<PipelineStage, HTMLDivElement>());
  const [connectorPaths, setConnectorPaths] = useState<ConnectorPath[]>([]);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const visiblePackets = useMemo(
    () =>
      normalizedSearchQuery.length === 0
        ? packets
        : packets.filter((packet) => searchablePacketText(packet).includes(normalizedSearchQuery)),
    [normalizedSearchQuery, packets]
  );
  const selectedMapPacket = selectedItem?.type === "packet"
    ? packets.find((packet) => packet.packetId === selectedItem.id) ?? null
    : null;
  const blockedGateCount = packets.filter((packet) => packet.currentStage === "human_gate").length;
  const topBlockedPacket = findTopBlockedPacket(packets);
  const attentionPacket = topBlockedPacket ?? packets.find((packet) => packet.status === "active") ?? selectedPacket;
  const stagePacketLimit = compactRouteMap ? 3 : 4;
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
    },
    []
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
    if (event.key !== "Escape") {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target === searchInputRef.current) {
      event.preventDefault();
      if (searchQuery.length > 0) {
        setSearchQuery("");
      } else {
        searchInputRef.current?.blur();
      }
      return;
    }
    if (selectedItem !== null) {
      event.preventDefault();
      setSelectedItem(null);
    }
  }, [focusSearchFromShortcut, searchQuery.length, selectedItem]);
  const registerStageButton = useCallback((stage: PipelineStage, node: HTMLButtonElement | null) => {
    if (node) {
      stageButtonRefs.current.set(stage, node);
      return;
    }
    stageButtonRefs.current.delete(stage);
  }, []);
  const registerStageStation = useCallback((stage: PipelineStage, node: HTMLDivElement | null) => {
    if (node) {
      stageStationRefs.current.set(stage, node);
      return;
    }
    stageStationRefs.current.delete(stage);
  }, []);
  const focusStage = useCallback((stage: PipelineStage) => {
    setFocusedStage(stage);
    stageButtonRefs.current.get(stage)?.focus();
  }, []);
  const moveStageFocus = useCallback((key: string) => {
    const currentStageIndex = pipelineStages.indexOf(focusedStage);
    const safeStageIndex = currentStageIndex >= 0 ? currentStageIndex : 0;
    const routeRow = routeRowRef.current;
    const columnCount = routeRow
      ? window.getComputedStyle(routeRow).gridTemplateColumns.trim().split(/\s+/).length
      : (compactRouteMap ? 2 : 4);
    const offsetByKey: Record<string, number> = {
      ArrowDown: columnCount,
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -columnCount,
    };
    const nextStageIndex = Math.max(0, Math.min(pipelineStages.length - 1, safeStageIndex + offsetByKey[key]));
    focusStage(pipelineStages[nextStageIndex]);
  }, [compactRouteMap, focusStage, focusedStage]);
  const handleRouteMapKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".pipeline-mini-packet")) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setSelectedItem(null);
      return;
    }
    if (event.key === "Enter") {
      const stationButton = target?.closest(".pipeline-stage-station") as HTMLElement | null;
      const stage = stationButton?.dataset.stage;
      if (isPipelineStage(stage)) {
        event.preventDefault();
        setSelectedItem({ type: "stage", id: stage });
      }
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      moveStageFocus(event.key);
    }
  }, [moveStageFocus]);

  useEffect(() => {
    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      focusSearchFromShortcut(event);
    };
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown);
  }, [focusSearchFromShortcut]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 720px)");
    const updateCompactRouteMap = () => setCompactRouteMap(mediaQuery.matches);
    updateCompactRouteMap();
    mediaQuery.addEventListener("change", updateCompactRouteMap);
    return () => mediaQuery.removeEventListener("change", updateCompactRouteMap);
  }, []);

  useEffect(() => {
    if (selectedItem?.type !== "packet") {
      return;
    }
    if (!visiblePackets.some((packet) => packet.packetId === selectedItem.id)) {
      setSelectedItem(null);
    }
  }, [selectedItem, visiblePackets]);

  const updateConnectorPaths = useCallback(() => {
    const routeMap = routeMapRef.current;
    if (!routeMap) {
      setConnectorPaths([]);
      return;
    }
    const mapRect = routeMap.getBoundingClientRect();
    const nextPaths = pipelineStages.slice(0, -1).flatMap((stage, index) => {
      const nextStage = pipelineStages[index + 1];
      const currentNode = stageStationRefs.current.get(stage);
      const nextNode = stageStationRefs.current.get(nextStage);
      if (!currentNode || !nextNode) {
        return [];
      }
      const currentRect = currentNode.getBoundingClientRect();
      const nextRect = nextNode.getBoundingClientRect();
      const start = {
        x: currentRect.right - mapRect.left,
        y: currentRect.top - mapRect.top + currentRect.height * 0.76,
      };
      const end = {
        x: nextRect.left - mapRect.left,
        y: nextRect.top - mapRect.top + nextRect.height * 0.24,
      };
      const sameRow = Math.abs(currentRect.top - nextRect.top) < 24;
      const schematicGutter = Math.min(42, Math.max(24, mapRect.width * 0.045));
      const schematicBusX = Math.min(mapRect.width - 2, start.x + schematicGutter);
      const entryStubX = Math.max(2, end.x - schematicGutter);
      const rowGutterY = end.y > start.y
        ? (currentRect.bottom - mapRect.top + nextRect.top - mapRect.top) / 2
        : (nextRect.bottom - mapRect.top + currentRect.top - mapRect.top) / 2;
      const cornerRadius = 12;
      const verticalDirection = end.y > start.y ? 1 : -1;
      const sameRowDirection = end.y > start.y ? 1 : -1;
      const sameRowJogX = start.x + Math.max(22, Math.min(42, (end.x - start.x) * 0.42));
      const d = sameRow
        ? [
            `M ${start.x} ${start.y}`,
            `H ${sameRowJogX - cornerRadius}`,
            `Q ${sameRowJogX} ${start.y} ${sameRowJogX} ${start.y + cornerRadius * sameRowDirection}`,
            `V ${end.y - cornerRadius * sameRowDirection}`,
            `Q ${sameRowJogX} ${end.y} ${sameRowJogX + cornerRadius} ${end.y}`,
            `H ${end.x}`,
          ].join(" ")
        : [
            `M ${start.x} ${start.y}`,
            `H ${schematicBusX - cornerRadius}`,
            `Q ${schematicBusX} ${start.y} ${schematicBusX} ${start.y + cornerRadius * verticalDirection}`,
            `V ${rowGutterY - cornerRadius * verticalDirection}`,
            `Q ${schematicBusX} ${rowGutterY} ${schematicBusX - cornerRadius} ${rowGutterY}`,
            `H ${entryStubX + cornerRadius}`,
            `Q ${entryStubX} ${rowGutterY} ${entryStubX} ${rowGutterY + cornerRadius * verticalDirection}`,
            `V ${end.y - cornerRadius * verticalDirection}`,
            `Q ${entryStubX} ${end.y} ${entryStubX + cornerRadius} ${end.y}`,
            `H ${end.x}`,
          ].join(" ");
      return [{ d, id: `${stage}-${nextStage}` }];
    });
    setConnectorPaths((currentPaths) => {
      const samePaths =
        currentPaths.length === nextPaths.length &&
        currentPaths.every((path, index) => path.id === nextPaths[index]?.id && path.d === nextPaths[index]?.d);
      return samePaths ? currentPaths : nextPaths;
    });
  }, []);

  useLayoutEffect(() => {
    updateConnectorPaths();
  }, [compactRouteMap, updateConnectorPaths, visiblePackets.length]);

  useEffect(() => {
    const routeMap = routeMapRef.current;
    if (!routeMap) {
      return;
    }
    const observer = new ResizeObserver(() => updateConnectorPaths());
    observer.observe(routeMap);
    stageStationRefs.current.forEach((node) => observer.observe(node));
    window.addEventListener("resize", updateConnectorPaths);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateConnectorPaths);
    };
  }, [updateConnectorPaths, visiblePackets.length]);

  useEffect(() => {
    const readUsageVisibility = () => {
      setUsageVisibility({
        claude: readStoredUsageVisible(claudeUsageVisibleKey),
        codex: readStoredUsageVisible(codexUsageVisibleKey),
      });
    };
    readUsageVisibility();
    window.addEventListener("storage", readUsageVisibility);
    window.addEventListener("kendall-usage-visibility-change", readUsageVisibility);
    return () => {
      window.removeEventListener("storage", readUsageVisibility);
      window.removeEventListener("kendall-usage-visibility-change", readUsageVisibility);
    };
  }, []);

  return (
    <main
      aria-label="Pipeline cockpit"
      className="grid box-border max-w-full min-w-0 gap-4 overflow-x-hidden"
      onKeyDown={handleCockpitKeyDown}
    >
      <section
        aria-label="Refined pipeline cockpit frame"
        className="grid box-border w-full max-w-full min-w-0 gap-2 overflow-visible"
      >
        <section
          aria-label="Cockpit first-frame hierarchy"
          className="pipeline-nohype-shell grid box-border w-full max-w-full min-w-0 gap-3 overflow-visible rounded-[0.5rem] border p-3"
        >
          <section
            aria-label="Pipeline command strip"
            className="pipeline-command-bar pipeline-video-card box-border w-full max-w-full min-w-0 overflow-visible rounded-[0.5rem] border p-2"
          >
            <div aria-label="Operator command center" className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="min-w-0 text-balance text-xl font-semibold leading-tight text-[var(--foreground)]">
                  Pipeline
                </h1>
                <span className="kendall-info-tip inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--muted)_38%,var(--line))] px-2 py-0.5 text-[0.68rem] font-medium text-[var(--muted)]" tabIndex={0}>
                  <span className="sr-only">{fixtureMode.label}: {fixtureMode.summary}</span>
                  <span aria-hidden="true">{fixtureMode.label}</span>
                  <span aria-hidden="true" className="kendall-info-tip-bubble">{fixtureMode.summary}</span>
                </span>
              </div>
              <span aria-label={`Top blocked packet: ${topBlockedPacket?.title ?? "None"}`} className="sr-only">
                top block: {topBlockedPacket?.title ?? "none"}
              </span>
            </div>
            <label className="sr-only" htmlFor="pipeline-packet-search">
              Packet search
            </label>
            <input
              aria-label="Packet search"
              className="h-8 min-w-[12rem] rounded-[0.375rem] border border-[color-mix(in_srgb,var(--info)_34%,var(--line))] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] px-2 text-sm shadow-[0_0_1rem_color-mix(in_srgb,var(--info)_10%,transparent)] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]"
              id="pipeline-packet-search"
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search packets"
              ref={searchInputRef}
              type="search"
              value={searchQuery}
            />
          </section>

          <section
            aria-label="Pipeline board"
            className="pipeline-board-surface max-w-full min-w-0"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[var(--accent)]">Route map</p>
                <InfoTooltip text="Each stage shows packets currently sitting there. Color marks state; order puts urgent work first." />
                <p className="max-w-2xl text-sm leading-5 text-[var(--muted)]">
                  See what is being worked on and where each packet sits in the process.
                </p>
              </div>
            </div>
            <OperationalStrip packets={packets} usageVisibility={usageVisibility} />
            <MissionControlStrip attentionPacket={attentionPacket} blockedGateCount={blockedGateCount} />
            <div className="pipeline-map-layout mt-3">
              <section
                aria-label="Pipeline route map"
                className="pipeline-route-map min-w-0"
                onKeyDown={handleRouteMapKeyDown}
                ref={routeMapRef}
              >
                <svg aria-hidden="true" className="pipeline-route-connectors">
                  {connectorPaths.map((path) => (
                    <g key={path.id}>
                      <path className="pipeline-route-connector-line" d={path.d} />
                      <path className="pipeline-route-connector-pulse" d={path.d} />
                    </g>
                  ))}
                </svg>
                <div className="pipeline-route-row" ref={routeRowRef}>
                  {pipelineStages.map((stage, stageIndex) => (
                    <RouteStation
                      key={stage}
                      isLast={stageIndex === pipelineStages.length - 1}
                      onFocusStage={() => setFocusedStage(stage)}
                      onSelectStage={() => setSelectedItem({ type: "stage", id: stage })}
                      onSelectPacket={(packetId) =>
                        setSelectedItem((currentItem) =>
                          currentItem?.type === "packet" && currentItem.id === packetId
                            ? null
                            : { type: "packet", id: packetId }
                        )
                      }
                      packets={visiblePackets.filter((packet) => packet.currentStage === stage)}
                      registerStageButton={registerStageButton}
                      registerStageStation={registerStageStation}
                      selectedItem={selectedItem}
                      stage={stage}
                      visibleLimit={stagePacketLimit}
                    />
                  ))}
                </div>
              </section>
              {selectedMapPacket && <PacketInspection packet={selectedMapPacket} />}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

function MissionControlStrip({
  attentionPacket,
  blockedGateCount,
}: {
  attentionPacket: PipelineFixturePacket;
  blockedGateCount: number;
}) {
  const state = attentionPacket.currentStage === "human_gate"
    ? "Needs your decision"
    : attentionPacket.status === "blocked" || attentionPacket.status === "failed"
      ? "Blocked"
      : attentionPacket.status === "active"
        ? "In motion"
        : "Watching";
  return (
    <div aria-label="Mission control focus strip" className="pipeline-mission-strip">
      <span className="pipeline-mission-chip pipeline-mission-chip-attention">
        <span className="pipeline-mission-label">Most urgent</span>
        <span className="pipeline-mission-value">{miniCardLabel(attentionPacket)}</span>
      </span>
      <span className="pipeline-mission-chip">
        <span className="pipeline-mission-label">State</span>
        <span className="pipeline-mission-value">{state}</span>
      </span>
      <span className="pipeline-mission-chip">
        <span className="pipeline-mission-label">Gate</span>
        <span className="pipeline-mission-value">{blockedGateCount > 0 ? `${blockedGateCount} waiting` : "Clear"}</span>
      </span>
    </div>
  );
}

function OperationalStrip({
  packets,
  usageVisibility,
}: {
  packets: PipelineFixturePacket[];
  usageVisibility: { claude: boolean; codex: boolean };
}) {
  const usageItems = globalUsageItems(packets).filter((item) => usageVisibility[item.providerKey]);
  return (
    <div aria-label="Pipeline operational strip" className="pipeline-operational-strip">
      <StatusKey />
      {usageItems.length > 0 ? (
        <div aria-label="Pipeline capacity strip" className="pipeline-capacity-strip">
          {usageItems.map((item) => (
            <span key={item.provider} className={`pipeline-usage-meter pipeline-usage-meter-${item.tone}`}>
              <span className="pipeline-usage-provider-row">
                <span className="pipeline-usage-provider">{item.provider}</span>
                <span className="pipeline-usage-warning" role="note" tabIndex={0}>
                  <span aria-hidden="true" className="pipeline-usage-warning-icon">!</span>
                  <span className="sr-only">{item.detail}</span>
                  <span aria-hidden="true" className="pipeline-usage-warning-bubble">{item.detail}</span>
                </span>
              </span>
              {item.meters.map((meter) => (
                <span key={meter.label} className="pipeline-usage-bar-row">
                  <span className="pipeline-usage-meter-label">{meter.label}</span>
                  <span aria-hidden="true" className="pipeline-usage-meter-track">
                    <span className="pipeline-usage-meter-fill" style={{ width: `${meter.percent}%` }} />
                  </span>
                </span>
              ))}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StatusKey() {
  const items = [
    { label: "Active", className: "pipeline-status-active" },
    { label: "Waiting", className: "pipeline-status-waiting" },
    { label: "Needs approval", className: "pipeline-status-approval" },
    { label: "Blocked", className: "pipeline-status-blocked" },
    { label: "Complete", className: "pipeline-status-complete" },
  ];
  return (
    <div aria-label="Pipeline status key" className="pipeline-status-key flex min-w-0 flex-wrap gap-2 rounded-[0.375rem] border px-2 py-1.5">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${item.className}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function InfoTooltip({ focusable = true, text }: { focusable?: boolean; text: string }) {
  return (
    <span className="kendall-info-tip" tabIndex={focusable ? 0 : undefined}>
      <span aria-hidden="true" className="kendall-info-tip-icon">i</span>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="kendall-info-tip-bubble">{text}</span>
    </span>
  );
}

function RouteStation({
  isLast,
  onFocusStage,
  onSelectPacket,
  onSelectStage,
  packets,
  registerStageButton,
  registerStageStation,
  selectedItem,
  stage,
  visibleLimit,
}: {
  isLast: boolean;
  onFocusStage: () => void;
  onSelectPacket: (packetId: string) => void;
  onSelectStage: () => void;
  packets: PipelineFixturePacket[];
  registerStageButton: (stage: PipelineStage, node: HTMLButtonElement | null) => void;
  registerStageStation: (stage: PipelineStage, node: HTMLDivElement | null) => void;
  selectedItem: SelectedMapItem;
  stage: PipelineStage;
  visibleLimit: number;
}) {
  const sortedPackets = sortPacketsForMap(packets);
  const selected = selectedItem?.type === "stage" && selectedItem.id === stage;
  const visiblePackets = selected ? sortedPackets : sortedPackets.slice(0, visibleLimit);
  const hiddenPacketSummary = selected ? null : overflowSummary(sortedPackets.slice(visibleLimit));
  const stageTone = stageToneForPackets(sortedPackets);
  const stagePurposeId = `pipeline-stage-purpose-${stage}`;

  return (
    <div
      className={`pipeline-route-station pipeline-route-station-${stageTone} ${isLast ? "pipeline-route-station-last" : ""}`}
      ref={(node) => registerStageStation(stage, node)}
    >
      <button
        aria-describedby={stagePurposeId}
        aria-pressed={selected}
        className={`pipeline-stage-station ${selected ? "pipeline-stage-station-selected" : ""}`}
        data-stage={stage}
        onClick={onSelectStage}
        onFocus={onFocusStage}
        ref={(node) => registerStageButton(stage, node)}
        title={stagePurpose(stage)}
        type="button"
      >
        <span aria-hidden="true" className="pipeline-stage-code">{stageCode(stage)}</span>
        <span className="pipeline-stage-label">{formatStageName(stage)}</span>
        <span aria-hidden="true" className="pipeline-stage-info-icon">i</span>
        <span aria-hidden="true" className="pipeline-stage-info-bubble">{stagePurpose(stage)}</span>
      </button>
      <span className="sr-only" id={stagePurposeId}>{stagePurpose(stage)}</span>
      <div className="mt-2 grid min-h-[6.75rem] content-start gap-1.5">
        {visiblePackets.length === 0 ? (
          <span aria-hidden="true" className="pipeline-empty-station min-h-[2.1rem]" />
        ) : (
          visiblePackets.map((packet) => (
            <PacketMiniCard
              key={packet.packetId}
              onSelect={() => onSelectPacket(packet.packetId)}
              packet={packet}
              selected={selectedItem?.type === "packet" && selectedItem.id === packet.packetId}
            />
          ))
        )}
        {hiddenPacketSummary ? (
          <button
            aria-label={`${hiddenPacketSummary} in ${formatStageName(stage)}`}
            className="pipeline-more-packets rounded-[0.375rem] border border-dashed px-2 py-1 text-left text-xs text-[var(--muted)]"
            onClick={onSelectStage}
            type="button"
          >
            {hiddenPacketSummary}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PacketMiniCard({
  onSelect,
  packet,
  selected,
}: {
  onSelect: () => void;
  packet: PipelineFixturePacket;
  selected: boolean;
}) {
  const statusClass = statusClassForPacket(packet);
  return (
    <button
      aria-label={`Inspect packet: ${packet.title}`}
      aria-pressed={selected}
      className={`pipeline-mini-packet ${statusClass} ${selected ? "pipeline-mini-packet-selected" : ""}`}
      onClick={onSelect}
      title={`${packet.title} - ${plainStageLabel(packet.currentStage)}`}
      type="button"
    >
      <span aria-hidden="true" className="pipeline-mini-packet-dot" />
      <span className="pipeline-mini-packet-label">{miniCardLabel(packet)}</span>
      {packet.status === "blocked" || packet.status === "failed" || packet.currentStage === "human_gate" ? (
        <span aria-hidden="true" className="pipeline-mini-packet-alert">!</span>
      ) : null}
    </button>
  );
}

function PacketInspection({ packet }: { packet: PipelineFixturePacket }) {
  return (
    <aside aria-label="Packet inspection panel" className="pipeline-inspection-panel rounded-[0.5rem] border p-3">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[var(--accent)]">Selected packet</p>
      <h2 className="mt-1 text-lg font-semibold leading-6">{packet.title}</h2>
      <div aria-label="Packet plain-language summary" className="pipeline-packet-summary mt-3">
        <span className="pipeline-packet-summary-state">{plainStatusLabel(packet)}</span>
        <span>{packet.summary}</span>
      </div>
      <dl className="mt-3 grid gap-2 text-sm">
        <InspectionRow label="Where" value={plainStageLabel(packet.currentStage)} />
        <InspectionRow label="Came from" value={originLabel(packet)} />
        <InspectionRow label="Got here" value="From the current fixture state" />
        <InspectionRow label="Next" value={plainNextStageLabel(packet)} />
        <InspectionRow label="Blocked by" value={blockerLabel(packet)} />
      </dl>
      <Link
        className="mt-3 inline-flex rounded-[0.375rem] border border-[color-mix(in_srgb,var(--accent)_42%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-1.5 text-sm font-semibold text-[var(--accent)] no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]"
        href={`/pipeline/packets/${encodeURIComponent(packet.packetId)}`}
      >
        Open full packet
      </Link>
    </aside>
  );
}

function InspectionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-[var(--muted)]">{label}</dt>
      <dd className="text-[var(--foreground)]">{value}</dd>
    </div>
  );
}

function sortPacketsForMap(packets: PipelineFixturePacket[]) {
  return [...packets].sort((left, right) => {
    return (
      packetUrgencyRank(right) - packetUrgencyRank(left)
      || priorityRank[right.priority] - priorityRank[left.priority]
      || left.title.localeCompare(right.title)
    );
  });
}

function packetUrgencyRank(packet: PipelineFixturePacket) {
  if (packet.currentStage === "human_gate") {
    return 60;
  }
  if (packet.status === "blocked" || packet.status === "failed") {
    return 50;
  }
  if (packet.status === "active") {
    return 40;
  }
  if (isSourceRiskPacket(packet)) {
    return 30;
  }
  if (packet.status === "waiting") {
    return 20;
  }
  if (packet.status === "complete") {
    return 10;
  }
  return 0;
}

function isSourceRiskPacket(packet: PipelineFixturePacket) {
  return (
    packet.sourceTrustStates.some((state) => state === "stale" || state === "contradictory" || state === "unavailable")
    || packet.confidenceLabel.toLowerCase().includes("low")
  );
}

function overflowSummary(packets: PipelineFixturePacket[]) {
  if (packets.length === 0) {
    return null;
  }
  const approvalCount = packets.filter((packet) => packet.currentStage === "human_gate").length;
  if (approvalCount > 0) {
    return approvalCount === 1 ? "1 needs approval" : `${approvalCount} need approval`;
  }
  const blockedCount = packets.filter((packet) => packet.status === "blocked" || packet.status === "failed").length;
  if (blockedCount > 0) {
    return blockedCount === 1 ? "1 blocked" : `${blockedCount} blocked`;
  }
  const sourceRiskCount = packets.filter(isSourceRiskPacket).length;
  if (sourceRiskCount > 0) {
    return sourceRiskCount === 1 ? "1 stale source" : `${sourceRiskCount} stale sources`;
  }
  const activeCount = packets.filter((packet) => packet.status === "active").length;
  if (activeCount > 0) {
    return activeCount === 1 ? "1 active" : `${activeCount} active`;
  }
  const waitingCount = packets.filter((packet) => packet.status === "waiting").length;
  if (waitingCount > 0) {
    return waitingCount === 1 ? "1 waiting" : `${waitingCount} waiting`;
  }
  return packets.length === 1 ? "1 low-risk packet" : `${packets.length} low-risk packets`;
}

function stageToneForPackets(packets: PipelineFixturePacket[]) {
  const topPacket = packets[0];
  if (!topPacket) {
    return "empty";
  }
  if (topPacket.currentStage === "human_gate") {
    return "approval";
  }
  if (topPacket.status === "blocked" || topPacket.status === "failed") {
    return "blocked";
  }
  if (topPacket.status === "active") {
    return "active";
  }
  if (topPacket.status === "complete") {
    return "complete";
  }
  return "waiting";
}

function globalUsageItems(_packets: PipelineFixturePacket[]) {
  const disconnectedUsageDetail = "Usage source is not connected. Configure a read-only source in Settings.";
  return [
    {
      detail: disconnectedUsageDetail,
      meters: [
        { label: "5h", percent: 0 },
        { label: "Weekly", percent: 0 },
      ],
      provider: "Codex",
      providerKey: "codex" as const,
      tone: "codex",
    },
    {
      detail: disconnectedUsageDetail,
      meters: [
        { label: "5h", percent: 0 },
        { label: "Weekly", percent: 0 },
      ],
      provider: "Claude",
      providerKey: "claude" as const,
      tone: "claude",
    },
  ];
}

function statusClassForPacket(packet: PipelineFixturePacket) {
  if (packet.currentStage === "human_gate") {
    return "pipeline-mini-packet-approval";
  }
  if (packet.status === "blocked" || packet.status === "failed") {
    return "pipeline-mini-packet-blocked";
  }
  if (packet.status === "complete") {
    return "pipeline-mini-packet-complete";
  }
  if (packet.status === "active") {
    return "pipeline-mini-packet-active";
  }
  return "pipeline-mini-packet-waiting";
}

function miniCardLabel(packet: PipelineFixturePacket) {
  const reasonLabel = miniCardReasonLabel(packet);
  if (reasonLabel) {
    return reasonLabel;
  }
  const stopWords = new Set(["a", "an", "and", "before", "for", "from", "in", "of", "or", "the", "to", "with"]);
  const words = packet.title
    .replace(/^Density \d+:\s*/, "")
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 1 && !stopWords.has(word));
  return words.slice(0, 3).join(" ") || packet.packetId;
}

function miniCardReasonLabel(packet: PipelineFixturePacket) {
  const normalizedTitle = packet.title.toLowerCase();
  if (packet.currentStage === "human_gate") {
    return normalizedTitle.includes("approve") ? "approve cockpit" : "approval needed";
  }
  if (packet.status === "failed" || packet.status === "blocked") {
    if (normalizedTitle.includes("worker")) {
      return "worker failed";
    }
    if (normalizedTitle.includes("review")) {
      return "review blocked";
    }
    if (packet.hermesJob?.statusLabel === "blocked_containment") {
      return "hermes blocked";
    }
    return packet.status === "failed" ? "needs recovery" : "blocked";
  }
  if (packet.localModelHealth?.statusLabel === "model_mismatch") {
    return "model mismatch";
  }
  if (packet.localModelHealth?.statusLabel === "endpoint_mismatch") {
    return "endpoint mismatch";
  }
  if (packet.localModelHealth?.statusLabel === "unavailable") {
    return "model unavailable";
  }
  if (packet.localModelHealth?.statusLabel === "busy") {
    return "gpu busy";
  }
  if (isSourceRiskPacket(packet)) {
    return "stale source";
  }
  if (packet.claudeReview?.statusLabel === "pending") {
    return "review pending";
  }
  if (packet.codexWorker?.readiness === "active") {
    return "codex active";
  }
  if (packet.memoryProposals.length > 0) {
    return "memory proposal";
  }
  if (packet.currentStage === "promote") {
    return "promote candidate";
  }
  return null;
}

function isPipelineStage(value: string | undefined): value is PipelineStage {
  return pipelineStages.includes(value as PipelineStage);
}

function formatStageName(stage: PipelineStage) {
  if (stage === "human_gate") {
    return "Needs approval";
  }
  return stage
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function stageCode(stage: PipelineStage) {
  const codes: Record<PipelineStage, string> = {
    capture: "CAP",
    classify: "CLS",
    route: "RTE",
    shape: "SHP",
    human_gate: "APP",
    execute: "EXE",
    review: "REV",
    promote: "PRO",
    deliver: "DLV",
    learn: "LRN",
  };
  return codes[stage];
}

function stagePurpose(stage: PipelineStage) {
  const purposes: Record<PipelineStage, string> = {
    capture: "New ideas and requests land here before Kendall decides what they are.",
    classify: "Kendall sorts the packet so it can move through the right path.",
    route: "Kendall chooses whether the packet needs planning, approval, execution, or review.",
    shape: "The packet is turned into clear work with enough context to act on.",
    human_gate: "Work waits here when you need to approve, reject, or send it back.",
    execute: "Approved work is actively being built, checked, or run.",
    review: "Completed work is inspected before it can move forward.",
    promote: "Reviewed work is prepared to become the accepted version.",
    deliver: "Finished work and its evidence are handed back for use.",
    learn: "Useful lessons or memory updates are reviewed before being kept.",
  };
  return purposes[stage];
}

function plainStageLabel(stage: PipelineStage) {
  const labels: Record<PipelineStage, string> = {
    capture: "Captured intake",
    classify: "Being sorted",
    route: "Choosing the path",
    shape: "Planning the work",
    human_gate: "Needs your approval",
    execute: "Being worked",
    review: "Under review",
    promote: "Ready to promote",
    deliver: "Delivery and evidence",
    learn: "Learning and memory review",
  };
  return labels[stage];
}

function plainNextStageLabel(packet: PipelineFixturePacket) {
  if (packet.status === "blocked" || packet.status === "failed" || packet.currentStage === "human_gate") {
    return packet.nextAction;
  }
  const currentIndex = pipelineStages.indexOf(packet.currentStage);
  if (packet.status === "complete" || currentIndex === pipelineStages.length - 1) {
    return "Done for now";
  }
  const nextStage = pipelineStages[currentIndex + 1];
  return nextStage ? plainStageLabel(nextStage) : "Next step not named yet";
}

function originLabel(packet: PipelineFixturePacket) {
  if (packet.sourceTrustStates.includes("stale")) {
    return "Research or source review";
  }
  if (packet.fixtureKind === "local-readiness") {
    return "Local readiness check";
  }
  if (packet.fixtureKind === "future-real-source") {
    return "Future real-source boundary";
  }
  return packet.fixtureLabel;
}

function blockerLabel(packet: PipelineFixturePacket) {
  if (packet.currentStage === "human_gate") {
    return "Approval required before work can move forward";
  }
  if (packet.status === "blocked" || packet.status === "failed") {
    return packet.riskFlags[0] ?? packet.nextAction;
  }
  if (packet.sourceTrustStates.includes("stale")) {
    return "Source freshness needs review";
  }
  return "No blocker named";
}

function plainStatusLabel(packet: PipelineFixturePacket) {
  if (packet.currentStage === "human_gate") {
    return "Needs approval";
  }
  if (packet.status === "active") {
    return "In motion";
  }
  if (packet.status === "blocked") {
    return "Blocked";
  }
  if (packet.status === "failed") {
    return "Needs recovery";
  }
  if (packet.status === "complete") {
    return "Complete";
  }
  return "Waiting";
}

function findTopBlockedPacket(packets: PipelineFixturePacket[]) {
  return packets
    .filter((packet) => packet.status === "blocked" || packet.currentStage === "human_gate")
    .sort((left, right) => priorityRank[right.priority] - priorityRank[left.priority])[0];
}

function searchablePacketText(packet: PipelineFixturePacket) {
  return [
    packet.title,
    miniCardLabel(packet),
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
