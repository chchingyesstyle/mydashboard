import { spawn } from "node:child_process";
import { createServer } from "node:http";
import process from "node:process";
import { describe, expect, it } from "vitest";

const ETAG = "\"dashboard-test\"";

async function runSmoke(conditionalStatus: 200 | 304): Promise<{
  code: number | null;
  stderr: string;
  stdout: string;
}> {
  const server = createServer((request, response) => {
    const conditional = request.headers["if-none-match"] === ETAG;
    response.writeHead(conditional ? conditionalStatus : 200, {
      "access-control-allow-origin": "*",
      "content-type": "application/json",
      etag: ETAG
    });
    response.end(conditional && conditionalStatus === 304 ? undefined : "{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Test server did not expose a TCP port");
  }

  const child = spawn(
    process.execPath,
    [
      "scripts/smoke-production.mjs",
      `http://127.0.0.1:${address.port}/api/v1/dashboard`
    ],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const code = await new Promise<number | null>((resolve) => {
    child.on("close", resolve);
  });
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });

  return { code, stderr, stdout };
}

describe("production API smoke command", () => {
  it("accepts an edge-cached 200 with a matching ETag", async () => {
    const result = await runSmoke(200);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("\"conditionalStatus\": 200");
  });

  it("passes a raw 200 then matching empty 304 exchange", async () => {
    const result = await runSmoke(304);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("\"conditionalStatus\": 304");
  });
});
