// Pure parsing helpers (no vscode import) so they can be unit-tested with plain node.

export interface DepRef {
  name: string;
  line: number;   // 0-based
  start: number;  // column of name start
  end: number;    // column of name end
}

export type Ecosystem = "npm" | "pypi";

/** Extract dependency names (with positions) from a package.json text. */
export function parsePackageJson(text: string): DepRef[] {
  const out: DepRef[] = [];
  const lines = text.split(/\r?\n/);
  const sections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
  let inSection = false;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inSection) {
      const m = line.match(/^\s*"(\w+)"\s*:\s*\{/);
      if (m && sections.includes(m[1])) {
        inSection = true;
        depth = 1;
        // handle one-line sections like "dependencies": { "a": "1" }
        const rest = line.slice(line.indexOf("{") + 1);
        collectInline(rest, line.indexOf("{") + 1, i, out);
        depth += (rest.match(/\{/g) || []).length - (rest.match(/\}/g) || []).length;
        if (depth <= 0) inSection = false;
      }
      continue;
    }
    const m = line.match(/^(\s*)"((?:@[^"/]+\/)?[^"]+)"\s*:/);
    if (m && depth === 1) {
      const start = line.indexOf('"') + 1;
      out.push({ name: m[2], line: i, start, end: start + m[2].length });
    }
    depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    if (depth <= 0) inSection = false;
  }
  return out;
}

function collectInline(rest: string, offset: number, lineNo: number, out: DepRef[]) {
  const re = /"((?:@[^"/]+\/)?[^"]+)"\s*:\s*"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest))) {
    const start = offset + m.index + 1;
    out.push({ name: m[1], line: lineNo, start, end: start + m[1].length });
  }
}

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

/** Find packages in a shell command such as `npm install a b@1.0` or `pip install x`. */
export function parseInstallCommand(cmd: string): { ecosystem: Ecosystem; names: string[] } | null {
  const tokens = cmd.trim().split(/\s+/);
  if (tokens.length < 3) return null;
  const tool = tokens[0].toLowerCase();
  const verb = tokens[1].toLowerCase();
  const skip = (t: string) => t.startsWith("-") || t.startsWith(".") || t.startsWith("/") || /^(https?:|git\+|file:)/.test(t);
  if (["npm", "pnpm", "yarn", "bun"].includes(tool) && ["install", "i", "add"].includes(verb)) {
    const names = tokens.slice(2).filter((t) => !skip(t)).map(stripNpmVersion).filter(Boolean);
    return names.length ? { ecosystem: "npm", names } : null;
  }
  if (["pip", "pip3", "uv"].includes(tool) || tool.startsWith("python")) {
    const idx = tokens.findIndex((t) => t === "install" || t === "add");
    if (idx === -1) return null;
    const names = tokens.slice(idx + 1).filter((t) => !skip(t)).map((t) => t.split(/[=<>!~\[;]/)[0]).filter(Boolean);
    return names.length ? { ecosystem: "pypi", names } : null;
  }
  return null;
}

function stripNpmVersion(t: string): string {
  // "@scope/pkg@1.2.3" -> "@scope/pkg", "pkg@latest" -> "pkg"
  const at = t.lastIndexOf("@");
  return at > 0 ? t.slice(0, at) : t;
}

/** Match JS/TS imports and Python imports to catch non-existent packages used in code. */
export function parseImports(text: string, languageId: string): DepRef[] {
  const out: DepRef[] = [];
  const lines = text.split(/\r?\n/);
  const jsRe = /(?:from\s+|require\(\s*|import\s+)["']((?:@[\w.-]+\/)?[\w.-]+)(?:\/[^"']*)?["']/g;
  const pyRe = /^\s*(?:import|from)\s+([A-Za-z_][\w]*)/;
  lines.forEach((line, i) => {
    if (["javascript", "typescript", "javascriptreact", "typescriptreact"].includes(languageId)) {
      let m: RegExpExecArray | null;
      jsRe.lastIndex = 0;
      while ((m = jsRe.exec(line))) {
        if (m[1].startsWith(".") || m[1].startsWith("node:")) continue;
        const start = line.indexOf(m[1], m.index);
        out.push({ name: m[1], line: i, start, end: start + m[1].length });
      }
    } else if (languageId === "python") {
      const m = line.match(pyRe);
      if (m) {
        const start = line.indexOf(m[1]);
        out.push({ name: m[1], line: i, start, end: start + m[1].length });
      }
    }
  });
  return out;
}
