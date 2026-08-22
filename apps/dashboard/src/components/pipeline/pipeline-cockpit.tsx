"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import type {
  PipelineGatedOperationalActionIdV0,
  PipelineOperationalActionApprovalRequestV0,
  PipelineOperationalActionRequestV0,
  PipelineOperationalActionApprovalRequestV1,
  PipelineOperationalActionRequestV1,
  PipelineStage,
} from "@kendall/contracts";
import {
  projectDashboardCanonicalPresentationsToCockpitPackets,
  type PipelineCanonicalPresentationPacketV1,
} from "../../lib/pipeline-supervisor-projector";
import {
  projectionDisplayLabels,
  projectionEffectiveLabels,
  projectionHasRenderableBackendPackets,
  projectionLiveProofLabel,
  projectionLiveProofState,
  currentProjectionAllowsOperationalActions,
} from "../../lib/pipeline/projection-truth";
import {
  buildPipelineActiveBoardViewModel,
  buildRuntimeOperationalActionStrip,
  type PipelineActiveBoardViewModel,
  type PipelineBackpressureState,
  type PipelineCanonicalPacketDetail,
  type PipelineCompactPacketCard,
  type PipelineContextualActionStrip,
  type PipelineDiagnosticsItem,
  type PipelinePacketDetailWhyDiagnostics,
  type PipelineStaleHistoryItem,
} from "../../lib/pipeline/active-board-view-model";
import type {
  PipelineManagerAuthorityOperationRow,
  PipelineManagerDeliveryControlRow,
  PipelineManagerExecutionLaneState,
  PipelineManagerFeedbackRouteRow,
  PipelineManagerLanePanel,
  PipelineManagerLaneRow,
} from "../../lib/pipeline/manager-execution-lane-types";
import {
  applyPipelineOperationalAction,
  applyPipelineOperationalActionV1,
  requestPipelineOperationalApproval,
  requestPipelineOperationalApprovalV1,
} from "../../lib/pipeline-supervisor-actions";
import type { DashboardCanonicalWorkPacketClientV1, PipelineRuntimeSourceState } from "../../lib/pipeline-packet-loader";
import type {
  DashboardCanonicalActiveBoardProjectionV1,
  DashboardCanonicalOperationalProjectionTruthV1,
  DashboardCanonicalOperationalProjectionV1,
} from "../../lib/pipeline/canonical-operational-projection";

/** Demo fixtures retain the legacy packet model; normal runtime uses this canonical packet DTO. */
type PipelineCockpitPacket = {
  packetId: string;
  title: string;
  requestedOutcome: string;
  currentStage: PipelineStage;
  currentOwner: string;
  status: "active" | "waiting" | "blocked" | "failed" | "complete" | "deferred";
  riskLevel: "low" | "medium" | "high";
  priority: "low" | "normal" | "high" | "urgent";
  sourceRefs: Array<{ refId: string; sourceType: string; freshness: string; accessState: string; pathOrUrl?: string | null; canonical?: boolean; summaryOnly?: boolean; blockedReason?: string | null }>;
  evidenceRefs: Array<{ refId: string }>;
  executionAttempts: Array<{ attemptId: string; authorityMode: string; workerId: string; status: string; evidenceRefs: string[] }>;
  humanGateActions: Array<{ label: string }>;
  laneCards: Array<{ laneId: string; label: string; status: string; summary: string; currentOwner?: string | null; evidenceRefs: string[] }>;
  fixtureId?: string;
  fixtureKind?: string;
  sourceKind?: "supervisor-runtime" | "demo-fixture" | "projection";
  sourceId?: string;
  fixtureLabel: string;
  summary: string;
  nextAction: string;
  confidenceLabel: string;
  freshnessLabel: string;
  sourceTrustState: string;
  sourceTrustStates: string[];
  sourceTrustSummary: string;
  lastEvent: string;
  matrixRowIds: string[];
  lifecycleState: unknown;
  routeSummary?: null | { recommendation?: string | null; confidenceScore?: number | null; confidenceBand?: string | null; reasonCodes?: string[] | null };
  routeFork: { selectedRoute: string; rejectedRoutes: string[]; tags: string[]; sourceContext: string; lowConfidenceActions: string[] };
  riskFlags: string[];
  activeBoardCard?: PipelineCompactPacketCard;
};

type PipelineFixturePacket = PipelineCockpitPacket;
/** The normal path reaches this component only through the canonical presentation projector below. */
type PipelineCanonicalCockpitPacket = PipelineCanonicalPresentationPacketV1 & PipelineCockpitPacket;

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

type CockpitStageSummary = {
  emptyReason: DashboardCanonicalActiveBoardProjectionV1["stageSummaries"][number]["emptyReason"];
  freshnessState: DashboardCanonicalActiveBoardProjectionV1["stageSummaries"][number]["freshnessState"] | "demo" | "empty" | "invalid";
  label: string;
  packetCount: number;
  sourceLabel: DashboardCanonicalActiveBoardProjectionV1["stageSummaries"][number]["sourceLabel"] | "demo" | "empty" | "invalid";
};

type ProjectionSelectedPacketDetail = DashboardCanonicalOperationalProjectionV1["selectedPacketDetails"][number];
type ActiveBoardSelectedPacketDetail = DashboardCanonicalActiveBoardProjectionV1["selectedPacketDetails"][number];
type ActiveManagerLaneClarity = NonNullable<DashboardCanonicalOperationalProjectionV1["activeManagerLaneClarity"]>;
type PipelineCoordinationHealth = NonNullable<DashboardCanonicalOperationalProjectionV1["coordinationHealth"]>;
type ActiveBoardCockpitPacket = PipelineCockpitPacket;

export function PipelineCockpit({
  fixtureMode,
  managerExecutionLane,
  readOnly = false,
  canonicalPackets,
  operationalTruth,
  packets,
  activeBoardProjection,
  operationalProjection,
  projectionError,
  selectedPacket,
}: {
  fixtureMode: PipelineRuntimeSourceState;
  managerExecutionLane?: PipelineManagerExecutionLaneState | null;
  /** Fixed test_viewer sessions can inspect truth but never receive action affordances. */
  readOnly?: boolean;
  /** Client-safe canonical runtime rows; this boundary owns the canonical presentation projector. */
  canonicalPackets?: readonly DashboardCanonicalWorkPacketClientV1[];
  /** Versioned canonical truth for action gating. */
  operationalTruth?: DashboardCanonicalOperationalProjectionTruthV1 | null;
  /** Explicit-demo V0 fixtures only. Normal runtime callers pass canonicalPackets. */
  packets?: PipelineFixturePacket[];
  /** Independently reconstructed dashboard-owned active-board model. */
  activeBoardProjection?: DashboardCanonicalActiveBoardProjectionV1 | null;
  /** Strict canonical board model; no V0 projection envelope crosses this boundary. */
  operationalProjection?: DashboardCanonicalOperationalProjectionV1 | null;
  projectionError?: string | null;
  selectedPacket?: PipelineFixturePacket | null;
}) {
  const presentationPackets = useMemo<PipelineCockpitPacket[]>(() => {
    if (!canonicalPackets) return packets ?? [];
    const canonicalPresentation = projectDashboardCanonicalPresentationsToCockpitPackets(
      canonicalPackets.map((packet) => packet.presentation),
    );
    return canonicalPresentation.kind === "runtime"
      ? canonicalPresentation.packets as PipelineCanonicalCockpitPacket[]
      : [];
  }, [canonicalPackets, packets]);
  const [selectedItem, setSelectedItem] = useState<SelectedMapItem>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedStage, setFocusedStage] = useState<PipelineStage>("capture");
  const [compactRouteMap, setCompactRouteMap] = useState(false);
  const [staleHistoryOpen, setStaleHistoryOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [usageVisibility, setUsageVisibility] = useState({ claude: true, codex: true });
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [projectionTruthClock, setProjectionTruthClock] = useState(() => Date.now());
  const currentProjection = operationalProjection ?? null;
  const currentActiveBoardProjection = activeBoardProjection ?? null;
  const currentOperationalTruth = operationalTruth ?? null;
  const activeManagerLaneClarity = currentProjection?.activeManagerLaneClarity ?? null;
  const currentProjectionError = projectionError ?? null;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const routeMapRef = useRef<HTMLElement | null>(null);
  const routeRowRef = useRef<HTMLDivElement | null>(null);
  const stageAnchorRefs = useRef(new Map<PipelineStage, HTMLSpanElement>());
  const stageButtonRefs = useRef(new Map<PipelineStage, HTMLButtonElement>());
  const stageStationRefs = useRef(new Map<PipelineStage, HTMLDivElement>());
  const packetButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const selectedPacketReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const staleHistoryButtonRef = useRef<HTMLButtonElement | null>(null);
  const diagnosticsButtonRef = useRef<HTMLButtonElement | null>(null);
  const [connectorPaths, setConnectorPaths] = useState<ConnectorPath[]>([]);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const activeBoardViewModel = useMemo(
    () => currentActiveBoardProjection ? buildPipelineActiveBoardViewModel(currentActiveBoardProjection) : null,
    [currentActiveBoardProjection]
  );
  const dashboardPackets = useMemo(
    () => projectionToCockpitPackets(currentActiveBoardProjection, presentationPackets, currentProjectionError, activeBoardViewModel, fixtureMode),
    [activeBoardViewModel, presentationPackets, currentActiveBoardProjection, currentProjectionError, fixtureMode]
  );
  const stageSummaryByStage = useMemo(
    () => buildStageSummaryByStage(currentActiveBoardProjection, currentProjectionError, fixtureMode),
    [currentActiveBoardProjection, currentProjectionError, fixtureMode]
  );
  const visiblePackets = useMemo(
    () =>
      normalizedSearchQuery.length === 0
        ? dashboardPackets
        : dashboardPackets.filter((packet) => searchablePacketText(packet).includes(normalizedSearchQuery)),
    [dashboardPackets, normalizedSearchQuery]
  );
  const selectedMapPacket = selectedItem?.type === "packet"
    ? dashboardPackets.find((packet) => packet.packetId === selectedItem.id) ?? null
    : null;
  const selectedProjectionWorkPacket = selectedItem?.type === "packet"
    ? currentProjection?.workPackets.find((packet) => packet.packetId === selectedItem.id) ?? null
    : null;
  const selectedProjectionDetail = selectedItem?.type === "packet"
    ? currentProjection?.selectedPacketDetails.find((detail) => detail.packetId === selectedItem.id) ?? null
    : null;
  const selectedPacketDetailWhyDiagnostics = selectedItem?.type === "packet"
    ? activeBoardViewModel?.packetDetails?.byPacketId?.[selectedItem.id] ?? null
    : null;
  const selectedDetailOnlyPacket = selectedItem?.type === "packet" && !selectedMapPacket && selectedProjectionWorkPacket
    ? projectionWorkPacketToDetailOnlyCockpitPacket(
        selectedProjectionWorkPacket,
        selectedProjectionDetail,
        currentProjection,
        selectedPacketDetailWhyDiagnostics?.canonical ?? null
      )
    : null;
  const selectedProjectionPacketMissing = selectedItem?.type === "packet"
    && Boolean(currentProjection)
    && !dashboardPackets.some((packet) => packet.packetId === selectedItem.id)
    && !currentProjection?.workPackets.some((packet) => packet.packetId === selectedItem.id)
    && !currentProjection?.selectedPacketDetails.some((detail) => detail.packetId === selectedItem.id);
  const selectedContextualActionStrip = !readOnly && selectedItem?.type === "packet"
    ? activeBoardViewModel?.contextualActions.byPacketId[selectedItem.id] ?? null
    : null;
  const effectiveProjectionLabels = currentOperationalTruth ? projectionEffectiveLabels(currentOperationalTruth, projectionTruthClock) : null;
  const projectionSupportsOperationalActions = currentOperationalTruth
    ? projectionLiveProofState(
        currentOperationalTruth,
        effectiveProjectionLabels?.sourceLabel ?? "unavailable",
        effectiveProjectionLabels?.freshnessState ?? "unavailable"
      ).canSatisfyLiveProof
    : false;
  const runtimeActionStrip = !readOnly && currentActiveBoardProjection && fixtureMode.kind === "runtime" && projectionSupportsOperationalActions
    ? buildRuntimeOperationalActionStrip(currentActiveBoardProjection)
    : null;
  const blockedGateCount = dashboardPackets.filter((packet) => packet.currentStage === "human_gate").length;
  const topBlockedPacket = findTopBlockedPacket(dashboardPackets);
  const topAttentionPacket = findTopAttentionPacket(dashboardPackets);
  const attentionPacket = topAttentionPacket
    ?? dashboardPackets.find((packet) => packet.status === "active")
    ?? (currentProjection ? null : selectedPacket)
    ?? null;
  const stagePacketLimit = normalizedSearchQuery.length > 0 ? 8 : (compactRouteMap ? 3 : 4);
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
    },
    []
  );
  const focusPanelReturnTarget = useCallback((target: HTMLButtonElement | null) => {
    if (target?.isConnected && !target.disabled) {
      target.focus();
      return;
    }
    searchInputRef.current?.focus();
  }, []);
  const closeSelectedItem = useCallback(() => {
    setSelectedItem(null);
    window.setTimeout(() => {
      focusPanelReturnTarget(selectedPacketReturnFocusRef.current);
    }, 0);
  }, [focusPanelReturnTarget]);
  const closeStaleHistory = useCallback(() => {
    setStaleHistoryOpen(false);
    window.setTimeout(() => focusPanelReturnTarget(staleHistoryButtonRef.current), 0);
  }, [focusPanelReturnTarget]);
  const closeDiagnostics = useCallback(() => {
    setDiagnosticsOpen(false);
    window.setTimeout(() => focusPanelReturnTarget(diagnosticsButtonRef.current), 0);
  }, [focusPanelReturnTarget]);
  const handleSelectPacket = useCallback((packetId: string, trigger: HTMLButtonElement) => {
    selectedPacketReturnFocusRef.current = trigger;
    packetButtonRefs.current.set(packetId, trigger);
    setSelectedItem((currentItem) =>
      currentItem?.type === "packet" && currentItem.id === packetId
        ? null
        : { type: "packet", id: packetId }
    );
  }, []);
  const handleOperationalAction = useCallback(async (action: PipelineContextualActionStrip["actions"][number], packetId: string) => {
    if (readOnly) {
      setActionFeedback("This dashboard account is read-only.");
      return;
    }
    if (fixtureMode.kind !== "runtime") {
      setActionFeedback("Operational actions are unavailable outside supervisor runtime mode.");
      return;
    }
    if (!currentProjectionAllowsOperationalActions(currentOperationalTruth)) {
      setActionFeedback("Operational actions are unavailable until the supervisor projection is current live truth.");
      return;
    }
    if (action.v1Capability) {
      const capability = action.v1Capability;
      if (
        action.state !== "available" ||
        capability.capabilityState !== "available" ||
        capability.serverBound !== true ||
        capability.sourceMode !== (packetId === "supervisor-runtime" ? "supervisor_runtime" : "packet") ||
        !capability.targetId ||
        !capability.actionContextDigestSha256
      ) {
        return;
      }
      const requestedBy = { actorType: "operator", actorId: "pipeline-operator", actorLabel: "Pipeline operator" } as const;
      const approvalRequest = {
        schemaVersion: "pipeline-operational-action/v1",
        actionId: capability.actionId,
        targetType: capability.targetType,
        targetId: capability.targetId,
        actionContext: capability.actionContext,
        actionContextDigestSha256: capability.actionContextDigestSha256,
        requestedBy,
        requestedAuthorityState: "needs_authority_approval",
        requestedRiskTier: capability.riskTier,
        serverBound: true,
        metadataOnly: true,
        rawPayloadRetained: false,
      } as PipelineOperationalActionApprovalRequestV1;
      try {
        if (!currentProjectionAllowsOperationalActions(currentOperationalTruth)) {
          setActionFeedback("Operational actions are unavailable until the supervisor projection is current live truth.");
          return;
        }
        const approval = await requestPipelineOperationalApprovalV1(approvalRequest);
        const request = {
          schemaVersion: approval.schemaVersion,
          actionId: approval.actionId,
          targetType: approval.targetType,
          targetId: approval.targetId,
          actionContext: approval.actionContext,
          actionContextDigestSha256: approval.actionContextDigestSha256,
          idempotencyKey: `pipeline-ui-${crypto.randomUUID()}`,
          correlationId: crypto.randomUUID(),
          requestedBy: approval.requestedBy,
          requestedAuthorityState: approval.requestedAuthorityState,
          requestedRiskTier: approval.requestedRiskTier,
          approvalId: approval.approvalId,
          serverBound: true,
          evidenceRefs: ["operational-action:dashboard-v1"],
          metadataOnly: true,
          rawPayloadRetained: false,
        } as PipelineOperationalActionRequestV1;
        if (!currentProjectionAllowsOperationalActions(currentOperationalTruth)) {
          setActionFeedback("Operational actions are unavailable until the supervisor projection is current live truth.");
          return;
        }
        const result = await applyPipelineOperationalActionV1(request);
        setActionFeedback(`${result.actionId}: ${result.outcome}; ${result.typedReason ?? "state updated"}; correlation ${result.correlationId}`);
        window.setTimeout(() => window.location.reload(), 250);
      } catch (error) {
        setActionFeedback(error instanceof Error ? error.message : "Operational v1 action failed.");
      }
      return;
    }
    const gatedActionIds = ["mark_tested", "request_rework", "requeue", "reject"] as const satisfies readonly PipelineGatedOperationalActionIdV0[];
    if (action.state !== "available" || !gatedActionIds.includes(action.actionId as (typeof gatedActionIds)[number])) {
      return;
    }
    const gatedActionId = action.actionId as (typeof gatedActionIds)[number];
    const testResult = action.actionInstanceId.endsWith(":pass")
      ? "pass"
      : action.actionInstanceId.endsWith(":fail")
        ? "fail"
        : undefined;
    const requestedBy = { actorType: "operator", actorId: "pipeline-operator", actorLabel: "Pipeline operator" } as const;
    const approvalRequest: PipelineOperationalActionApprovalRequestV0 = {
      actionId: gatedActionId,
      targetType: "work_packet",
      targetId: packetId,
      requestedBy,
      requestedAuthorityState: gatedActionId === "requeue" ? "needs_authority_approval" : "needs_product_approval",
      requestedRiskTier: "medium",
      metadataOnly: true,
      rawPayloadRetained: false,
    };
    try {
      if (!currentProjectionAllowsOperationalActions(currentOperationalTruth)) {
        setActionFeedback("Operational actions are unavailable until the supervisor projection is current live truth.");
        return;
      }
      const approval = await requestPipelineOperationalApproval(approvalRequest);
      const request: PipelineOperationalActionRequestV0 = {
        schemaVersion: "pipeline-operational-action/v0",
        actionId: approval.actionId,
        targetType: approval.targetType,
        targetId: approval.targetId,
        idempotencyKey: `pipeline-ui:${packetId}:${action.actionId}:${Date.now()}`,
        correlationId: `pipeline-ui:${packetId}:${action.actionId}:${Date.now()}`,
        requestedBy,
        requestedAuthorityState: approval.requestedAuthorityState,
        requestedRiskTier: approval.requestedRiskTier,
        approvalId: approval.approvalId,
        expectedCurrentEventId: approval.expectedCurrentEventId,
        operatorIntentSummary: `${action.label} from /pipeline packet detail.`,
        evidenceRefs: ["evidence:dashboard-action-request"],
        testResult,
        metadataOnly: true,
        rawPayloadRetained: false,
      };
      if (!currentProjectionAllowsOperationalActions(currentOperationalTruth)) {
        setActionFeedback("Operational actions are unavailable until the supervisor projection is current live truth.");
        return;
      }
      const result = await applyPipelineOperationalAction(request);
      setActionFeedback(`${result.actionId}: ${result.outcome}; ${result.typedReason ?? "state updated"}; correlation ${result.correlationId}`);
      window.setTimeout(() => window.location.reload(), 250);
    } catch (error) {
      setActionFeedback(error instanceof Error ? error.message : "Operational action failed.");
    }
  }, [currentOperationalTruth, fixtureMode.kind, readOnly]);
  const registerPacketButton = useCallback((packetId: string, node: HTMLButtonElement | null) => {
    if (node) {
      packetButtonRefs.current.set(packetId, node);
      return;
    }
    packetButtonRefs.current.delete(packetId);
  }, []);
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
    const targetWithinPacketDetail = target?.closest('[data-pipeline-panel="packet-detail"]');
    const targetWithinStaleHistory = target?.closest('[data-pipeline-panel="stale-history"]');
    const targetWithinDiagnostics = target?.closest('[data-pipeline-panel="diagnostics"]');
    if (targetWithinPacketDetail && selectedItem !== null) {
      event.preventDefault();
      closeSelectedItem();
      return;
    }
    if (targetWithinStaleHistory && staleHistoryOpen) {
      event.preventDefault();
      closeStaleHistory();
      return;
    }
    if (targetWithinDiagnostics && diagnosticsOpen) {
      event.preventDefault();
      closeDiagnostics();
      return;
    }
    if (staleHistoryOpen) {
      event.preventDefault();
      closeStaleHistory();
      return;
    }
    if (selectedItem !== null) {
      event.preventDefault();
      closeSelectedItem();
    }
  }, [closeDiagnostics, closeSelectedItem, closeStaleHistory, diagnosticsOpen, focusSearchFromShortcut, searchQuery.length, selectedItem, staleHistoryOpen]);
  const registerStageAnchor = useCallback((stage: PipelineStage, node: HTMLSpanElement | null) => {
    if (node) {
      stageAnchorRefs.current.set(stage, node);
      return;
    }
    stageAnchorRefs.current.delete(stage);
  }, []);
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
      closeSelectedItem();
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
  }, [closeSelectedItem, moveStageFocus]);

  useEffect(() => {
    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      focusSearchFromShortcut(event);
    };
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown);
  }, [focusSearchFromShortcut]);

  useEffect(() => {
    setProjectionTruthClock(Date.now());
    if (!currentProjection) {
      return;
    }
    const sourceUpdatedAt = Date.parse(currentProjection.sourceUpdatedAt);
    const expiresAt = sourceUpdatedAt + currentProjection.staleAfterSeconds * 1000;
    if (!Number.isFinite(expiresAt)) {
      return;
    }
    const delay = expiresAt - Date.now();
    if (delay <= 0) {
      return;
    }
    const timer = window.setTimeout(
      () => setProjectionTruthClock(Date.now()),
      Math.min(delay + 1, 2_147_483_647)
    );
    return () => window.clearTimeout(timer);
  }, [currentProjection]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 720px)");
    const updateCompactRouteMap = () => setCompactRouteMap(mediaQuery.matches);
    updateCompactRouteMap();
    mediaQuery.addEventListener("change", updateCompactRouteMap);
    return () => mediaQuery.removeEventListener("change", updateCompactRouteMap);
  }, []);

  const updateConnectorPaths = useCallback(() => {
    const routeMap = routeMapRef.current;
    if (!routeMap) {
      setConnectorPaths([]);
      return;
    }
    const mapRect = routeMap.getBoundingClientRect();
    const nextPaths = pipelineStages.slice(0, -1).flatMap((stage, index) => {
      const nextStage = pipelineStages[index + 1];
      const currentNode = stageAnchorRefs.current.get(stage);
      const nextNode = stageAnchorRefs.current.get(nextStage);
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
  }, [compactRouteMap, updateConnectorPaths]);

  useEffect(() => {
    const routeMap = routeMapRef.current;
    if (!routeMap) {
      return;
    }
    const observer = new ResizeObserver(() => updateConnectorPaths());
    observer.observe(routeMap);
    stageAnchorRefs.current.forEach((node) => observer.observe(node));
    stageStationRefs.current.forEach((node) => observer.observe(node));
    window.addEventListener("resize", updateConnectorPaths);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateConnectorPaths);
    };
  }, [updateConnectorPaths]);

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

          <ProjectionTruthSummary
            activeBoardViewModel={activeBoardViewModel}
            projection={currentActiveBoardProjection}
            projectionError={currentProjectionError}
            sourceState={fixtureMode}
          />
          {runtimeActionStrip ? (
            <ContextualActionStripPanel
              onAction={(action) => handleOperationalAction(action, "supervisor-runtime")}
              strip={runtimeActionStrip}
            />
          ) : null}

          <section
            aria-label="Pipeline board"
            className="pipeline-board-surface max-w-full min-w-0"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[var(--accent)]">Active board</p>
                <InfoTooltip text="Shows current actionable packets. Stale and diagnostic packets stay out of active lanes." />
                {activeBoardViewModel?.staleHistory.count ? (
                  <p className="max-w-2xl text-sm leading-5 text-[var(--muted)]">
                    No stale packets are shown as live work. {activeBoardViewModel.staleHistory.summary}
                  </p>
                ) : null}
              </div>
              <div className="flex min-w-0 flex-wrap gap-2">
                <button
                  aria-expanded={staleHistoryOpen}
                  className="rounded-[0.375rem] border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-55"
                  disabled={!activeBoardViewModel?.staleHistory.count}
                  onClick={() => setStaleHistoryOpen((open) => !open)}
                  ref={staleHistoryButtonRef}
                  type="button"
                >
                  Stale History {activeBoardViewModel?.staleHistory.count ?? 0}
                </button>
                <button
                  aria-expanded={diagnosticsOpen}
                  className="rounded-[0.375rem] border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
                  onClick={() => setDiagnosticsOpen((open) => !open)}
                  ref={diagnosticsButtonRef}
                  type="button"
                >
                  {diagnosticsOpen ? "Hide Diagnostics" : "Diagnostics"}
                </button>
              </div>
            </div>
            <OperationalStrip usageVisibility={usageVisibility} />
            {currentProjectionError ? (
              <p className="mb-2 rounded-[0.375rem] border border-[color-mix(in_srgb,var(--blocked)_38%,var(--line))] bg-[color-mix(in_srgb,var(--blocked)_10%,transparent)] p-2 text-sm text-[var(--foreground)]">
                Backend projection refresh unavailable. No runtime packet fallback is shown; inspect supervisor state before trusting the board.
              </p>
            ) : null}
            <MissionControlStrip
              attentionPacket={attentionPacket}
              blockedGateCount={blockedGateCount}
              readyToTestCount={activeBoardViewModel?.summary.readyToTestCount ?? 0}
            />
            {managerExecutionLane?.operatorAttentionRequired ? <ManagerAttentionSummary lane={managerExecutionLane} /> : null}
            <CoordinationHealthPanel health={currentProjection?.coordinationHealth ?? null} />
            {managerExecutionLane ? (
              <details className="mt-3 rounded-[0.5rem] border border-[var(--line)] bg-[var(--surface)] p-2">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--foreground)]">Manager</summary>
                <ManagerExecutionLane lane={managerExecutionLane} />
              </details>
            ) : activeManagerLaneClarity ? (
              <ProductionManagerLaneClarity clarity={activeManagerLaneClarity} />
            ) : null}
            {staleHistoryOpen && activeBoardViewModel ? (
              <StaleHistoryPanel
                items={activeBoardViewModel.staleHistory.items}
                onClose={closeStaleHistory}
                onInspect={(packetId) => {
                  selectedPacketReturnFocusRef.current = staleHistoryButtonRef.current;
                  setSelectedItem({ type: "packet", id: packetId });
                  setStaleHistoryOpen(false);
                }}
              />
            ) : null}
            {diagnosticsOpen ? (
              <DiagnosticsPanel
                fixtureMode={fixtureMode}
                items={activeBoardViewModel?.diagnostics.items ?? []}
                managerExecutionLane={managerExecutionLane ?? null}
                onClose={closeDiagnostics}
                projection={currentProjection}
                projectionError={currentProjectionError}
              />
            ) : null}
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
                    </g>
                  ))}
                </svg>
                <div className="pipeline-route-row" ref={routeRowRef}>
                  {pipelineStages.map((stage, stageIndex) => {
                    const stagePackets = dashboardPackets.filter((packet) => packet.currentStage === stage);
                    const visibleStagePackets = visiblePackets.filter((packet) => packet.currentStage === stage);
                    return (
                      <RouteStation
                        key={stage}
                        isLast={stageIndex === pipelineStages.length - 1}
                        onFocusStage={() => setFocusedStage(stage)}
                        onSelectStage={() => setSelectedItem({ type: "stage", id: stage })}
                        onSelectPacket={handleSelectPacket}
                        packets={visibleStagePackets}
                        projectionAvailable={Boolean(currentActiveBoardProjection)}
                        sourceKind={fixtureMode.kind}
                        registerPacketButton={registerPacketButton}
                        registerStageAnchor={registerStageAnchor}
                        registerStageButton={registerStageButton}
                        registerStageStation={registerStageStation}
                        searchActive={normalizedSearchQuery.length > 0}
                        selectedItem={selectedItem}
                        stage={stage}
                        stageSummary={stageSummaryByStage.get(stage) ?? null}
                        totalPacketCount={stagePackets.length}
                        visibleLimit={stagePacketLimit}
                      />
                    );
                  })}
                </div>
              </section>
              {selectedMapPacket && (selectedMapPacket.fixtureId ?? "").startsWith("projection:") && !selectedProjectionDetail ? (
                <ProjectionDetailUnavailableInspection onClose={closeSelectedItem} packet={selectedMapPacket} />
              ) : selectedMapPacket ? (
                <PacketInspection
                  onClose={closeSelectedItem}
                  onOperationalAction={handleOperationalAction}
                  actionFeedback={actionFeedback}
                  contextualActionStrip={selectedContextualActionStrip}
                  packet={selectedMapPacket}
                  packetDetailWhyDiagnostics={selectedPacketDetailWhyDiagnostics}
                  projectionDetail={selectedProjectionDetail}
                  projectionError={currentProjectionError}
                />
              ) : selectedDetailOnlyPacket ? (
                <PacketInspection
                  onClose={closeSelectedItem}
                  onOperationalAction={handleOperationalAction}
                  actionFeedback={actionFeedback}
                  contextualActionStrip={selectedContextualActionStrip}
                  packet={selectedDetailOnlyPacket}
                  packetDetailWhyDiagnostics={selectedPacketDetailWhyDiagnostics}
                  projectionDetail={selectedProjectionDetail}
                  projectionError={currentProjectionError}
                />
              ) : selectedProjectionPacketMissing && selectedItem?.type === "packet" ? (
                <MissingSelectedPacketInspection onClose={closeSelectedItem} packetId={selectedItem.id} />
              ) : null}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

function ProjectionTruthSummary({
  activeBoardViewModel,
  projection,
  projectionError,
  sourceState,
}: {
  activeBoardViewModel: PipelineActiveBoardViewModel | null;
  projection: DashboardCanonicalActiveBoardProjectionV1 | null;
  projectionError: string | null;
  sourceState: PipelineRuntimeSourceState;
}) {
  const projectionTooOld = projection ? isProjectionTooOld(projection) : false;
  const effectiveSourceLabel = projectionTooOld && projection?.sourceLabel === "live" ? "stale" : projection?.sourceLabel;
  const effectiveFreshnessState = projectionTooOld && projection?.freshnessState === "live" ? "stale" : projection?.freshnessState;
  const explicitNonRuntimeSource = cockpitNonRuntimeSourceKind(sourceState);
  const proofSourceLabel = projectionError
    ? "unavailable"
    : explicitNonRuntimeSource
      ? "unavailable"
      : effectiveSourceLabel ?? "unavailable";
  const proofFreshnessState = projectionError
    ? "unavailable"
    : explicitNonRuntimeSource
      ? "unavailable"
      : effectiveFreshnessState ?? "unavailable";
  const liveProofState = projectionLiveProofState(projection, proofSourceLabel, proofFreshnessState);
  const displayLabels = applyNonRuntimeStageLabels(
    projectionDisplayLabels(projection, proofSourceLabel, proofFreshnessState, Boolean(projectionError), liveProofState),
    explicitNonRuntimeSource
  );
  const sourceLabel = displayLabels.sourceLabel;
  const freshnessState = displayLabels.freshnessState;
  const statusNeedsAnnouncement = sourceLabel === "unavailable" || displayLabels.freshnessState === "stale" || Boolean(projectionError) || ["empty", "invalid", "demo"].includes(sourceState.kind);
  const backendState = projectionError
    ? "unavailable"
    : sourceState.kind === "empty"
      ? "reachable"
      : projection?.backendReachability.state ?? "unavailable";
  const projectionState = explicitNonRuntimeSource === "invalid"
    ? "invalid"
    : explicitNonRuntimeSource === "empty"
      ? "empty"
      : explicitNonRuntimeSource === "demo"
        ? "demo"
        : liveProofState.canSatisfyLiveProof
          ? "live"
          : projectionError
            ? "refresh unavailable"
            : freshnessState === "stale" || sourceLabel === "stale"
              ? "stale"
              : projection
                ? "limited"
                : "unavailable";
  const lastUpdated = projection?.sourceUpdatedAt ?? "not available";
  const activePacketCount = activeBoardViewModel ? String(activeBoardViewModel.summary.activePacketCount) : sourceState.kind === "empty" ? "0" : "unknown";
  const staleHistoryCount = activeBoardViewModel ? String(activeBoardViewModel.summary.staleHistoryCount) : sourceState.kind === "empty" ? "0" : "unknown";
  const readyToTestCount = activeBoardViewModel ? String(activeBoardViewModel.summary.readyToTestCount) : sourceState.kind === "empty" ? "0" : "unknown";
  const dispatchState = activeBoardViewModel?.summary.dispatchAffectingManagerState;
  const backpressure = activeBoardViewModel?.summary.backpressure ?? null;
  const recoveryText = projectionError
    ? `Projection fetch failed: ${projectionError}. No runtime packets are shown until supervisor state is readable.`
    : sourceState.kind === "empty"
      ? sourceState.summary
      : projection?.truthSummary.summary ?? sourceState.summary;

  return (
    <section
      aria-label="Projection truth summary"
      className="grid gap-2 rounded-[0.5rem] border border-[color-mix(in_srgb,var(--info)_30%,var(--line))] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] p-2 text-sm"
      role={statusNeedsAnnouncement ? "status" : undefined}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <ProjectionTruthChip label="Projection" value={projectionState} />
        <ProjectionTruthChip label="Backend" value={backendState} />
        <ProjectionTruthChip label="Source" value={sourceLabel} />
      </div>
      <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ProjectionTruthMetric label="Last updated" value={lastUpdated} />
        <ProjectionTruthMetric label="Active packets" value={activePacketCount} />
        <ProjectionTruthMetric label="Stale history" value={staleHistoryCount} />
        <ProjectionTruthMetric label="Ready to test" value={readyToTestCount} />
      </dl>
      {dispatchState ? (
        <p className="rounded-[0.375rem] border border-[color-mix(in_srgb,var(--blocked)_34%,var(--line))] bg-[color-mix(in_srgb,var(--blocked)_10%,transparent)] px-2 py-1 text-sm leading-5 text-[var(--foreground)]">
          Dispatch attention: {dispatchState.summary}
        </p>
      ) : null}
      <BackpressureSummaryBanner backpressure={backpressure} />
      <p className="text-sm leading-5 text-[var(--muted)]">
        {recoveryText} Open Diagnostics only when you need debug details.
      </p>
    </section>
  );
}

function BackpressureSummaryBanner({ backpressure }: { backpressure: PipelineBackpressureState | null }) {
  if (!backpressure) {
    return null;
  }
  const affectedStages = backpressure.affectedStages.length > 0
    ? backpressure.affectedStages.map((stage) => stage.replace(/_/g, " ")).join(", ")
    : "queue";
  return (
    <section
      aria-label="Backpressure state"
      aria-live="polite"
      className="grid gap-1 rounded-[0.375rem] border border-[color-mix(in_srgb,var(--review)_38%,var(--line))] bg-[color-mix(in_srgb,var(--review)_10%,transparent)] px-2 py-1 text-sm leading-5 text-[var(--foreground)]"
      role="status"
    >
      <p>
        Backpressure: {backpressure.summary} Severity {backpressure.severity}; source {backpressure.source}; affected {affectedStages}.
      </p>
      {backpressure.backendWip ? (
        <p className="text-[var(--muted)]">
          Backend WIP: {formatBackendWipCounts(backpressure.backendWip.observed, backpressure.backendWip.limits)}; reason {backpressure.backendWip.typedReason}; evidence {backpressure.backendWip.evidenceRefs.length} metadata ref{backpressure.backendWip.evidenceRefs.length === 1 ? "" : "s"}.
        </p>
      ) : null}
      <p className="text-[var(--muted)]">Next safe action: {backpressure.nextSafeAction}</p>
    </section>
  );
}

function formatBackendWipCounts(
  observed: NonNullable<PipelineBackpressureState["backendWip"]>["observed"],
  limits: NonNullable<PipelineBackpressureState["backendWip"]>["limits"]
) {
  if (!observed || !limits) {
    return "capacity unavailable";
  }
  return `review ${observed.review}/${limits.review}, deliver ${observed.deliver}/${limits.deliver}, verification ${observed.verification}/${limits.verification}, operator testing ${observed.operatorTesting}/${limits.operatorTesting}`;
}

function ProjectionTruthChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-xs text-[var(--foreground)]">
      <span className="font-semibold">{label}:</span>
      <span className="break-words">{value}</span>
    </span>
  );
}

function ProjectionTruthMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[0.375rem] border border-[var(--line)] bg-[var(--surface)] p-2">
      <dt className="text-xs font-semibold text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 break-words text-sm text-[var(--foreground)]">{value}</dd>
    </div>
  );
}

function buildStageSummaryByStage(
  projection: DashboardCanonicalActiveBoardProjectionV1 | null,
  projectionError: string | null,
  sourceState: PipelineRuntimeSourceState
) {
  const summaries = new Map<PipelineStage, CockpitStageSummary>();
  if (!projection) {
    return summaries;
  }
  const explicitNonRuntimeSource = cockpitNonRuntimeSourceKind(sourceState);
  const projectionTooOld = isProjectionTooOld(projection);
  for (const summary of projection.stageSummaries) {
    const stage = summary.stage === "needs_approval" ? "human_gate" : summary.stage;
    const proofSourceLabel = projectionTooOld && summary.sourceLabel === "live" ? "stale" : summary.sourceLabel;
    const proofFreshnessState = projectionTooOld && summary.freshnessState === "live" ? "stale" : summary.freshnessState;
    const displayLabels = projectionDisplayLabels(
      projection,
      proofSourceLabel,
      proofFreshnessState,
      Boolean(projectionError)
    );
    const stageLabels = applyNonRuntimeStageLabels(displayLabels, explicitNonRuntimeSource);
    const sourceLabel = stageLabels.sourceLabel;
    const freshnessState = stageLabels.freshnessState;
    const emptyReason = normalizeStageEmptyReason(summary.emptyReason, sourceLabel, freshnessState);
    summaries.set(stage, {
      emptyReason,
      freshnessState,
      label: summary.label,
      packetCount: summary.packetCount,
      sourceLabel,
    });
  }
  return summaries;
}

function projectionToCockpitPackets(
  projection: DashboardCanonicalActiveBoardProjectionV1 | null,
  runtimePackets: PipelineFixturePacket[],
  projectionError: string | null,
  activeBoardViewModel: PipelineActiveBoardViewModel | null,
  sourceState: PipelineRuntimeSourceState
) {
  if (sourceState.kind !== "runtime" && sourceState.kind !== "stale") {
    return sourceState.kind === "demo" ? runtimePackets : [];
  }
  if (!projection) {
    return runtimePackets;
  }
  if (!projectionHasRenderableBackendPackets(projection) || !activeBoardViewModel) {
    return [];
  }
  const activeBoardCards = activeBoardViewModel.activeBoard.stageLanes.flatMap((lane) => lane.packetCards);
  const runtimePacketIds = new Set(runtimePackets.map((packet) => packet.packetId));
  const activeBoardCardByPacketId = new Map(activeBoardCards.map((card) => [card.packetId, card]));
  const projectionPacketById = new Map(projection.workPackets.map((packet) => [packet.packetId, packet]));
  const selectedDetailByPacketId = new Map<string, ActiveBoardSelectedPacketDetail>(projection.selectedPacketDetails.map((detail) => [detail.packetId, detail]));
  const refreshUnavailable = Boolean(projectionError);
  const proofFreshness = projectionFreshnessForPackets(projection);
  const proofSource = projectionSourceForPackets(projection);
  const projectionLiveProof = projectionLiveProofState(
    projection,
    refreshUnavailable ? "unavailable" : proofSource,
    refreshUnavailable ? "unavailable" : proofFreshness
  );
  const effectiveLabels = projectionDisplayLabels(projection, proofSource, proofFreshness, refreshUnavailable, projectionLiveProof);
  const effectiveFreshness = effectiveLabels.freshnessState;
  const effectiveSource = effectiveLabels.sourceLabel;
  const projectionIsLive = projectionLiveProof.canSatisfyLiveProof;
  return activeBoardCards.flatMap((card) => {
    if (!runtimePacketIds.has(card.packetId)) {
      return [];
    }
    const packet = projectionPacketById.get(card.packetId);
    if (!packet) {
      return [];
    }
    const currentStage = activeBoardStageToCockpitStage(card.stage);
    const currentOwner = currentStage === "human_gate" ? "operator" : "kendall";
    const packetSourceLabel = packet.truthLabel === "live" ? effectiveSource : packet.truthLabel;
    const packetFreshness = packet.truthLabel === "stale"
      ? "stale"
      : packet.truthLabel === "unavailable"
        ? "unavailable"
        : effectiveFreshness;
    const detail = selectedDetailByPacketId.get(packet.packetId) ?? null;
    const detailCanSatisfyLiveMovementProof = detail?.canSatisfyLiveMovementProof ?? false;
    const packetIsLive = projectionIsLive && packet.truthLabel === "live" && detailCanSatisfyLiveMovementProof;
    const packetProofLabel = packetIsLive
      ? "live backend proof"
      : packet.truthLabel === "live"
        ? projectionLiveProofLabel(projectionLiveProof)
        : `not live proof: packet ${packet.truthLabel}`;
    const canonicalDetail = activeBoardViewModel.packetDetails.byPacketId[packet.packetId]?.canonical ?? null;
    const sourceTrustState = canonicalDetail?.source
      ? canonicalSourceTrustState(canonicalDetail.source.trust, packetSourceLabel, packetFreshness)
      : projectionSourceTrustState(packetSourceLabel, packetFreshness);
    const projectionDetailSourceRefs = detail?.sourceRefs ?? [];
    const detailSourceRefs = canonicalDetail?.source
      ? [canonicalDetail.source.sourceRef]
      : projectionDetailSourceRefs.length > 0
        ? projectionDetailSourceRefs
        : packet.sourceRef
          ? [packet.sourceRef]
          : [];
    const sourceRefs = detailSourceRefs.map((ref) => projectionSourceRefForPacket(ref, packetSourceLabel, packetFreshness));
    const projectionDetailEvidenceRefs = detail?.evidenceRefs ?? [];
    const detailEvidenceRefs = projectionDetailEvidenceRefs.length > 0 ? projectionDetailEvidenceRefs : packet.evidenceRefs;
    const evidenceRefs = detailEvidenceRefs.map((refId) => ({
      refId,
      evidenceType: "event" as const,
      label: refId,
      retentionClass: "metadata_only" as const,
      rawPayloadRetained: false as const,
    }));
    const summary = card.nextActionLabel ?? packet.blocker ?? projection.truthSummary.summary;
    const nextAction = card.nextActionLabel ?? packet.nextAction ?? packet.blocker ?? "";
    const lifecycleEvidenceRefs = evidenceRefs.map((ref) => ref.refId);
    const projectionDetailMovementRefs = detail?.recentTransitionEventRefs ?? [];
    const movementEventRefs = detail
      ? projectionDetailMovementRefs
      : lifecycleEvidenceRefs;
    const latestMovementRef = detail?.latestTransitionEventRef ?? movementEventRefs.at(-1) ?? null;
    return {
      packetId: packet.packetId,
      title: packet.title,
      requestedOutcome: packet.nextAction ?? packet.blocker ?? "Track this backend WorkPacket through the pipeline.",
      currentStage,
      currentOwner,
      status: packet.status,
      lifecycleState: {
        source: "workflow_event",
        stage: currentStage,
        owner: currentOwner,
        status: packet.status,
        reasonCodes: [packetSourceLabel, packetFreshness],
        authoritativeRef: `projection:${packet.packetId}`,
        derivedFromRefs: lifecycleEvidenceRefs,
        transitionEventRefs: movementEventRefs,
        latestTransitionEventRef: latestMovementRef,
        attemptRef: null,
        metadataOnly: true,
        sourceMutationAllowed: false,
        providerCallsAllowed: false,
        workerLaunchAllowed: false,
        githubMutationAllowed: false,
        cleanupAllowed: false,
      },
      riskLevel: packet.status === "blocked" || packet.status === "failed" ? "medium" : "low",
      priority: packet.status === "blocked" || currentStage === "human_gate" ? "high" : "normal",
      routeSummary: {
        recommendation: currentStage,
        confidenceScore: packetIsLive ? 0.86 : 0.42,
        confidenceBand: packetIsLive ? "backend projection" : `${packetSourceLabel} ${packetFreshness} projection`,
        reasonCodes: [packetSourceLabel, packetFreshness],
      },
      executionAttempts: [],
      sourceRefs,
      evidenceRefs,
      humanGateActions: [],
      laneCards: [],
      fixtureId: `projection:${packet.packetId}`,
      sourceKind: "projection" as const,
      sourceId: packet.packetId,
      fixtureLabel: packetIsLive
        ? "backend projection: packet truth live"
        : `backend projection: packet truth ${packet.truthLabel}; dashboard proof ${packetProofLabel}`,
      summary,
      nextAction,
      confidenceLabel: packetIsLive ? "backend projection" : `${packetSourceLabel} ${packetFreshness} projection; ${packetProofLabel}`,
      freshnessLabel: packetFreshness,
      sourceTrustState,
      sourceTrustStates: [sourceTrustState],
      sourceTrustSummary: canonicalDetail?.source
        ? `Canonical ${canonicalDetail.source.role} source; trust ${canonicalDetail.source.trust}; observed ${canonicalDetail.source.observedAt}.`
        : "Canonical source and trust unavailable; projection labels are lifecycle context only.",
      routeFork: {
        selectedRoute: currentStage,
        rejectedRoutes: [],
        tags: ["backend-projection", packetSourceLabel, packetFreshness],
        sourceContext: projection.truthSummary.summary,
        lowConfidenceActions: packetIsLive ? [] : ["Refresh projection", "Inspect supervisor state"],
      },
      lastEvent: detail?.latestMovementSummary ?? `projection updated ${packet.updatedAt}`,
      riskFlags: packetIsLive ? [] : [packetSourceLabel, packetFreshness],
      matrixRowIds: [],
      activeBoardCard: activeBoardCardByPacketId.get(card.packetId),
    } satisfies ActiveBoardCockpitPacket;
  });
}

function cockpitNonRuntimeSourceKind(
  sourceState: PipelineRuntimeSourceState
): Extract<PipelineRuntimeSourceState["kind"], "demo" | "empty" | "invalid" | "stale"> | null {
  return sourceState.kind === "demo" || sourceState.kind === "empty" || sourceState.kind === "invalid" || sourceState.kind === "stale"
    ? sourceState.kind
    : null;
}

function applyNonRuntimeStageLabels(
  displayLabels: Pick<CockpitStageSummary, "sourceLabel" | "freshnessState">,
  explicitNonRuntimeSource: ReturnType<typeof cockpitNonRuntimeSourceKind>
) {
  if (!explicitNonRuntimeSource) {
    return displayLabels;
  }
  if (displayLabels.sourceLabel === "invalid" || displayLabels.freshnessState === "invalid") {
    return {
      sourceLabel: "invalid" as const,
      freshnessState: "invalid" as const,
    };
  }
  return {
    sourceLabel: explicitNonRuntimeSource,
    freshnessState: explicitNonRuntimeSource,
  };
}

function projectionWorkPacketToDetailOnlyCockpitPacket(
  packet: DashboardCanonicalOperationalProjectionV1["workPackets"][number],
  detail: ProjectionSelectedPacketDetail | null,
  projection: DashboardCanonicalOperationalProjectionV1 | null,
  canonicalDetail: PipelineCanonicalPacketDetail | null
): ActiveBoardCockpitPacket {
  const stage = activeBoardStageToCockpitStage(packet.currentStage);
  const currentOwner = stage === "human_gate" ? "operator" : "kendall";
  const sourceLabel = packet.truthLabel === "live" ? projection?.sourceLabel ?? "live" : packet.truthLabel;
  const freshnessState = packet.truthLabel === "stale" ? "stale" : projection?.freshnessState ?? "unknown";
  const sourceTrustState = canonicalDetail?.source
    ? canonicalSourceTrustState(canonicalDetail.source.trust, sourceLabel, freshnessState)
    : projectionSourceTrustState(sourceLabel, freshnessState);
  const sourceRefs = canonicalDetail?.source
    ? [projectionSourceRefForPacket(canonicalDetail.source.sourceRef, sourceLabel, freshnessState)]
    : detail
      ? detail.sourceRefs.map((ref) => projectionSourceRefForPacket(ref, sourceLabel, freshnessState))
      : packet.sourceRef
        ? [projectionSourceRefForPacket(packet.sourceRef, sourceLabel, freshnessState)]
        : [];
  const attemptEvidenceRefs = (detail?.executionAttempts ?? packet.executionAttempts ?? []).flatMap((attempt) => attempt.evidenceRefs);
  const evidenceRefs = [...new Set([...(detail?.evidenceRefs ?? packet.evidenceRefs), ...attemptEvidenceRefs])].map((refId) => ({
    refId,
    evidenceType: "event" as const,
    label: refId,
    retentionClass: "metadata_only" as const,
    rawPayloadRetained: false as const,
  }));
  const lifecycleEvidenceRefs = evidenceRefs.map((ref) => ref.refId);
  const projectionDetailMovementRefs = detail?.recentTransitionEventRefs ?? [];
  const movementEventRefs = detail
    ? projectionDetailMovementRefs
    : lifecycleEvidenceRefs;
  const latestMovementRef = detail?.latestTransitionEventRef ?? movementEventRefs.at(-1) ?? null;
  return {
    packetId: packet.packetId,
    title: packet.title,
    requestedOutcome: packet.nextAction ?? packet.blocker ?? "Inspect this backend WorkPacket.",
    currentStage: stage,
    currentOwner,
    status: packet.status,
    lifecycleState: {
      source: "workflow_event",
      stage,
      owner: currentOwner,
      status: packet.status,
      reasonCodes: [sourceLabel, freshnessState, "detail-only"],
      authoritativeRef: `projection-detail:${packet.packetId}`,
      derivedFromRefs: lifecycleEvidenceRefs,
      transitionEventRefs: movementEventRefs,
      latestTransitionEventRef: latestMovementRef,
      attemptRef: null,
      metadataOnly: true,
      sourceMutationAllowed: false,
      providerCallsAllowed: false,
      workerLaunchAllowed: false,
      githubMutationAllowed: false,
      cleanupAllowed: false,
    },
    riskLevel: packet.status === "blocked" || packet.status === "failed" ? "medium" : "low",
    priority: packet.status === "blocked" || packet.status === "failed" ? "high" : "normal",
    routeSummary: {
      recommendation: stage,
      confidenceScore: 0.42,
      confidenceBand: `${sourceLabel} ${freshnessState} projection`,
      reasonCodes: [sourceLabel, freshnessState, "detail-only"],
    },
    executionAttempts: [],
    sourceRefs,
    evidenceRefs,
    humanGateActions: [],
    laneCards: [],
    fixtureId: `projection-detail:${packet.packetId}`,
    sourceKind: "projection" as const,
    sourceId: packet.packetId,
    fixtureLabel: `backend projection detail-only: packet truth ${packet.truthLabel}`,
    summary: packet.blocker ?? packet.nextAction ?? projection?.truthSummary.summary ?? "Detail-only backend projection packet.",
    nextAction: packet.nextAction ?? packet.blocker ?? "Inspect packet detail.",
    confidenceLabel: `${sourceLabel} ${freshnessState} projection; detail-only`,
    freshnessLabel: freshnessState,
    sourceTrustState,
    sourceTrustStates: [sourceTrustState],
    sourceTrustSummary: canonicalDetail?.source
      ? `Canonical ${canonicalDetail.source.role} source; trust ${canonicalDetail.source.trust}; observed ${canonicalDetail.source.observedAt}.`
      : "Canonical source and trust unavailable; projection labels are lifecycle context only.",
    routeFork: {
      selectedRoute: stage,
      rejectedRoutes: [],
      tags: ["backend-projection", "detail-only", sourceLabel, freshnessState],
      sourceContext: projection?.truthSummary.summary ?? "Projection detail-only packet.",
      lowConfidenceActions: sourceLabel === "live" && freshnessState === "live" ? [] : ["Inspect diagnostics", "Refresh projection"],
    },
    lastEvent: detail?.latestMovementSummary ?? `projection updated ${packet.updatedAt}`,
    riskFlags: sourceLabel === "live" && freshnessState === "live" ? ["detail-only"] : ["detail-only", sourceLabel, freshnessState],
    matrixRowIds: [],
    activeBoardCard: undefined,
  };
}

function activeBoardStageToCockpitStage(stage: PipelineCompactPacketCard["stage"]): PipelineStage {
  return stage === "needs_approval" ? "human_gate" : stage;
}

type PacketProjectionTruth = Pick<
  DashboardCanonicalActiveBoardProjectionV1,
  "sourceUpdatedAt" | "staleAfterSeconds" | "sourceLabel" | "freshnessState"
>;

function projectionSourceForPackets(projection: PacketProjectionTruth) {
  return isProjectionTooOld(projection) && projection.sourceLabel === "live" ? "stale" : projection.sourceLabel;
}

function projectionFreshnessForPackets(projection: PacketProjectionTruth) {
  return isProjectionTooOld(projection) && projection.freshnessState === "live" ? "stale" : projection.freshnessState;
}

function projectionSourceTrustState(
  sourceLabel: DashboardCanonicalOperationalProjectionV1["sourceLabel"],
  freshnessState: DashboardCanonicalOperationalProjectionV1["freshnessState"]
): PipelineFixturePacket["sourceTrustState"] {
  if (freshnessState === "stale" || sourceLabel === "stale") {
    return "stale";
  }
  if (freshnessState === "unavailable" || freshnessState === "unknown" || sourceLabel === "unavailable" || sourceLabel === "unknown") {
    return "unavailable";
  }
  if (sourceLabel === "fixture" || sourceLabel === "simulated" || sourceLabel === "dry_run") {
    return "derived-only";
  }
  return "included";
}

function canonicalSourceTrustState(
  trust: NonNullable<PipelineCanonicalPacketDetail["source"]>["trust"],
  sourceLabel: DashboardCanonicalOperationalProjectionV1["sourceLabel"],
  freshnessState: DashboardCanonicalOperationalProjectionV1["freshnessState"]
): PipelineFixturePacket["sourceTrustState"] {
  const projectionState = projectionSourceTrustState(sourceLabel, freshnessState);
  if (projectionState === "stale" || projectionState === "unavailable") {
    return projectionState;
  }
  if (trust === "authoritative" || trust === "attested") {
    return "included";
  }
  if (trust === "derived") {
    return "derived-only";
  }
  return "excluded";
}

function projectionSourceRefType(
  sourceType: NonNullable<DashboardCanonicalOperationalProjectionV1["workPackets"][number]["sourceRef"]>["sourceType"]
): PipelineFixturePacket["sourceRefs"][number]["sourceType"] {
  if (sourceType === "prd" || sourceType === "bmad_story") {
    return "bmad_artifact";
  }
  if (sourceType === "repo_doc" || sourceType === "workflow") {
    return "research";
  }
  return "research";
}

function projectionSourceRefForPacket(
  sourceRef: NonNullable<DashboardCanonicalOperationalProjectionV1["workPackets"][number]["sourceRef"]>,
  sourceLabel: DashboardCanonicalOperationalProjectionV1["sourceLabel"],
  freshnessState: DashboardCanonicalOperationalProjectionV1["freshnessState"]
): PipelineFixturePacket["sourceRefs"][number] {
  const freshness = projectionSourceFreshness(sourceLabel, freshnessState);
  const refBase = {
    refId: sourceRef.refId,
    sourceType: projectionSourceRefType(sourceRef.sourceType),
    label: sourceRef.title ?? sourceRef.refId,
    freshness,
    summaryOnly: true as const,
  };
  if (sourceLabel === "unavailable" || sourceLabel === "unknown" || freshnessState === "unavailable" || freshnessState === "unknown") {
    return {
      ...refBase,
      accessState: "missing",
      canonical: false,
      blockedReason: "Projection source ref is unavailable or unknown in the backend projection.",
    };
  }
  return {
    ...refBase,
    pathOrUrl: sourceRef.pathOrUrl ?? null,
    accessState: "allowed",
    canonical: sourceRef.sourceType === "prd" || sourceRef.sourceType === "bmad_story" || sourceRef.sourceType === "repo_doc",
    blockedReason: null,
  };
}

function projectionSourceFreshness(
  sourceLabel: DashboardCanonicalOperationalProjectionV1["sourceLabel"],
  freshnessState: DashboardCanonicalOperationalProjectionV1["freshnessState"]
): PipelineFixturePacket["sourceRefs"][number]["freshness"] {
  if (sourceLabel === "live" && freshnessState === "live") {
    return "fresh";
  }
  if (sourceLabel === "stale" || freshnessState === "stale") {
    return "stale";
  }
  return "unknown";
}

function isProjectionTooOld(projection: Pick<PacketProjectionTruth, "sourceUpdatedAt" | "staleAfterSeconds">) {
  const sourceUpdatedAt = Date.parse(projection.sourceUpdatedAt);
  if (!Number.isFinite(sourceUpdatedAt)) {
    return true;
  }
  if (!Number.isFinite(projection.staleAfterSeconds) || projection.staleAfterSeconds <= 0) {
    return true;
  }
  return Date.now() - sourceUpdatedAt > projection.staleAfterSeconds * 1000;
}

function ProductionManagerLaneClarity({ clarity }: { clarity: ActiveManagerLaneClarity }) {
  return (
    <section aria-label="Manager Execution Lane" className="manager-execution-lane mt-3 min-w-0 rounded-[0.5rem] border border-[color-mix(in_srgb,var(--accent)_25%,var(--line))] bg-[color-mix(in_srgb,var(--surface)_86%,transparent)] p-3">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[var(--accent)]">Manager Execution Lane</p>
      <ManagerLaneClarityPanel clarity={clarity} />
    </section>
  );
}

function ManagerLaneClarityPanel({ clarity }: { clarity: ActiveManagerLaneClarity }) {
  const posture = clarity.posture.state === "on_scope"
    ? { label: "On scope", tone: "border-[color-mix(in_srgb,var(--complete)_45%,var(--line))] bg-[color-mix(in_srgb,var(--complete)_10%,transparent)]" }
    : clarity.posture.state === "pivot_required"
      ? { label: "Pivot required", tone: "border-[color-mix(in_srgb,var(--blocked)_45%,var(--line))] bg-[color-mix(in_srgb,var(--blocked)_10%,transparent)]" }
      : { label: "Not assessed", tone: "border-[color-mix(in_srgb,var(--waiting)_45%,var(--line))] bg-[color-mix(in_srgb,var(--waiting)_10%,transparent)]" };
  return (
    <section aria-label="Lane clarity" className="mt-3 min-w-0 rounded-[0.375rem] border border-[var(--line)] bg-[var(--surface)] p-3" role="status">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Lane Clarity</h2>
          <p className="mt-1 break-words text-sm leading-5 text-[var(--foreground)]">{clarity.goal.summary}</p>
          <p className="mt-1 break-all text-xs text-[var(--muted)]">Source: {clarity.goal.sourceRef}</p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold text-[var(--foreground)] ${posture.tone}`}>{posture.label}</span>
      </div>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <ManagerDefinition label="Canonical state" value={`${clarity.canonicalState.phase}; ${clarity.canonicalState.freshness}; evidence ${clarity.canonicalState.evidenceFreshness}`} />
        <ManagerDefinition label="Next safe gate" value={`${clarity.nextGate.summary}. ${clarity.nextGate.nextSafeAction}`} />
        <ManagerDefinition label="Posture" value={`${clarity.posture.reason}. ${clarity.posture.nextSafeAction}`} />
        {clarity.posture.decisionRef ? (
          <ManagerDefinition
            label="Recorded decision"
            value={clarity.posture.qualification ? `${clarity.posture.decisionRef}; ${clarity.posture.qualification}` : clarity.posture.decisionRef}
          />
        ) : null}
      </dl>
      <div className="mt-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Progress evidence</h3>
        <ul className="mt-2 grid gap-2">
          {clarity.criteria.map((criterion) => (
            <li className="min-w-0 rounded-[0.25rem] border border-[var(--line)] p-2 text-xs" key={criterion.criterionId}>
              <p className="font-semibold text-[var(--foreground)]">{criterion.summary} <span className="font-normal text-[var(--muted)]">— {criterion.disposition}</span></p>
              <p className="mt-1 break-words text-[var(--muted)]">Evidence: {criterion.evidenceRefs.join(", ")}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ManagerAttentionSummary({ lane }: { lane: PipelineManagerExecutionLaneState }) {
  return (
    <section
      aria-label="Manager attention summary"
      className="mt-3 rounded-[0.5rem] border border-[color-mix(in_srgb,var(--blocked)_36%,var(--line))] bg-[color-mix(in_srgb,var(--blocked)_10%,transparent)] p-3 text-sm"
      role="alert"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[var(--blocked)]">Manager attention</p>
          <h2 className="mt-1 text-base font-semibold leading-6 text-[var(--foreground)]">{lane.statusText}</h2>
          <p className="mt-1 break-words text-[var(--muted)]">
            {lane.attentionReason ?? lane.nextAction}
          </p>
        </div>
        <span className="rounded-full border border-[color-mix(in_srgb,var(--blocked)_42%,var(--line))] px-2 py-0.5 text-xs font-semibold text-[var(--foreground)]">
          Needs attention
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
        Manager internals, worker counts, run ids, evidence refs, and authority details are available in Diagnostics.
      </p>
    </section>
  );
}

function CoordinationHealthPanel({ health }: { health: PipelineCoordinationHealth | null }) {
  const unavailable = health === null || health.availability === "unavailable" || health.freshness === "unavailable";
  const incomplete = !unavailable && health.availability === "incomplete";
  const attention = unavailable || incomplete || Boolean(health?.dirtyPreserveCount) || Boolean(health?.missingWorktreeJournalHold);
  const staleCoverage = health ? `${health.staleOwnerProjectedCount} projected / ${health.staleOwnerTargetCount} total` : "unavailable";
  const holds = health
    ? [
        health.staleOwnerProjectedCount < health.staleOwnerTargetCount ? "bounded stale-owner evidence" : null,
        health.dirtyPreserveCount > 0 ? `${health.dirtyPreserveCount} dirty worktree${health.dirtyPreserveCount === 1 ? "" : "s"} preserved` : null,
        health.missingWorktreeJournalHold ? "missing-worktree journal hold" : null,
      ].filter((hold): hold is string => Boolean(hold))
    : ["supervisor receipt unavailable"];
  const status = unavailable ? "unavailable" : incomplete ? "incomplete" : "available";
  return (
    <section
      aria-label="Coordination Health"
      className="mt-3 grid min-w-0 gap-3 rounded-[0.5rem] border border-[color-mix(in_srgb,var(--accent)_25%,var(--line))] bg-[color-mix(in_srgb,var(--surface)_86%,transparent)] p-3"
    >
      <p className="sr-only" role={attention ? "alert" : "status"}>
        Coordination Health {status}. {health ? `${health.activeWorkCount} active work item${health.activeWorkCount === 1 ? "" : "s"}. ${staleCoverage}.` : "No canonical manager inventory receipt is available."}
      </p>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[var(--accent)]">Current Work</p>
          <h2 className="mt-1 text-base font-semibold leading-tight text-[var(--foreground)]">Coordination Health</h2>
          <p className="mt-1 max-w-4xl text-sm leading-5 text-[var(--muted)]">
            {health
              ? `Canonical manager workspace inventory; observed ${health.observedAt}.`
              : "No canonical manager workspace inventory receipt is available. This panel does not infer local worktree state."}
          </p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${attention ? "border-[color-mix(in_srgb,var(--blocked)_45%,var(--line))] text-[var(--blocked)]" : "border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] text-[var(--accent)]"}`}>
          {status}
        </span>
      </div>
      <dl className="grid gap-2 text-xs sm:grid-cols-3">
        <CoordinationHealthMetric label="Active work" value={health ? String(health.activeWorkCount) : "—"} detail={health?.source ?? "source unavailable"} />
        <CoordinationHealthMetric label="Stale-owner scope" value={staleCoverage} detail={health?.freshness ?? "unavailable"} />
        <CoordinationHealthMetric label="Dirty preserves" value={health ? String(health.dirtyPreserveCount) : "—"} detail={health?.missingWorktreeJournalHold ? "journal hold active" : "no journal hold reported"} />
      </dl>
      {holds.length > 0 ? (
        <div className={`rounded-[0.375rem] border p-2 text-sm ${attention ? "border-[color-mix(in_srgb,var(--blocked)_45%,var(--line))] bg-[color-mix(in_srgb,var(--blocked)_10%,transparent)] text-[var(--foreground)]" : "border-[var(--line)] text-[var(--muted)]"}`}>
          <p className="font-semibold">{attention ? "Intentional holds" : "No coordination holds reported"}</p>
          {attention ? <p className="mt-1">{holds.join("; ")}.</p> : null}
        </div>
      ) : null}
      <p className="rounded-[0.375rem] border border-[var(--line)] p-2 text-sm text-[var(--muted)]">
        <span className="font-semibold text-[var(--foreground)]">Next safe action: </span>
        {health?.nextSafeAction ?? "Restore the supervisor receipt, then refresh canonical manager coordination evidence before lifecycle mutation."}
      </p>
    </section>
  );
}

function CoordinationHealthMetric({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="rounded-[0.375rem] border border-[var(--line)] bg-[var(--surface)] p-2">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-[var(--foreground)]">{value}</dd>
      <p className="mt-1 break-words text-[0.7rem] text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function ManagerExecutionLane({ lane }: { lane: PipelineManagerExecutionLaneState }) {
  const authorityDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const evidenceDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const handleManagerKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") {
      return;
    }
    const target = event.target instanceof Node ? event.target : null;
    const detailsNodes = [evidenceDetailsRef.current, authorityDetailsRef.current];
    const openDetails = detailsNodes.find((details) => details?.open && target !== null && details.contains(target))
      ?? detailsNodes.find((details) => details?.open);
    if (!openDetails) {
      return;
    }
    event.preventDefault();
    openDetails.open = false;
    openDetails.querySelector("summary")?.focus();
  }, []);

  return (
    <section
      aria-label="Manager Execution Lane"
      className="manager-execution-lane mt-3 grid min-w-0 gap-3 rounded-[0.5rem] border border-[color-mix(in_srgb,var(--accent)_25%,var(--line))] bg-[color-mix(in_srgb,var(--surface)_86%,transparent)] p-3"
      onKeyDown={handleManagerKeyDown}
    >
      <p aria-label="Manager live status" className="sr-only" role={lane.operatorAttentionRequired ? "alert" : "status"}>
        Manager status: {lane.statusText}. Phase {lane.phase}. Next action {lane.nextAction}.
      </p>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[var(--accent)]">Manager Execution Lane</p>
          <h2 className="mt-1 break-all text-base font-semibold leading-tight text-[var(--foreground)]">Run {lane.runId}</h2>
          <p className="mt-1 max-w-4xl text-sm leading-5 text-[var(--muted)]">{lane.statusText}. Next: {lane.nextAction}.</p>
        </div>
        <div aria-label="Manager fixture and proof status" className="flex min-w-0 flex-wrap gap-2 text-xs">
          <ManagerStateChip label={lane.fixtureBacked ? "fixture-backed" : lane.stateSource} tone={lane.fixtureBacked ? "waiting" : "active"} />
          <ManagerStateChip label={lane.proofMode} tone="waiting" />
          <ManagerStateChip label={lane.authorityStage} tone="active" />
          <ManagerStateChip label={lane.authorityClass} tone={lane.authorityClass === "allowed_unattended" ? "complete" : "blocked"} />
        </div>
      </div>

      <div aria-label="Manager run summary strip" className="grid gap-2 md:grid-cols-4">
        <ManagerMetric label="Phase" value={lane.phase} detail={`freshness ${lane.freshness}`} />
        <ManagerMetric label="Safe work" value={String(lane.safeWorkAvailableCount)} detail={`${lane.unsafeOrGatedWorkCount} unsafe or gated`} />
        <ManagerMetric label="Workers" value={`${lane.stateCounts.running} running`} detail={`${lane.stateCounts.leased} leased`} />
        <ManagerMetric label="Evidence" value={lane.evidenceFreshness} detail={`${lane.evidenceRefs.length} refs`} />
      </div>
      <ManagerCompactStatusBlocks lane={lane} />
      <ManagerCleanupTakeoverGates lane={lane} />

      {lane.operatorAttentionRequired ? (
        <div role="alert" className="rounded-[0.375rem] border border-[color-mix(in_srgb,var(--blocked)_45%,var(--line))] bg-[color-mix(in_srgb,var(--blocked)_10%,transparent)] p-2 text-sm text-[var(--foreground)]">
          Operator action needed: {lane.attentionReason ?? lane.nextAction}
        </div>
      ) : null}

      <div className="manager-lane-layout grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <div className="grid min-w-0 gap-3">
          <ManagerRows title="Queue and lease table" emptyReason={queueEmptyReason(lane)} rows={[...lane.queueRows, ...lane.leaseRows]} />
          <div className="grid gap-3 lg:grid-cols-3">
            <ManagerPanel panel={lane.refillPanel} />
            <ManagerPanel panel={lane.workerPanel} />
            <ManagerPanel panel={lane.resourceUsagePanel} />
          </div>
          <ManagerFeedbackPanel lane={lane} />
        </div>
        <div className="grid min-w-0 gap-3">
          <ManagerAuthorityDetails detailsRef={authorityDetailsRef} lane={lane} />
          <ManagerEvidenceDetails detailsRef={evidenceDetailsRef} lane={lane} />
        </div>
      </div>

      <div aria-label="Manager explicit backend states" className="flex min-w-0 flex-wrap gap-2" role="status">
        {lane.displayStates.map((state) => (
          <ManagerStateChip key={state} label={state} tone={stateTone(state)} />
        ))}
      </div>
    </section>
  );
}

function ManagerFeedbackPanel({ lane }: { lane: PipelineManagerExecutionLaneState }) {
  return (
    <section aria-label="Operator feedback routing" className="min-w-0 rounded-[0.375rem] border border-[var(--line)] bg-[var(--surface)] p-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Operator feedback routing</h3>
        <span className="text-xs text-[var(--muted)]">{lane.feedbackRouteRows.length} Feedback routes</span>
      </div>
      <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
        <ManagerDefinition label="Record policy" value={lane.feedbackRecordPolicy} />
        <ManagerDefinition label="Unrelated lanes" value={lane.feedbackUnrelatedLanePolicy} />
        <ManagerDefinition label="Retention" value={`${lane.feedbackRetention}; rawPayloadRetained ${String(lane.feedbackRawPayloadRetained)}`} />
      </dl>
      {lane.affectedDeliveryGates.length > 0 ? (
        <div className="mt-2 rounded-[0.25rem] border border-[color-mix(in_srgb,var(--blocked)_35%,var(--line))] p-2 text-xs text-[var(--muted)]">
          <p className="font-semibold text-[var(--foreground)]">Affected delivery gates</p>
          <ul className="mt-1 grid gap-1">
            {lane.affectedDeliveryGates.map((gate, index) => (
              <li className="break-words" key={`${gate.affectedLane}-${gate.mergePolicy}-${index}`}>
                {gate.affectedLane}: {gate.mergePolicy}; {gate.downstreamPolicy}; recovery {gate.recoveryPath}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {lane.feedbackRouteRows.length === 0 ? (
        <p className="mt-2 rounded-[0.25rem] border border-dashed border-[var(--line)] p-2 text-sm text-[var(--muted)]">
          No operator feedback routes are present in this summary.
        </p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {lane.feedbackRouteRows.map((route) => (
            <ManagerFeedbackRouteItem key={route.key} route={route} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ManagerCompactStatusBlocks({ lane }: { lane: PipelineManagerExecutionLaneState }) {
  const blockerText = lane.blockers.length > 0
    ? lane.blockers.join(", ")
    : lane.attentionReason ?? lane.authorityBlockedReason ?? lane.authorityStopReason ?? "none";
  const checkpointText = `${lane.evidenceFreshness}; ${lane.evidenceRefs.length} refs; event ${lane.eventWatermark}`;
  return (
    <section aria-label="Manager compact status blocks" className="grid gap-2 md:grid-cols-3">
      <ManagerMetric label="Liveness" value={lane.phase} detail={`${lane.stateSource}; observed ${lane.lastObservedAt}`} />
      <ManagerMetric label="Blockers" value={blockerText} detail={`authority ${lane.authorityClass}; stop ${lane.authorityStopReason ?? "none"}`} />
      <ManagerMetric label="Checkpoint status" value={checkpointText} detail={`limitations ${lane.currentLimitations.length > 0 ? lane.currentLimitations.join(", ") : "none"}`} />
    </section>
  );
}

type CleanupTakeoverGateRow = {
  key: string;
  kind: "cleanup" | "takeover";
  label: string;
  reason: string;
  whyItMatters: string;
  nextSafeAction: string;
  authorityClass: PipelineManagerAuthorityOperationRow["authorityClass"];
  evidenceRefs: readonly string[];
  rawStateLabels: readonly string[];
};

function ManagerCleanupTakeoverGates({ lane }: { lane: PipelineManagerExecutionLaneState }) {
  const rows = cleanupTakeoverGateRows(lane);
  const dispatchableLabel = gateDispatchableCountLabel(rows, lane);
  if (rows.length === 0) {
    return null;
  }
  return (
    <section aria-label="Cleanup and takeover gates" className="rounded-[0.375rem] border border-[color-mix(in_srgb,var(--blocked)_38%,var(--line))] bg-[color-mix(in_srgb,var(--blocked)_8%,transparent)] p-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Cleanup and takeover gates</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Not dispatchable safe work. {dispatchableLabel}. Worker launch is not implied.
          </p>
        </div>
        <ManagerStateChip label="Not dispatchable safe work" tone="blocked" />
      </div>
      <ul className="mt-2 grid gap-2">
        {rows.map((row) => (
          <li
            aria-label={`Cleanup or takeover gate ${row.label}: ${row.reason}; next ${row.nextSafeAction}`}
            className="manager-lane-block rounded-[0.25rem] bg-[color-mix(in_srgb,var(--panel)_72%,transparent)] p-2 text-xs text-[var(--muted)]"
            key={row.key}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="break-words font-semibold text-[var(--foreground)]">{row.label}</span>
              <ManagerAuthorityChip authorityClass={row.authorityClass} />
              <ManagerStateChip label={row.kind === "takeover" ? "Takeover gated, not implementation work" : "Cleanup gated, not source exhausted"} tone="blocked" />
            </div>
            <dl className="mt-2 grid gap-1 sm:grid-cols-2">
              <ManagerDefinition label="Gate reason" value={row.reason} />
              <ManagerDefinition label="Why it matters" value={row.whyItMatters} />
              <ManagerDefinition label="Next safe action" value={row.nextSafeAction} />
              <ManagerDefinition label="Evidence" value={row.evidenceRefs.length > 0 ? row.evidenceRefs.join(", ") : "none"} />
              <ManagerDefinition label="Raw states" value={row.rawStateLabels.length > 0 ? row.rawStateLabels.join(", ") : "unknown"} />
              <ManagerDefinition label="Dispatchable count" value="0; not counted as dispatchable safe work" />
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

function cleanupTakeoverGateRows(lane: PipelineManagerExecutionLaneState): CleanupTakeoverGateRow[] {
  const rows: CleanupTakeoverGateRow[] = [];
  const rawStateText = lane.rawStateLabels.join(" ").toLowerCase();
  const blockerText = lane.blockers.join(" ").toLowerCase();
  const authorityText = [
    lane.attentionReason,
    lane.authorityBlockedReason,
    lane.authorityStopReason,
    lane.nextAction,
    ...lane.currentLimitations,
  ].filter((item): item is string => Boolean(item)).join(" ").toLowerCase();
  const combinedText = `${rawStateText} ${blockerText} ${authorityText}`;
  const cleanupOperation = lane.authorityOperations.find((operation) => operation.family === "cleanup_stewardship" || operation.key === "cleanup");
  const hasCleanupGate = /cleanup|dirty workspace|dirty worktree|cleanup[-_\s]partial|cleanup[-_\s]ready/.test(combinedText);
  if (hasCleanupGate) {
    const cleanupReason = cleanupOperation?.reason
      ?? lane.authorityBlockedReason
      ?? lane.attentionReason
      ?? "Cleanup gate is present in manager state.";
    rows.push({
      key: "cleanup-gate",
      kind: "cleanup",
      label: cleanupGateLabel(combinedText),
      reason: cleanupReason,
      whyItMatters: "Cleanup can remove or alter local worktree, branch, or evidence state, so it must stay gated until scoped evidence and approval are present.",
      nextSafeAction: cleanupOperation?.rollbackOrRecoveryNote
        ?? cleanupNextSafeAction(combinedText)
        ?? lane.nextAction
        ?? "Inspect cleanup evidence before any cleanup decision.",
      authorityClass: cleanupOperation?.authorityClass ?? lane.authorityClass,
      evidenceRefs: cleanupOperation?.requiredEvidence ?? lane.evidenceRefs,
      rawStateLabels: lane.rawStateLabels,
    });
  }
  if (/takeover|owner mismatch|stale owner|split_brain|split-brain|other-owner|other owner|workspace owner/.test(combinedText)) {
    rows.push({
      key: "takeover-gate",
      kind: "takeover",
      label: takeoverGateLabel(combinedText),
      reason: lane.authorityBlockedReason ?? lane.attentionReason ?? lane.blockers[0] ?? "Takeover gate is present in manager state.",
      whyItMatters: "Takeover can transfer lane ownership or overwrite another session's assumptions, so it must wait for stale-owner evidence or an explicit operator decision.",
      nextSafeAction: takeoverNextSafeAction(combinedText) ?? lane.nextAction ?? "Review owner evidence before takeover.",
      authorityClass: lane.authorityClass,
      evidenceRefs: lane.evidenceRefs,
      rawStateLabels: lane.rawStateLabels,
    });
  }
  return rows;
}

function cleanupGateLabel(source: string) {
  if (/outside scoped|blocked cleanup target|cleanup target/.test(source)) {
    return "blocked cleanup target";
  }
  if (/cleanup[-_\s]partial/.test(source)) {
    return "cleanup partial";
  }
  if (/cleanup[-_\s]ready/.test(source)) {
    return "cleanup ready";
  }
  if (/dirty workspace|dirty worktree/.test(source)) {
    return "dirty workspace";
  }
  return "cleanup gated";
}

function takeoverGateLabel(source: string) {
  if (/stale owner/.test(source)) {
    return "stale owner";
  }
  if (/owner mismatch|split_brain|split-brain/.test(source)) {
    return "owner mismatch";
  }
  return "takeover gated";
}

function cleanupNextSafeAction(source: string) {
  if (/cleanup[-_\s]partial/.test(source)) {
    return "Resume cleanup only from a stable worktree after verifying retained evidence and recorded cleanup target.";
  }
  if (/cleanup[-_\s]ready/.test(source)) {
    return "Prepare a scoped cleanup approval packet; do not delete from readiness alone.";
  }
  if (/dirty workspace|dirty worktree/.test(source)) {
    return "Inspect the dirty workspace and preserve evidence before cleanup or new worker dispatch.";
  }
  return null;
}

function takeoverNextSafeAction(source: string) {
  if (/stale owner/.test(source)) {
    return "Review stale-owner evidence and request explicit takeover approval before mutation.";
  }
  if (/owner mismatch|split_brain|split-brain/.test(source)) {
    return "Resolve owner mismatch before dispatching or mutating the lane.";
  }
  return null;
}

function gateDispatchableCountLabel(rows: CleanupTakeoverGateRow[], lane: PipelineManagerExecutionLaneState) {
  if (rows.length === 0) {
    return `${lane.safeWorkAvailableCount} dispatchable safe work item(s)`;
  }
  return `0 of ${rows.length} cleanup/takeover gate(s) counted as dispatchable safe work; manager safe work count remains ${lane.safeWorkAvailableCount}`;
}

function ManagerFeedbackRouteItem({ route }: { route: PipelineManagerFeedbackRouteRow }) {
  return (
    <li aria-label={`Feedback route ${route.feedbackId}: ${route.classification} via ${route.route}`} className="manager-lane-block rounded-[0.25rem] bg-[color-mix(in_srgb,var(--panel)_72%,transparent)] p-2 text-xs text-[var(--muted)]">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="break-words font-semibold text-[var(--foreground)]">{route.summary}</span>
        <ManagerStateChip label={route.classification} tone={route.classification === "blocking" || route.classification === "malformed_feedback" ? "blocked" : route.classification === "future_work" ? "waiting" : "active"} />
        <ManagerStateChip label={route.route} tone={route.classification === "blocking" || route.classification === "malformed_feedback" ? "blocked" : "active"} />
      </div>
      <dl className="mt-2 grid gap-1 sm:grid-cols-2">
        <ManagerDefinition label="Feedback id" value={route.feedbackId} />
        <ManagerDefinition label="Target surface" value={route.targetSurface} />
        <ManagerDefinition label="Affected work" value={route.affectedLane} />
        <ManagerDefinition label="Target worker" value={route.targetWorkerId ?? "none"} />
        <ManagerDefinition label="Authority impact" value={route.authorityImpact} />
        <ManagerDefinition label="Dependency impact" value={route.dependencyImpact} />
        <ManagerDefinition label="Delivery gate" value={route.affectedDeliveryGate ? `${route.affectedDeliveryGate.mergePolicy}; ${route.affectedDeliveryGate.recoveryPath}` : "none"} />
        <ManagerDefinition label="Source refs" value={route.sourceRefs.length > 0 ? route.sourceRefs.join(", ") : "none"} />
        <ManagerDefinition label="Record policy" value={route.recordPolicy} />
        <ManagerDefinition label="Next action" value={route.nextAction} />
      </dl>
    </li>
  );
}

function ManagerMetric({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div aria-label={`${label}: ${value}; ${detail}`} className="manager-lane-block min-w-0 rounded-[0.375rem] border border-[var(--line)] bg-[var(--surface)] p-2">
      <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
      <p className="mt-1 break-words font-mono text-sm text-[var(--foreground)]">{value}</p>
      <p className="mt-1 break-words text-xs text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function ManagerRows({ emptyReason, rows, title }: { emptyReason: string; rows: readonly PipelineManagerLaneRow[]; title: string }) {
  return (
    <section aria-label={title} className="min-w-0 rounded-[0.375rem] border border-[var(--line)] bg-[var(--surface)] p-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
        <span className="text-xs text-[var(--muted)]">{rows.length} rows</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 rounded-[0.25rem] border border-dashed border-[var(--line)] p-2 text-sm text-[var(--muted)]">{emptyReason}</p>
      ) : (
        <div aria-label={`${title} rows`} className="mt-2 grid gap-2" role="table">
          <div className="sr-only" role="row">
            {["Item", "Backend state", "Authority", "Reason", "Evidence", "Next"].map((header) => (
              <span key={header} role="columnheader">{header}</span>
            ))}
          </div>
          {rows.map((row) => (
            <article
              aria-label={`${title} row ${row.label}: ${row.id}; backend state ${row.rawState}; next ${row.nextAction}`}
              className="manager-lane-row grid min-w-0 gap-2 rounded-[0.25rem] bg-[color-mix(in_srgb,var(--panel)_72%,transparent)] p-2 text-xs md:grid-cols-[minmax(0,0.85fr)_auto_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]"
              key={`${row.label}-${row.id}`}
              role="row"
            >
              <dl role="cell"><ManagerDefinition label="Item" value={row.id} /></dl>
              <div className="min-w-0" role="cell">
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-[var(--muted)]">Backend state</p>
                <div className="mt-1"><ManagerStateChip label={row.rawState} tone={stateTone(row.rawState)} /></div>
              </div>
              <div className="min-w-0" role="cell">
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-[var(--muted)]">Authority</p>
                <div className="mt-1"><ManagerAuthorityChip authorityClass={row.authorityClass} /></div>
                <p className="mt-1 break-words text-[var(--muted)]">{row.authorityReason}</p>
              </div>
              <dl role="cell"><ManagerDefinition label="Reason" value={row.reason} /></dl>
              <dl role="cell"><ManagerDefinition label="Evidence" value={row.evidenceRefIds.length > 0 ? row.evidenceRefIds.join(", ") : "none"} /></dl>
              <dl role="cell"><ManagerDefinition label="Next" value={row.nextAction} /></dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ManagerPanel({ panel }: { panel: PipelineManagerLanePanel }) {
  return (
    <section aria-label={panel.title} className="manager-lane-block min-w-0 rounded-[0.375rem] border border-[var(--line)] bg-[var(--surface)] p-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">{panel.title}</h3>
        <ManagerStateChip label={panel.state} tone={stateTone(panel.state)} />
      </div>
      <p className="mt-2 text-sm leading-5 text-[var(--muted)]">{panel.reason}</p>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
        <ManagerAuthorityChip authorityClass={panel.authorityClass} />
        <span className="break-words">{panel.authorityReason}</span>
      </div>
      <p className="mt-2 break-words font-mono text-xs text-[var(--muted)]">next: {panel.nextAction}</p>
    </section>
  );
}

function ManagerAuthorityDetails({
  detailsRef,
  lane,
}: {
  detailsRef: RefObject<HTMLDetailsElement | null>;
  lane: PipelineManagerExecutionLaneState;
}) {
  const allowedOperations = lane.authorityOperations.filter((operation) => operation.authorityClass === "allowed_unattended");
  const preauthorizationOperations = lane.authorityOperations.filter((operation) => operation.authorityClass === "requires_preauthorization");
  const blockedOperations = lane.authorityOperations.filter((operation) => operation.authorityClass === "block_and_record");
  const forbiddenOperations = lane.authorityOperations.filter((operation) => operation.authorityClass === "forbidden");
  const hasUnavailableOperations = lane.authorityOperations.some((operation) => !operation.available);
  return (
    <details className="rounded-[0.375rem] border border-[var(--line)] bg-[var(--surface)] p-2" ref={detailsRef}>
      <summary className="cursor-pointer text-sm font-semibold text-[var(--foreground)]">Authority and stop-line drawer</summary>
      <dl className="mt-2 grid gap-2 text-xs">
        <ManagerDefinition label="Authority stage" value={lane.authorityStage} />
        <ManagerDefinition label="Authority class" value={lane.authorityClass} />
        <ManagerDefinition label="Active run-contract stage" value={lane.authorityStage} />
        <ManagerDefinition label="Blocked reason" value={lane.authorityBlockedReason ?? "none"} />
        <ManagerDefinition label="Stop reason" value={lane.authorityStopReason ?? "none"} />
        <ManagerDefinition label="Recovery" value={`${lane.recoveryStatus}; attempts ${lane.recoveryAttemptCount}`} />
        <ManagerDefinition label="Last observed" value={lane.lastObservedAt} />
      </dl>
      <ManagerDeliveryControls controls={lane.deliveryControlRows} />
      <div className="mt-3 grid gap-2">
        <ManagerAuthorityOperationGroup title="Allowed unattended operations" operations={allowedOperations} />
        <ManagerAuthorityOperationGroup title="Preauthorization required" operations={preauthorizationOperations} />
        <ManagerAuthorityOperationGroup title="Blocked operations" operations={blockedOperations} />
        <ManagerAuthorityOperationGroup title="Forbidden operations" operations={forbiddenOperations} />
      </div>
      {hasUnavailableOperations ? (
        <p className="mt-2 rounded-[0.25rem] border border-[color-mix(in_srgb,var(--blocked)_40%,var(--line))] p-2 text-xs text-[var(--muted)]">
          Delivery, cleanup, retry, worker launch, tmux, provider, GitHub, and supervisor actions stay unavailable unless the backend summary exposes an authorized stage.
        </p>
      ) : null}
    </details>
  );
}

function ManagerAuthorityChip({ authorityClass }: { authorityClass: PipelineManagerAuthorityOperationRow["authorityClass"] }) {
  return (
    <span aria-label={`Authority chip raw state ${authorityClass}`}>
      <ManagerStateChip label={authorityClass} tone={authorityClass === "allowed_unattended" ? "complete" : "blocked"} />
    </span>
  );
}

function ManagerDeliveryControls({ controls }: { controls: readonly PipelineManagerDeliveryControlRow[] }) {
  const unavailableCount = controls.filter((control) => !control.available).length;
  const hasUnavailableControls = unavailableCount > 0;
  return (
    <section aria-label={hasUnavailableControls ? "Delivery controls unavailable" : "Delivery controls available"} className="mt-3 rounded-[0.25rem] border border-[color-mix(in_srgb,var(--blocked)_30%,var(--line))] p-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-[var(--foreground)]">{hasUnavailableControls ? "Delivery controls unavailable" : "Delivery controls available"}</h4>
        <span className="text-xs text-[var(--muted)]">{unavailableCount} unavailable</span>
      </div>
      {hasUnavailableControls ? <p className="mt-1 text-xs text-[var(--muted)]">Missing contract: delivery_phase</p> : null}
      <ul className="mt-2 grid gap-2">
        {controls.map((control) => (
          <li aria-label={`Delivery control ${control.label}: ${control.available ? "available" : "unavailable"}`} key={control.key} className="manager-lane-block rounded-[0.25rem] bg-[color-mix(in_srgb,var(--panel)_72%,transparent)] p-2 text-xs text-[var(--muted)]">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="font-semibold text-[var(--foreground)]">{control.label}</span>
              <ManagerAuthorityChip authorityClass={control.authorityClass} />
              <ManagerStateChip label={control.available ? "available" : "unavailable"} tone={control.available ? "complete" : "blocked"} />
            </div>
            <p className="mt-1 break-words">{control.reason}</p>
            <p className="mt-1 break-words">Missing contract: {control.missingContract ?? "none"}</p>
            <p className="mt-1 break-words">Required evidence: {control.requiredEvidence.join(", ")}</p>
            <p className="mt-1 break-words">Rollback: {control.rollbackOrRecoveryNote}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ManagerAuthorityOperationGroup({
  operations,
  title,
}: {
  operations: readonly PipelineManagerAuthorityOperationRow[];
  title: string;
}) {
  return (
    <section aria-label={title} className="rounded-[0.25rem] border border-[var(--line)] p-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-[var(--foreground)]">{title}</h4>
        <span className="text-xs text-[var(--muted)]">{operations.length} operations</span>
      </div>
      {operations.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--muted)]">None reported by the active summary.</p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {operations.map((operation) => (
            <li aria-label={`Authority operation ${operation.operation}: ${operation.authorityClass}; ${operation.statusText}`} key={operation.key} className="manager-lane-block rounded-[0.25rem] bg-[color-mix(in_srgb,var(--panel)_72%,transparent)] p-2 text-xs text-[var(--muted)]">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-semibold text-[var(--foreground)]">{operation.operation}</span>
                <ManagerAuthorityChip authorityClass={operation.authorityClass} />
                <ManagerStateChip label={operation.statusText} tone={operation.available ? "complete" : "blocked"} />
              </div>
              <dl className="mt-2 grid gap-1">
                <ManagerDefinition label="Family" value={operation.family} />
                <ManagerDefinition label="Reason" value={operation.reason} />
                <ManagerDefinition label="Missing contract" value={operation.missingContract ?? "none"} />
                <ManagerDefinition label="Run-contract stage" value={operation.runContractStage} />
                <ManagerDefinition label="Mutation risk" value={operation.mutationRisk} />
                <ManagerDefinition label="Required evidence" value={operation.requiredEvidence.join(", ")} />
                <ManagerDefinition label="Rollback" value={operation.rollbackOrRecoveryNote} />
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ManagerEvidenceDetails({
  detailsRef,
  lane,
}: {
  detailsRef: RefObject<HTMLDetailsElement | null>;
  lane: PipelineManagerExecutionLaneState;
}) {
  return (
    <details className="rounded-[0.375rem] border border-[var(--line)] bg-[var(--surface)] p-2" ref={detailsRef}>
      <summary className="cursor-pointer text-sm font-semibold text-[var(--foreground)]">Evidence and Checkpoint Drawer</summary>
      <dl className="mt-2 grid gap-2 text-xs">
        <ManagerDefinition label="Current limitation" value={lane.currentLimitations.length > 0 ? lane.currentLimitations.join(", ") : "none"} />
        <ManagerDefinition label="Source cursor" value={lane.sourceCursor} />
        <ManagerDefinition label="Event watermark" value={lane.eventWatermark} />
      </dl>
      {lane.evidenceLinks.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">No evidence links are present in this summary. Evidence freshness: {lane.evidenceFreshness}.</p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {lane.evidenceLinks.map((link) => (
            <li aria-label={`Evidence link ${link.evidenceRefId}: ${link.result}`} key={link.key} className="manager-lane-block rounded-[0.25rem] border border-[var(--line)] p-2 text-xs text-[var(--muted)]">
              <p className="break-all font-mono text-[var(--foreground)]">{link.evidenceRefId}</p>
              <ManagerCopyButton label="Copy evidence ref" value={link.evidenceRefId} />
              <p className="mt-1">Result: {link.result}; retention: {link.retentionClass}; rawPayloadRetained {String(link.rawPayloadRetained)}</p>
              <p className="mt-1 break-all">Requirements: {link.sourceRequirementIds.length > 0 ? link.sourceRequirementIds.join(", ") : "none"}</p>
              <p className="mt-1 break-all">Verification: {link.verificationCommandId ?? "not supplied"}</p>
              {link.verificationCommandId ? <ManagerCopyButton label="Copy verification id" value={link.verificationCommandId} /> : null}
              <p className="mt-1 break-all">Work: {link.workItemId ?? "none"}; lease: {link.leaseId ?? "none"}; attempt: {link.attemptId ?? "none"}</p>
              <p className="mt-1 break-all">Event watermark: {link.eventWatermark}</p>
              <p className="mt-1">Proof mode: {lane.proofMode}; state source: {lane.stateSource}</p>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function ManagerCopyButton({ label, value }: { label: string; value: string }) {
  const [copyStatus, setCopyStatus] = useState("");
  const handleCopy = useCallback(() => {
    if (!navigator.clipboard?.writeText) {
      setCopyStatus(`${label} unavailable`);
      return;
    }
    void navigator.clipboard.writeText(value)
      .then(() => setCopyStatus(`${label} copied`))
      .catch(() => setCopyStatus(`${label} failed`));
  }, [label, value]);
  return (
    <>
      <button
        aria-label={`${label}: ${value}`}
        className="mt-1 inline-flex rounded-[0.25rem] border border-[var(--line)] px-2 py-1 font-mono text-[0.68rem] text-[var(--foreground)]"
        onClick={handleCopy}
        type="button"
      >
        {label}
      </button>
      <span aria-live="polite" className="sr-only" role="status">{copyStatus}</span>
    </>
  );
}

function ManagerDefinition({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="break-words font-mono text-[var(--foreground)]">{value}</dd>
    </div>
  );
}

function ManagerStateChip({ label, tone }: { label: string; tone: "active" | "waiting" | "blocked" | "complete" }) {
  const className = tone === "blocked"
    ? "border-[color-mix(in_srgb,var(--blocked)_50%,var(--line))] bg-[color-mix(in_srgb,var(--blocked)_16%,transparent)] text-[var(--foreground)]"
    : tone === "complete"
      ? "border-[color-mix(in_srgb,var(--success)_42%,var(--line))] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--foreground)]"
      : tone === "active"
        ? "border-[color-mix(in_srgb,var(--info)_42%,var(--line))] bg-[color-mix(in_srgb,var(--info)_12%,transparent)] text-[var(--foreground)]"
        : "border-[color-mix(in_srgb,var(--stale)_42%,var(--line))] bg-[color-mix(in_srgb,var(--stale)_12%,transparent)] text-[var(--foreground)]";
  return (
    <span aria-label={`State chip raw state ${label}`} className={`inline-flex max-w-full items-center rounded-[0.25rem] border px-2 py-0.5 font-mono text-[0.68rem] ${className}`}>
      <span className="break-words">{label}</span>
    </span>
  );
}

function queueEmptyReason(lane: PipelineManagerExecutionLaneState) {
  if (lane.phase === "no_safe_work") return "Backend summary reports no safe work. The lane is waiting for eligible backlog or source refill.";
  if (lane.phase === "refilling") return "Backend summary reports refill in progress.";
  if (lane.phase === "manager_only") return lane.attentionReason ?? "Manager-only mode is active.";
  if (lane.phase === "blocked") return lane.attentionReason ?? lane.blockers[0] ?? "Backend summary reports blocked state.";
  return "No queued or leased work is present in the current summary.";
}

function stateTone(state: string): "active" | "waiting" | "blocked" | "complete" {
  if (/blocked|critical|forbidden|unavailable|unsafe|unknown|failed/i.test(state)) return "blocked";
  if (/complete|completed|closed|allowed/i.test(state)) return "complete";
  if (/running|leased|queued|refilling|fresh/i.test(state)) return "active";
  return "waiting";
}

function MissionControlStrip({
  attentionPacket,
  blockedGateCount,
  readyToTestCount,
}: {
  attentionPacket: PipelineFixturePacket | null;
  blockedGateCount: number;
  readyToTestCount: number;
}) {
  const state = !attentionPacket
    ? "No packets"
    : attentionPacket.currentStage === "human_gate"
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
        <span className="pipeline-mission-value">{attentionPacket ? miniCardLabel(attentionPacket) : "None"}</span>
      </span>
      <span className="pipeline-mission-chip">
        <span className="pipeline-mission-label">State</span>
        <span className="pipeline-mission-value">{state}</span>
      </span>
      <span className="pipeline-mission-chip">
        <span className="pipeline-mission-label">Gate</span>
        <span className="pipeline-mission-value">{blockedGateCount > 0 ? `${blockedGateCount} waiting` : "Clear"}</span>
      </span>
      {readyToTestCount > 0 ? (
        <span className="pipeline-mission-chip">
          <span className="pipeline-mission-label">Ready to test</span>
          <span className="pipeline-mission-value">{readyToTestCount}</span>
        </span>
      ) : null}
    </div>
  );
}

function OperationalStrip({
  usageVisibility,
}: {
  usageVisibility: { claude: boolean; codex: boolean };
}) {
  const usageItems = globalUsageItems().filter((item) => usageVisibility[item.providerKey]);
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
                <UsageMeterRow item={item} key={meter.label} meter={meter} />
              ))}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function UsageMeterRow({
  item,
  meter,
}: {
  item: ReturnType<typeof globalUsageItems>[number];
  meter: ReturnType<typeof globalUsageItems>[number]["meters"][number];
}) {
  const percent = clampPercent(meter.percent);
  return (
    <span
      aria-label={`${item.provider} ${meter.label} usage ${percent}%`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent}
      className="pipeline-usage-bar-row"
      role="meter"
    >
      <span className="pipeline-usage-meter-label">{meter.label}</span>
      <span aria-hidden="true" className="pipeline-usage-meter-track">
        <span className="pipeline-usage-meter-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="pipeline-usage-meter-value">{percent}%</span>
    </span>
  );
}

function clampPercent(percent: number) {
  if (!Number.isFinite(percent)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(percent)));
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
  projectionAvailable,
  sourceKind,
  registerPacketButton,
  registerStageAnchor,
  registerStageButton,
  registerStageStation,
  searchActive,
  selectedItem,
  stage,
  stageSummary,
  totalPacketCount,
  visibleLimit,
}: {
  isLast: boolean;
  onFocusStage: () => void;
  onSelectPacket: (packetId: string, trigger: HTMLButtonElement) => void;
  onSelectStage: () => void;
  packets: PipelineFixturePacket[];
  projectionAvailable: boolean;
  sourceKind: PipelineRuntimeSourceState["kind"];
  registerPacketButton: (packetId: string, node: HTMLButtonElement | null) => void;
  registerStageAnchor: (stage: PipelineStage, node: HTMLSpanElement | null) => void;
  registerStageButton: (stage: PipelineStage, node: HTMLButtonElement | null) => void;
  registerStageStation: (stage: PipelineStage, node: HTMLDivElement | null) => void;
  searchActive: boolean;
  selectedItem: SelectedMapItem;
  stage: PipelineStage;
  stageSummary: CockpitStageSummary | null;
  totalPacketCount: number;
  visibleLimit: number;
}) {
  const sortedPackets = sortPacketsForMap(packets);
  const stageRenderedCount = sortedPackets.length;
  const stageKnownTotalCount = stageRenderedCount;
  const stageCountLabel = stageSummary === null && projectionAvailable
    ? "unknown packets"
    : `${stageKnownTotalCount} ${stageKnownTotalCount === 1 ? "packet" : "packets"}`;
  const stageSourceLabel = stageSummary?.sourceLabel ?? (projectionAvailable
    ? "unknown"
    : sourceKind === "demo"
      ? "demo"
      : sourceKind === "empty"
        ? "empty"
        : sourceKind === "invalid"
          ? "invalid"
          : "unavailable");
  const stageFreshnessLabel = stageSummary?.freshnessState ?? (projectionAvailable
    ? "unknown"
    : sourceKind === "demo"
      ? "demo"
      : sourceKind === "empty"
        ? "empty"
        : sourceKind === "invalid"
          ? "invalid"
          : "unavailable");
  const stageEmptyReason = stageSummary?.emptyReason ?? (stageKnownTotalCount === 0 ? (sourceKind === "empty" ? "healthy_empty" : projectionAvailable ? "unknown" : "backend_unavailable") : null);
  const stageEmptyState = stageHealthStateLabel(stageEmptyReason, stageSourceLabel, stageFreshnessLabel, stageKnownTotalCount);
  const stageNextAction = stageNextActionLabel(stageEmptyReason, stageSourceLabel, stageFreshnessLabel, stageRenderedCount, stageKnownTotalCount);
  const stageHealthSummary = searchActive && stageRenderedCount === 0 && totalPacketCount > 0
    ? "No matching packets in this stage."
    : !searchActive && stageRenderedCount === 0 && stageKnownTotalCount > 0
      ? `${stageEmptyState}. Packet details unavailable in projection.`
    : `${stageEmptyState}. ${stageNextAction}`;
  const selected = selectedItem?.type === "stage" && selectedItem.id === stage;
  const selectedPacketInStage = selectedItem?.type === "packet" && sortedPackets.some((packet) => packet.packetId === selectedItem.id);
  const expanded = selected || selectedPacketInStage;
  const visiblePackets = expanded ? sortedPackets : sortedPackets.slice(0, visibleLimit);
  const hiddenPacketSummary = expanded ? null : overflowSummary(sortedPackets.slice(visibleLimit));
  const stagePurposeId = `pipeline-stage-purpose-${stage}`;

  return (
    <div
      className={`pipeline-route-station ${isLast ? "pipeline-route-station-last" : ""}`}
      ref={(node) => registerStageStation(stage, node)}
    >
      <span aria-hidden="true" className="pipeline-route-anchor" ref={(node) => registerStageAnchor(stage, node)} />
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
      <div className="mt-2 grid gap-0.5 rounded-[0.375rem] border border-[var(--line)] px-2 py-1 text-[0.68rem] leading-4 text-[var(--muted)]">
        <span aria-label={`Stage count: ${stageCountLabel}`}>{stageCountLabel}</span>
        <span aria-label={`Stage source: ${stageSourceLabel}`}>source {stageSourceLabel}</span>
        <span aria-label={`Stage freshness: ${stageFreshnessLabel}`}>freshness {stageFreshnessLabel}</span>
        <span aria-label={`Stage health: ${stageEmptyState}`}>{stageEmptyState}</span>
      </div>
      <p className="mt-2 rounded-[0.375rem] border border-[var(--line)] px-2 py-1 text-xs leading-5 text-[var(--muted)]">
        {stageHealthSummary}
      </p>
      <div className="mt-2 grid min-h-[6.75rem] content-start gap-1.5">
        {visiblePackets.length === 0 ? (
          <span aria-hidden="true" className="pipeline-empty-station min-h-[2.1rem] rounded-[0.375rem] border border-dashed border-[var(--line)] px-2 py-1 text-xs leading-5 text-[var(--muted)]" />
        ) : (
          visiblePackets.map((packet) => (
            <PacketMiniCard
              key={packet.packetId}
              onSelect={(trigger) => onSelectPacket(packet.packetId, trigger)}
              packet={packet}
              registerPacketButton={registerPacketButton}
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
  registerPacketButton,
  selected,
}: {
  onSelect: (trigger: HTMLButtonElement) => void;
  packet: ActiveBoardCockpitPacket;
  registerPacketButton: (packetId: string, node: HTMLButtonElement | null) => void;
  selected: boolean;
}) {
  const statusClass = statusClassForPacket(packet);
  return (
    <button
      aria-label={`${miniCardLabel(packet)}; ${packetCardStatusLabel(packet)}`}
      aria-pressed={selected}
      className={`pipeline-mini-packet ${statusClass} ${selected ? "pipeline-mini-packet-selected" : ""}`}
      onClick={(event) => onSelect(event.currentTarget)}
      ref={(node) => registerPacketButton(packet.packetId, node)}
      title={`${miniCardLabel(packet)}; ${packetCardStatusLabel(packet)}`}
      type="button"
    >
      <span aria-hidden="true" className="pipeline-mini-packet-dot" />
      <span className="pipeline-mini-packet-body">
        <span className="pipeline-mini-packet-label">{miniCardLabel(packet)}</span>
        <span className="pipeline-mini-packet-meta">{packetCardStatusLabel(packet)}</span>
      </span>
    </button>
  );
}

function StaleHistoryPanel({
  items,
  onClose,
  onInspect,
}: {
  items: PipelineStaleHistoryItem[];
  onClose: () => void;
  onInspect: (packetId: string) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <section
      aria-label="Stale History Drawer"
      className="mt-3 grid gap-3 rounded-[0.5rem] border border-[color-mix(in_srgb,var(--stale)_38%,var(--line))] bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] p-3"
      data-pipeline-panel="stale-history"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[var(--stale)]">Stale History</p>
          <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-base font-semibold leading-6 text-[var(--foreground)]">
            {items.length} stale packet{items.length === 1 ? "" : "s"}
          </h2>
          <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
            Historical packets are inspection context only. They are not active stage-lane work or dispatchable work.
          </p>
        </div>
        <button
          aria-label="Close Stale History"
          className="rounded-[0.375rem] border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>
      {items.length === 0 ? (
        <p className="rounded-[0.375rem] border border-dashed border-[var(--line)] p-2 text-sm text-[var(--muted)]">
          No stale packets are present in the current projection.
        </p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li
              aria-label={`Stale packet ${item.title}: ${item.lastKnownState}; reason ${item.staleReason}; inspect ${item.inspectLabel}`}
              className="rounded-[0.375rem] border border-[var(--line)] bg-[var(--surface)] p-2 text-sm text-[var(--foreground)]"
              key={item.packetId}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="break-words font-semibold">{item.title}</span>
                <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs text-[var(--muted)]">{item.stage}</span>
                {item.ageLabel ? <span className="text-xs text-[var(--muted)]">{item.ageLabel}</span> : null}
              </div>
              <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-3">
                <InspectionRow label="Last known state" value={item.lastKnownState} />
                <InspectionRow label="Stale reason" value={item.staleReason} />
                <InspectionRow label="Inspect action" value={item.inspectLabel} />
              </dl>
              <button
                aria-label={`Inspect stale packet: ${item.title}`}
                className="mt-2 rounded-[0.375rem] border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
                onClick={() => onInspect(item.packetId)}
                type="button"
              >
                Inspect
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DiagnosticsPanel({
  fixtureMode,
  items,
  managerExecutionLane,
  onClose,
  projection,
  projectionError,
}: {
  fixtureMode: PipelineRuntimeSourceState;
  items: PipelineDiagnosticsItem[];
  managerExecutionLane: PipelineManagerExecutionLaneState | null;
  onClose: () => void;
  projection: DashboardCanonicalOperationalProjectionV1 | null;
  projectionError: string | null;
}) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const diagnosticsProofSource = projection ? projectionSourceForPackets(projection) : "unavailable";
  const diagnosticsProofFreshness = projection ? projectionFreshnessForPackets(projection) : "unavailable";
  const diagnosticsLiveProof = projectionLiveProofState(projection, diagnosticsProofSource, diagnosticsProofFreshness);
  const diagnosticItems: PipelineDiagnosticsItem[] = [
    {
      label: "Diagnostics state",
      value: "Explicit diagnostics/debug information; metadata-only retention.",
      source: "dashboard",
      copyable: false,
      retentionClass: "metadata_only",
    },
    {
      label: "Fixture mode",
      value: `${fixtureMode.label}; ${fixtureMode.summary}; rows ${fixtureMode.matrixRows}; catalog ${fixtureMode.fixtureCatalogEntries}`,
      source: "fixtureMode",
      copyable: true,
      retentionClass: "metadata_only",
    },
    projection ? {
      label: "Projection proof",
      value: `${projection.projectionId}; ${projection.sourceLabel}; ${projection.freshnessState}; ${projection.truthSummary.label}; live proof ${projectionLiveProofLabel(diagnosticsLiveProof)}; updated ${projection.sourceUpdatedAt}`,
      source: "DashboardCanonicalOperationalProjectionV1",
      copyable: true,
      retentionClass: "metadata_only",
    } : {
      label: "Projection proof",
      value: projectionError ? `projection unavailable: ${projectionError}` : "projection unavailable",
      source: "DashboardCanonicalOperationalProjectionV1",
      copyable: false,
      retentionClass: "metadata_only",
    },
    projection ? {
      label: "Projection evidence refs",
      value: projection.evidenceRefs.length > 0 ? projection.evidenceRefs.join(", ") : "none",
      source: "DashboardCanonicalOperationalProjectionV1.evidenceRefs",
      copyable: projection.evidenceRefs.length > 0,
      retentionClass: "metadata_only",
    } : {
      label: "Projection evidence refs",
      value: "projection unavailable",
      source: "DashboardCanonicalOperationalProjectionV1.evidenceRefs",
      copyable: false,
      retentionClass: "metadata_only",
    },
    ...(managerExecutionLane ? [{
      label: "Manager internals",
      value: `run ${managerExecutionLane.runId}; phase ${managerExecutionLane.phase}; workers ${managerExecutionLane.stateCounts.running} running; safe work ${managerExecutionLane.safeWorkAvailableCount}`,
      source: "managerExecutionLane",
      copyable: true,
      retentionClass: "metadata_only" as const,
    }] : []),
    ...items,
  ];
  return (
    <section
      aria-label="Diagnostics Panel"
      className="mt-3 grid gap-3 rounded-[0.5rem] border border-[color-mix(in_srgb,var(--info)_34%,var(--line))] bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] p-3"
      data-pipeline-panel="diagnostics"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[var(--info)]">Diagnostics</p>
          <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-base font-semibold leading-6 text-[var(--foreground)]">
            Debug metadata and projection proof
          </h2>
          <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
            Diagnostics are opt-in. They do not change Active Board density and retain metadata only.
          </p>
        </div>
        <button
          aria-label="Close Diagnostics"
          className="rounded-[0.375rem] border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>
      <ul className="grid gap-2">
        {diagnosticItems.map((item, index) => (
          <li className="rounded-[0.375rem] border border-[var(--line)] bg-[var(--surface)] p-2 text-sm" key={`${item.label}:${index}`}>
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-[var(--foreground)]">{item.label}</p>
                <p className="mt-1 break-words text-xs leading-5 text-[var(--muted)]">{item.value}</p>
                <p className="mt-1 break-words font-mono text-[0.68rem] text-[var(--muted)]">
                  source {item.source}; retention {item.retentionClass}
                </p>
              </div>
              {item.copyable ? <DiagnosticCopyButton label={item.label} value={item.value} /> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DiagnosticCopyButton({ label, value }: { label: string; value: string }) {
  const [copyStatus, setCopyStatus] = useState("");
  const handleCopy = useCallback(() => {
    if (!navigator.clipboard?.writeText) {
      setCopyStatus(`${label} unavailable`);
      return;
    }
    void navigator.clipboard.writeText(value)
      .then(() => setCopyStatus(`${label} copied`))
      .catch(() => setCopyStatus(`${label} failed`));
  }, [label, value]);
  return (
    <>
      <button
        aria-label={`Copy diagnostic value: ${label}`}
        className="rounded-[0.375rem] border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
        onClick={handleCopy}
        type="button"
      >
        Copy
      </button>
      <span aria-live="polite" className="sr-only" role="status">{copyStatus}</span>
    </>
  );
}

function PacketInspection({
  actionFeedback,
  contextualActionStrip,
  onOperationalAction,
  onClose,
  packet,
  packetDetailWhyDiagnostics,
  projectionDetail,
  projectionError,
}: {
  actionFeedback: string | null;
  contextualActionStrip: PipelineContextualActionStrip | null;
  onOperationalAction: (action: PipelineContextualActionStrip["actions"][number], packetId: string) => void;
  onClose: () => void;
  packet: ActiveBoardCockpitPacket;
  packetDetailWhyDiagnostics: PipelinePacketDetailWhyDiagnostics | null;
  projectionDetail: ProjectionSelectedPacketDetail | null;
  projectionError: string | null;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    panelRef.current?.focus();
  }, [packet.packetId]);
  const projectionBackedPacket = (packet.fixtureId ?? "").startsWith("projection:") || (packet.fixtureId ?? "").startsWith("projection-detail:");
  const projectionRefreshLabel = projectionError
    ? `refresh unavailable; last-known ${packet.freshnessLabel}`
    : packet.freshnessLabel;
  const detailSourceRefs = projectionDetailSourceRefs(projectionDetail, packet);
  const detailEvidenceRefs = projectionDetailEvidenceRefs(projectionDetail, packet);
  const detailState = projectionDetailStateLabel(projectionDetail, packet);
  const detailStage = projectionDetailStageLabel(projectionDetail, packet);
  const detailTruth = projectionDetailTruthLabel(projectionDetail, packet, projectionRefreshLabel);
  const detailNextAction = projectionDetailNextAction(projectionDetail, packet);
  const detailBlocker = projectionDetailBlocker(projectionDetail, packet);
  const detailMovement = projectionDetailMovementSummary(projectionDetail);
  const detailQuality = detailEvidenceRefs.length > 0 ? `${detailEvidenceRefs.length} metadata-only evidence ref${detailEvidenceRefs.length === 1 ? "" : "s"}` : "quality evidence not present in projection detail";
  const detailAuthority = authorityNeedsLabel(packet);
  const detailTestability = packetCardTestabilityLabel(packet);
  const actionNeededKind = packet.activeBoardCard?.attentionKind ?? null;
  const actionNeededReason = detailBlocker !== "blocker not named"
    ? detailBlocker
    : packet.activeBoardCard?.attentionReasonLabel ?? "No action-needed reason named.";
  const actionNeededNext = detailNextAction !== "next action not named"
    ? detailNextAction
    : packet.activeBoardCard?.nextOperatorActionLabel ?? "Inspect packet detail.";
  const testTarget = packetTestTargetLabel(packet, detailNextAction);
  const checksRun = packetChecksRunLabel(detailEvidenceRefs);
  const residualRisk = packetResidualRiskLabel(packet);
  const routeRecommendation = packet.routeSummary?.recommendation ?? "route recommendation not present in projection detail";
  const routeConfidence = packet.routeSummary
    ? `${packet.routeSummary.confidenceBand}; ${packet.routeSummary.confidenceScore ?? "score unavailable"}`
    : "route confidence not present in projection detail";
  const routeReasonCodes = packet.routeSummary?.reasonCodes?.length
    ? packet.routeSummary.reasonCodes.join(", ")
    : "reason codes not present in projection detail";
  const routeSourceContext = packet.routeFork?.sourceContext || "five-whys context not present in projection detail";
  const projectedExecutionAttempts = projectionDetail?.executionAttempts ?? [];
  return (
    <aside aria-label="Packet inspection panel" className="pipeline-inspection-panel rounded-[0.5rem] border p-3" data-pipeline-panel="packet-detail" id="pipeline-selected-packet-detail" ref={panelRef} tabIndex={-1}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[var(--accent)]">Selected packet</p>
          <h2 className="mt-1 text-lg font-semibold leading-6">{packet.title}</h2>
        </div>
        <button
          aria-label="Close Packet Detail"
          className="rounded-[0.375rem] border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>
      {projectionBackedPacket || packet.sourceKind === "supervisor-runtime" ? (
        <p className="mt-2 rounded-[0.375rem] border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)]">
          {projectionBackedPacket ? "projection detail from backend selectedPacketDetails" : "persisted supervisor runtime packet; read-only dashboard projection"}
        </p>
      ) : (
        <p className="mt-2 rounded-[0.375rem] border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)]">
          Fixture/non-live packet; cannot satisfy live proof.
        </p>
      )}
      <div aria-label="Packet plain-language summary" className="pipeline-packet-summary mt-3">
        <span className="pipeline-packet-summary-state">{detailState}</span>
        <span>{packet.summary}</span>
      </div>
      <ContextualActionStripPanel onAction={(action) => onOperationalAction(action, packet.packetId)} strip={contextualActionStrip} />
      {actionFeedback ? <p aria-live="polite" className="mt-2 rounded-[0.375rem] border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)]">{actionFeedback}</p> : null}
      <PacketWhyDiagnosticsPanel detail={packetDetailWhyDiagnostics} />
      <CanonicalPacketDetailPanel detail={packetDetailWhyDiagnostics?.canonical ?? null} />
      <dl className="mt-3 grid gap-2 text-sm">
        <InspectionRow label="Where" value={detailStage} />
        <InspectionRow label="Status" value={detailState} />
        <InspectionRow label="Owner/session" value={packet.currentOwner} />
        <InspectionRow label="Came from" value={originLabel(packet)} />
        <InspectionRow label="Got here" value={arrivalLabel(packet)} />
        <InspectionRow label="Next" value={detailNextAction} />
        <InspectionRow label="Blocked by" value={detailBlocker} />
        <InspectionRow label="Freshness" value={projectionRefreshLabel} />
        <InspectionRow label="Truth" value={detailTruth} />
        <InspectionRow label="Quality" value={detailQuality} />
        <InspectionRow label="Authority needs" value={detailAuthority} />
        <InspectionRow label="Testability" value={detailTestability} />
      </dl>
      {packet.activeBoardCard?.attention ? (
        <section aria-label="Action Needed detail" className="mt-3 grid gap-2 rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
          <h3 className="text-sm font-semibold">Action Needed</h3>
          <dl className="grid gap-2 text-sm">
            <InspectionRow label="Blocker class" value={actionNeededKind ? actionNeededKind.replace(/_/g, " ") : "unknown"} />
            <InspectionRow label="Reason" value={actionNeededReason} />
            <InspectionRow label="Next operator action" value={actionNeededNext} />
            <InspectionRow label="Owner" value={packet.currentOwner} />
            <InspectionRow label="Evidence refs" value={detailEvidenceRefs.length > 0 ? detailEvidenceRefs.join(", ") : "No evidence refs in backend projection detail."} />
            <InspectionRow label="Five whys summary" value={routeSourceContext} />
          </dl>
        </section>
      ) : null}
      <section aria-label="Packet route and reasoning" className="mt-3 grid gap-2 rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
        <h3 className="text-sm font-semibold">Route and reasoning</h3>
        <dl className="grid gap-2 text-sm">
          <InspectionRow label="Route" value={routeRecommendation} />
          <InspectionRow label="Confidence" value={routeConfidence} />
          <InspectionRow label="Reason codes" value={routeReasonCodes} />
          <InspectionRow label="Five whys" value={routeSourceContext} />
        </dl>
      </section>
      <ReviewRoutePanel route={packetDetailWhyDiagnostics?.reviewRoute ?? projectionDetail?.reviewRoute ?? null} />
      <section aria-label="Testing and risk" className="mt-3 grid gap-2 rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
        <h3 className="text-sm font-semibold">Testing and risk</h3>
        <dl className="grid gap-2 text-sm">
          <InspectionRow label="What changed" value={packet.summary || "change summary not present in projection detail"} />
          <InspectionRow label="Where to test" value={testTarget} />
          <InspectionRow label="Checks run" value={checksRun} />
          <InspectionRow label="Residual risk" value={residualRisk} />
        </dl>
      </section>
      {projectionBackedPacket ? (
        <section aria-label="Backend projection packet detail" className="mt-3 grid gap-2 rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
          <h3 className="text-sm font-semibold">Backend projection detail</h3>
          <dl className="grid gap-2 text-sm">
            <InspectionRow label="Latest movement" value={detailMovement} />
          </dl>
          <RefList title="Source refs" values={detailSourceRefs} empty="No source refs in backend projection detail." />
          <RefList title="Evidence refs" values={detailEvidenceRefs} empty="No evidence refs in backend projection detail." />
        </section>
      ) : null}
      <ParallelWorkGraphPanel detail={projectionDetail} />
      {packet.executionAttempts.length > 0 || projectedExecutionAttempts.length > 0 ? (
        <section aria-label="Execution attempts" className="mt-3 grid gap-2 rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
          <h3 className="text-sm font-semibold">Execution attempts</h3>
          <ul className="grid gap-2 text-xs leading-5 text-[var(--muted)]">
            {[...packet.executionAttempts, ...projectedExecutionAttempts].map((attempt) => (
              <li className="break-words" key={attempt.attemptId}>
                Attempt {attempt.attemptId}; worker {attempt.workerId}; status {attempt.status}; authority mode {"authorityMode" in attempt ? attempt.authorityMode : "integrated_local"}; retention metadata_only; rawPayloadRetained false; evidence refs {attempt.evidenceRefs.join(", ")}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section aria-label="Execution attempts" className="mt-3 grid gap-2 rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
          <h3 className="text-sm font-semibold">Execution attempts</h3>
          <p className="text-xs leading-5 text-[var(--muted)]">No attempt ids are present in this projection detail.</p>
        </section>
      )}
      {packet.laneCards.length > 0 ? (
        <section aria-label="Manager lane details" className="mt-3 grid gap-2 rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
          <h3 className="text-sm font-semibold">Manager lane details</h3>
          <ul className="grid gap-2 text-xs leading-5 text-[var(--muted)]">
            {packet.laneCards.map((lane) => (
              <li className="break-words" key={lane.laneId}>
                {lane.label}; {lane.status}; {lane.summary}; owner {lane.currentOwner}; evidence refs {lane.evidenceRefs.join(", ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Link
        className="mt-3 inline-flex rounded-[0.375rem] border border-[color-mix(in_srgb,var(--accent)_42%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-1.5 text-sm font-semibold text-[var(--accent)] no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]"
        href={`${packet.sourceKind === "demo-fixture" ? "/pipeline/demo/packets" : "/pipeline/packets"}/${encodeURIComponent(packet.packetId)}`}
      >
        Open full packet
      </Link>
    </aside>
  );
}

function ReviewRoutePanel({ route }: { route: ProjectionSelectedPacketDetail["reviewRoute"] | null }) {
  const unavailable = !route || route.reasonCode === "review_evidence_unavailable";
  const stale = route?.availability === "stale" || route?.exactIdentity === "changed";
  const vetoed = route?.routeState === "blocked" && route.reasonCode === "policy_vetoed";
  const expired = route?.reasonCode === "issuance_expired";
  const revoked = route?.reasonCode === "issuance_revoked";
  const cancelled = route?.reasonCode === "issuance_cancelled";
  const stateLabel = unavailable
    ? "Review evidence unavailable"
    : stale
      ? "Stale — exact head changed"
      : vetoed
        ? "Vetoed"
        : expired
          ? "Expired"
          : revoked
            ? "Revoked"
            : cancelled
              ? "Cancelled"
              : route?.routeState === "report_only"
                ? "Report only"
                : route?.routeState === "simulated"
                  ? "Simulated"
                  : "Blocked";
  const requiresAttention = unavailable || stale || vetoed || expired || revoked || cancelled || route?.routeState === "blocked";
  const findingSummary = !route || route.findingSummary.count === 0
    ? "No normalized findings are available."
    : `${route.findingSummary.count} normalized finding${route.findingSummary.count === 1 ? "" : "s"}; highest severity ${route.findingSummary.highestSeverity}.`;
  const issuance = unavailable
    ? "unavailable"
    : route?.issuanceState === "expired"
      ? "Expired — reissue before relying on review evidence"
      : route?.issuanceState === "revoked"
        ? "Revoked — resolve the policy block before reissuing"
        : route?.issuanceState === "cancelled"
          ? "Cancelled — re-evaluate before issuing a new review"
          : route?.issuanceState ?? "unavailable";
  return (
    <section aria-label="Review route" className="mt-3 grid gap-2 rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Review route</h3>
        <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs text-[var(--muted)]">{stateLabel}</span>
      </div>
      {requiresAttention ? (
        <p aria-live="assertive" className="text-xs leading-5 text-[var(--muted)]">
          {stateLabel}. {route?.safeFallback ?? "Re-evaluate and reissue bounded review evidence before relying on it."}
        </p>
      ) : null}
      {route?.routeState === "report_only" || route?.routeState === "simulated" ? (
        <p className="text-xs leading-5 text-[var(--muted)]">No provider received a live packet.</p>
      ) : null}
      <dl className="grid gap-2 text-sm">
        <InspectionRow label="State" value={stateLabel} />
        <InspectionRow label="Reason" value={route?.reason ?? "Review evidence unavailable."} />
        <InspectionRow label="Recovery" value={route?.safeFallback ?? "Re-evaluate and reissue bounded review evidence before relying on it."} />
        <InspectionRow label="Exact identity" value={stale ? "changed; not current review evidence" : route?.exactIdentity ?? "unavailable"} />
        <InspectionRow label="Issuance" value={issuance} />
        <InspectionRow label="Data boundary" value={route?.dataClass === "metadata_only" ? "metadata only; no source, diff, prompt, completion, reasoning, credentials, or provider material retained" : "unavailable"} />
        <InspectionRow label="Findings" value={findingSummary} />
        <InspectionRow label="Delivery evidence" value="Not eligible; this read-only group cannot establish delivery evidence." />
      </dl>
      <RefList title="Review evidence refs" values={route?.findingSummary.evidenceRefs ?? []} empty="No bounded review evidence refs are available." />
    </section>
  );
}

function ParallelWorkGraphPanel({ detail }: { detail: ProjectionSelectedPacketDetail | null }) {
  const graph = detail?.workGraph;
  if (!graph) {
    return null;
  }
  const needsAttention = graph.availability !== "available" || graph.waveMembership === "blocked" || graph.waveMembership === "deferred";
  return (
    <section aria-label="Work Graph" className="mt-3 grid gap-2 rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Work Graph</h3>
        <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs text-[var(--muted)]">{graph.availability}</span>
      </div>
      {needsAttention ? (
        <p aria-live="assertive" className="text-xs leading-5 text-[var(--muted)]">
          Work Graph {graph.availability === "stale" ? "is stale" : graph.availability === "unavailable" ? "is unavailable" : `is ${graph.waveMembership}`}. {graph.nextSafeAction}
        </p>
      ) : null}
      <dl className="grid gap-2 text-sm">
        <InspectionRow label="Wave" value={graph.waveMembership} />
        <InspectionRow label="Dependencies" value={graph.dependencyState} />
        <InspectionRow label="Reservation" value={`${graph.reservation.status}; ${graph.reservation.reasonCode}; owner ${graph.reservation.owner ?? "not assigned"}`} />
        <InspectionRow label="Capacity" value={`${graph.capacity.posture}; ${graph.capacity.reasonCode}`} />
        <InspectionRow label="Reason" value={graph.reason} />
        <InspectionRow label="Recovery" value={graph.nextSafeAction} />
        <InspectionRow label="Freshness" value={graph.generatedAt ? `${graph.freshnessState}; generated ${graph.generatedAt}` : graph.freshnessState} />
        <InspectionRow label="Boundary" value="advisory metadata only; no dispatch, provider execution, findings, or delivery eligibility" />
      </dl>
      <RefList title="Work Graph evidence refs" values={graph.evidenceRefs} empty="No Work Graph evidence refs are available." />
    </section>
  );
}

function CanonicalPacketDetailPanel({ detail }: { detail: PipelineCanonicalPacketDetail | null }) {
  if (!detail || detail.availability === "unavailable") {
    return (
      <section aria-label="Canonical packet contract" className="mt-3 rounded-[0.5rem] border border-[var(--line)] bg-[var(--background-elevated)] p-3">
        <h3 className="text-sm font-semibold">Canonical packet contract</h3>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
          Canonical source, readiness, quality, retention, delivery, and product-mode posture are unavailable. No dashboard fallback is treated as canonical truth.
        </p>
      </section>
    );
  }
  const mode = detail.productMode;
  return (
    <section aria-label="Canonical packet contract" className="mt-3 grid gap-3 rounded-[0.5rem] border border-[var(--line)] bg-[var(--background-elevated)] p-3">
      <h3 className="text-sm font-semibold">Canonical packet contract</h3>
      <dl className="grid gap-2 text-sm">
        <InspectionRow label="Canonical source" value={detail.source ? `${detail.source.sourceId}; ${detail.source.role}; trust ${detail.source.trust}` : "unavailable"} />
        <InspectionRow label="Provenance observed" value={detail.source?.observedAt ?? "unavailable"} />
        <InspectionRow label="Requested product mode" value={mode?.requestedProductMode ?? "unavailable"} />
        <InspectionRow label="Effective product mode" value={mode?.effectiveProductMode ?? "unavailable"} />
        <InspectionRow label="Operational mode" value={mode?.operationalMode ?? "unavailable"} />
        <InspectionRow label="Readiness" value={mode ? `${mode.readinessState}; ready ${mode.ready}` : "unavailable"} />
        <InspectionRow label="Capability" value={mode?.capabilityState ?? "unavailable"} />
        <InspectionRow label="Freshness" value={mode?.freshnessState ?? "unavailable"} />
        <InspectionRow label="Blocked reasons" value={mode?.blockedReasons.length ? mode.blockedReasons.join(", ") : mode ? "none" : "unavailable"} />
        <InspectionRow label="Authority" value={detail.authority ? "metadata only; source, provider, worker, GitHub, and raw-payload authority all prohibited" : "unavailable"} />
      </dl>
      <CanonicalReadinessList components={detail.readinessComponents} />
      <CanonicalQualityGateList gates={detail.qualityGates} />
      <CanonicalDeliveryList entries={detail.deliveryEvidence} />
      <RefList title="Canonical provenance evidence" values={detail.source?.evidenceRefs ?? []} empty="No canonical provenance evidence refs." />
    </section>
  );
}

function CanonicalReadinessList({ components }: { components: PipelineCanonicalPacketDetail["readinessComponents"] }) {
  return (
    <section aria-label="Canonical readiness components">
      <h4 className="text-xs font-semibold text-[var(--foreground)]">Readiness components</h4>
      {components.length ? (
        <ul className="mt-2 grid gap-1 text-xs leading-5 text-[var(--muted)]">
          {components.map((component) => (
            <li key={component.componentId} className="break-words">
              {component.componentId}: {component.state}; {component.requirement}; evidence {component.evidenceRefs.join(", ") || "none"}
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-xs text-[var(--muted)]">Canonical readiness unavailable.</p>}
    </section>
  );
}

function CanonicalQualityGateList({ gates }: { gates: PipelineCanonicalPacketDetail["qualityGates"] }) {
  return (
    <section aria-label="Canonical quality gates">
      <h4 className="text-xs font-semibold text-[var(--foreground)]">Quality gates</h4>
      {gates.length ? (
        <ul className="mt-2 grid gap-1 text-xs leading-5 text-[var(--muted)]">
          {gates.map((gate, index) => (
            <li key={`${gate.gateId}:${index}`} className="break-words">
              {gate.gateId}: {gate.kind}; state {gate.state ?? "group"}; evidence {gate.evidenceRefs.join(", ") || "none"}
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-xs text-[var(--muted)]">Canonical quality evidence unavailable.</p>}
    </section>
  );
}

function CanonicalDeliveryList({ entries }: { entries: PipelineCanonicalPacketDetail["deliveryEvidence"] }) {
  return (
    <section aria-label="Canonical delivery and retention evidence">
      <h4 className="text-xs font-semibold text-[var(--foreground)]">Delivery and retention</h4>
      {entries.length ? (
        <ul className="mt-2 grid gap-1 text-xs leading-5 text-[var(--muted)]">
          {entries.map((entry) => (
            <li key={entry.deliveryId} className="break-words">
              {entry.action}: {entry.status}; {entry.target.repository}; retention {entry.evidence.disposition}; evidence {entry.evidence.evidenceRefs.join(", ") || "none"}; delivery authority false
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-xs text-[var(--muted)]">No canonical delivery evidence recorded.</p>}
    </section>
  );
}

function PacketWhyDiagnosticsPanel({ detail }: { detail: PipelinePacketDetailWhyDiagnostics | null }) {
  if (!detail) {
    return null;
  }
  return (
    <section aria-label="Packet why diagnostics" className="mt-3 grid gap-2 rounded-[0.5rem] border bg-[var(--background-elevated)] p-3">
      <h3 className="text-sm font-semibold">Why and diagnostics</h3>
      <dl className="grid gap-2 text-sm">
        <InspectionRow label="Why here" value={detail.why.placementReason} />
        <InspectionRow label="Placement" value={detail.why.label} />
        {detail.backpressure ? (
          <>
            <InspectionRow label="Backpressure" value={detail.backpressure.summary} />
            <InspectionRow label="Backpressure next" value={detail.backpressure.nextSafeAction} />
            <InspectionRow label="Backpressure state" value={`${detail.backpressure.reason}; severity ${detail.backpressure.severity}; source ${detail.backpressure.source}; rawPayloadRetained ${String(detail.backpressure.rawPayloadRetained)}`} />
          </>
        ) : null}
        <InspectionRow label="Detail source" value={detail.detailSource} />
        <InspectionRow label="Selected detail" value={detail.selectedDetailAvailable ? "available" : "not present"} />
        <InspectionRow label="Next diagnostic action" value={detail.why.nextDiagnosticAction} />
        <InspectionRow label="Source ref count" value={String(detail.diagnostics.sourceRefCount)} />
        <InspectionRow label="Evidence ref count" value={String(detail.diagnostics.evidenceRefCount)} />
        <InspectionRow label="Movement ref count" value={String(detail.diagnostics.movementRefCount)} />
        <InspectionRow label="Latest movement" value={detail.diagnostics.latestMovementLabel} />
        <InspectionRow label="Retention" value={`${detail.diagnostics.retentionClass}; rawPayloadRetained ${String(detail.diagnostics.rawPayloadRetained)}`} />
      </dl>
    </section>
  );
}

function ContextualActionStripPanel({ onAction, strip }: {
  onAction: (action: PipelineContextualActionStrip["actions"][number]) => void;
  strip: PipelineContextualActionStrip | null;
}) {
  if (!strip?.visible || strip.actions.length === 0) {
    return null;
  }
  return (
    <section aria-label="Contextual action strip" className="mt-3 rounded-[0.5rem] border border-[color-mix(in_srgb,var(--accent)_30%,var(--line))] bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Actions</h3>
        <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs text-[var(--muted)]">
          {strip.selectionType} {strip.selectionId}
        </span>
      </div>
      <ul className="mt-2 grid gap-2">
        {strip.actions.map((action) => (
          <li
            aria-label={`Action ${action.label}: ${action.state}; result ${action.result?.label ?? "not run"}`}
            className="grid min-w-0 gap-2 rounded-[0.375rem] border border-[var(--line)] bg-[var(--surface)] p-2 text-sm md:grid-cols-[auto_minmax(0,1fr)]"
            key={action.actionInstanceId}
          >
            {action.state === "available" ? (
              <button
                className="inline-flex h-8 items-center justify-center rounded-[0.375rem] border border-[color-mix(in_srgb,var(--accent)_42%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 text-sm font-semibold text-[var(--accent)] no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]"
                onClick={() => onAction(action)}
                title={`${action.reason} ${action.expectedResult}`}
                type="button"
              >
                {action.label}
              </button>
            ) : (
              <button
                aria-disabled="true"
                className="h-8 rounded-[0.375rem] border border-[var(--line)] px-3 text-sm font-semibold text-[var(--foreground)] opacity-70"
                onClick={(event) => event.preventDefault()}
                title={`${action.reason} ${action.expectedResult}`}
                type="button"
              >
                {action.label}
              </button>
            )}
            <div className="grid min-w-0 gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <ManagerStateChip label={action.state} tone={contextualActionTone(action.state)} />
                <ManagerStateChip label={action.riskTier} tone={action.riskTier === "low" ? "complete" : action.riskTier === "medium" ? "waiting" : "blocked"} />
                {action.result ? <ManagerStateChip label={action.result.label} tone={contextualResultTone(action.result.status)} /> : null}
              </div>
              <p className="break-words text-xs leading-5 text-[var(--muted)]">{action.reason}</p>
              {action.result ? (
                <p aria-live={action.result.status === "failed" || action.result.status === "blocked" ? "assertive" : "polite"} className="break-words text-xs leading-5 text-[var(--muted)]">
                  Result: {action.result.detail}; correlation {action.result.correlationLabel}; retention metadata-only
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function contextualActionTone(state: PipelineContextualActionStrip["actions"][number]["state"]): "active" | "waiting" | "blocked" | "complete" {
  if (state === "available") return "complete";
  if (state === "simulated") return "waiting";
  return "blocked";
}

function contextualResultTone(status: NonNullable<PipelineContextualActionStrip["actions"][number]["result"]>["status"]): "active" | "waiting" | "blocked" | "complete" {
  if (status === "accepted") return "complete";
  if (status === "queued" || status === "idempotent_noop") return "waiting";
  return "blocked";
}

function ProjectionDetailUnavailableInspection({ onClose, packet }: { onClose: () => void; packet: PipelineFixturePacket }) {
  const panelRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    panelRef.current?.focus();
  }, [packet.packetId]);
  return (
    <aside aria-label="Packet inspection panel" className="pipeline-inspection-panel rounded-[0.5rem] border p-3" data-pipeline-panel="packet-detail" ref={panelRef} tabIndex={-1}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[var(--accent)]">Selected packet</p>
          <h2 className="mt-1 text-lg font-semibold leading-6">{packet.title}</h2>
        </div>
        <button
          aria-label="Close Packet Detail"
          className="rounded-[0.375rem] border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>
      <p className="mt-2 rounded-[0.375rem] border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)]">
        Selected detail unavailable in latest projection: {packet.packetId}
      </p>
    </aside>
  );
}

function MissingSelectedPacketInspection({ onClose, packetId }: { onClose: () => void; packetId: string }) {
  const panelRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    panelRef.current?.focus();
  }, [packetId]);
  return (
    <aside aria-label="Packet inspection panel" className="pipeline-inspection-panel rounded-[0.5rem] border p-3" data-pipeline-panel="packet-detail" ref={panelRef} tabIndex={-1}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[var(--accent)]">Selected packet</p>
          <h2 className="mt-1 text-lg font-semibold leading-6">Packet no longer present</h2>
        </div>
        <button
          aria-label="Close Packet Detail"
          className="rounded-[0.375rem] border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>
      <p className="mt-2 rounded-[0.375rem] border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)]">
        Selected packet is no longer present in the latest projection: {packetId}
      </p>
    </aside>
  );
}

function InspectionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-[var(--muted)]">{label}</dt>
      <dd className="min-w-0 break-words text-[var(--foreground)] [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function RefList({ empty, title, values }: { empty: string; title: string; values: string[] }) {
  return (
    <div className="rounded-[0.375rem] border border-[var(--line)] bg-[var(--surface)] p-2">
      <h4 className="text-xs font-semibold text-[var(--foreground)]">{title}</h4>
      {values.length > 0 ? (
        <ul className="mt-2 grid gap-1 text-xs leading-5 text-[var(--muted)]">
          {values.map((value) => (
            <li className="break-words" key={value}>{value}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[var(--muted)]">{empty}</p>
      )}
    </div>
  );
}

function projectionDetailStateLabel(
  detail: ProjectionSelectedPacketDetail | null,
  packet: PipelineFixturePacket
) {
  return detail ? `status ${detail.status}` : plainStatusLabel(packet);
}

function projectionDetailStageLabel(
  detail: ProjectionSelectedPacketDetail | null,
  packet: PipelineFixturePacket
) {
  const stage = detail?.currentStage === "needs_approval" ? "human_gate" : detail?.currentStage;
  return stage ? plainStageLabel(stage) : plainStageLabel(packet.currentStage);
}

function projectionDetailTruthLabel(
  detail: ProjectionSelectedPacketDetail | null,
  packet: PipelineFixturePacket,
  freshnessLabel: string
) {
  if (detail) {
    return `truth ${detail.truthLabel}; source ${freshnessLabel}`;
  }
  return packetCardTruthLabel(packet);
}

function projectionDetailNextAction(
  detail: ProjectionSelectedPacketDetail | null,
  packet: PipelineFixturePacket
) {
  const nextAction = detail?.nextAction ?? packet.nextAction;
  return nextAction.trim() || "next action not named";
}

function projectionDetailBlocker(
  detail: ProjectionSelectedPacketDetail | null,
  packet: PipelineFixturePacket
) {
  const blocker = detail?.blocker ?? (packet.status === "blocked" || packet.status === "failed" ? packet.nextAction : "");
  return blocker.trim() || "blocker not named";
}

function projectionDetailMovementSummary(detail: ProjectionSelectedPacketDetail | null) {
  return detail?.latestMovementSummary?.trim() || "movement proof not present in projection detail";
}

function authorityNeedsLabel(packet: PipelineFixturePacket) {
  if (packet.currentStage === "human_gate") {
    return "operator approval required";
  }
  if (packet.humanGateActions.length > 0) {
    return packet.humanGateActions.map((action) => action.label).join(", ");
  }
  if (packet.executionAttempts.some((attempt) => attempt.authorityMode !== "none")) {
    return packet.executionAttempts.map((attempt) => `${attempt.attemptId}: ${attempt.authorityMode}`).join(", ");
  }
  if (packet.riskFlags.length > 0) {
    return `review risk flags: ${packet.riskFlags.join(", ")}`;
  }
  return "no authority need named in projection detail";
}

function projectionDetailSourceRefs(
  detail: ProjectionSelectedPacketDetail | null,
  packet: PipelineFixturePacket
) {
  if (detail) {
    return detail.sourceRefs.map((ref) => {
      const location = ref.pathOrUrl ? `; ${ref.pathOrUrl}` : "";
      return `${ref.refId}; ${ref.sourceType}; ${ref.title ?? "untitled source"}${location}`;
    });
  }
  return packet.sourceRefs.map((ref) => `${ref.refId}; ${ref.sourceType}; ${ref.freshness}; ${ref.accessState}`);
}

function projectionDetailEvidenceRefs(
  detail: ProjectionSelectedPacketDetail | null,
  packet: PipelineFixturePacket
) {
  const refs = detail?.evidenceRefs ?? packet.evidenceRefs.map((ref) => ref.refId);
  return refs.map((ref) => `${ref}; metadata_only`);
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

function globalUsageItems() {
  const disconnectedUsageDetail = "Usage source is not connected. Configure a read-only source in Settings.";
  return [
    {
      detail: disconnectedUsageDetail,
      meters: [
        { label: "Current allowance", percent: 0 },
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

function miniCardLabel(packet: ActiveBoardCockpitPacket) {
  return packet.activeBoardCard?.title.trim() || packet.title.trim() || "untitled packet";
}

function packetCardStatusLabel(packet: ActiveBoardCockpitPacket) {
  return `status ${packet.status}`;
}

function packetCardTruthLabel(packet: ActiveBoardCockpitPacket) {
  if (packet.activeBoardCard) {
    return packet.activeBoardCard.truthLabel ? `truth ${packet.activeBoardCard.truthLabel}` : "truth live";
  }
  const truth = (packet.fixtureId ?? "").startsWith("projection:")
    ? packet.fixtureLabel.replace(/^backend projection:\s*/, "")
    : packet.sourceTrustState;
  return `truth ${truth}; source ${packet.freshnessLabel}`;
}

function packetCardTestabilityLabel(packet: ActiveBoardCockpitPacket) {
  if (packet.activeBoardCard?.readyToTest) {
    return "ready to test";
  }
  return "testability unknown";
}

function packetTestTargetLabel(packet: ActiveBoardCockpitPacket, detailNextAction: string) {
  if (packet.activeBoardCard?.readyToTest) {
    return detailNextAction || "ready-to-test target not present in projection detail";
  }
  if (packet.activeBoardCard?.attention && packet.nextAction.toLowerCase().includes("ready to test")) {
    return "ready-to-test claim is degraded; inspect missing or stale evidence first";
  }
  return "test target not present in projection detail";
}

function packetChecksRunLabel(detailEvidenceRefs: string[]) {
  if (detailEvidenceRefs.length === 0) {
    return "checks not present in projection detail";
  }
  return `${detailEvidenceRefs.length} metadata-only check/evidence ref${detailEvidenceRefs.length === 1 ? "" : "s"}`;
}

function packetResidualRiskLabel(packet: PipelineFixturePacket) {
  if (packet.riskFlags.length > 0) {
    return packet.riskFlags.join(", ");
  }
  if (packet.riskLevel && packet.riskLevel !== "low") {
    return packet.riskLevel;
  }
  return "no residual risk named in projection detail";
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

function normalizeStageEmptyReason(
  reason: CockpitStageSummary["emptyReason"],
  sourceLabel: CockpitStageSummary["sourceLabel"],
  freshnessState: CockpitStageSummary["freshnessState"]
) {
  if (sourceLabel === "invalid" || freshnessState === "invalid") {
    return reason;
  }
  if (sourceLabel === "unavailable" || freshnessState === "unavailable") {
    return "backend_unavailable";
  }
  if (sourceLabel === "stale" || freshnessState === "stale") {
    return "projection_stale";
  }
  if (reason && reason !== "healthy_empty") {
    return reason;
  }
  if (sourceLabel === "empty" || freshnessState === "empty") {
    return "healthy_empty";
  }
  return reason;
}

function stageHealthStateLabel(
  reason: CockpitStageSummary["emptyReason"] | null,
  sourceLabel: CockpitStageSummary["sourceLabel"],
  freshnessState: CockpitStageSummary["freshnessState"],
  packetCount: number
) {
  if (sourceLabel === "invalid" || freshnessState === "invalid") {
    return "invalid supervisor state";
  }
  if (sourceLabel === "demo" || freshnessState === "demo") {
    return "demo fixtures";
  }
  if (packetCount > 0) {
    if (sourceLabel === "unavailable" || freshnessState === "unavailable") {
      return "backend unavailable";
    }
    if (sourceLabel === "stale" || freshnessState === "stale") {
      return "projection stale";
    }
    if (sourceLabel === "empty") {
      return "supervisor empty";
    }
    if (sourceLabel === "simulated") {
      return "simulated";
    }
    if (sourceLabel === "dry_run") {
      return "dry run";
    }
    if (sourceLabel === "unknown" || freshnessState === "unknown") {
      return "unknown";
    }
    return `${packetCount} ${freshnessState}`;
  }
  switch (reason) {
    case "healthy_empty":
      return "healthy-empty";
    case "source_exhausted":
      return "source exhausted";
    case "blocked":
      return "blocked";
    case "refilling":
      return "refilling";
    case "usage_limited":
      return "usage limited";
    case "resource_limited":
      return "resource limited";
    case "cleanup_gated":
      return "cleanup gated";
    case "approval_required":
      return "approval required";
    case "failure_budget_hit":
      return "failure budget hit";
    case "backend_unavailable":
      return "backend unavailable";
    case "projection_stale":
      return "projection stale";
    case "unknown":
    case null:
    default:
      if (sourceLabel === "unavailable" || freshnessState === "unavailable") {
        return "backend unavailable";
      }
      if (sourceLabel === "stale" || freshnessState === "stale") {
        return "projection stale";
      }
      return "unknown";
  }
}

function stageNextActionLabel(
  reason: CockpitStageSummary["emptyReason"] | null,
  sourceLabel: CockpitStageSummary["sourceLabel"],
  freshnessState: CockpitStageSummary["freshnessState"],
  renderedPacketCount: number,
  totalPacketCount: number
) {
  if (sourceLabel === "demo" || freshnessState === "demo") {
    return "Demo fixtures cannot prove live work.";
  }
  if (sourceLabel === "invalid" || freshnessState === "invalid") {
    return "Inspect invalid supervisor state before trusting this stage.";
  }
  if (renderedPacketCount > 0) {
    return "Open a packet for details.";
  }
  if (totalPacketCount > 0) {
    return "Packet details unavailable in projection.";
  }
  if (sourceLabel === "empty" || freshnessState === "empty" || reason === "healthy_empty") {
    return "Supervisor returned zero persisted WorkPacketV0 rows.";
  }
  if (sourceLabel === "unavailable" || reason === "backend_unavailable") {
    return "Check supervisor projection.";
  }
  if (sourceLabel === "stale" || freshnessState === "stale" || reason === "projection_stale") {
    return "Refresh projection before trusting state.";
  }
  if (reason === "source_exhausted") {
    return "Create or approve more source-owned work.";
  }
  if (reason === "blocked" || reason === "approval_required") {
    return "Clear the named blocker or approval.";
  }
  if (reason === "refilling") {
    return "Wait for queue refill.";
  }
  if (reason === "failure_budget_hit") {
    return "Wait for failure budget recovery.";
  }
  return "No stage action named.";
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

function originLabel(packet: PipelineFixturePacket) {
  if (packet.sourceKind === "supervisor-runtime") {
    return "Supervisor runtime";
  }
  if (packet.sourceKind === "projection") {
    return "Backend projection";
  }
  if (packet.sourceKind === "demo-fixture") {
    return "Demo fixture";
  }
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

function arrivalLabel(packet: PipelineFixturePacket) {
  if (packet.sourceKind === "supervisor-runtime") {
    return `From persisted supervisor state (${packet.freshnessLabel})`;
  }
  if (packet.sourceKind === "demo-fixture") {
    return "From explicit demo mode";
  }
  if ((packet.fixtureId ?? "").startsWith("projection:")) {
    return `From backend projection metadata (${packet.freshnessLabel})`;
  }
  return "From dashboard source metadata";
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

function findTopAttentionPacket(packets: PipelineFixturePacket[]) {
  return packets
    .filter((packet) => packet.status === "blocked" || packet.status === "failed" || packet.currentStage === "human_gate")
    .sort((left, right) => priorityRank[right.priority] - priorityRank[left.priority])[0];
}

function searchablePacketText(packet: ActiveBoardCockpitPacket) {
  return [
      packet.title,
      miniCardLabel(packet),
      packet.summary,
      packet.requestedOutcome,
    packet.currentStage,
    packet.currentOwner,
    packet.status,
    packet.priority,
    packet.riskLevel,
    packet.activeBoardCard?.statusLabel,
    packet.activeBoardCard?.truthLabel,
    packet.activeBoardCard?.nextActionLabel,
    packet.activeBoardCard?.attention ? "attention" : "",
    packet.activeBoardCard?.readyToTest ? "ready to test" : "",
    packet.fixtureLabel,
    packet.nextAction,
      packet.confidenceLabel,
      packet.freshnessLabel,
      packet.sourceTrustStates.join(" "),
    ].join(" ").toLowerCase();
}
