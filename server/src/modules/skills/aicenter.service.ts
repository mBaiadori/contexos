import fs from 'node:fs';
import path from 'node:path';
import { AgentDefinition, MCPServerDefinition, CommunityToolDefinition } from './skills.types.js';
import { eccSeedAgents } from './seeds/agents.seeds.js';
import { eccSeedMcpTemplates } from './seeds/mcp.seeds.js';
import { BASE_DIR, PROJECTS_DIR, resolveRepoDir } from '../../config/constants.js';
import { toolRegistry } from '../ai/tools/ToolRegistry.js';

export class AICenterService {
  // =========================================================================
  // 1. AGENTS MANAGEMENT
  // =========================================================================
  public getHubAgents(): AgentDefinition[] {
    const agentsMap = new Map<string, AgentDefinition>();

    // 1. Agentes Nativos do Sistema (Core)
    for (const seed of eccSeedAgents) {
      agentsMap.set(seed.id, {
        ...seed,
        source: 'system',
        author: 'Context-OS (Core)',
      });
    }

    // 2. Agentes da Comunidade (ECC-main/agents/*.md)
    const candidateAgentDirs = [
      path.join(BASE_DIR, 'ECC-main', 'agents'),
      path.resolve(process.cwd(), 'ECC-main', 'agents'),
      path.resolve(process.cwd(), '..', 'ECC-main', 'agents'),
      path.resolve(PROJECTS_DIR, '..', 'ECC-main', 'agents'),
    ];
    const eccMainAgentsDir = candidateAgentDirs.find((p) => fs.existsSync(p));

    if (eccMainAgentsDir) {
      try {
        const agentFiles = fs.readdirSync(eccMainAgentsDir, { withFileTypes: true });
        for (const file of agentFiles) {
          if (!file.isFile() || !file.name.endsWith('.md')) continue;
          const agentId = file.name.replace(/\.md$/, '');

          try {
            const rawContent = fs.readFileSync(path.join(eccMainAgentsDir, file.name), 'utf-8');
            const parsed = this.parseAgentMarkdown(rawContent, agentId);
            if (!agentsMap.has(parsed.id) || agentsMap.get(parsed.id)?.source === 'community') {
              agentsMap.set(parsed.id, parsed);
            }
          } catch (agentErr) {
            console.warn(`[AICenterService] Falha ao processar agente '${file.name}':`, agentErr);
          }
        }
      } catch (err) {
        console.warn('[AICenterService] Aviso ao ler agentes da comunidade:', err);
      }
    }

    return Array.from(agentsMap.values());
  }

  private parseAgentMarkdown(rawContent: string, defaultId: string): AgentDefinition {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = rawContent.match(frontmatterRegex);

    const metadata: Record<string, any> = {};
    let content = rawContent;

    if (match) {
      const yamlBlock = match[1];
      content = match[2];
      const lines = yamlBlock.split('\n');
      let currentKey: string | null = null;

      for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Check if list item of current key
        if (rawLine.startsWith('  - ') || rawLine.startsWith('- ')) {
          const itemVal = trimmed.replace(/^-\s*/, '').replace(/^["']|["']$/g, '');
          if (currentKey) {
            if (!Array.isArray(metadata[currentKey])) {
              metadata[currentKey] = [];
            }
            metadata[currentKey].push(itemVal);
          }
          continue;
        }

        // Check if continuation of multi-line string
        if ((rawLine.startsWith('  ') || rawLine.startsWith('\t')) && currentKey && typeof metadata[currentKey] === 'string') {
          metadata[currentKey] += ' ' + trimmed.replace(/^["']|["']$/g, '');
          continue;
        }

        const colonIdx = rawLine.indexOf(':');
        if (colonIdx > 0) {
          const key = rawLine.slice(0, colonIdx).trim();
          const val = rawLine.slice(colonIdx + 1).trim();
          currentKey = key;

          if (val === '' || val === '|' || val === '>') {
            metadata[key] = '';
          } else if (val.startsWith('[') && val.endsWith(']')) {
            try {
              metadata[key] = JSON.parse(val.replace(/'/g, '"'));
            } catch {
              metadata[key] = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
            }
          } else {
            metadata[key] = val.replace(/^["']|["']$/g, '');
          }
        }
      }
    }

    const name = metadata.name || defaultId;
    const titleFormatted = name
      .split('-')
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    let tools: string[] = [];
    if (Array.isArray(metadata.tools)) {
      tools = metadata.tools;
    } else if (typeof metadata.tools === 'string' && metadata.tools.trim()) {
      tools = metadata.tools.split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
    if (tools.length === 0) {
      tools = ['docs_read_file', 'docs_get_graph', 'docs_search_terms'];
    }

    let skills: string[] = [];
    if (Array.isArray(metadata.skills)) {
      skills = metadata.skills;
    } else if (typeof metadata.skills === 'string' && metadata.skills.trim()) {
      skills = metadata.skills.split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }

    let category = metadata.category;
    if (!category) {
      const lower = (name + ' ' + (metadata.description || '')).toLowerCase();
      if (lower.includes('architect') || lower.includes('design') || lower.includes('system')) {
        category = 'architecture';
      } else if (lower.includes('reviewer') || lower.includes('review') || lower.includes('eval') || lower.includes('analyzer')) {
        category = 'review';
      } else if (lower.includes('security') || lower.includes('guard') || lower.includes('sanitizer')) {
        category = 'security';
      } else if (lower.includes('gov') || lower.includes('spec') || lower.includes('staff') || lower.includes('planner')) {
        category = 'governance';
      } else if (lower.includes('test') || lower.includes('qa') || lower.includes('tdd')) {
        category = 'quality';
      } else {
        category = 'engineering';
      }
    }

    return {
      id: metadata.id || defaultId,
      name,
      title: metadata.title || `${titleFormatted} (Especialista)`,
      role: metadata.role || `Especialista (${titleFormatted})`,
      description: metadata.description || 'Persona autônoma da comunidade para operações especializadas.',
      system_prompt: content.trim(),
      skills,
      tools,
      category: category as AgentDefinition['category'],
      recommended_model: metadata.model ? `gemini-2.5-pro` : 'gemini-2.5-flash',
      temperature: 0.3,
      source: 'community',
      sourceUrl: metadata.sourceUrl || 'https://github.com/affaan-m/everything-claude-code',
      license: 'MIT',
      author: 'Comunidade (ECC • Licença MIT)',
      icon: metadata.icon || 'psychology',
    };
  }

  public getProjectAgents(repoName: string): AgentDefinition[] {
    const repoDir = resolveRepoDir(repoName);
    const agentsDir = path.join(repoDir, '.agents');
    const manifestPath = path.join(agentsDir, 'agents.manifest.json');

    if (!fs.existsSync(manifestPath)) {
      return [];
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      return manifest.agents || [];
    } catch (e) {
      return [];
    }
  }

  public installAgent(repoName: string, agentId: string): { success: boolean; agent: AgentDefinition } {
    const allHub = this.getHubAgents();
    const hubAgent = allHub.find((a) => a.id === agentId);
    if (!hubAgent) {
      throw new Error(`Agente '${agentId}' não encontrado no catálogo global.`);
    }

    const repoDir = resolveRepoDir(repoName);
    const agentsDir = path.join(repoDir, '.agents');
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true });
    }

    const installedAgent: AgentDefinition = {
      ...hubAgent,
      source: 'project',
      installed_at: new Date().toISOString(),
    };

    const manifestPath = path.join(agentsDir, 'agents.manifest.json');
    let existingAgents: AgentDefinition[] = [];
    if (fs.existsSync(manifestPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        existingAgents = parsed.agents || [];
      } catch (e) {}
    }

    const filtered = existingAgents.filter((a) => a.id !== agentId);
    filtered.push(installedAgent);

    fs.writeFileSync(manifestPath, JSON.stringify({ version: '1.0.0', agents: filtered }, null, 2), 'utf-8');

    // Also write markdown definition
    const agentFolder = path.join(agentsDir, agentId);
    if (!fs.existsSync(agentFolder)) {
      fs.mkdirSync(agentFolder, { recursive: true });
    }
    const agentMd = `---
name: ${installedAgent.name}
title: ${installedAgent.title}
role: ${installedAgent.role}
category: ${installedAgent.category}
skills: [${installedAgent.skills.join(', ')}]
tools: [${installedAgent.tools.join(', ')}]
---

# ${installedAgent.title}

${installedAgent.description}

## Prompt de Persona
${installedAgent.system_prompt}
`;
    fs.writeFileSync(path.join(agentFolder, 'AGENT.md'), agentMd, 'utf-8');

    return { success: true, agent: installedAgent };
  }

  public uninstallAgent(repoName: string, agentId: string): { success: boolean; message: string } {
    const repoDir = resolveRepoDir(repoName);
    const agentsDir = path.join(repoDir, '.agents');
    const manifestPath = path.join(agentsDir, 'agents.manifest.json');

    if (!fs.existsSync(manifestPath)) {
      return { success: true, message: 'Nenhum agente instalado.' };
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const updated = (manifest.agents || []).filter((a: AgentDefinition) => a.id !== agentId);
    fs.writeFileSync(manifestPath, JSON.stringify({ version: '1.0.0', agents: updated }, null, 2), 'utf-8');

    const agentFolder = path.join(agentsDir, agentId);
    if (fs.existsSync(agentFolder)) {
      fs.rmSync(agentFolder, { recursive: true, force: true });
    }

    return { success: true, message: `Agente '${agentId}' removido do projeto.` };
  }

  // =========================================================================
  // 2. TOOLS MANAGEMENT
  // =========================================================================
  public getAllTools() {
    return toolRegistry.getAllTools().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  public async executeToolTest(toolName: string, args: Record<string, any>, repoName: string) {
    return toolRegistry.executeTool(toolName, args, { repoName });
  }

  /**
   * Retorna o catálogo rico de ferramentas da comunidade (extraído de MCPs do ECC-main e ferramentas comunitárias)
   */
  public getCommunityTools(): CommunityToolDefinition[] {
    const mcpServers = this.getMcpTemplates();
    const tools: CommunityToolDefinition[] = [];

    // Mapeamento enriquecido de ferramentas por servidor MCP do ECC
    const mcpToolCatalog: Record<
      string,
      Array<{
        name: string;
        title: string;
        description: string;
        parameters?: CommunityToolDefinition['parameters'];
      }>
    > = {
      nexus: [
        { name: 'nexus_stats', title: 'Nexus Stats', description: 'Consulta uso, economia e métricas de chamadas de LLM em tempo real.', parameters: { type: 'object', properties: { period: { type: 'string', enum: ['today', 'week', 'month'] } } } },
        { name: 'nexus_route', title: 'Nexus Model Router', description: 'Roteia dinamicamente prompts para o modelo mais eficiente em custo.', parameters: { type: 'object', properties: { task_type: { type: 'string' }, complexity: { type: 'string', enum: ['low', 'medium', 'high'] } } } },
        { name: 'nexus_mask_pii', title: 'Nexus PII Masker', description: 'Sanitiza segredos, senhas e PII antes do tráfego para APIs de IA.', parameters: { type: 'object', properties: { payload: { type: 'string' } }, required: ['payload'] } },
      ],
      github: [
        { name: 'github_create_pr', title: 'GitHub Create PR', description: 'Cria pull requests automatizados com descrição e governança associada.', parameters: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, head: { type: 'string' }, base: { type: 'string' } }, required: ['title', 'head', 'base'] } },
        { name: 'github_search_repos', title: 'GitHub Search', description: 'Pesquisa código, repositórios, issues e commits no GitHub.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
        { name: 'github_create_issue', title: 'GitHub Create Issue', description: 'Cria novas issues com labels, milestones e assignees.', parameters: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, labels: { type: 'array', items: { type: 'string' } } }, required: ['title'] } },
      ],
      supabase: [
        { name: 'supabase_query', title: 'Supabase SQL Query', description: 'Executa queries SQL seguras no PostgreSQL do Supabase.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
        { name: 'supabase_schema_inspect', title: 'Supabase Schema Inspector', description: 'Inspeciona tabelas, colunas, chaves estrangeiras e RLS.', parameters: { type: 'object', properties: { schema: { type: 'string', default: 'public' } } } },
      ],
      firecrawl: [
        { name: 'firecrawl_scrape', title: 'Firecrawl Scraper', description: 'Converte páginas web completas em Markdown limpo para LLMs.', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
        { name: 'firecrawl_crawl', title: 'Firecrawl Deep Crawler', description: 'Faz varredura profunda de sites mapeando páginas e documentações.', parameters: { type: 'object', properties: { url: { type: 'string' }, limit: { type: 'number', default: 10 } }, required: ['url'] } },
      ],
      'exa-web-search': [
        { name: 'exa_search', title: 'Exa Neural Search', description: 'Pesquisa neural na web com resultados semanticamente estruturados para IA.', parameters: { type: 'object', properties: { query: { type: 'string' }, num_results: { type: 'number', default: 5 } }, required: ['query'] } },
      ],
      'parallel-search': [
        { name: 'parallel_web_search', title: 'Parallel Web Search', description: 'Busca paralela multi-query com citações consolidadas em uma única chamada.', parameters: { type: 'object', properties: { objective: { type: 'string' }, queries: { type: 'array', items: { type: 'string' } } }, required: ['objective'] } },
      ],
      context7: [
        { name: 'context7_query_docs', title: 'Context7 Docs Lookup', description: 'Busca documentação oficial de frameworks e bibliotecas em tempo real.', parameters: { type: 'object', properties: { library: { type: 'string' }, query: { type: 'string' } }, required: ['library', 'query'] } },
      ],
      memory: [
        { name: 'memory_store_fact', title: 'Persistent Memory Store', description: 'Grava fatos e contextos na memória persistente de longo prazo.', parameters: { type: 'object', properties: { key: { type: 'string' }, fact: { type: 'string' } }, required: ['key', 'fact'] } },
        { name: 'memory_recall_facts', title: 'Persistent Memory Recall', description: 'Recupera fatos gravados na memória persistente entre sessões.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      ],
      'omega-memory': [
        { name: 'omega_knowledge_graph', title: 'Omega Knowledge Graph', description: 'Consulta e constrói grafos de conhecimento semântico e coordenação multi-agente.', parameters: { type: 'object', properties: { subject: { type: 'string' }, depth: { type: 'number', default: 2 } } } },
      ],
      'sequential-thinking': [
        { name: 'sequential_reasoning', title: 'Sequential Thinking', description: 'Raciocínio chain-of-thought passo a passo com correção e branching.', parameters: { type: 'object', properties: { thought: { type: 'string' }, thoughtNumber: { type: 'number' }, totalThoughts: { type: 'number' } }, required: ['thought'] } },
      ],
      playwright: [
        { name: 'playwright_browser_action', title: 'Playwright Browser Action', description: 'Navega, interage e captura tela de aplicações web via headless browser.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['navigate', 'click', 'type', 'screenshot'] }, url: { type: 'string' }, selector: { type: 'string' } }, required: ['action'] } },
      ],
      squish: [
        { name: 'squish_memory_recall', title: 'Squish Local Memory', description: 'Recuperação de memória vetorial ultra-rápida (1-20ms) local com SQLite.', parameters: { type: 'object', properties: { context: { type: 'string' } }, required: ['context'] } },
      ],
      'fal-ai': [
        { name: 'fal_ai_generate_media', title: 'fal.ai Media Generation', description: 'Geração de mídia, imagens e vídeos usando modelos de última geração fal.ai.', parameters: { type: 'object', properties: { prompt: { type: 'string' }, model: { type: 'string' } }, required: ['prompt'] } },
      ],
      'token-optimizer': [
        { name: 'token_compress', title: 'Token Optimizer', description: 'Comprime e deduplica conteúdos reduzindo em até 95% o consumo de tokens.', parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] } },
      ],
      evalview: [
        { name: 'evalview_snapshot_check', title: 'EvalView Regression Test', description: 'Gera snapshots e valida regressão de chamadas de tools e qualidade de respostas.', parameters: { type: 'object', properties: { suite_name: { type: 'string' } } } },
      ],
      jira: [
        { name: 'jira_search_issues', title: 'Jira Issue Search', description: 'Pesquisa e atualiza cards, sprints e épicos no Jira Cloud.', parameters: { type: 'object', properties: { jql: { type: 'string' } }, required: ['jql'] } },
      ],
    };

    // Gera lista estruturada de ferramentas baseada nos servidores MCP disponíveis
    for (const server of mcpServers) {
      const definedTools = mcpToolCatalog[server.id];
      if (definedTools && definedTools.length > 0) {
        for (const t of definedTools) {
          tools.push({
            id: `comm_${t.name}`,
            name: t.name,
            title: t.title,
            description: t.description,
            category: server.category || 'integration',
            server_id: server.id,
            server_name: server.name,
            parameters: t.parameters || { type: 'object', properties: {} },
            source: 'community',
            author: 'Comunidade (ECC • Licença MIT)',
            license: 'MIT',
            icon: 'build_circle',
            command_snippet: server.command ? `${server.command} ${(server.args || []).join(' ')}` : server.endpoint,
          });
        }
      } else {
        // Gera tool genérica associada ao servidor MCP
        const toolName = `${server.id.replace(/[^a-z0-9]/g, '_')}_call`;
        tools.push({
          id: `comm_${toolName}`,
          name: toolName,
          title: `${server.name} Connector`,
          description: server.description || `Operações integradas via servidor MCP ${server.name}.`,
          category: server.category || 'integration',
          server_id: server.id,
          server_name: server.name,
          parameters: { type: 'object', properties: { action: { type: 'string', description: 'Ação a ser executada no servidor MCP' } } },
          source: 'community',
          author: 'Comunidade (ECC • Licença MIT)',
          license: 'MIT',
          icon: 'cable',
          command_snippet: server.command ? `${server.command} ${(server.args || []).join(' ')}` : server.endpoint,
        });
      }
    }

    return tools;
  }

  // =========================================================================
  // 3. MCP CONNECTORS MANAGEMENT
  // =========================================================================
  public getMcpTemplates(): MCPServerDefinition[] {
    const templatesMap = new Map<string, MCPServerDefinition>();

    // 1. Sementes básicas
    for (const seed of eccSeedMcpTemplates) {
      templatesMap.set(seed.id, seed);
    }

    // 2. Carrega todos os servidores definidos em ECC-main/mcp-configs/mcp-servers.json
    const candidateMcpFiles = [
      path.join(BASE_DIR, 'ECC-main', 'mcp-configs', 'mcp-servers.json'),
      path.resolve(process.cwd(), 'ECC-main', 'mcp-configs', 'mcp-servers.json'),
      path.resolve(process.cwd(), '..', 'ECC-main', 'mcp-configs', 'mcp-servers.json'),
      path.resolve(PROJECTS_DIR, '..', 'ECC-main', 'mcp-configs', 'mcp-servers.json'),
    ];
    const mcpConfigPath = candidateMcpFiles.find((p) => fs.existsSync(p));

    if (mcpConfigPath) {
      try {
        const raw = fs.readFileSync(mcpConfigPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
          for (const [key, val] of Object.entries<any>(parsed.mcpServers)) {
            const isHttp = val.type === 'http' || Boolean(val.url);
            const serverNameFormatted = key
              .split(/[-_]/)
              .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ');

            let category = 'integration';
            const lowerDesc = (val.description || '').toLowerCase();
            if (lowerDesc.includes('memory') || key.includes('memory')) category = 'memory';
            else if (lowerDesc.includes('search') || lowerDesc.includes('scrape') || lowerDesc.includes('docs')) category = 'search';
            else if (lowerDesc.includes('deploy') || lowerDesc.includes('cloud') || lowerDesc.includes('workers')) category = 'devops';
            else if (lowerDesc.includes('test') || lowerDesc.includes('eval') || lowerDesc.includes('quality')) category = 'quality';

            templatesMap.set(key, {
              id: key,
              name: `${serverNameFormatted}`,
              description: val.description || `Servidor MCP da comunidade (${key}).`,
              type: isHttp ? 'sse' : 'stdio',
              command: val.command,
              args: Array.isArray(val.args) ? val.args : [],
              endpoint: val.url || (val.endpoint ? val.endpoint : undefined),
              env: val.env || {},
              enabled: false,
              category,
            });
          }
        }
      } catch (err) {
        console.warn('[AICenterService] Aviso ao ler ECC-main/mcp-configs/mcp-servers.json:', err);
      }
    }

    return Array.from(templatesMap.values());
  }

  public getProjectMcpServers(repoName: string): MCPServerDefinition[] {
    const repoDir = resolveRepoDir(repoName);
    const mcpConfigPath = path.join(repoDir, '.mcp.json');

    if (!fs.existsSync(mcpConfigPath)) {
      return [];
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
      return parsed.mcpServers || [];
    } catch (e) {
      return [];
    }
  }

  public saveProjectMcpServer(repoName: string, server: MCPServerDefinition): { success: boolean; server: MCPServerDefinition } {
    const repoDir = resolveRepoDir(repoName);
    if (!fs.existsSync(repoDir)) {
      fs.mkdirSync(repoDir, { recursive: true });
    }

    const mcpConfigPath = path.join(repoDir, '.mcp.json');
    let existingServers: MCPServerDefinition[] = [];
    if (fs.existsSync(mcpConfigPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
        existingServers = parsed.mcpServers || [];
      } catch (e) {}
    }

    const filtered = existingServers.filter((s) => s.id !== server.id);
    filtered.push(server);

    fs.writeFileSync(mcpConfigPath, JSON.stringify({ mcpServers: filtered }, null, 2), 'utf-8');
    return { success: true, server };
  }

  public removeProjectMcpServer(repoName: string, serverId: string): { success: boolean; message: string } {
    const repoDir = resolveRepoDir(repoName);
    const mcpConfigPath = path.join(repoDir, '.mcp.json');

    if (!fs.existsSync(mcpConfigPath)) {
      return { success: true, message: 'Nenhum MCP configurado.' };
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
      const filtered = (parsed.mcpServers || []).filter((s: MCPServerDefinition) => s.id !== serverId);
      fs.writeFileSync(mcpConfigPath, JSON.stringify({ mcpServers: filtered }, null, 2), 'utf-8');
      return { success: true, message: 'Servidor MCP removido com sucesso.' };
    } catch (e: unknown) {
      return { success: false, message: e instanceof Error ? e.message : String(e) };
    }
  }
}

export const aiCenterService = new AICenterService();
