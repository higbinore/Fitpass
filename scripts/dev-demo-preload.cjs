/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { PassThrough } = require("node:stream");

function isEnvironmentFile(value) {
  try {
    const raw = Buffer.isBuffer(value) ? value.toString() : String(value);
    const normalized = raw.replace(/^file:\/\//i, "").replaceAll("/", "\\");
    const name = path.win32.basename(normalized).toLowerCase();
    return name === ".env" || name.startsWith(".env.");
  } catch {
    return false;
  }
}

function missingEnvironmentFile() {
  const error = new Error("Environment-file access is disabled by the FitPass local guard.");
  error.code = "ENOENT";
  return error;
}

for (const method of ["readFileSync", "openSync", "statSync", "lstatSync", "accessSync", "realpathSync"]) {
  const original = fs[method].bind(fs);
  fs[method] = (file, ...args) => {
    if (isEnvironmentFile(file)) throw missingEnvironmentFile();
    return original(file, ...args);
  };
}

const originalExistsSync = fs.existsSync.bind(fs);
fs.existsSync = (file) => isEnvironmentFile(file) ? false : originalExistsSync(file);

for (const method of ["readFile", "open", "stat", "lstat", "access", "realpath"]) {
  const original = fs[method].bind(fs);
  fs[method] = (file, ...args) => {
    if (!isEnvironmentFile(file)) return original(file, ...args);
    const callback = args.at(-1);
    if (typeof callback === "function") return queueMicrotask(() => callback(missingEnvironmentFile()));
    return Promise.reject(missingEnvironmentFile());
  };
}

const originalExists = fs.exists.bind(fs);
fs.exists = (file, callback) => isEnvironmentFile(file) ? queueMicrotask(() => callback(false)) : originalExists(file, callback);

const originalCreateReadStream = fs.createReadStream.bind(fs);
fs.createReadStream = (file, ...args) => {
  if (!isEnvironmentFile(file)) return originalCreateReadStream(file, ...args);
  const stream = new PassThrough();
  queueMicrotask(() => stream.destroy(missingEnvironmentFile()));
  return stream;
};

for (const method of ["readFile", "open", "stat", "lstat", "access", "realpath"]) {
  const original = fs.promises[method].bind(fs.promises);
  fs.promises[method] = (file, ...args) => isEnvironmentFile(file)
    ? Promise.reject(missingEnvironmentFile())
    : original(file, ...args);
}

if (process.env.FITPASS_DEMO_LOCAL_ONLY === "1") {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const requestUrl = new URL(typeof input === "string" ? input : input.url);
    if (requestUrl.hostname === "api.resend.com") {
      const sink = process.env.FITPASS_LOCAL_MAIL_SINK_FILE;
      const expectedSuffix = path.join(".fitpass-local", "email-sink.jsonl");
      const resolvedSink = sink ? path.resolve(sink) : "";
      const expectedPath = path.resolve(process.cwd(), expectedSuffix);
      if (resolvedSink !== expectedPath || typeof init?.body !== "string") {
        throw new Error("Local email sink is not configured safely; no email was sent.");
      }
      fs.appendFileSync(resolvedSink, `${init.body}\n`, { encoding: "utf8", mode: 0o600 });
      return new Response(JSON.stringify({ id: "local-mail-sink" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (requestUrl.hostname === "api.paystack.co" || requestUrl.hostname.endsWith(".api.paystack.co")) {
      throw new Error("External Paystack requests are blocked in the local FitPass review server.");
    }
    return originalFetch(input, init);
  };
}
