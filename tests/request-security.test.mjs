import assert from "node:assert/strict";
import test from "node:test";

import {
  applySecurityHeaders,
  guardRequest,
  resetRequestSecurityForTests,
} from "../worker/request-security.ts";

const ORIGIN = "https://sntss1puebla.com";

function sameOriginRequest(path, init = {}) {
  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    headers.set("origin", ORIGIN);
    headers.set("sec-fetch-site", "same-origin");
  }
  return new Request(`${ORIGIN}${path}`, { ...init, method, headers });
}

test("allows worldwide reads without a geographic restriction", () => {
  for (const country of ["FR", "US", "CA", "MX"]) {
    assert.equal(
      guardRequest(new Request(`${ORIGIN}/`, { headers: { "cf-ipcountry": country } })),
      null,
    );
  }
});

test("allows local development without Cloudflare metadata", () => {
  assert.equal(guardRequest(new Request("http://localhost:3000/")), null);
});

test("blocks API mutations without a verifiable same-origin browser request", async () => {
  const missingOrigin = guardRequest(
    new Request(`${ORIGIN}/api/devi/chat`, { method: "POST", body: "{}" }),
  );
  assert.equal(missingOrigin?.status, 403);
  assert.equal((await missingOrigin?.json()).error, "ORIGIN_REQUIRED");

  const crossSite = guardRequest(
    new Request(`${ORIGIN}/api/devi/chat`, {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      },
      body: "{}",
    }),
  );
  assert.equal(crossSite?.status, 403);
  assert.equal((await crossSite?.json()).error, "CROSS_SITE_REQUEST");
});

test("keeps the signed provider webhook reachable globally", () => {
  assert.equal(
    guardRequest(
      new Request(`${ORIGIN}/api/meta/webhook`, {
        method: "POST",
        headers: { "cf-ipcountry": "US" },
        body: "signed-provider-payload",
      }),
    ),
    null,
  );
});

test("rejects forged action and method-override headers", async () => {
  for (const header of ["next-action", "x-http-method-override", "x-method-override", "x-http-method"]) {
    const response = guardRequest(
      sameOriginRequest("/api/devi/chat", {
        method: "POST",
        headers: { [header]: "forged" },
        body: "{}",
      }),
    );
    assert.equal(response?.status, 400);
    assert.equal((await response?.json()).error, "SUSPICIOUS_HEADERS");
  }
});

test("rejects unsupported methods, invalid hosts and ambiguous paths", async () => {
  const methodResponse = guardRequest(new Request(`${ORIGIN}/`, { method: "PROPFIND" }));
  assert.equal(methodResponse?.status, 405);

  const hostResponse = guardRequest(new Request("https://evil.example/"));
  assert.equal(hostResponse?.status, 400);
  assert.equal((await hostResponse?.json()).error, "INVALID_HOST");

  const pathResponse = guardRequest(new Request(`${ORIGIN}/api/%5Cadmin`));
  assert.equal(pathResponse?.status, 400);
  assert.equal((await pathResponse?.json()).error, "INVALID_PATH");
});

test("rejects oversized payloads while preserving the larger upload allowance", async () => {
  const oversized = guardRequest(
    sameOriginRequest("/api/devi/chat", {
      method: "POST",
      headers: { "content-length": String(1024 * 1024 + 1) },
    }),
  );
  assert.equal(oversized?.status, 413);
  assert.equal((await oversized?.json()).error, "PAYLOAD_TOO_LARGE");

  assert.equal(
    guardRequest(
      sameOriginRequest("/api/documents", {
        method: "POST",
        headers: { "content-length": String(2 * 1024 * 1024) },
      }),
    ),
    null,
  );
});

test("rejects mutating requests to non-resource roots", async () => {
  for (const path of ["/", "/api", "/api/"]) {
    const response = guardRequest(sameOriginRequest(path, { method: "POST" }));
    assert.equal(response?.status, 405);
    assert.equal((await response?.json()).error, "METHOD_NOT_ALLOWED");
  }
});

test("preserves legitimate same-origin API posts", () => {
  assert.equal(
    guardRequest(
      sameOriginRequest("/api/devi/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    ),
    null,
  );
});

test("rate-limits abusive bursts by client and endpoint group", async () => {
  resetRequestSecurityForTests();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    assert.equal(
      guardRequest(
        sameOriginRequest("/api/worker/session", {
          method: "POST",
          headers: { "cf-connecting-ip": "203.0.113.10", "content-type": "application/json" },
          body: "{}",
        }),
      ),
      null,
    );
  }

  const blocked = guardRequest(
    sameOriginRequest("/api/worker/session", {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.10", "content-type": "application/json" },
      body: "{}",
    }),
  );
  assert.equal(blocked?.status, 429);
  assert.equal(blocked?.headers.get("cache-control"), "no-store");
  assert.ok(Number(blocked?.headers.get("retry-after")) >= 1);
  assert.equal((await blocked?.json()).error, "RATE_LIMITED");
  resetRequestSecurityForTests();
});

test("adds browser hardening headers to every response", () => {
  const response = applySecurityHeaders(
    new Response("ok", { status: 200 }),
    new Request(`${ORIGIN}/`),
  );

  assert.match(response.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
  assert.match(response.headers.get("permissions-policy") || "", /geolocation=\(\)/);
});

test("requires JSON on sensitive service endpoints", async () => {
  const response = guardRequest(sameOriginRequest("/api/devi/chat", { method: "POST", body: "hello" }));
  assert.equal(response?.status, 415);
  assert.equal((await response?.json()).error, "UNSUPPORTED_MEDIA_TYPE");
});

test("allows empty same-origin session logout requests", () => {
  assert.equal(
    guardRequest(
      sameOriginRequest("/api/worker/session", {
        method: "DELETE",
      }),
    ),
    null,
  );
  assert.equal(
    guardRequest(
      sameOriginRequest("/api/privileged/session", {
        method: "DELETE",
      }),
    ),
    null,
  );
});

test("prevents caching and indexing of API responses", () => {
  const response = applySecurityHeaders(new Response("{}"), new Request(`${ORIGIN}/api/health`));
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
});
