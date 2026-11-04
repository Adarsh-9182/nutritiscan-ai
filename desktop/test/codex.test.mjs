import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { CodexBridge, restrictedArgs } from "../src/codex.mjs";
import { safeChildEnvironment } from "../src/policy.mjs";
test("inherited model keys and unrelated credentials are not sent to the Codex subprocess", () => {
  const env = safeChildEnvironment({ HOME: "/example", PATH: "/usr/bin", OPENAI_API_KEY: "synthetic", ANTHROPIC_API_KEY: "synthetic", DATABASE_URL: "synthetic", ACCESS_TOKEN: "synthetic" }); assert.deepEqual(Object.keys(env).sort(), ["HOME", "PATH"]); assert.equal(env.HOME, "/example"); assert.ok(env.PATH.includes("/example/.local/node/bin")); assert.ok(env.PATH.includes("/opt/homebrew/bin"));
});
test("MCP isolation enumerates full inert disabled entries instead of an ineffective empty table", () => {
  const args = restrictedArgs(["test-server", 'quoted"name']); assert.ok(args.includes("features.shell_tool=false")); assert.ok(args.includes("features.hooks=false"));
  assert.ok(args.at(-1).includes('"test-server"={enabled=false,command="/usr/bin/false"}')); assert.ok(args.at(-1).includes('"quoted\\"name"'));
  assert.throws(() => restrictedArgs([undefined])); assert.ok(!args.some((a) => a.includes("forced_login_method")));
});
test("JSONL transport handles chunked messages, dispatches tool calls and rejects provider errors safely", async () => {
  const bridge = new CodexBridge(); bridge.process = { stdin: new PassThrough(), killed: false }; const pending = bridge.rpc("account/read", {});
  bridge.receive('{"id":1,"result":{"account":'); bridge.receive('{"type":"chatgpt"}}}\n'); assert.equal((await pending).account.type, "chatgpt");
  let seen; bridge.on("request", (m) => { seen = m; }); bridge.receive('{"id":"tool-1","method":"item/tool/call","params":{}}\n'); assert.equal(seen.id, "tool-1");
  const failed = bridge.rpc("turn/start", {}); bridge.receive('{"id":2,"error":{"message":"private sensitive upstream diagnostic"}}\n'); await assert.rejects(failed, (error) => !error.message.includes("sensitive"));
  bridge.closed();
});
test("a concurrent connection waits for initialization and catalog loading", async () => {
  const bridge = new CodexBridge(); bridge.connected = true; bridge.starting = Promise.resolve({ ready: true });
  assert.deepEqual(await bridge.connect(), { ready: true }); bridge.process = null; bridge.connected = false;
});
