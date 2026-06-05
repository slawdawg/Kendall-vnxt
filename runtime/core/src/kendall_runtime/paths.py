from __future__ import annotations

from pathlib import Path


def runtime_root() -> Path:
    return Path(__file__).resolve().parents[3]


def modules_root() -> Path:
    return runtime_root() / "modules"


def contracts_root() -> Path:
    return runtime_root() / "contracts"
