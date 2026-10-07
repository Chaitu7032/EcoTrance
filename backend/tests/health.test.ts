import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { Server } from "node:http";

function listen(app: ReturnType<typeof createApp>): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

describe("health API", () => {
  it("returns health payload", async () => {
    const { server, url } = await listen(createApp());
    const res = await fetch(`${url}/api/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    server.close();
  });
});
