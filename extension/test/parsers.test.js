const assert = require("assert");
const p = require("../out/parsers");

// Requirements.txt parsing
const req = "# comments are ignored\nrequests==2.31\nflask>=2\n-r other.txt\nnumpy[extra]\npydantic\n";
const parsedReqs = p.parseRequirements(req).map(d => d.name);
assert.deepStrictEqual(parsedReqs, ["requests", "flask", "numpy", "pydantic"]);

// Pip install command interception
assert.deepStrictEqual(p.parseInstallCommand("pip install requests==2.0 flask"), { ecosystem: "pypi", names: ["requests", "flask"] });
assert.deepStrictEqual(p.parseInstallCommand("pip3 install -U uv httpx"), { ecosystem: "pypi", names: ["uv", "httpx"] });
assert.deepStrictEqual(p.parseInstallCommand("python -m pip install torch torchvision"), { ecosystem: "pypi", names: ["torch", "torchvision"] });
assert.strictEqual(p.parseInstallCommand("pip install"), null);
assert.strictEqual(p.parseInstallCommand("ls -la"), null);

// Python import parsing
const pyCode = "import requests\nfrom flask import Flask\nimport os, sys\n";
const imports = p.parseImports(pyCode, "python").map(d => d.name);
assert.ok(imports.includes("requests"));
assert.ok(imports.includes("flask"));

console.log("Python parser tests passed successfully!");
