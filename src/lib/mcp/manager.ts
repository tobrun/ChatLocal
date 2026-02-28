import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "fs";
import path from "path";
import type { McpServersConfig } from "./types";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

interface ManagedServer {
  client: Client;
  transport: StdioClientTransport;
  tools: Tool[];
}

class McpManager {
  private servers = new Map<string, ManagedServer>();
  private initialized = false;

  async initialize(configPath?: string) {
    if (this.initialized) return;
    this.initialized = true;

    const cfgPath = configPath ?? path.resolve("mcp-servers.json");
    if (!fs.existsSync(cfgPath)) {
      console.log("[MCP] No mcp-servers.json found, skipping MCP initialization");
      return;
    }

    let config: McpServersConfig;
    try {
      config = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    } catch (err) {
      console.error("[MCP] Failed to parse mcp-servers.json:", err);
      return;
    }

    for (const [name, serverConfig] of Object.entries(config)) {
      await this.spawnServer(name, serverConfig);
    }
  }

  private interpolateEnvVars(value: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] ?? "");
  }

  private async spawnServer(name: string, config: { command: string; args: string[]; env?: Record<string, string> }) {
    try {
      const args = config.args.map((a) => this.interpolateEnvVars(a));
      const env: Record<string, string> = { ...process.env as Record<string, string> };
      if (config.env) {
        for (const [k, v] of Object.entries(config.env)) {
          env[k] = this.interpolateEnvVars(v);
        }
      }

      const transport = new StdioClientTransport({
        command: config.command,
        args,
        env,
      });

      const client = new Client(
        { name: "chatlocal", version: "1.0.0" },
        { capabilities: {} }
      );

      await client.connect(transport);

      const toolsResult = await client.listTools();
      const tools = toolsResult.tools ?? [];

      this.servers.set(name, { client, transport, tools });
      console.log(`[MCP] Server "${name}" connected with ${tools.length} tools:`, tools.map((t) => t.name));

      // Restart on error
      transport.onclose = () => {
        console.warn(`[MCP] Server "${name}" disconnected, attempting restart in 5s`);
        this.servers.delete(name);
        setTimeout(() => {
          this.spawnServer(name, config).catch((err) =>
            console.error(`[MCP] Server "${name}" failed to restart:`, err)
          );
        }, 5000);
      };
    } catch (err) {
      console.error(`[MCP] Failed to spawn server "${name}":`, err);
    }
  }

  listTools(): Array<{ serverName: string; tool: Tool }> {
    const result: Array<{ serverName: string; tool: Tool }> = [];
    for (const [serverName, server] of this.servers) {
      for (const tool of server.tools) {
        result.push({ serverName, tool });
      }
    }
    return result;
  }

  getOpenAITools(): Array<{
    type: "function";
    function: { name: string; description: string; parameters: unknown };
  }> {
    return this.listTools().map(({ tool }) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description ?? "",
        parameters: tool.inputSchema ?? { type: "object", properties: {} },
      },
    }));
  }

  async callTool(name: string, args: Record<string, unknown>, timeoutMs = 30_000): Promise<string> {
    for (const [, server] of this.servers) {
      const hasTool = server.tools.some((t) => t.name === name);
      if (!hasTool) continue;

      try {
        const result = await Promise.race([
          server.client.callTool({ name, arguments: args }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Tool "${name}" timed out after ${timeoutMs}ms`)), timeoutMs)
          ),
        ]);
        const content = result.content;
        if (Array.isArray(content)) {
          return content
            .map((c: { type: string; text?: string }) =>
              c.type === "text" ? c.text ?? "" : JSON.stringify(c)
            )
            .join("\n");
        }
        return JSON.stringify(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Tool "${name}" failed: ${msg}`);
      }
    }
    throw new Error(`Tool "${name}" not found in any MCP server`);
  }

  async shutdown() {
    for (const [name, server] of this.servers) {
      try {
        await server.transport.close();
      } catch {
        // ignore shutdown errors
      }
      console.log(`[MCP] Server "${name}" shut down`);
    }
    this.servers.clear();
  }
}

// Singleton
export const mcpManager = new McpManager();
