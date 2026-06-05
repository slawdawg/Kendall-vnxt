from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .module_contract import ContractValidationError, ModuleContract
from .paths import modules_root


@dataclass(slots=True)
class LoadedModule:
    contract: ModuleContract
    module_dir: Path

    def __post_init__(self) -> None:
        if not isinstance(self.contract, ModuleContract):
            raise ValueError("loaded module contract must be a ModuleContract")
        if not isinstance(self.module_dir, Path):
            raise ValueError("loaded module_dir must be a pathlib.Path")
        self.contract = self.contract.clone()

    def clone(self) -> "LoadedModule":
        return LoadedModule(contract=self.contract.clone(), module_dir=self.module_dir)


@dataclass(slots=True)
class ModuleLoadFailure:
    module_dir: Path
    reason: str

    def __post_init__(self) -> None:
        if not isinstance(self.module_dir, Path):
            raise ValueError("module load failure module_dir must be a pathlib.Path")
        if not isinstance(self.reason, str) or not self.reason:
            raise ValueError("module load failure reason must be a non-empty string")

    def clone(self) -> "ModuleLoadFailure":
        return ModuleLoadFailure(module_dir=self.module_dir, reason=self.reason)


@dataclass(slots=True)
class ModuleDiscoveryResult:
    loaded: list[LoadedModule]
    failed: list[ModuleLoadFailure]

    def __post_init__(self) -> None:
        if not isinstance(self.loaded, list):
            raise ValueError("module discovery loaded entries must be a list")
        if not isinstance(self.failed, list):
            raise ValueError("module discovery failed entries must be a list")
        if any(not isinstance(item, LoadedModule) for item in self.loaded):
            raise ValueError("module discovery loaded entries must contain LoadedModule instances")
        if any(not isinstance(item, ModuleLoadFailure) for item in self.failed):
            raise ValueError("module discovery failed entries must contain ModuleLoadFailure instances")
        self.loaded = [item.clone() for item in self.loaded]
        self.failed = [item.clone() for item in self.failed]

    def clone(self) -> "ModuleDiscoveryResult":
        return ModuleDiscoveryResult(
            loaded=[item.clone() for item in self.loaded],
            failed=[item.clone() for item in self.failed],
        )


def discover_modules(root: Path | None = None) -> ModuleDiscoveryResult:
    if root is not None and not isinstance(root, Path):
        raise ValueError("root must be a pathlib.Path or None")
    search_root = root or modules_root()
    loaded: list[LoadedModule] = []
    failed: list[ModuleLoadFailure] = []

    if not search_root.exists():
        return ModuleDiscoveryResult(
            loaded=[],
            failed=[ModuleLoadFailure(module_dir=search_root, reason="module root does not exist")],
        )
    if not search_root.is_dir():
        return ModuleDiscoveryResult(
            loaded=[],
            failed=[ModuleLoadFailure(module_dir=search_root, reason="module root is not a directory")],
        )

    for module_dir in sorted(path for path in search_root.iterdir() if path.is_dir()):
        contract_path = module_dir / "module.contract.json"
        if not contract_path.exists():
            if module_dir.name != "__pycache__":
                failed.append(ModuleLoadFailure(module_dir=module_dir, reason="missing module.contract.json"))
            continue

        try:
            contract = ModuleContract.from_path(contract_path)
            loaded.append(LoadedModule(contract=contract, module_dir=module_dir))
        except (OSError, ValueError, ContractValidationError) as exc:
            failed.append(ModuleLoadFailure(module_dir=module_dir, reason=str(exc)))

    return ModuleDiscoveryResult(loaded=loaded, failed=failed)
