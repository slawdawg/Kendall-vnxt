import { request as httpRequest } from "node:http";

const MAX_RESPONSE_BYTES = 256 * 1024;

export function resolvePrivateSupervisorUdsPath(context = {}) {
  const transport = context.supervisorTransport ?? process.env.KENDALL_SUPERVISOR_TRANSPORT;
  if (transport !== "private_uds") return null;
  const socketPath = context.supervisorUdsPath ?? process.env.KENDALL_SUPERVISOR_UDS_PATH;
  if (typeof socketPath !== "string" || !socketPath.trim() || socketPath !== socketPath.trim() || socketPath.length > 512 ||
    !socketPath.startsWith("/") || socketPath.includes("\0") || socketPath.split("/").includes("..")) {
    throw new TypeError("private supervisor UDS transport requires a safe absolute KENDALL_SUPERVISOR_UDS_PATH.");
  }
  return socketPath;
}

export function privateSupervisorUdsEndpoint(socketPath, path) {
  assertRequestPath(path);
  return `private-uds:${socketPath}${path}`;
}

export function requestPrivateSupervisorUds(socketPath, path, options = {}) {
  assertRequestPath(path);
  const method = options.method || "GET";
  const timeoutMs = options.timeoutMs;
  const body = options.body === undefined ? null : JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      socketPath,
      path,
      method,
      headers: {
        accept: "application/json",
        ...(body === null ? {} : { "content-type": "application/json", "content-length": Buffer.byteLength(body) }),
      },
      timeout: timeoutMs,
    }, (response) => {
      const contentLength = Number(response.headers["content-length"]);
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        response.resume();
        reject(new Error("private supervisor UDS response exceeds the metadata limit"));
        return;
      }
      const chunks = [];
      let receivedBytes = 0;
      response.on("data", (chunk) => {
        receivedBytes += chunk.length;
        if (receivedBytes > MAX_RESPONSE_BYTES) {
          response.destroy(new Error("private supervisor UDS response exceeds the metadata limit"));
          return;
        }
        chunks.push(chunk);
      });
      response.once("error", reject);
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          ok: (response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300,
          status: response.statusCode ?? 500,
          json: async () => JSON.parse(text),
        });
      });
    });
    request.once("error", reject);
    request.once("timeout", () => request.destroy(new Error("private supervisor UDS request timed out")));
    if (body !== null) request.write(body);
    request.end();
  });
}

function assertRequestPath(path) {
  if (typeof path !== "string" || !path.startsWith("/") || path.includes("?") || path.includes("#") || path.includes("\0")) {
    throw new TypeError("private supervisor UDS request path must be an absolute path without query or fragment.");
  }
}
