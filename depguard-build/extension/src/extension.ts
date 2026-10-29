import * as vscode from "vscode";
import { analyze, checkHealth, getJson, PackageResult } from "./api";
import { DepRef, Ecosystem, parseInstallCommand, parsePackageJson, parseRequirements } from "./parsers";
import * as cp from "child_process";
import * as path from "path";

let diagnostics: vscode.DiagnosticCollection;
let status: vscode.StatusBarItem;
const output = vscode.window.createOutputChannel("DepGuard");

const apiUrl = () => vscode.workspace.getConfiguration("depguard").get<string>("apiUrl", "http://127.0.0.1:8000");

function ecosystemFor(doc: vscode.TextDocument): Ecosystem | null {
  const file = doc.fileName.replace(/\\\\/g, "/").split("/").pop() ?? "";
  if (file === "package.json") return "npm";
  if (/^requirements.*\\.txt$/.test(file)) return "pypi";
  return null;
}

function parseDeps(doc: vscode.TextDocument, eco: Ecosystem): DepRef[] {
  return eco === "npm" ? parsePackageJson(doc.getText()) : parseRequirements(doc.getText());
}

function severity(level: PackageResult["risk_level"]): vscode.DiagnosticSeverity | null {
  switch (level) {
    case "dangerous": return vscode.DiagnosticSeverity.Error;
    case "suspicious": return vscode.DiagnosticSeverity.Warning;
    default: return null; // safe / unknown: no squiggle
  }
}

// ──────────────── Backend Health ────────────────

async function ensureBackend(): Promise<boolean> {
  const ok = await checkHealth(apiUrl());
  if (ok) return true;
  const choice = await vscode.window.showWarningMessage(
    "DepGuard backend is not running. Start it or check the connection.",
    "Start Backend", "Configure URL", "Dismiss"
  );
  if (choice === "Start Backend") {
    await startBackend();
    // Wait a moment for it to start
    await new Promise(r => setTimeout(r, 3000));
    return checkHealth(apiUrl());
  }
  if (choice === "Configure URL") {
    vscode.commands.executeCommand("workbench.action.openSettings", "depguard.apiUrl");
  }
  return false;
}

async function startBackend(): Promise<void> {
  const terminal = vscode.window.createTerminal({ name: "DepGuard Backend" });
  // Try to find the backend directory
  const workspaceFolders = vscode.workspace.workspaceFolders;
  let backendDir = "";

  // Check common locations
  if (workspaceFolders) {
    for (const wf of workspaceFolders) {
      const candidate = path.join(wf.uri.fsPath, "backend");
      try {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(path.join(candidate, "app", "main.py")));
        if (stat) { backendDir = candidate; break; }
      } catch { /* not found, continue */ }
    }
  }

  if (backendDir) {
    terminal.sendText(`cd "${backendDir}"`);
  }

  // Use py launcher on Windows, python3 elsewhere
  const pyCmd = process.platform === "win32" ? "py" : "python3";
  terminal.sendText(`${pyCmd} -m uvicorn app.main:app --host 127.0.0.1 --port 8000`);
  terminal.show();
  vscode.window.showInformationMessage("DepGuard: Starting backend server... Please wait a few seconds.");
}

async function cmdCheckBackend(): Promise<void> {
  status.text = "$(sync~spin) DepGuard checking...";
  const ok = await checkHealth(apiUrl());
  if (ok) {
    status.text = "$(shield) DepGuard: connected";
    vscode.window.showInformationMessage(`DepGuard backend is running at ${apiUrl()}.`);
  } else {
    status.text = "$(shield) DepGuard: offline";
    vscode.window.showErrorMessage(`DepGuard backend is NOT reachable at ${apiUrl()}.`);
  }
}

// ──────────────── Scanning ────────────────

async function scanDocument(doc: vscode.TextDocument): Promise<void> {
  const eco = ecosystemFor(doc);
  if (!eco) return;
  const deps = parseDeps(doc, eco);
  if (!deps.length) { diagnostics.delete(doc.uri); return; }

  status.text = "$(sync~spin) DepGuard scanning...";
  status.show();
  try {
    const results = await analyze(apiUrl(), eco, deps.map((d) => d.name), vscode.workspace.name);
    const byName = new Map(results.map((r) => [r.name, r]));
    const found: vscode.Diagnostic[] = [];
    for (const d of deps) {
      const r = byName.get(d.name);
      const sev = r ? severity(r.risk_level) : null;
      if (!r || sev === null) continue;
      const range = new vscode.Range(d.line, d.start, d.line, d.end);
      const msg = `DepGuard: ${r.risk_level.toUpperCase()} (risk ${r.score}/100)\n` + r.reasons.map((x) => `\u2022 ${x.text}`).join("\n");
      const diag = new vscode.Diagnostic(range, msg, sev);
      diag.source = "DepGuard";
      diag.code = r.reasons[0]?.code;
      found.push(diag);
    }
    diagnostics.set(doc.uri, found);
    const bad = found.length;
    status.text = bad ? `$(shield) DepGuard: ${bad} risky` : "$(shield) DepGuard: clean";
    if (bad) vscode.window.showWarningMessage(`DepGuard found ${bad} risky package(s) in ${doc.fileName.split(/[\\\\/]/).pop()}.`);
  } catch (e: any) {
    status.text = "$(shield) DepGuard: offline";
    output.appendLine(`Scan failed: ${e?.message ?? e}`);
    const ok = await ensureBackend();
    if (!ok) return;
    // Retry once after backend starts
    return scanDocument(doc);
  }
}

async function scanProject(): Promise<void> {
  if (!(await ensureBackend())) return;
  const files = await vscode.workspace.findFiles("**/{package.json,requirements*.txt}", "**/node_modules/**", 50);
  if (!files.length) {
    vscode.window.showInformationMessage("DepGuard: no package.json or requirements.txt found.");
    return;
  }
  for (const f of files) await scanDocument(await vscode.workspace.openTextDocument(f));
}

async function checkPackage(): Promise<void> {
  if (!(await ensureBackend())) return;
  const eco = await vscode.window.showQuickPick(["npm", "pypi"], { placeHolder: "Ecosystem" });
  if (!eco) return;
  const name = await vscode.window.showInputBox({ prompt: "Package name to check" });
  if (!name) return;
  try {
    const [r] = await analyze(apiUrl(), eco as Ecosystem, [name.trim()], "manual");
    const text = `${r.name}: ${r.risk_level.toUpperCase()} (${r.score}/100)\n` + r.reasons.map((x) => `- ${x.text}`).join("\n");
    (r.risk_level === "safe" ? vscode.window.showInformationMessage : r.risk_level === "suspicious" ? vscode.window.showWarningMessage : vscode.window.showErrorMessage)(text, { modal: true });
  } catch (e: any) {
    vscode.window.showErrorMessage(`DepGuard: ${e?.message ?? e}`);
  }
}

// ──────────────── History & Summary ────────────────

async function viewHistory(): Promise<void> {
  if (!(await ensureBackend())) return;
  try {
    const data = await getJson(apiUrl(), "/history?limit=50");
    const scans: any[] = data.scans || [];
    if (!scans.length) {
      vscode.window.showInformationMessage("DepGuard: No scan history yet.");
      return;
    }
    const panel = vscode.window.createWebviewPanel("depguardHistory", "DepGuard: Scan History", vscode.ViewColumn.One, {});
    panel.webview.html = buildHistoryHtml(scans);
  } catch (e: any) {
    vscode.window.showErrorMessage(`DepGuard: Could not load history. ${e?.message ?? e}`);
  }
}

async function showSummary(): Promise<void> {
  if (!(await ensureBackend())) return;
  try {
    const s = await getJson(apiUrl(), "/summary");
    const msg = `DepGuard Summary\n\nTotal scans: ${s.total}\n\u2705 Safe: ${s.safe}\n\u26A0\uFE0F Suspicious: ${s.suspicious}\n\u274C Dangerous: ${s.dangerous}`;
    vscode.window.showInformationMessage(msg, { modal: true });
  } catch (e: any) {
    vscode.window.showErrorMessage(`DepGuard: ${e?.message ?? e}`);
  }
}

function buildHistoryHtml(scans: any[]): string {
  const rows = scans.map((s) => {
    const color = s.risk_level === "safe" ? "#22c55e" : s.risk_level === "suspicious" ? "#f59e0b" : s.risk_level === "dangerous" ? "#ef4444" : "#888";
    const reasons = (s.reasons || []).map((r: any) => `<div style="color:#ccc;font-size:12px;padding-left:16px">\u2022 ${escHtml(r.text)}</div>`).join("");
    return `<tr>
      <td>${escHtml(s.scanned_at?.slice(0, 19) || "")}</td>
      <td>${escHtml(s.ecosystem)}</td>
      <td><strong>${escHtml(s.name)}</strong></td>
      <td style="color:${color};font-weight:bold">${escHtml(s.risk_level?.toUpperCase())}</td>
      <td>${s.score}</td>
      <td>${s.exists ? "Yes" : "No"}</td>
    </tr>
    <tr><td colspan="6" style="padding:0 0 8px 0">${reasons}</td></tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; color: #d4d4d4; padding: 16px; }
  h1 { color: #569cd6; font-size: 20px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { text-align: left; padding: 8px; border-bottom: 2px solid #444; color: #9cdcfe; font-size: 13px; }
  td { padding: 6px 8px; border-bottom: 1px solid #333; font-size: 13px; }
  tr:hover td { background: #2a2a2a; }
</style>
</head>
<body>
  <h1>\uD83D\uDEE1\uFE0F DepGuard Scan History</h1>
  <table>
    <tr><th>Time</th><th>Ecosystem</th><th>Package</th><th>Risk</th><th>Score</th><th>Exists</th></tr>
    ${rows}
  </table>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ──────────────── Terminal Watch ────────────────

/** Warn BEFORE `npm install x` / `pip install x` runs in the integrated terminal. */
function watchTerminal(ctx: vscode.ExtensionContext): void {
  const w: any = vscode.window;
  if (typeof w.onDidStartTerminalShellExecution !== "function") {
    output.appendLine("Shell integration API unavailable; terminal interception disabled (file scanning still works).");
    return;
  }
  ctx.subscriptions.push(
    w.onDidStartTerminalShellExecution(async (e: any) => {
      const cmd: string | undefined = e?.execution?.commandLine?.value;
      const parsed = cmd ? parseInstallCommand(cmd) : null;
      if (!parsed) return;
      try {
        const results = await analyze(apiUrl(), parsed.ecosystem, parsed.names, "terminal");
        const risky = results.filter((r) => r.risk_level === "dangerous" || r.risk_level === "suspicious");
        if (!risky.length) return;
        const list = risky.map((r) => `${r.name} (${r.risk_level}, ${r.score}/100)`).join(", ");
        const choice = await vscode.window.showErrorMessage(
          `DepGuard: risky package(s) in "${cmd}": ${list}. Press Ctrl+C in the terminal to cancel the install.`,
          "Show details"
        );
        if (choice === "Show details") {
          output.clear();
          risky.forEach((r) => { output.appendLine(`${r.name}: ${r.risk_level} ${r.score}/100`); r.reasons.forEach((x) => output.appendLine(`   - ${x.text}`)); });
          output.show(true);
        }
      } catch (err: any) {
        output.appendLine(`Terminal check failed: ${err?.message ?? err}`);
      }
    })
  );
}

// ──────────────── Activation ────────────────

export function activate(ctx: vscode.ExtensionContext): void {
  diagnostics = vscode.languages.createDiagnosticCollection("depguard");
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  status.text = "$(shield) DepGuard";
  status.command = "depguard.scanProject";
  status.show();

  ctx.subscriptions.push(
    diagnostics, status, output,
    vscode.commands.registerCommand("depguard.scanProject", scanProject),
    vscode.commands.registerCommand("depguard.scanFile", () => { const d = vscode.window.activeTextEditor?.document; if (d) return scanDocument(d); }),
    vscode.commands.registerCommand("depguard.checkPackage", checkPackage),
    vscode.commands.registerCommand("depguard.checkBackend", cmdCheckBackend),
    vscode.commands.registerCommand("depguard.viewHistory", viewHistory),
    vscode.commands.registerCommand("depguard.showSummary", showSummary),
    vscode.commands.registerCommand("depguard.startBackend", startBackend),
    vscode.workspace.onDidSaveTextDocument((d) => { if (vscode.workspace.getConfiguration("depguard").get<boolean>("scanOnSave", true)) scanDocument(d); }),
    vscode.workspace.onDidOpenTextDocument((d) => scanDocument(d))
  );
  watchTerminal(ctx);

  // Check backend on activation
  checkHealth(apiUrl()).then((ok) => {
    status.text = ok ? "$(shield) DepGuard: connected" : "$(shield) DepGuard: offline";
    if (!ok) {
      output.appendLine("Backend not reachable. Use Command Palette > \"DepGuard: Start Backend Server\" to start it.");
    }
  });

  // Scan already-open documents
  vscode.workspace.textDocuments.forEach((d) => scanDocument(d));
}

export function deactivate(): void {}
