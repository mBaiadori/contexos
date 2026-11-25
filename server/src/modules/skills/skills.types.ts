export interface SkillMetadata {
  id: string;
  name: string;
  title?: string;
  description: string;
  category: 'governance' | 'architecture' | 'quality' | 'engineering' | 'memory' | 'general' | 'testing' | 'security' | 'database';
  version: string;
  source: 'system' | 'community' | 'project';
  sourceUrl?: string;
  license?: string;
  author?: string;
  tools: string[];
  suggested_templates?: string[];
  tags?: string[];
  icon?: string;
}

export interface SkillDefinition extends SkillMetadata {
  content: string; // The markdown body instructions for the agent
  instincts?: string; // Optional behavioral heuristics
  installed_at?: string;
  updated_at?: string;
  is_customized?: boolean;
}

export interface ProjectSkillsManifest {
  version: string;
  project_repo: string;
  installed_skills: {
    id: string;
    version: string;
    source: string;
    installed_at: string;
    updated_at: string;
    is_customized?: boolean;
  }[];
}

export interface AgentDefinition {
  id: string;
  name: string;
  title: string;
  role: string;
  description: string;
  system_prompt: string;
  skills: string[];
  tools: string[];
  category: 'architecture' | 'governance' | 'quality' | 'engineering' | 'review' | 'security' | 'general';
  recommended_model?: string;
  temperature?: number;
  source: 'system' | 'community' | 'project';
  sourceUrl?: string;
  license?: string;
  author?: string;
  installed_at?: string;
  icon?: string;
}

export interface MCPServerDefinition {
  id: string;
  name: string;
  description: string;
  type: 'sse' | 'stdio';
  endpoint?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
  status?: 'connected' | 'disconnected' | 'error';
  discovered_tools?: { name: string; description: string }[];
  category?: string;
}

export interface CustomToolParameterProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: {
    type: string;
    description?: string;
  };
  properties?: Record<string, any>;
  required?: string[];
}

export interface CustomToolDefinition {
  id: string;
  name: string;
  title: string;
  description: string;
  category?: 'utility' | 'integration' | 'domain' | 'validation' | 'general';
  parameters: {
    type: 'object';
    properties: Record<string, CustomToolParameterProperty>;
    required?: string[];
  };
  handler_type: 'javascript' | 'http' | 'shell';
  handler_code?: string; // Async JS: async function(args, context) { ... }
  handler_config?: {
    url?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    command?: string;
    executable?: string;
    args?: string[];
  };
  is_active?: boolean;
  source?: 'project' | 'global';
  created_at?: string;
  updated_at?: string;
}

export interface CommunityToolDefinition {
  id: string;
  name: string;
  title: string;
  description: string;
  category: string;
  server_id?: string;
  server_name?: string;
  parameters?: {
    type?: string;
    properties?: Record<string, CustomToolParameterProperty>;
    required?: string[];
  };
  source: 'community';
  author?: string;
  license?: string;
  icon?: string;
  command_snippet?: string;
}

export interface ProjectToolsManifest {
  version: string;
  project_repo: string;
  tools: CustomToolDefinition[];
}


