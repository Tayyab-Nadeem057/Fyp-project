// Pure Python parsing helpers (no vscode import) so they can be unit-tested with plain node.

export interface DepRef {
  name: string;
  line: number;   // 0-based
  start: number;  // column of name start
  end: number;    // column of name end
}

export type Ecosystem = "pypi";

/** Extract package names from a requirements.txt text. */
export function parseRequirements(text: string): DepRef[] {
  const out: DepRef[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(#|-|git\+|https?:)/.test(line) || !line.trim()) return;
    const m = line.match(/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/);
    if (m) {
      const start = line.indexOf(m[1]);
      out.push({ name: m[1], line: i, start, end: start + m[1].length });
    }
  });
  return out;
}

/** Find Python packages in a shell command such as `pip install x y` or `python -m pip install z`. */
export function parseInstallCommand(cmd: string): { ecosystem: Ecosystem; names: string[] } | null {
  const tokens = cmd.trim().split(/\s+/);
  if (tokens.length < 3) return null;
  const tool = tokens[0].toLowerCase();
  const skip = (t: string) => t.startsWith("-") || t.startsWith(".") || t.startsWith("/") || /^(https?:|git\+|file:)/.test(t);

  if (["pip", "pip3", "uv"].includes(tool) || tool.startsWith("python")) {
    const idx = tokens.findIndex((t) => t === "install" || t === "add");
    if (idx === -1) return null;
    const names = tokens.slice(idx + 1).filter((t) => !skip(t)).map((t) => t.split(/[=<>!~\[;]/)[0]).filter(Boolean);
    return names.length ? { ecosystem: "pypi", names } : null;
  }
  return null;
}

/** Match Python imports to catch non-existent packages used in code. */
export function parseImports(text: string, languageId: string): DepRef[] {
  if (languageId !== "python") return [];
  const out: DepRef[] = [];
  const lines = text.split(/\r?\n/);
  const pyRe = /^\s*(?:import|from)\s+([A-Za-z_][\w]*)/;
  lines.forEach((line, i) => {
    const m = line.match(pyRe);
    if (m) {
      const start = line.indexOf(m[1]);
      out.push({ name: m[1], line: i, start, end: start + m[1].length });
    }
  });
  return out;
}
