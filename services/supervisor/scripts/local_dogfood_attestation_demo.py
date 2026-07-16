"""Disposable local-only demo: authorize → UDS observe → verify → readback.

No provider, worker, external network, or generic signing protocol is used.
"""

import asyncio
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient


async def _seed_packet() -> None:
    from supervisor.infrastructure.db.database import SessionLocal
    from supervisor.infrastructure.db.models import AuthoritativeWorkPacket
    async with SessionLocal() as session:
        session.add(AuthoritativeWorkPacket(
            id="packet-local-1", title="Local dogfood packet", current_stage="verify", status="held",
            current_event_id="event-local-1", source_ref_json={"environment": "local_dogfood", "sourceRevision": "a" * 40, "sourceRefs": ["packet:packet-local-1"], "evidenceRefs": ["evidence:packet-local-1"]},
        ))
        await session.commit()


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="kendall-local-dogfood-") as directory:
        root = Path(directory)
        private = Ed25519PrivateKey.generate()
        private_path, secret_path, observation_path, socket_path = (root / "issuer.key", root / "envelope.secret", root / "observation.json", root / "issuer.sock")
        private_path.write_text(base64.b64encode(private.private_bytes_raw()).decode(), encoding="ascii")
        secret_path.write_text(base64.b64encode(os.urandom(32)).decode(), encoding="ascii")
        observation_path.write_text(json.dumps({"environment": "local_dogfood", "sourceRevision": "a" * 40, "sourceRefs": ["packet:packet-local-1"], "evidenceRefs": ["evidence:packet-local-1"]}, sort_keys=True, separators=(",", ":")), encoding="utf-8")
        os.chmod(observation_path, 0o600)
        consumed_dir = root / "consumed"
        consumed_dir.mkdir(mode=0o700)
        api_dir = root / "api"
        api_dir.mkdir(mode=0o700)
        os.chmod(private_path, 0o600)
        os.chmod(secret_path, 0o600)
        issuer_path = Path(__file__).with_name("local_dogfood_attestation_issuer.py")
        with subprocess.Popen([sys.executable, str(issuer_path), "--socket", str(socket_path), "--observation-json", str(observation_path), "--private-key-file", str(private_path), "--envelope-secret-file", str(secret_path), "--consumed-dir", str(root / "consumed")]) as issuer:
            for _ in range(40):
                if socket_path.exists():
                    break
                time.sleep(0.05)
            else:
                raise RuntimeError("issuer socket did not start")
            os.environ["SUPERVISOR_DATABASE_URL"] = f"sqlite+aiosqlite:///{(root / 'supervisor.db').as_posix()}"
            os.environ["SUPERVISOR_ENABLE_BACKGROUND"] = "false"
            os.environ["SUPERVISOR_ENABLE_LOCAL_DOGFOOD_ATTESTATION"] = "true"
            os.environ["SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_SOCKET_PATH"] = str(socket_path)
            os.environ["SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_ENVELOPE_SECRET_FILE"] = str(secret_path)
            os.environ["SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_API_SOCKET_PATH"] = str(api_dir / "api.sock")
            os.environ["SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_ISSUER_REGISTRY"] = json.dumps([{"issuerId": "issuer-local", "keyId": "dev-key-1", "publicKeyB64": base64.b64encode(private.public_key().public_bytes_raw()).decode()}])
            from supervisor.api.main import app
            with TestClient(app, client=None) as client:
                asyncio.run(_seed_packet())
                authorization = client.post("/local-dogfood/attestations/packets/packet-local-1/authorizations").json()["data"]
                accept = client.post(f"/local-dogfood/attestations/authorizations/{authorization['authorizationId']}/observe").json()["data"]
                replay = client.post(f"/local-dogfood/attestations/authorizations/{authorization['authorizationId']}/observe").json()["data"]["accepted"]
                readback = client.get(f"/local-dogfood/attestations/authorizations/{authorization['authorizationId']}").json()["data"]
            issuer.terminate()
            issuer.wait(timeout=5)
    print(json.dumps({"accepted": accept["accepted"], "replayIdempotent": replay, "readbackEvidenceClass": readback["evidenceClass"], "liveEvidenceAccepted": readback["liveEvidenceAccepted"]}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
