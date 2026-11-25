import type OpenAI from 'openai';
import type Anthropic from '@anthropic-ai/sdk';
import { SchemaType, type FunctionDeclaration, type Schema } from '@google/generative-ai';
import { AgentTool, ToolExecutionContext, ToolParameterProperty, ToolParametersSchema, ToolResult } from './tool.types.js';
import { nativeTools } from './native-tools.js';
import { customToolsService } from '../../skills/custom-tools.service.js';

interface GeminiSchemaNode {
  type: SchemaType;
  description?: string;
  enum?: string[];
  items?: GeminiSchemaNode;
  properties?: Record<string, GeminiSchemaNode>;
  required?: string[];
}

type SchemaPropInput = Partial<ToolParameterProperty> & {
  properties?: Record<string, SchemaPropInput>;
  required?: string[];
};

function convertPropToGeminiSchema(prop?: SchemaPropInput): GeminiSchemaNode {
  if (!prop) return { type: SchemaType.STRING };
  const rawType = (prop.type || 'string').toLowerCase();
  let type: SchemaType = SchemaType.STRING;
  if (rawType === 'string') type = SchemaType.STRING;
  else if (rawType === 'number') type = SchemaType.NUMBER;
  else if (rawType === 'integer') type = SchemaType.INTEGER;
  else if (rawType === 'boolean') type = SchemaType.BOOLEAN;
  else if (rawType === 'array') type = SchemaType.ARRAY;
  else if (rawType === 'object') type = SchemaType.OBJECT;

  const schema: GeminiSchemaNode = { type };
  if (prop.description) {
    schema.description = prop.description;
  }
  if (prop.enum && Array.isArray(prop.enum)) {
    schema.enum = prop.enum;
  }
  if (type === SchemaType.ARRAY) {
    schema.items = prop.items ? convertPropToGeminiSchema(prop.items) : { type: SchemaType.STRING };
  }
  if (type === SchemaType.OBJECT && prop.properties) {
    schema.properties = Object.entries(prop.properties).reduce<Record<string, GeminiSchemaNode>>(
      (acc, [k, v]) => {
        acc[k] = convertPropToGeminiSchema(v);
        return acc;
      },
      {},
    );
    if (Array.isArray(prop.required) && prop.required.length > 0) {
      schema.required = prop.required;
    }
  }
  return schema;
}

export class ToolRegistry {
  private tools: Map<string, AgentTool> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults() {
    for (const tool of nativeTools) {
      this.tools.set(tool.name, tool);
    }
  }

  registerTool(tool: AgentTool) {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(repoName?: string): AgentTool[] {
    const nativeList = Array.from(this.tools.values());
    if (!repoName) return nativeList;

    const customList = customToolsService.getProjectTools(repoName)
      .filter((ct) => ct.is_active !== false)
      .map((ct): AgentTool => ({
        name: ct.name,
        description: `[Custom Tool] ${ct.description}`,
        parameters: ct.parameters as unknown as ToolParametersSchema,
        execute: async (args, ctx) => {
          return await customToolsService.executeCustomTool(ct, args, ctx);
        },
      }));

    return [...nativeList, ...customList];
  }

  getToolsForSkill(allowedToolNames?: string[], repoName?: string): AgentTool[] {
    const all = this.getAllTools(repoName);
    if (!allowedToolNames || allowedToolNames.length === 0) {
      return all;
    }
    return all.filter((t) => allowedToolNames.includes(t.name));
  }

  async executeTool(
    toolName: string,
    args: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const nativeTool = this.tools.get(toolName);
    if (nativeTool) {
      try {
        return await nativeTool.execute(args || {}, context);
      } catch (err: unknown) {
        return {
          success: false,
          error: `Erro ao executar ferramenta nativa '${toolName}': ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    if (context.repoName) {
      const customTool = customToolsService.getProjectTool(context.repoName, toolName);
      if (customTool) {
        return await customToolsService.executeCustomTool(customTool, args || {}, context);
      }
    }

    return {
      success: false,
      error: `Ferramenta '${toolName}' não registrada no sistema ou no projeto ativo.`,
    };
  }

  /**
   * Converte ferramentas para o formato Gemini Function Declarations
   */
  toGeminiFunctionDeclarations(tools: AgentTool[]): FunctionDeclaration[] {
    return tools.map((t) => {
      const properties = Object.entries(t.parameters.properties || {}).reduce<
        Record<string, Schema>
      >((acc, [key, prop]) => {
        acc[key] = convertPropToGeminiSchema(prop) as Schema;
        return acc;
      }, {});

      return {
        name: t.name,
        description: t.description,
        parameters: {
          type: SchemaType.OBJECT,
          properties,
          required: t.parameters.required || [],
        },
      };
    });
  }

  /**
   * Converte ferramentas para o formato OpenAI Tools
   */
  toOpenAITools(tools: AgentTool[]): OpenAI.Chat.ChatCompletionTool[] {
    return tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties: t.parameters.properties || {},
          required: t.parameters.required || [],
        },
      },
    }));
  }

  /**
   * Converte ferramentas para o formato Anthropic Tools
   */
  toAnthropicTools(tools: AgentTool[]): Anthropic.Tool[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object' as const,
        properties: t.parameters.properties || {},
        required: t.parameters.required || [],
      },
    }));
  }
}

export const toolRegistry = new ToolRegistry();
