# MCP registry entry (draft, not published)

`server.json` describes the public Aroha MCP server (no sign-in, eight read-only tools) for the official registry at registry.modelcontextprotocol.io.

Nothing has been published. Before publishing:

1. Decide the namespace. `in.arohaastrology/...` needs DNS authentication: the owner adds the TXT record `mcp-publisher login dns` asks for on `arohaastrology.in`. If DNS or HTTP auth misbehaves (registry issues #1694 and #1679 were open on 2026-11-13), fall back to `io.github.<org>/...` with GitHub login.
2. Confirm `version` matches what `/mcp` reports (`1.0.0`, from `src/modules/mcp/mcp.server.ts`).
3. `mcp-publisher publish` from this folder. Outward-facing, so it waits for the owner.

The Claude connector at `/mcp/claude` is a separate endpoint with its own wording and is not listed here.
