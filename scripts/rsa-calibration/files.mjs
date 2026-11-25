import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { check } from "./cases.mjs";

const repo = fs.realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const inside = (root, p) => {
  const rel = path.relative(root, p);
  return (
    !rel ||
    (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel))
  );
};
export function openVault(directory) {
  check(
    directory && path.isAbsolute(directory),
    "Supply an absolute private directory",
  );
  const root = fs.realpathSync(directory);
  check(
    !inside(repo, root) && !inside(root, repo),
    "Vault must be separate from the repository",
  );
  for (let p = root; ; p = path.dirname(p)) {
    check(
      !fs.existsSync(path.join(p, ".git")),
      "Vault cannot be in a Git checkout",
    );
    if (path.dirname(p) === p) break;
  }
  function location(name) {
    const p = path.resolve(root, name);
    check(inside(root, p) && p !== root, "Invalid private file location");
    for (let part = p; part !== root; part = path.dirname(part)) {
      const stat = fs.lstatSync(part, { throwIfNoEntry: false });
      if (stat)
        check(
          !stat.isSymbolicLink() &&
            (stat.isDirectory() || (stat.isFile() && stat.nlink === 1)),
          "Linked private path rejected",
        );
    }
    return p;
  }
  function write(name, content, replace = false) {
    const dest = location(name);
    fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
    if (!replace)
      return fs.writeFileSync(dest, content, { flag: "wx", mode: 0o600 });
    const temporary = location(path.relative(root, dest) + "." + randomUUID());
    fs.writeFileSync(temporary, content, { flag: "wx", mode: 0o600 });
    try {
      fs.renameSync(temporary, dest);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  return {
    exists: (name) => fs.existsSync(location(name)),
    read: (name) =>
      JSON.parse(
        fs.readFileSync(location(name), "utf8").replace(/^\uFEFF/, ""),
      ),
    json: (name, value, replace) =>
      write(name, JSON.stringify(value, null, 2) + "\n", replace),
    write,
  };
}
