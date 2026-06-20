# Platform Decision Boundary

Date: 2026-06-19
Status: source-owned decision boundary

## Purpose

Preserve the current platform decision without publishing the full local
platform-evaluation research packet in the GitHub clean-install surface.

## Decision

Kendall_Nxt primary development automation targets a Linux VM / Ubuntu
26.04-or-later environment.

Windows may remain an operator host for desktop access, SSH, and private-key
storage, but Windows, PowerShell, WSL2, and Windows-to-Linux orchestration are
not supported install paths for the clean installer.

## Source Rules

- Generic installation starts at `docs/linux-install/install-playbook.md`.
- Current primary-development operations use
  `docs/workflows/linux-primary-development-runbook.md`.
- Historical platform-evaluation research is local workspace state and must not
  be tracked as `docs/platform-evaluation-sprint.md`.
- If the primary platform decision changes, update this boundary and the Linux
  runbook rather than reintroducing the local research packet.
