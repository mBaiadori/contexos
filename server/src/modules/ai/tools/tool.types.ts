export interface ToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string };
  default?: unknown;
}

export interface ToolParametersSchema {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolExecutionContext {
  repoName: string;
  filePath?: string;
  user?: { name?: string; role?: string };
}

export interface ToolResult {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
  message?: string;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: ToolParametersSchema;
  execute: (args: Record<string, any>, context: ToolExecutionContext) => Promise<ToolResult> | ToolResult;
}

export interface ToolCallExecutionRecord {
  tool: string;
  args: Record<string, any>;
  result: ToolResult;
  timestamp: string;
}
