const assert = require("assert");
const p = require("../out/parsers");

const pj = `{
  "name": "x",
  "scripts": { "build": "tsc" },
  "dependencies": {
    "express": "^4.0.0",
    "@types/node": "^20"
  },
  "devDependencies": { "jest": "1" }
}`;
const deps = p.parsePackageJson(pj).map(d => d.name);
assert.deepStrictEqual(deps, ["express", "@types/node", "jest"]);
const e = p.parsePackageJson(pj)[0];
assert.strictEqual(pj.split("\n")[e.line].slice(e.start, e.end), "express");

const req = "# c\nrequests==2.31\nflask>=2\n-r other.txt\nnumpy[extra]\n";
assert.deepStrictEqual(p.parseRequirements(req).map(d => d.name), ["requests", "flask", "numpy"]);

assert.deepStrictEqual(p.parseInstallCommand("npm install express@4 lodash --save"), { ecosystem: "npm", names: ["express", "lodash"] });
assert.deepStrictEqual(p.parseInstallCommand("npm i @scope/pkg@1.0.0"), { ecosystem: "npm", names: ["@scope/pkg"] });
assert.deepStrictEqual(p.parseInstallCommand("pip install requests==2.0 flask"), { ecosystem: "pypi", names: ["requests", "flask"] });
assert.strictEqual(p.parseInstallCommand("npm install"), null);
assert.strictEqual(p.parseInstallCommand("ls -la"), null);
console.log("parser tests passed");
