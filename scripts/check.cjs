const fs = require("node:fs"),
  { spawnSync } = require("node:child_process");
for (const name of fs.readdirSync(".")) {
  if (name.endsWith(".js")) {
    const r = spawnSync(process.execPath, ["--check", name], {
      stdio: "inherit",
    });
    if (r.status !== 0) process.exit(1);
  } else if (name.endsWith(".json")) JSON.parse(fs.readFileSync(name, "utf8"));
}

for (const name of fs.readdirSync(".")) {
  if (name.endsWith(".css")) {
    const s = fs.readFileSync(name, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    if ((s.match(/\{/g) || []).length !== (s.match(/\}/g) || []).length)
      throw Error("Unbalanced CSS rules: " + name);
  }
}
