const fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path"),
  { createRequire } = require("node:module");
function el(tag) {
  return {
    tag,
    children: [],
    style: {
      setProperty(k, v) {
        this[k] = v;
      },
    },
    classList: { add() {} },
    attrs: {},
    appendChild(c) {
      this.children.push(c);
      return c;
    },
    append(...xs) {
      this.children.push(...xs);
    },
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    set textContent(s) {
      this.text = String(s);
    },
    get textContent() {
      return (
        (this.text || "") + this.children.map((x) => x.textContent).join(" ")
      );
    },
  };
}
function frontend(options = {}, fixed = "2030-01-08T15:00:00Z") {
  const root = path.resolve(__dirname, ".."),
    name = require("../package.json").name;
  const file = fs
    .readdirSync(root)
    .find((f) => f.startsWith("MMM-") && f.endsWith(".js"));
  const context = {
    Date,
    Intl,
    URL,
    URLSearchParams,
    structuredClone,
    console,
    document: { createElement: el, createElementNS: (ns, t) => el(t) },
    setInterval: () => 1,
    clearInterval() {},
    fetch: async () => {
      throw Error("Unexpected external API");
    },
  };
  const real = Date;
  context.Date = class extends real {
    constructor(...args) {
      super(...(args.length ? args : [real.parse(fixed)]));
    }
    static now() {
      return real.parse(fixed);
    }
  };
  let def;
  context.Module = {
    register: (n, d) => {
      if (n !== file.slice(0, -3)) throw Error("Registration mismatch");
      def = d;
    },
  };
  context.self = context;
  vm.createContext(context);
  for (const dep of [
    "date-utils.js",
    "birthday-logic.js",
    "schoolday-logic.js",
  ])
    if (fs.existsSync(path.join(root, dep)))
      vm.runInContext(fs.readFileSync(path.join(root, dep), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  Object.assign(def, {
    config: { ...def.defaults, ...options },
    identifier: "one",
    file: (x) => x,
    updates: 0,
    updateDom() {
      this.updates++;
    },
    sendSocketNotification(n, p) {
      this.sent = { n, p };
    },
    hide() {
      this.hidden = true;
    },
    show() {
      this.hidden = false;
    },
  });
  return def;
}
function helper(files = {}, extra = {}) {
  const root = path.resolve(__dirname, ".."),
    localRequire = createRequire(path.join(root, "node_helper.js"));
  let def;
  const fakefs = {
    existsSync: (p) => Object.hasOwn(files, path.basename(p)),
    readFileSync: (p) => {
      const value = files[path.basename(p)];
      if (value === undefined) throw Error("missing");
      return typeof value === "string" ? value : JSON.stringify(value);
    },
    writeFileSync() {},
    mkdirSync() {},
  };
  const ctx = {
    module: { exports: {} },
    global: { root_path: "/synthetic" },
    __dirname: root,
    console,
    Date,
    Intl,
    URL,
    Map,
    require: (n) =>
      n === "node_helper"
        ? { create: (x) => x }
        : n === "fs" || n === "node:fs"
          ? fakefs
          : extra[n] || localRequire(n),
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "node_helper.js"), "utf8"),
    ctx,
  );
  def = ctx.module.exports;
  def.sendSocketNotification = (n, p) => {
    def.sent = { n, p };
  };
  return def;
}
module.exports = { frontend, helper, el };
