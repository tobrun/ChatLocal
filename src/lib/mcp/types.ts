export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpServersConfig {
  [serverName: string]: McpServerConfig;
}
