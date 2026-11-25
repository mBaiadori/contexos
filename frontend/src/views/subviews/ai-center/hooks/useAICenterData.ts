import { useState, useEffect } from "react";
import { useWorkspace } from "../../../../context/WorkspaceContext";
import { useAI } from "../../../../context/AIContext";
import { API } from "../../../../services/api";
import type {
  SkillItem,
  AgentDefinition,
  MCPServerDefinition,
  ToolItem,
  CustomToolItem,
  CommunityToolItem,
} from "../../../../types";
import type { MainTab, ScopeFilter } from "../types";

export function useAICenterData() {
  const { activeRepo } = useWorkspace();
  const { activeSkillId, setActiveSkillId } = useAI();

  const [activeMainTab, setActiveMainTab] = useState<MainTab>("skills");
  const [loading, setLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  // 1. Skills State
  const [skillScope, setSkillScope] = useState<ScopeFilter>("installed");
  const [hubSkills, setHubSkills] = useState<SkillItem[]>([]);
  const [installedSkills, setInstalledSkills] = useState<SkillItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<SkillItem | null>(null);

  // 2. Agents State
  const [agentScope, setAgentScope] = useState<ScopeFilter>("installed");
  const [hubAgents, setHubAgents] = useState<AgentDefinition[]>([]);
  const [installedAgents, setInstalledAgents] = useState<AgentDefinition[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentDefinition | null>(null);

  // 3. Tools State (Native, Custom & Community ECC Tools)
  const [toolScope, setToolScope] = useState<ScopeFilter>("installed");
  const [toolsList, setToolsList] = useState<ToolItem[]>([]);
  const [customTools, setCustomTools] = useState<CustomToolItem[]>([]);
  const [communityTools, setCommunityTools] = useState<CommunityToolItem[]>([]);
  const [communityToolCategory, setCommunityToolCategory] = useState<string>("all");
  const [communityToolSearch, setCommunityToolSearch] = useState<string>("");
  const [selectedCommunityTool, setSelectedCommunityTool] = useState<CommunityToolItem | null>(null);
  const [testingTool, setTestingTool] = useState<ToolItem | null>(null);
  const [toolArgsInput, setToolArgsInput] = useState("{}");
  const [toolTestResult, setToolTestResult] = useState<any>(null);
  const [isExecutingTool, setIsExecutingTool] = useState(false);

  // Custom Tool Create / Edit Modal State
  const [isCustomToolModalOpen, setIsCustomToolModalOpen] = useState(false);
  const [editingCustomTool, setEditingCustomTool] = useState<Partial<CustomToolItem>>({
    name: "",
    title: "",
    description: "",
    category: "utility",
    handler_type: "javascript",
    handler_code: `// Código JavaScript executado em sandbox assíncrono
// Parâmetros disponíveis:
// - args: objeto com os parâmetros passados pelo modelo
// - context: { repoName, filePath }
// - utils: { fetch, readProjectFile, writeProjectFile, listProjectFiles }

const { message } = args;
return {
  success: true,
  echo: message || "Hello from Custom Tool!",
  timestamp: new Date().toISOString()
};`,
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Mensagem de entrada para a ferramenta.",
        },
      },
      required: [],
    },
  });
  const [customToolSchemaStr, setCustomToolSchemaStr] = useState("");
  const [customToolTestArgs, setCustomToolTestArgs] = useState("{}");
  const [customToolTestOutput, setCustomToolTestOutput] = useState<any>(null);
  const [isTestingCustomTool, setIsTestingCustomTool] = useState(false);

  // 4. MCP State
  const [mcpTemplates, setMcpTemplates] = useState<MCPServerDefinition[]>([]);
  const [projectMcpServers, setProjectMcpServers] = useState<MCPServerDefinition[]>([]);
  const [isAddingMcp, setIsAddingMcp] = useState(false);
  const [newMcpName, setNewMcpName] = useState("");
  const [newMcpType, setNewMcpType] = useState<"stdio" | "sse">("stdio");
  const [newMcpCommand, setNewMcpCommand] = useState("");
  const [newMcpEndpoint, setNewMcpEndpoint] = useState("");
  const [newMcpDesc, setNewMcpDesc] = useState("");

  const loadAllData = async () => {
    setLoading(true);
    try {
      const repo = activeRepo?.name;
      const [
        hubSkillsRes,
        projSkillsRes,
        hubAgentsRes,
        projAgentsRes,
        toolsRes,
        customToolsRes,
        commToolsRes,
        mcpTemplatesRes,
        projMcpRes,
      ] = await Promise.all([
        API.getSkillsHub(),
        API.getSkillsProject(repo),
        API.getAgentsHub(),
        API.getAgentsProject(repo),
        API.getTools(),
        API.getCustomTools(repo),
        API.getCommunityTools(),
        API.getMcpTemplates(),
        API.getMcpProject(repo),
      ]);

      if (hubSkillsRes.ok && hubSkillsRes.data)
        setHubSkills(hubSkillsRes.data.skills || []);
      if (projSkillsRes.ok && projSkillsRes.data) {
        const inst = projSkillsRes.data.installed_skills || [];
        setInstalledSkills(inst);
      }

      if (hubAgentsRes.ok && hubAgentsRes.data)
        setHubAgents(hubAgentsRes.data.agents || []);
      if (projAgentsRes.ok && projAgentsRes.data)
        setInstalledAgents(projAgentsRes.data.agents || []);

      if (toolsRes.ok && toolsRes.data) setToolsList(toolsRes.data.tools || []);
      if (customToolsRes.ok && customToolsRes.data)
        setCustomTools(customToolsRes.data.tools || []);
      if (commToolsRes.ok && commToolsRes.data)
        setCommunityTools(commToolsRes.data.tools || []);

      if (mcpTemplatesRes.ok && mcpTemplatesRes.data)
        setMcpTemplates(mcpTemplatesRes.data.templates || []);
      if (projMcpRes.ok && projMcpRes.data)
        setProjectMcpServers(projMcpRes.data.servers || []);
    } catch (err) {
      console.error("Erro ao carregar dados do AI Center:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [activeRepo]);

  // --- Skills Handlers ---
  const handleInstallSkill = async (skill: SkillItem) => {
    try {
      setActionFeedback({
        ok: true,
        msg: `Instalando skill '${skill.title || skill.name}'...`,
      });
      const res = await API.installSkill(skill.id, activeRepo?.name);
      if (res.ok) {
        setActionFeedback({
          ok: true,
          msg: `Skill '${skill.title || skill.name}' instalada com sucesso!`,
        });
        await loadAllData();
        setTimeout(() => setActionFeedback(null), 3500);
      } else {
        setActionFeedback({
          ok: false,
          msg: (res.data as { message?: string } | undefined)?.message || "Falha ao instalar skill.",
        });
      }
    } catch (err: unknown) {
      setActionFeedback({ ok: false, msg: err instanceof Error ? err.message : "Erro de conexão." });
    }
  };

  const handleUninstallSkill = async (skillId: string) => {
    const ok = window.confirm("Deseja remover esta skill do projeto?");
    if (!ok) return;
    try {
      setActionFeedback({ ok: true, msg: "Removendo skill..." });
      const res = await API.uninstallSkill(skillId, activeRepo?.name);
      if (res.ok) {
        setActionFeedback({ ok: true, msg: "Skill removida do projeto." });
        await loadAllData();
        if (selectedSkill?.id === skillId) setSelectedSkill(null);
        if (activeSkillId === skillId) setActiveSkillId(null);
        setTimeout(() => setActionFeedback(null), 3500);
      }
    } catch (err: unknown) {
      setActionFeedback({ ok: false, msg: err instanceof Error ? err.message : "Erro de conexão." });
    }
  };

  // --- Agents Handlers ---
  const handleInstallAgent = async (agent: AgentDefinition) => {
    try {
      setActionFeedback({
        ok: true,
        msg: `Instalando persona '${agent.title}' no projeto...`,
      });
      const res = await API.installAgent(agent.id, activeRepo?.name);
      if (res.ok) {
        setActionFeedback({
          ok: true,
          msg: `Persona '${agent.title}' pronta no projeto!`,
        });
        await loadAllData();
        setTimeout(() => setActionFeedback(null), 3500);
      } else {
        setActionFeedback({
          ok: false,
          msg: (res.data as { message?: string } | undefined)?.message || "Falha ao instalar agente.",
        });
      }
    } catch (err: unknown) {
      setActionFeedback({ ok: false, msg: err instanceof Error ? err.message : "Erro de conexão." });
    }
  };

  const handleUninstallAgent = async (agentId: string) => {
    const ok = window.confirm("Deseja remover este agente do projeto?");
    if (!ok) return;
    try {
      const res = await API.uninstallAgent(agentId, activeRepo?.name);
      if (res.ok) {
        setActionFeedback({ ok: true, msg: "Agente removido." });
        await loadAllData();
        if (selectedAgent?.id === agentId) setSelectedAgent(null);
        setTimeout(() => setActionFeedback(null), 3500);
      }
    } catch (err: unknown) {
      setActionFeedback({ ok: false, msg: err instanceof Error ? err.message : "Erro de conexão." });
    }
  };

  // --- Tools Test Handler ---
  const handleExecuteToolTest = async () => {
    if (!testingTool) return;
    setIsExecutingTool(true);
    setToolTestResult(null);
    try {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(toolArgsInput || "{}");
      } catch {
        setToolTestResult({
          success: false,
          error: "JSON de argumentos inválido.",
        });
        setIsExecutingTool(false);
        return;
      }

      const res = await API.executeToolTest(
        testingTool.name,
        parsedArgs,
        activeRepo?.name,
      );
      if (res.ok) {
        setToolTestResult(res.data);
      } else {
        setToolTestResult({
          success: false,
          error: (res.data as { error?: string } | undefined)?.error || "Erro na execução da tool.",
        });
      }
    } catch (err: unknown) {
      setToolTestResult({ success: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsExecutingTool(false);
    }
  };

  // --- MCP Handlers ---
  const handleSaveMcpFromTemplate = async (tpl: MCPServerDefinition) => {
    try {
      setActionFeedback({
        ok: true,
        msg: `Adicionando conector MCP '${tpl.name}'...`,
      });
      const res = await API.saveMcpServer(
        { ...tpl, enabled: true },
        activeRepo?.name,
      );
      if (res.ok) {
        setActionFeedback({
          ok: true,
          msg: `Conector MCP '${tpl.name}' adicionado!`,
        });
        await loadAllData();
        setTimeout(() => setActionFeedback(null), 3500);
      }
    } catch (err: unknown) {
      setActionFeedback({
        ok: false,
        msg: err instanceof Error ? err.message : "Erro ao salvar MCP.",
      });
    }
  };

  const handleSaveCustomMcp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMcpName.trim()) return;
    try {
      const serverDef: MCPServerDefinition = {
        id: newMcpName.toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
        name: newMcpName.trim(),
        description: newMcpDesc.trim() || "Servidor MCP customizado.",
        type: newMcpType,
        command: newMcpType === "stdio" ? newMcpCommand.trim() : undefined,
        endpoint: newMcpType === "sse" ? newMcpEndpoint.trim() : undefined,
        enabled: true,
      };

      const res = await API.saveMcpServer(serverDef, activeRepo?.name);
      if (res.ok) {
        setActionFeedback({ ok: true, msg: `MCP '${newMcpName}' cadastrado!` });
        setIsAddingMcp(false);
        setNewMcpName("");
        setNewMcpCommand("");
        setNewMcpEndpoint("");
        setNewMcpDesc("");
        await loadAllData();
        setTimeout(() => setActionFeedback(null), 3500);
      }
    } catch (err: unknown) {
      setActionFeedback({
        ok: false,
        msg: err instanceof Error ? err.message : "Erro ao cadastrar MCP.",
      });
    }
  };

  const handleRemoveMcp = async (id: string) => {
    const ok = window.confirm("Deseja remover este conector MCP?");
    if (!ok) return;
    try {
      const res = await API.removeMcpServer(id, activeRepo?.name);
      if (res.ok) {
        setActionFeedback({ ok: true, msg: "Conector MCP removido." });
        await loadAllData();
        setTimeout(() => setActionFeedback(null), 3500);
      }
    } catch (err: unknown) {
      setActionFeedback({ ok: false, msg: err instanceof Error ? err.message : "Erro ao remover." });
    }
  };

  // --- Custom Tool Handlers ---
  const handleOpenCreateCustomTool = () => {
    const defaultTool: Partial<CustomToolItem> = {
      name: "",
      title: "",
      description: "",
      category: "utility",
      handler_type: "javascript",
      handler_code: `// Código JavaScript executado em sandbox assíncrono
// Disponível: args, context, utils { fetch, readProjectFile, writeProjectFile, listProjectFiles }

const { message } = args;
return {
  success: true,
  echo: message || "Hello from Custom Tool!",
  timestamp: new Date().toISOString()
};`,
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Mensagem de entrada para a ferramenta.",
          },
        },
        required: [],
      },
      handler_config: {
        url: "",
        method: "POST",
        headers: {},
        command: "",
      },
    };
    setEditingCustomTool(defaultTool);
    setCustomToolSchemaStr(JSON.stringify(defaultTool.parameters, null, 2));
    setCustomToolTestArgs(
      JSON.stringify({ message: "Teste de execução" }, null, 2),
    );
    setCustomToolTestOutput(null);
    setIsCustomToolModalOpen(true);
  };

  const handleOpenEditCustomTool = (tool: CustomToolItem) => {
    setEditingCustomTool({ ...tool });
    setCustomToolSchemaStr(
      JSON.stringify(
        tool.parameters || { type: "object", properties: {}, required: [] },
        null,
        2,
      ),
    );
    const sampleArgs: Record<string, string> = {};
    if (tool.parameters?.properties) {
      Object.keys(tool.parameters.properties).forEach((k) => {
        sampleArgs[k] = "";
      });
    }
    setCustomToolTestArgs(JSON.stringify(sampleArgs, null, 2));
    setCustomToolTestOutput(null);
    setIsCustomToolModalOpen(true);
  };

  const handleSaveCustomTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !editingCustomTool.name?.trim() ||
      !editingCustomTool.description?.trim()
    ) {
      setActionFeedback({
        ok: false,
        msg: "Nome e descrição da ferramenta são obrigatórios.",
      });
      return;
    }

    let parsedParams = { type: "object", properties: {}, required: [] };
    try {
      if (customToolSchemaStr.trim()) {
        parsedParams = JSON.parse(customToolSchemaStr);
      }
    } catch {
      setActionFeedback({
        ok: false,
        msg: "Esquema JSON de parâmetros inválido.",
      });
      return;
    }

    try {
      const payload: Partial<CustomToolItem> = {
        ...editingCustomTool,
        name: editingCustomTool.name.trim().replace(/[^a-zA-Z0-9_]/g, "_"),
        title: editingCustomTool.title?.trim() || editingCustomTool.name.trim(),
        description: editingCustomTool.description.trim(),
        parameters: parsedParams as CustomToolItem["parameters"],
      };

      const res = await API.saveCustomTool(payload, activeRepo?.name);
      if (res.ok) {
        setActionFeedback({
          ok: true,
          msg: `Ferramenta '${payload.name}' salva com sucesso!`,
        });
        setIsCustomToolModalOpen(false);
        await loadAllData();
        setTimeout(() => setActionFeedback(null), 3500);
      } else {
        setActionFeedback({
          ok: false,
          msg: (res.data as { error?: string } | undefined)?.error || "Erro ao salvar ferramenta.",
        });
      }
    } catch (err: unknown) {
      setActionFeedback({
        ok: false,
        msg: err instanceof Error ? err.message : "Erro de conexão ao salvar ferramenta.",
      });
    }
  };

  const handleDeleteCustomTool = async (toolId: string) => {
    const ok = window.confirm(
      `Deseja realmente excluir a ferramenta customizada '${toolId}'?`,
    );
    if (!ok) return;

    try {
      const res = await API.deleteCustomTool(toolId, activeRepo?.name);
      if (res.ok) {
        setActionFeedback({
          ok: true,
          msg: `Ferramenta '${toolId}' removida!`,
        });
        await loadAllData();
        setTimeout(() => setActionFeedback(null), 3500);
      } else {
        setActionFeedback({
          ok: false,
          msg: (res.data as { error?: string } | undefined)?.error || "Erro ao excluir.",
        });
      }
    } catch (err: unknown) {
      setActionFeedback({
        ok: false,
        msg: err instanceof Error ? err.message : "Erro de conexão ao excluir ferramenta.",
      });
    }
  };

  const handleTestCustomToolDirect = async () => {
    setIsTestingCustomTool(true);
    setCustomToolTestOutput(null);

    let parsedArgs = {};
    try {
      if (customToolTestArgs.trim()) {
        parsedArgs = JSON.parse(customToolTestArgs);
      }
    } catch {
      setCustomToolTestOutput({
        error: "Argumentos JSON inválidos na entrada.",
      });
      setIsTestingCustomTool(false);
      return;
    }

    let parsedParams = { type: "object", properties: {}, required: [] };
    try {
      if (customToolSchemaStr.trim()) {
        parsedParams = JSON.parse(customToolSchemaStr);
      }
    } catch {}

    const toolPayload: Partial<CustomToolItem> = {
      ...editingCustomTool,
      parameters: parsedParams as CustomToolItem["parameters"],
    };

    try {
      const res = await API.testCustomTool(
        toolPayload,
        parsedArgs,
        activeRepo?.name,
      );
      setCustomToolTestOutput(res.data);
    } catch (err: unknown) {
      setCustomToolTestOutput({
        error: err instanceof Error ? err.message : "Erro de execução da ferramenta.",
      });
    } finally {
      setIsTestingCustomTool(false);
    }
  };

  const isSkillInstalled = (id: string) =>
    installedSkills.some((s) => s.id === id);
  const isAgentInstalled = (id: string) =>
    installedAgents.some((a) => a.id === id);
  const isMcpInstalled = (id: string) =>
    projectMcpServers.some((s) => s.id === id);

  const systemSkills = hubSkills.filter((s) => s.source === "system");
  const communitySkills = hubSkills.filter(
    (s) => s.source === "community" || (!s.source && s.source !== "system"),
  );

  const displayedSkills =
    skillScope === "installed"
      ? installedSkills
      : skillScope === "system"
        ? systemSkills
        : communitySkills;

  const filteredSkills = displayedSkills.filter((s) => {
    const matchesCat =
      selectedCategory === "all" ||
      s.category?.toLowerCase() === selectedCategory.toLowerCase();

    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.title && s.title.toLowerCase().includes(q)) ||
      s.description.toLowerCase().includes(q) ||
      (s.tags && s.tags.some((t) => t.toLowerCase().includes(q)));

    return matchesCat && matchesSearch;
  });

  const systemAgents = hubAgents.filter((a) => a.source === "system");
  const communityAgents = hubAgents.filter(
    (a) => a.source === "community" || (!a.source && a.source !== "system"),
  );

  const displayedAgents =
    agentScope === "installed"
      ? installedAgents
      : agentScope === "system"
        ? systemAgents
        : communityAgents;

  return {
    activeRepo,
    activeSkillId,
    setActiveSkillId,
    activeMainTab,
    setActiveMainTab,
    loading,
    actionFeedback,
    setActionFeedback,
    loadAllData,

    // Skills
    skillScope,
    setSkillScope,
    hubSkills,
    installedSkills,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    selectedSkill,
    setSelectedSkill,
    filteredSkills,
    isSkillInstalled,
    handleInstallSkill,
    handleUninstallSkill,

    // Agents
    agentScope,
    setAgentScope,
    hubAgents,
    installedAgents,
    selectedAgent,
    setSelectedAgent,
    displayedAgents,
    isAgentInstalled,
    handleInstallAgent,
    handleUninstallAgent,

    // Tools
    toolScope,
    setToolScope,
    toolsList,
    customTools,
    communityTools,
    communityToolCategory,
    setCommunityToolCategory,
    communityToolSearch,
    setCommunityToolSearch,
    selectedCommunityTool,
    setSelectedCommunityTool,
    testingTool,
    setTestingTool,
    toolArgsInput,
    setToolArgsInput,
    toolTestResult,
    setToolTestResult,
    isExecutingTool,
    handleExecuteToolTest,

    // Custom Tools Modal
    isCustomToolModalOpen,
    setIsCustomToolModalOpen,
    editingCustomTool,
    setEditingCustomTool,
    customToolSchemaStr,
    setCustomToolSchemaStr,
    customToolTestArgs,
    setCustomToolTestArgs,
    customToolTestOutput,
    isTestingCustomTool,
    handleOpenCreateCustomTool,
    handleOpenEditCustomTool,
    handleSaveCustomTool,
    handleDeleteCustomTool,
    handleTestCustomToolDirect,

    // MCP
    mcpTemplates,
    projectMcpServers,
    isAddingMcp,
    setIsAddingMcp,
    newMcpName,
    setNewMcpName,
    newMcpType,
    setNewMcpType,
    newMcpCommand,
    setNewMcpCommand,
    newMcpEndpoint,
    setNewMcpEndpoint,
    newMcpDesc,
    setNewMcpDesc,
    isMcpInstalled,
    handleSaveMcpFromTemplate,
    handleSaveCustomMcp,
    handleRemoveMcp,
  };
}
