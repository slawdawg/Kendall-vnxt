import assert from "node:assert/strict";
import test from "node:test";

import { buildAssignmentInventory } from "../scripts/lib/codex-workspace-assignment-inventory.mjs";

const generatedAt = new Date("2026-07-06T18:00:00.000Z");

test("buildAssignmentInventory returns canonical metadata and exact rows from in-memory inputs", () => {
  const inventory = buildAssignmentInventory({
    stateRoot: "/tmp/kendall-state",
    currentOwner: "manager-current",
    generatedAt,
    staleAfterSeconds: 86_400,
    assignments: [
      {
        assignment_id: "lane-current",
        task_id: "task-current",
        status: "active",
        owner: "manager-current",
        branch: "codex/current",
        phase: "implementation",
        last_heartbeat_at: "2026-07-06T17:30:00.000Z",
      },
      {
        assignment_id: "lane-old",
        task_id: "task-old",
        status: "active",
        owner: "old-owner",
        branch: "codex/old",
        phase: "review_ready",
        last_heartbeat_at: "2026-07-01T18:00:00.000Z",
      },
      {
        assignment_id: "lane-closed",
        task_id: "task-closed",
        status: "closed",
        owner: "old-owner",
        branch: "codex/closed",
        phase: "done",
        last_heartbeat_at: "2026-07-01T18:00:00.000Z",
      },
    ],
    manifests: [
      {
        task_id: "workspace-old",
        status: "active",
        owner: "old-owner",
        branch: "codex/workspace-old",
        phase: "review_ready",
        worktree_path: "/tmp/workspace-old",
        owner_updated_at: "2026-07-01T18:00:00.000Z",
      },
      {
        task_id: "workspace-pr-old",
        status: "pr_open",
        owner: "old-owner",
        branch: "codex/workspace-pr-old",
        phase: "delivery",
        worktree_path: "/tmp/workspace-pr-old",
        owner_updated_at: "2026-07-01T18:00:00.000Z",
      },
      {
        task_id: "workspace-merged",
        status: "merged",
        owner: "old-owner",
        branch: "codex/workspace-merged",
        phase: "delivery",
        worktree_path: "/tmp/workspace-merged",
        owner_updated_at: "2026-07-01T18:00:00.000Z",
      },
    ],
  });

  assert.equal(inventory.schemaVersion, "manager-assignment-inventory/v0");
  assert.equal(inventory.generatedAt, "2026-07-06T18:00:00.000Z");
  assert.equal(inventory.stateRoot, "/tmp/kendall-state");
  assert.equal(inventory.currentOwner, "manager-current");
  assert.equal(inventory.staleAfterSeconds, 86_400);
  assert.equal(inventory.complete, true);
  assert.deepEqual(inventory.blockers, []);
  assert.equal(inventory.counts.laneAssignments, 3);
  assert.equal(inventory.counts.workspaceAssignments, 3);
  assert.equal(inventory.counts.staleOwnerTargets, 3);
  assert.equal(inventory.counts.ownedActiveTargets, 1);

  const requiredRowFields = [
    "kind",
    "id",
    "assignmentId",
    "taskId",
    "branch",
    "owner",
    "status",
    "phase",
    "reasonCode",
    "reason",
    "heartbeat",
    "nextAction",
    "source",
  ];
  for (const row of [...inventory.laneAssignments, ...inventory.workspaceAssignments]) {
    for (const field of requiredRowFields) {
      assert.ok(Object.hasOwn(row, field), `${row.kind}:${row.id} missing ${field}`);
    }
  }

  assert.deepEqual(
    inventory.staleOwnerTargets.map((row) => `${row.kind}:${row.id}`).sort(),
    ["lane_assignment:lane-old", "workspace_assignment:workspace-old", "workspace_assignment:workspace-pr-old"],
  );
  assert.equal(
    inventory.laneAssignments.find((row) => row.id === "lane-current").status,
    "claimed",
  );
  assert.equal(
    inventory.laneAssignments.find((row) => row.id === "lane-closed").status,
    "closed",
  );
  assert.equal(
    inventory.workspaceAssignments.find((row) => row.id === "workspace-merged").status,
    "cleanup",
  );
});

test("buildAssignmentInventory uses timestamp aliases and assignment-report reason codes", () => {
  const inventory = buildAssignmentInventory({
    currentOwner: "manager-current",
    generatedAt,
    staleAfterSeconds: 86_400,
    assignments: [
      {
        assignment_id: "lane-camel-fresh",
        task_id: "task-camel-fresh",
        status: "active",
        owner: "old-owner",
        branch: "codex/camel-fresh",
        lastHeartbeatAt: "2026-07-06T17:30:00.000Z",
      },
      {
        assignment_id: "lane-current",
        task_id: "task-current",
        status: "active",
        owner: "manager-current",
        branch: "codex/current",
        lastHeartbeatAt: "2026-07-06T17:30:00.000Z",
      },
      {
        assignment_id: "lane-unowned",
        task_id: "task-unowned",
        status: "active",
        branch: "codex/unowned",
        updatedAt: "2026-07-06T17:30:00.000Z",
      },
    ],
    manifests: [
      {
        task_id: "workspace-camel-fresh",
        status: "active",
        owner: "old-owner",
        branch: "codex/workspace-camel-fresh",
        worktree_path: "/tmp/workspace-camel-fresh",
        ownerUpdatedAt: "2026-07-06T17:30:00.000Z",
      },
    ],
  });

  assert.equal(
    inventory.laneAssignments.find((row) => row.id === "lane-camel-fresh").status,
    "blocked_owned_active",
  );
  assert.equal(
    inventory.workspaceAssignments.find((row) => row.id === "workspace-camel-fresh").status,
    "blocked_owned_active",
  );
  assert.equal(
    inventory.laneAssignments.find((row) => row.id === "lane-current").reasonCode,
    "assignment_current_owner",
  );
  assert.equal(
    inventory.laneAssignments.find((row) => row.id === "lane-unowned").reasonCode,
    "assignment_missing_owner",
  );
});

test("buildAssignmentInventory keeps active lane evidence distinct for duplicate row ids", () => {
  const inventory = buildAssignmentInventory({
    currentOwner: "manager-current",
    generatedAt,
    assignments: [
      {
        task_id: "shared-task",
        status: "active",
        owner: "manager-current",
        branch: "codex/shared-task",
        last_heartbeat_at: "2026-07-06T17:30:00.000Z",
      },
    ],
    manifests: [
      {
        task_id: "shared-task",
        status: "active",
        owner: "manager-current",
        branch: "codex/shared-task",
        worktree_path: "/tmp/shared-task",
        owner_updated_at: "2026-07-06T17:30:00.000Z",
      },
    ],
  });

  assert.deepEqual(Object.keys(inventory.activeLaneEvidence).sort(), [
    "lane_assignment:shared-task",
    "workspace_assignment:shared-task",
  ]);
});
