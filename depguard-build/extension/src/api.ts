import * as http from "http";
import * as https from "https";
import { URL } from "url";
import { Ecosystem } from "./parsers";

export interface Reason { code: string; points: number; text: string; }
export interface PackageResult {
  name: string;
  ecosystem: Ecosystem;
  exists: boolean | null;
  score: number;
  risk_level: "safe" | "suspicious" | "dangerous" | "unknown";
  reasons: Reason[];
}

/** POST /analyze using only node built-ins (no extra dependencies to bundle). */
export function analyze(apiUrl: string, ecosystem: Ecosystem, names: string[], project?: string): Promise<PackageResult[]> {
  return new Promise((resolve, reject) => {
    const url = new URL("/analyze", apiUrl);
    const body = JSON.stringify({ ecosystem, names, project });
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, timeout: 60000 },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) return reject(new Error(`DepGuard API ${res.statusCode}: ${data}`));
          try { resolve(JSON.parse(data).results as PackageResult[]); } catch (e) { reject(e); }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("DepGuard API timed out")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export function getJson(apiUrl: string, path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, apiUrl);
    const lib = url.protocol === "https:" ? https : http;
    lib.get(url, { timeout: 10000 }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on("error", reject).on("timeout", function(this: http.ClientRequest) { this.destroy(new Error("timeout")); });
  });
}

/** Quick health check — resolves true/false. */
export async function checkHealth(apiUrl: string): Promise<boolean> {
  try {
    const r = await getJson(apiUrl, "/health");
    return r?.status === "ok";
  } catch {
    return false;
  }
}
