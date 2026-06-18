#!/usr/bin/env node

import { request } from "node:https";
import { fileURLToPath } from "node:url";

const DEFAULT_BOOTSTRAP_URL =
  "https://raw.githubusercontent.com/slawdawg/Kendall-vnxt/main/scripts/bootstrap-linux.sh";

export function checkUrl(targetUrl) {
  return new Promise((resolve) => {
    let req;
    try {
      req = request(targetUrl, { method: "GET", timeout: 15000 }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          if (body.length < 4096) {
            body += chunk;
          }
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body,
          });
        });
      });
    } catch (error) {
      resolve({ statusCode: 0, error: error.message, body: "" });
      return;
    }
    req.on("timeout", () => {
      req.destroy(new Error("request timed out"));
    });
    req.on("error", (error) => {
      resolve({ statusCode: 0, error: error.message, body: "" });
    });
    req.end();
  });
}

export async function runBootstrapUrlCheck(url = DEFAULT_BOOTSTRAP_URL) {
  const result = await checkUrl(url);
  if (result.statusCode !== 200) {
    console.error(`Bootstrap URL is not reachable: ${url}`);
    console.error(`HTTP status: ${result.statusCode || "request failed"}`);
    if (result.error) {
      console.error(`Error: ${result.error}`);
    }
    return 1;
  }

  if (!result.body.includes("--install-kendall-vnxt")) {
    console.error(`Bootstrap URL did not return the expected installer content: ${url}`);
    return 1;
  }

  console.log(`Bootstrap URL reachable and contains installer mode: ${url}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await runBootstrapUrlCheck(process.argv[2]);
}
