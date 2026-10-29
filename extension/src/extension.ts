import * as vscode from "vscode";
import { analyze, getJson, PackageResult } from "./api";
import { DepRef, Ecosystem, parseInstallCommand, parseRequirements } from "./parsers";

let diagnostics: vscode.DiagnosticCollection;
let status: vscode.StatusBarItem;
const output = vscode.window.createOutputChannel("DepGuard");

const apiUrl = () => vscode.workspace.getConfiguration("depguard").get<string>("apiUrl", "http://127.0.0.1:8000");

function ecosystemFor(doc: vscode.TextDocument): Ecosystem | null {
  const file = doc.fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  if (/^requirements.*\.txt$/.test(file) || file === "Pipfile" || file === "pyproject.toml") return "pypi";
  return null;
}

function parseDeps(doc: vscode.TextDocument, _eco: Ecosystem): DepRef[] {
  return parseRequirements(doc.getText());
}

function severity(level: PackageResult["risk_level"]): vscode.DiagnosticSeverity | null {
  switch (level) {
    case "dangerous": return vscode.DiagnosticSeverity.Error;
    case "suspicious": return vscode.DiagnosticSeverity.Warning;
    default: return null; // safe / unknown: no squiggle
  }
}

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
      const msg = `DepGuard: ${r.risk_level.toUpperCase()} (risk ${r.score}/100)\n` + r.reasons.map((x) => `• ${x.text}`).join("\n");
      const diag = new vscode.Diagnostic(range, msg, sev);
      diag.source = "DepGuard";
      diag.code = r.reasons[0]?.code;
      found.push(diag);
    }
    diagnostics.set(doc.uri, found);
    const bad = found.length;
    status.text = bad ? `$(shield) DepGuard: ${bad} risky` : "$(shield) DepGuard: clean";
    if (bad) vscode.window.showWarningMessage(`DepGuard found ${bad} risky Python package(s) in ${doc.fileName.split(/[\\/]/).pop()}.`);
  } catch (e: any) {
    status.text = "$(shield) DepGuard: offline";
    output.appendLine(`Scan failed: ${e?.message ?? e}`);
    vscode.window.showErrorMessage(`DepGuard could not reach the backend at ${apiUrl()}. Is it running?`);
  }
}

async function scanProject(): Promise<void> {
  const files = await vscode.workspace.findFiles("**/requirements*.txt", "**/node_modules/**", 50);
  if (!files.length) { vscode.window.showInformationMessage("DepGuard: no requirements.txt found."); return; }
  for (const f of files) await scanDocument(await vscode.workspace.openTextDocument(f));
}

async function checkPackage(): Promise<void> {
  const name = await vscode.window.showInputBox({ prompt: "Enter Python package name to check (e.g. requests)" });
  if (!name) return;
  try {
    const [r] = await analyze(apiUrl(), "pypi", [name.trim()], "manual");
    const text = `${r.name}: ${r.risk_level.toUpperCase()} (${r.score}/100)\n` + r.reasons.map((x) => `- ${x.text}`).join("\n");
    (r.risk_level === "safe" ? vscode.window.showInformationMessage : r.risk_level === "suspicious" ? vscode.window.showWarningMessage : vscode.window.showErrorMessage)(text, { modal: true });
  } catch (e: any) {
    vscode.window.showErrorMessage(`DepGuard: ${e?.message ?? e}`);
  }
}

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
    vscode.workspace.onDidSaveTextDocument((d) => { if (vscode.workspace.getConfiguration("depguard").get<boolean>("scanOnSave", true)) scanDocument(d); }),
    vscode.workspace.onDidOpenTextDocument((d) => scanDocument(d))
  );
  watchTerminal(ctx);
  vscode.workspace.textDocuments.forEach((d) => scanDocument(d));
  void getJson; // dashboard (history/summary) is the next milestone
}

export function deactivate(): void {}
