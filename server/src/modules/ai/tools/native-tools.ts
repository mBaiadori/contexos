import fs from "node:fs";
import path from "node:path";
import { AgentTool, ToolResult } from "./tool.types.js";
import { PROJECTS_DIR } from "../../../config/constants.js";
import { docsMetadataService } from "../../workspace/docs-metadata.service.js";
import { dictionaryService } from "../../dictionary/dictionary.service.js";
import { templatesService } from "../../templates/templates.service.js";
import { customToolsService } from "../../skills/custom-tools.service.js";
import { wikiService } from "../../wiki/wiki.service.js";

import { resolveRepoDir } from "../../../config/constants.js";
import { resolveSafeRepoPath } from "../../../utils/repo-ref.js";

export function getSafeRepoPath(
  repoName: string,
  relativeFilePath: string,
): string | null {
  try {
    const repoDir = resolveRepoDir(repoName || "local");
    return resolveSafeRepoPath(repoDir, relativeFilePath);
  } catch {
    return null;
  }
}

export const nativeTools: AgentTool[] = [
  {
    name: "docs_get_graph",
    description:
      "Obtém o grafo de conexões, links de entrada/saída, status e metadados de documentos no projeto.",
    parameters: {
      type: "object",
      properties: {
        target_path: {
          type: "string",
          description:
            'Caminho relativo do documento específico para inspecionar conexões (ex: "docs/architecture.md"). Se omitido, retorna resumo de todo o grafo.',
        },
      },
    },
    execute: async (args, context): Promise<ToolResult> => {
      try {
        const metaList = docsMetadataService.loadDocsMetadata(context.repoName);
        if (args.target_path) {
          const cleanPath = args.target_path.replace(/^\/+/, "");
          const doc = metaList.find(
            (d) => d.path === cleanPath || d.id === cleanPath,
          );
          if (!doc) {
            return {
              success: false,
              error: `Documento '${args.target_path}' não encontrado no índice de metadados do projeto.`,
            };
          }

          // Documentos que apontam para este (incoming links)
          const referencedBy = metaList
            .filter(
              (d) =>
                Array.isArray(d.links) &&
                d.links.some(
                  (l) => l.includes(cleanPath) || l.includes(doc.id),
                ),
            )
            .map((d) => ({ path: d.path, title: d.title, status: d.status }));

          return {
            success: true,
            data: {
              document: doc,
              incoming_references: referencedBy,
              outgoing_links: doc.links || [],
            },
          };
        }

        // Resumo geral do grafo
        return {
          success: true,
          data: {
            total_documents: metaList.length,
            documents: metaList.map((d) => ({
              id: d.id,
              path: d.path,
              title: d.title || d.name,
              status: d.status,
              categories: d.categories,
              tags: d.tags,
              links_count: (d.links || []).length,
            })),
          },
        };
      } catch (err: any) {
        return { success: false, error: `Erro ao obter grafo: ${err.message}` };
      }
    },
  },

  {
    name: "docs_list_by_status",
    description:
      "Lista documentos filtrados por status do ciclo de vida (draft, proposed, review, approved, superseded, deprecated).",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            'O status a ser filtrado (ex: "approved", "draft", "deprecated", "review").',
        },
      },
      required: ["status"],
    },
    execute: async (args, context): Promise<ToolResult> => {
      try {
        const metaList = docsMetadataService.loadDocsMetadata(context.repoName);
        const filtered = metaList.filter(
          (d) =>
            (d.status || "draft").toLowerCase() ===
            (args.status || "").toLowerCase(),
        );
        return {
          success: true,
          data: {
            status: args.status,
            count: filtered.length,
            documents: filtered.map((d) => ({
              id: d.id,
              path: d.path,
              title: d.title || d.name,
              tags: d.tags,
              updated_at: d.updated_at,
            })),
          },
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Erro ao filtrar por status: ${err.message}`,
        };
      }
    },
  },

  {
    name: "docs_read_file",
    description:
      "Lê com segurança o conteúdo de texto de um arquivo markdown ou especificação dentro do repositório.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description:
            'Caminho relativo do arquivo no repositório (ex: "docs/index.md", "README.md").',
        },
      },
      required: ["file_path"],
    },
    execute: async (args, context): Promise<ToolResult> => {
      try {
        const fullPath = getSafeRepoPath(context.repoName, args.file_path);
        if (!fullPath) {
          return {
            success: false,
            error: "Acesso negado: Caminho fora dos limites do repositório.",
          };
        }
        if (!fs.existsSync(fullPath)) {
          return {
            success: false,
            error: `Arquivo '${args.file_path}' não encontrado no repositório.`,
          };
        }
        const content = fs.readFileSync(fullPath, "utf-8");
        return {
          success: true,
          data: {
            file_path: args.file_path,
            content,
            size_bytes: Buffer.byteLength(content, "utf-8"),
          },
        };
      } catch (err: any) {
        return { success: false, error: `Erro ao ler arquivo: ${err.message}` };
      }
    },
  },

  {
    name: "docs_propose_diff",
    description:
      "Propõe uma alteração estruturada (patch/diff) para um arquivo. Não sobrescreve diretamente; gera uma proposta para aprovação do usuário.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Caminho do arquivo a ser modificado.",
        },
        proposed_content: {
          type: "string",
          description:
            "Conteúdo completo proposto para o arquivo após a alteração.",
        },
        rationale: {
          type: "string",
          description:
            "Justificativa clara da mudança proposta e quais regras ou documentos motivaram a alteração.",
        },
      },
      required: ["file_path", "proposed_content", "rationale"],
    },
    execute: async (args, context): Promise<ToolResult> => {
      try {
        const fullPath = getSafeRepoPath(context.repoName, args.file_path);
        if (!fullPath) {
          return {
            success: false,
            error: "Acesso negado: Caminho fora do repositório.",
          };
        }

        let originalContent = "";
        if (fs.existsSync(fullPath)) {
          originalContent = fs.readFileSync(fullPath, "utf-8");
        }

        return {
          success: true,
          message: `Proposta de alteração gerada para '${args.file_path}'. Aguardando revisão do usuário.`,
          data: {
            file_path: args.file_path,
            has_existing: fs.existsSync(fullPath),
            original_content: originalContent,
            proposed_content: args.proposed_content,
            rationale: args.rationale,
            timestamp: new Date().toISOString(),
          },
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Erro ao gerar proposta de diff: ${err.message}`,
        };
      }
    },
  },

  {
    name: "dictionary_validate_terms",
    description:
      "Valida se o texto ou documento fornecido utiliza corretamente os termos canônicos e a Linguagem Ubíqua cadastrada no projeto.",
    parameters: {
      type: "object",
      properties: {
        text_sample: {
          type: "string",
          description:
            "Texto ou trecho de especificação para validar contra o dicionário de domínio.",
        },
      },
      required: ["text_sample"],
    },
    execute: async (args, context): Promise<ToolResult> => {
      try {
        const dict = dictionaryService.getDictionary(context.repoName);
        const terms: any[] = dict.terms || [];
        const foundTerms: any[] = [];
        const missingOrMisused: string[] = [];

        const lowerText = (args.text_sample || "").toLowerCase();

        for (const t of terms) {
          const termName = (t.term || t.name || "").toLowerCase();
          if (termName && lowerText.includes(termName)) {
            foundTerms.push({
              term: t.term || t.name,
              definition: t.definition,
              domain: t.domain,
            });
          }
        }

        return {
          success: true,
          data: {
            total_domain_terms_checked: terms.length,
            matched_canonical_terms: foundTerms,
            alerts: missingOrMisused,
          },
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Erro ao validar termos no dicionário: ${err.message}`,
        };
      }
    },
  },

  {
    name: "dictionary_upsert_term",
    description:
      "Adiciona um novo termo canônico ou atualiza a definição, domínio, categoria ou aliases de um termo existente no Dicionário de Linguagem Ubíqua do projeto.",
    parameters: {
      type: "object",
      properties: {
        term: {
          type: "string",
          description:
            'Nome canônico do termo (ex: "Workspace", "Living Documentation", "Tenant").',
        },
        definition: {
          type: "string",
          description: "Definição conceitual do termo no contexto do projeto.",
        },
        domain: {
          type: "string",
          description:
            'Domínio ou Bounded Context ao qual o termo pertence (ex: "Core", "Billing", "Identity"). Opcional.',
        },
        category: {
          type: "string",
          description:
            'Classificação do termo (ex: "Entity", "Value Object", "Process", "Architecture"). Opcional.',
        },
        code_name: {
          type: "string",
          description:
            'Nome correspondente no código-fonte/API (ex: "WorkspaceEntity", "BillingPlan"). Opcional.',
        },
        aliases: {
          type: "array",
          items: { type: "string" },
          description:
            "Sinônimos, variações ou termos legados equivalentes. Opcional.",
        },
      },
      required: ["term", "definition"],
    },
    execute: async (args, context): Promise<ToolResult> => {
      try {
        if (!args.term || typeof args.term !== "string" || !args.term.trim()) {
          return {
            success: false,
            error: 'O parâmetro "term" é obrigatório e não pode ser vazio.',
          };
        }
        if (
          !args.definition ||
          typeof args.definition !== "string" ||
          !args.definition.trim()
        ) {
          return {
            success: false,
            error:
              'O parâmetro "definition" é obrigatório e não pode ser vazio.',
          };
        }

        const dict = dictionaryService.getDictionary(context.repoName);
        dict.terms = Array.isArray(dict.terms) ? dict.terms : [];
        dict.domains = Array.isArray(dict.domains) ? dict.domains : [];

        const normalizedTermName = args.term.trim();
        const existingIndex = dict.terms.findIndex(
          (t: any) =>
            (t.term || t.name || "").toLowerCase() ===
            normalizedTermName.toLowerCase(),
        );

        const updatedEntry: any = {
          term: normalizedTermName,
          definition: args.definition.trim(),
          ...(args.domain ? { domain: args.domain.trim() } : {}),
          ...(args.category ? { category: args.category.trim() } : {}),
          ...(args.code_name ? { code_name: args.code_name.trim() } : {}),
          ...(Array.isArray(args.aliases)
            ? {
                aliases: args.aliases
                  .map((a: any) => String(a).trim())
                  .filter(Boolean),
              }
            : {}),
        };

        let action: "created" | "updated" = "created";

        if (existingIndex >= 0) {
          action = "updated";
          dict.terms[existingIndex] = {
            ...dict.terms[existingIndex],
            ...updatedEntry,
          };
        } else {
          dict.terms.push(updatedEntry);
        }

        if (args.domain && typeof args.domain === "string") {
          const trimmedDomain = args.domain.trim();
          if (trimmedDomain && !dict.domains.includes(trimmedDomain)) {
            dict.domains.push(trimmedDomain);
          }
        }

        dictionaryService.saveDictionary(dict, context.repoName);

        return {
          success: true,
          data: {
            action,
            term: updatedEntry,
            total_terms: dict.terms.length,
            message: `Termo '${normalizedTermName}' ${action === "created" ? "adicionado" : "atualizado"} com sucesso no dicionário.`,
          },
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Erro ao salvar termo no dicionário: ${err.message}`,
        };
      }
    },
  },

  {
    name: "templates_get_template",
    description:
      "Obtém a estrutura e o esqueleto de um template oficial cadastrado no projeto ou no catálogo global.",
    parameters: {
      type: "object",
      properties: {
        template_id: {
          type: "string",
          description:
            'ID ou slug do template desejado (ex: "adr-template", "technical-spec").',
        },
      },
      required: ["template_id"],
    },
    execute: async (args, context): Promise<ToolResult> => {
      try {
        const tpl = templatesService.resolveTemplate(
          args.template_id,
          context.repoName,
        );
        if (!tpl) {
          return {
            success: false,
            error: `Template '${args.template_id}' não encontrado.`,
          };
        }
        return {
          success: true,
          data: {
            id: tpl.id,
            title: tpl.title,
            category: tpl.category,
            content: tpl.content,
            prompt: tpl.prompt,
          },
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Erro ao buscar template: ${err.message}`,
        };
      }
    },
  },

  {
    name: "memory_wiki_search",
    description:
      "Pesquisa por palavras-chave ou lista notas e decisões na Base de Conhecimento Wiki do projeto (.wiki/).",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Termo de busca ou palavra-chave para filtrar notas da Wiki (opcional).",
        },
        category: {
          type: "string",
          enum: ["all", "decisions", "_rules", "concepts", "gotchas", "handoffs", "geral"],
          description: "Filtrar por categoria específica (decisions = ADRs, _rules = regras de governança, concepts = termos/domínio, gotchas = armadilhas/bugs, handoffs = marcos de sessão, all = todas).",
        },
      },
    },
    execute: async (args, context): Promise<ToolResult> => {
      try {
        const pages = wikiService.getWikiPages(context.repoName, args.category, args.query);
        return {
          success: true,
          data: {
            total: pages.length,
            category: args.category || "all",
            query: args.query || "",
            entries: pages.map((p) => ({
              slug: p.slug,
              title: p.title,
              category: p.category,
              snippet: p.content.slice(0, 160).replace(/\n+/g, " ") + (p.content.length > 160 ? "..." : ""),
              updated_at: p.updated_at,
              path: p.path,
            })),
          },
        };
      } catch (err: any) {
        return { success: false, error: `Erro ao buscar na Wiki: ${err.message}` };
      }
    },
  },

  {
    name: "memory_wiki_get",
    description:
      "Recupera o conteúdo completo de uma nota específica da Wiki do projeto por categoria e slug.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: 'Categoria da nota (ex: "decisions", "_rules", "concepts", "gotchas", "handoffs", "geral").',
        },
        slug: {
          type: "string",
          description: 'Slug identificador da nota (ex: "0001-autenticacao-stateless", "regra-lgpd-sanitizacao-logs").',
        },
      },
      required: ["category", "slug"],
    },
    execute: async (args, context): Promise<ToolResult> => {
      try {
        const page = wikiService.getWikiPage(args.category, args.slug, context.repoName);
        if (!page) {
          return {
            success: false,
            error: `Nota '${args.slug}' não encontrada na categoria '${args.category}'.`,
          };
        }
        return {
          success: true,
          data: page,
        };
      } catch (err: any) {
        return { success: false, error: `Erro ao ler nota da Wiki: ${err.message}` };
      }
    },
  },

  {
    name: "memory_wiki_upsert",
    description:
      "Cria ou atualiza uma nota de conhecimento na Wiki do projeto (.wiki/) nas categorias decisions, _rules, concepts, gotchas ou handoffs.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["decisions", "_rules", "concepts", "gotchas", "handoffs", "geral"],
          description: "Categoria da nota (decisions, _rules, concepts, gotchas, handoffs, geral).",
        },
        title: {
          type: "string",
          description: "Título descritivo da nota (ex: 'ADR 0003: Validação de Payload com Zod').",
        },
        slug: {
          type: "string",
          description: "Slug identificador único do arquivo (ex: '0003-validacao-zod'). Se omitido, será gerado a partir do título.",
        },
        content: {
          type: "string",
          description: "Conteúdo completo da nota formatado em Markdown.",
        },
      },
      required: ["category", "title", "content"],
    },
    execute: async (args, context): Promise<ToolResult> => {
      try {
        const result = wikiService.saveWikiPage(
          args.category,
          args.slug || args.title,
          args.title,
          args.content,
          context.repoName
        );
        return {
          success: true,
          data: {
            message: `Nota '${result.page.title}' salva com sucesso em '.wiki/${result.page.category}/${result.page.slug}.md'`,
            page: result.page,
          },
        };
      } catch (err: any) {
        return { success: false, error: `Erro ao salvar nota na Wiki: ${err.message}` };
      }
    },
  },

  {
    name: "project_tool_list",
    description:
      "Lista todas as ferramentas customizadas e ativas cadastradas no projeto.",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (_args, context): Promise<ToolResult> => {
      try {
        const tools = customToolsService.getProjectTools(context.repoName);
        return {
          success: true,
          data: {
            total_custom_tools: tools.length,
            tools: tools.map((t) => ({
              id: t.id,
              name: t.name,
              title: t.title,
              description: t.description,
              handler_type: t.handler_type,
              is_active: t.is_active,
            })),
          },
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Erro ao listar ferramentas do projeto: ${err.message}`,
        };
      }
    },
  },

  {
    name: "project_tool_upsert",
    description:
      "Cria ou atualiza uma ferramenta customizada no projeto (.tools/), permitindo que o próprio Copilot execute scripts Node.js, chamadas HTTP ou comandos CLI.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            'Identificador único da ferramenta no formato snake_case (ex: "format_sql_query", "jira_create_issue").',
        },
        title: {
          type: "string",
          description: "Título legível da ferramenta para exibição na UI.",
        },
        description: {
          type: "string",
          description:
            "Descrição clara e detalhada para que o modelo saiba quando e como invocar a ferramenta.",
        },
        category: {
          type: "string",
          description:
            "Categoria da ferramenta (utility, integration, domain, validation, general).",
        },
        handler_type: {
          type: "string",
          enum: ["javascript", "http", "shell"],
          description:
            "Tipo de executor: javascript (código assíncrono em sandbox), http (webhook/API) ou shell (CLI).",
        },
        handler_code: {
          type: "string",
          description:
            'Código JavaScript executado quando handler_type for "javascript". Recebe args, context, utils.',
        },
        parameters_json: {
          type: "string",
          description:
            'String JSON contendo a definição do schema de parâmetros no formato { "type": "object", "properties": { ... }, "required": [...] }.',
        },
      },
      required: ["name", "description", "handler_type"],
    },
    execute: async (args, context): Promise<ToolResult> => {
      try {
        let parsedParameters = { type: "object", properties: {}, required: [] };
        if (args.parameters_json) {
          try {
            parsedParameters = JSON.parse(args.parameters_json);
          } catch {
            return {
              success: false,
              error: "O campo parameters_json não é um JSON válido.",
            };
          }
        }

        const res = customToolsService.saveCustomTool(context.repoName, {
          name: args.name,
          title: args.title || args.name,
          description: args.description,
          category: args.category as any,
          handler_type: args.handler_type,
          handler_code: args.handler_code,
          parameters: parsedParameters as any,
        });

        return {
          success: true,
          data: {
            tool: res.tool,
            message: `Ferramenta customizada '${res.tool.name}' salva com sucesso no projeto!`,
          },
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Erro ao salvar ferramenta no projeto: ${err.message}`,
        };
      }
    },
  },

  {
    name: "project_tool_delete",
    description:
      "Remove uma ferramenta customizada do projeto pelo ID ou nome.",
    parameters: {
      type: "object",
      properties: {
        tool_id: {
          type: "string",
          description: "ID ou nome da ferramenta a ser removida.",
        },
      },
      required: ["tool_id"],
    },
    execute: async (args, context): Promise<ToolResult> => {
      try {
        const res = customToolsService.deleteCustomTool(
          context.repoName,
          args.tool_id,
        );
        return {
          success: res.success,
          data: { message: res.message },
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Erro ao remover ferramenta: ${err.message}`,
        };
      }
    },
  },
];
