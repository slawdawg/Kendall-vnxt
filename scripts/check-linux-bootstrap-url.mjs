#!/usr/bin/env node

import { request } from "node:https";

const url = process.argv[2] ?? "https://raw.githubusercontent.com/slawdawg/Kendall-vnxt/main/scripts/bootstrap-linux.sh";

function checkUrl(targetUrl) {
  return new Promise((resolve) => {
    const req = request(targetUrl, { method: "GET", timeout: 15000 }, (res) => {
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
    req.on("timeout", () => {
      req.destroy(new Error("request timed out"));
    });
    req.on("error", (error) => {
      resolve({ statusCode: 0, error: error.message, body: "" });
    });
    req.end();
  });
}

const result = await checkUrl(url);
if (result.statusCode !== 200) {
  console.error(`Bootstrap URL is not reachable: ${url}`);
  console.error(`HTTP status: ${result.statusCode || "request failed"}`);
  if (result.error) {
    console.error(`Error: ${result.error}`);
  }
  process.exit(1);
}

if (!result.body.includes("--install-kendall-vnxt")) {
  console.error(`Bootstrap URL did not return the expected installer content: ${url}`);
  process.exit(1);
}

console.log(`Bootstrap URL reachable and contains installer mode: ${url}`);
