import http from "node:http";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const WORK_PACKET_PATH = /^\/work-packets(?:\/[A-Za-z0-9._:%-]+)?$/;
const CANONICAL_WORK_ITEM_PACKET_PATH = /^\/pipeline-control-plane\/work-items\/[A-Za-z0-9._:%-]+\/packet$/;

function assertAllowedPath(path: string) {
  if (path === "/pipeline-control-plane/projection" || WORK_PACKET_PATH.test(path) || CANONICAL_WORK_ITEM_PACKET_PATH.test(path)) return;
  throw new Error("LAN-auth pipeline read path is not allowed.");
}

function privateSupervisorSocketPath() {
  const socketPath = process.env.KENDALL_SUPERVISOR_UDS_PATH;
  if (typeof socketPath !== "string" || !socketPath.startsWith("/")) {
    throw new Error("LAN-auth supervisor UDS path is unavailable.");
  }
  return socketPath;
}

export async function requestPipelineSupervisorViaUds<T>(path: string): Promise<T> {
  assertAllowedPath(path);
  const socketPath = privateSupervisorSocketPath();

  return new Promise<T>((resolve, reject) => {
    const request = http.request({
      socketPath,
      path,
      method: "GET",
      headers: { accept: "application/json" },
    }, (response) => {
      const contentLength = Number(response.headers["content-length"]);
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        response.resume();
        reject(new Error(`LAN-auth supervisor response exceeded ${MAX_RESPONSE_BYTES} bytes for ${path}`));
        return;
      }
      const chunks: Buffer[] = [];
      let responseBytes = 0;
      let oversized = false;
      response.on("data", (chunk: Buffer) => {
        responseBytes += chunk.length;
        if (responseBytes > MAX_RESPONSE_BYTES) {
          oversized = true;
          request.destroy();
          reject(new Error(`LAN-auth supervisor response exceeded ${MAX_RESPONSE_BYTES} bytes for ${path}`));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (oversized) return;
        if (response.statusCode !== 200) {
          reject(new Error(`LAN-auth supervisor request failed for ${path} (${response.statusCode ?? 503})`));
          return;
        }
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { data?: T };
          if (!payload || !("data" in payload)) throw new Error("Malformed response");
          resolve(payload.data as T);
        } catch {
          reject(new Error(`LAN-auth supervisor response was invalid for ${path}`));
        }
      });
    });
    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error("LAN-auth supervisor request timed out.")));
    request.on("error", reject);
    request.end();
  });
}
