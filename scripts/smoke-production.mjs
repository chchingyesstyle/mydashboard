import http from "node:http";
import https from "node:https";

const DEFAULT_URL = "https://dashboard.cchk.uk/api/v1/dashboard";

function request(url, headers = {}) {
  const client = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const outgoing = client.request(url, {
      headers,
      method: "GET"
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          body: Buffer.concat(chunks),
          headers: response.headers,
          status: response.statusCode
        });
      });
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

function requireValue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function verify(url) {
  const initial = await request(url);
  requireValue(
    initial.status === 200,
    `Expected initial status 200, received ${initial.status}`
  );
  const etag = initial.headers.etag;
  requireValue(typeof etag === "string", "Expected initial ETag header");
  requireValue(
    initial.headers["access-control-allow-origin"] === "*",
    "Expected initial Access-Control-Allow-Origin: *"
  );

  const conditional = await request(url, {
    "If-None-Match": etag
  });
  requireValue(
    conditional.status === 304 ||
      (conditional.status === 200 && conditional.headers.etag === etag),
    `Expected conditional status 304 or matching ETag 200, received ${conditional.status}`
  );
  if (conditional.status === 304) {
    requireValue(
      conditional.body.length === 0,
      `Expected empty conditional body, received ${conditional.body.length} bytes`
    );
  }
  requireValue(
    conditional.headers.etag === etag,
    "Expected matching conditional ETag header"
  );
  requireValue(
    conditional.headers["access-control-allow-origin"] === "*",
    "Expected conditional Access-Control-Allow-Origin: *"
  );

  return {
    url: url.toString(),
    initialStatus: initial.status,
    etagPresent: true,
    initialCors: initial.headers["access-control-allow-origin"],
    conditionalStatus: conditional.status,
    conditionalBodyBytes: conditional.body.length,
    conditionalEtagMatches: true,
    conditionalCors: conditional.headers["access-control-allow-origin"]
  };
}

try {
  const url = new URL(process.argv[2] ?? DEFAULT_URL);
  console.log(JSON.stringify(await verify(url), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
