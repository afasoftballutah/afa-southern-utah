/**
 * /api/mcp — AFA Southern Utah's read-only MCP server (Streamable HTTP,
 * stateless, JSON responses). Plug it into an assistant to follow a
 * tournament: schedule, games, team paths, brackets, now/next, results.
 * Same library and shape as the Corporation league's /api/mcp, without
 * tokens: it only serves what the public site already shows. 60 requests a
 * minute per address (per instance). See docs/mcp.md.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildAfaMcpServer } from "@/lib/mcp/tools";
import { createAfaData } from "@/lib/mcp/data";
import { createRateLimiter, clientKey } from "@/lib/mcp/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const limiter = createRateLimiter(60, 60_000);

async function handle(request) {
  const hit = limiter.hit(clientKey(request));
  if (!hit.ok) {
    return new Response(JSON.stringify({ error: "Too many requests; try again shortly." }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(hit.retryAfterSec) },
    });
  }
  const server = buildAfaMcpServer(createAfaData(), { siteUrl: new URL(request.url).origin });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    void server.close();
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
