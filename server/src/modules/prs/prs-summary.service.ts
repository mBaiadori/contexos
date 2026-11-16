import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../../config/storage.js";
import { getGitDiff, getGitStatus, executeGit } from "../../utils/git.js";
import { isPathHidden, loadHiddenFiles, isSystemPath } from "../../utils/hidden-files.js";
import { aiService } from "../ai/ai.service.js";
import { prsStorageService } from "./prs-storage.service.js";

export class PRsSummaryService {
  parseDiffInsights(diffText: string): Map<
    string,
    {
      additions: number;
      deletions: number;
      sectionsAdded: string[];
      frontmatterChanges: string[];
      hasMermaid: boolean;
      hasTables: boolean;
    }
  > {
    const result = new Map<
      string,
      {
        additions: number;
        deletions: number;
        sectionsAdded: string[];
        frontmatterChanges: string[];
        hasMermaid: boolean;
        hasTables: boolean;
      }
    >();

    if (!diffText) return result;

    const chunks = diffText.split(
      /(?=^diff --git |^--- \/dev\/null\n\+\+\+ b\/)/m,
    );

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;

      let filePath = "";
      const headerMatch = chunk.match(
        /^(?:diff --git a\/[^\s\n\r]+\s+b\/([^\s\n\r]+)|\+\+\+ b\/([^\s\n\r]+))/m,
      );
      if (headerMatch) {
        filePath = headerMatch[1] || headerMatch[2];
      }

      if (!filePath) continue;

      let additions = 0;
      let deletions = 0;
      const sectionsAdded: string[] = [];
      const frontmatterChanges: string[] = [];
      let hasMermaid = false;
      let hasTables = false;

      const lines = chunk.split(/\r?\n/);
      let inFrontmatter = false;

      for (const line of lines) {
        if (line.startsWith("+++") || line.startsWith("---")) continue;

        if (line.startsWith("+---") || line.startsWith("----")) {
          inFrontmatter = !inFrontmatter;
        }

        if (line.startsWith("+")) {
          additions++;
          const content = line.substring(1).trim();
          const headerMatch = content.match(/^(#{1,4})\s+([^#\n\r]+)/);
          if (headerMatch) {
            const title = headerMatch[2].trim();
            if (title && !sectionsAdded.includes(title)) {
              sectionsAdded.push(title);
            }
          }
          if (
            inFrontmatter ||
            /^(?:title|status|category|version|type):\s*/i.test(content)
          ) {
            const fmMatch = content.match(/^([a-zA-Z0-9_-]+):\s*(.+)/);
            if (fmMatch && !["title"].includes(fmMatch[1].toLowerCase())) {
              frontmatterChanges.push(`+ ${fmMatch[1]}: ${fmMatch[2].trim()}`);
            }
          }
          if (content.includes("```mermaid")) {
            hasMermaid = true;
          }
          if (content.includes("|") && content.split("|").length >= 3) {
            hasTables = true;
          }
        } else if (line.startsWith("-")) {
          deletions++;
          const content = line.substring(1).trim();
          if (inFrontmatter || /^(?:status|version|type):\s*/i.test(content)) {
            const fmMatch = content.match(/^([a-zA-Z0-9_-]+):\s*(.+)/);
            if (fmMatch && !["title"].includes(fmMatch[1].toLowerCase())) {
              frontmatterChanges.push(`- ${fmMatch[1]}: ${fmMatch[2].trim()}`);
            }
          }
        }
      }

      result.set(filePath, {
        additions,
        deletions,
        sectionsAdded: sectionsAdded.slice(0, 6),
        frontmatterChanges: frontmatterChanges.slice(0, 4),
        hasMermaid,
        hasTables,
      });
    }

    return result;
  }

  async generatePRSummary(repoNameQuery?: string) {
    const cfg = loadConfig();
    const repoName = repoNameQuery || cfg.active_repo?.name || "local";
    const repoDir = prsStorageService.getRepoDir(repoName);
    const hiddenList = loadHiddenFiles(repoDir);

    const wsChanges = (cfg.workspace_changes?.[repoName] || []).filter(
      (c) => !isPathHidden(c.path, hiddenList) || isSystemPath(c.path),
    );

    const gitStatus = await getGitStatus(repoDir);
    const gitFiles = [
      ...(gitStatus.files || []).filter(
        (f) => !isPathHidden(f.path, hiddenList),
      ),
      ...(gitStatus.systemFiles || []),
    ];

    const allPathsSet = new Set<string>([
      ...wsChanges.map((c) => c.path),
      ...gitFiles.map((f) => f.path),
    ]);

    const changedPaths = Array.from(allPathsSet);

    if (changedPaths.length === 0) {
      return {
        success: true,
        title: "docs: atualização de especificações",
        description: "Nenhuma alteração pendente detectada no repositório.",
        body: "Nenhuma alteração pendente detectada no repositório.",
        type: "docs",
        layer: "Geral",
        is_ai_generated: false,
      };
    }

    const fileDetails: Array<{
      path: string;
      name: string;
      title: string;
      action: string;
      module: string;
    }> = [];

    for (const p of changedPaths) {
      const fullPath = path.join(repoDir, p);
      let docTitle = path.basename(p, path.extname(p));
      let action = "Modificado";

      const gitItem = gitFiles.find((f) => f.path === p);
      const wsItem = wsChanges.find((c) => c.path === p);

      if (gitItem?.status === "??" || wsItem?.type === "ADDED") {
        action = "Novo Documento";
      } else if (gitItem?.status === "D" || wsItem?.type === "DELETED") {
        action = "Removido";
      }

      if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const frontmatterMatch = content.match(
            /^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/,
          );
          if (frontmatterMatch) {
            const titleMatch = frontmatterMatch[1].match(
              /^title:\s*["']?([^"'\r\n]+)["']?/m,
            );
            if (titleMatch && titleMatch[1].trim()) {
              docTitle = titleMatch[1].trim();
            }
          }
          if (docTitle === path.basename(p, path.extname(p))) {
            const h1Match = content.match(/^#\s+([^\r\n]+)/m);
            if (h1Match && h1Match[1].trim()) {
              docTitle = h1Match[1].replace(/^[📄🏛️📌✨🔧📋\s]+/, "").trim();
            }
          }
        } catch {}
      }

      const parts = p.split("/");
      const moduleName = parts.length > 1 ? parts[0] : "raiz";

      fileDetails.push({
        path: p,
        name: path.basename(p),
        title: docTitle,
        action,
        module: moduleName,
      });
    }

    // Extrair diff do Git e analisar alterações estruturais
    let diffText = "";
    try {
      const gitDiffRes = await getGitDiff(repoDir);
      diffText = gitDiffRes?.diff || "";
    } catch (diffErr) {
      console.warn("[PRsService] Erro ao extrair git diff:", diffErr);
    }
    const diffInsights = this.parseDiffInsights(diffText);

    // Verificar se existe modelo de IA configurado
    const aiSettings = cfg.ai_settings || {
      provider: "gemini",
      model: "gemini-2.5-flash",
      api_key: "",
      custom_endpoint: "",
    };

    const hasApiKey = Boolean(
      (aiSettings.api_key && aiSettings.api_key.trim().length > 0) ||
      process.env.GEMINI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY,
    );
    const isLocalProvider =
      aiSettings.provider === "local" || aiSettings.provider === "ollama";
    const isAIConfigured = hasApiKey || isLocalProvider;

    // Se houver IA configurada, tentar gerar resumo semântico profundo
    if (isAIConfigured) {
      try {
        const fileSummaries = fileDetails
          .map((f) => {
            const insight = diffInsights.get(f.path);
            const addStr = insight ? `+${insight.additions}` : "";
            const delStr = insight ? `-${insight.deletions}` : "";
            return `- ${f.path} (${f.action}, módulo: ${f.module}${addStr ? `, ${addStr} ${delStr}` : ""}): "${f.title}"`;
          })
          .join("\n");

        // Truncar diff com segurança para não estourar a janela de contexto de tokens (limite de 14.000 caracteres)
        const safeDiff =
          diffText.length > 14000
            ? `${diffText.substring(0, 14000)}\n\n... [diff truncado para respeitar limites de tokens] ...`
            : diffText;

        const systemPrompt = `Você é um Especialista em Documentação e Governança de Conteúdo.
Sua missão é analisar as alterações e o diff fornecidos e gerar um título semântico, claro e humano e um resumo de alto valor para a Proposta de Versão.

DIRETRIZES OBRIGATÓRIAS:
1. TÍTULO: Deve ser em linguagem natural, claro, amigável e direto (sem jargões técnicos para usuários não-técnicos):
   - NUNCA use prefixos técnicos de Conventional Commits (proibido usar "docs:", "feat:", "fix:", "chore:", "refactor:", etc.).
   - Escreva uma frase concisa em português com inicial maiúscula (máximo 60 caracteres).
   - Exemplo bom: "Atualização das Regras de Acesso e Termos de Uso" ou "Revisão dos Diagramas de Arquitetura e Contratos"
   - Exemplo proibido: "docs(auth): add mfa flow" ou "feat: novas regras"
2. DESCRIÇÃO: Deve ser formatada em Markdown estruturada da seguinte forma:
   ## 📋 Visão Geral
   2 a 3 frases explicando com clareza o objetivo principal das alterações e o benefício para o projeto.

   ### 🔍 Principais Mudanças
   Tópicos objetivos explicando o que realmente mudou em cada documento com contexto amigável e claro.

   ### 🏛️ Destaques para Revisão
   Itens que demandam atenção dos revisores (novas seções, regras atualizadas ou itens críticos).

3. FORMATO DE SAÍDA: Retorne ESTRITAMENTE um JSON válido com os campos "title" e "description", sem blocos de código envolventes. Exemplo:
{"title": "Atualização das Regras de Governança", "description": "## 📋 Visão Geral\\n\\n..."}`;

        const userPrompt =
          `Analise os seguintes arquivos alterados e o diff do repositório "${repoName}":\n\n` +
          `### Arquivos Alterados:\n${fileSummaries}\n\n` +
          `### Git Diff:\n\`\`\`diff\n${safeDiff || "Diff indisponível, considere os arquivos alterados."}\n\`\`\``;

        const aiRes = await aiService.callLLM(
          aiSettings,
          userPrompt,
          "",
          "pr-summary.md",
          [],
          systemPrompt,
          repoName,
        );

        let parsedTitle = "";
        let parsedDescription = "";

        if (aiRes && aiRes.reply) {
          const raw = aiRes.reply.trim();
          const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [
            null,
            raw,
          ];
          try {
            const data = JSON.parse(jsonMatch[1] || raw);
            if (data.title) parsedTitle = String(data.title).trim();
            if (data.description)
              parsedDescription = String(data.description).trim();
          } catch {
            const lines = raw.split("\n");
            const titleLine = lines.find((l) =>
              /^(?:título|title):\s*/i.test(l),
            );
            if (titleLine) {
              parsedTitle = titleLine
                .replace(/^(?:título|title):\s*/i, "")
                .replace(/[*"`]/g, "")
                .trim();
            }
            parsedDescription = raw;
          }
        }

        if (parsedTitle && parsedDescription) {
          return {
            success: true,
            title: parsedTitle,
            description: parsedDescription,
            body: parsedDescription,
            type: "docs",
            layer: "Especificações",
            is_ai_generated: true,
          };
        }
      } catch (err: any) {
        console.warn(
          `[PRsService] Falha na geração com IA (${err.message}), utilizando fallback estruturado de diff.`,
        );
      }
    }

    // Fallback Estruturado por Diff (Abordagem B: Determinística e sem dependência de chaves de IA)
    const allNew = fileDetails.every((f) => f.action === "Novo Documento");
    const allDeleted = fileDetails.every((f) => f.action === "Removido");

    const titleAction = allNew
      ? "Inclusão de"
      : allDeleted
        ? "Remoção de"
        : "Atualização em";
    const namesList = fileDetails
      .slice(0, 3)
      .map((f) => f.title || f.name.replace(/\.md$/i, ""))
      .join(", ");
    const autoTitle = `${titleAction} ${namesList}${fileDetails.length > 3 ? ` e mais ${fileDetails.length - 3} documento(s)` : ""}`;

    let totalAdditions = 0;
    let totalDeletions = 0;
    diffInsights.forEach((ins) => {
      totalAdditions += ins.additions;
      totalDeletions += ins.deletions;
    });

    const structuralHighlights: string[] = [];
    for (const f of fileDetails) {
      const ins = diffInsights.get(f.path);
      const points: string[] = [];
      if (ins) {
        if (ins.sectionsAdded.length > 0) {
          points.push(
            `seções: ${ins.sectionsAdded.map((s) => `\`${s}\``).join(", ")}`,
          );
        }
        if (ins.frontmatterChanges.length > 0) {
          points.push(
            `metadados alterados (${ins.frontmatterChanges.join(", ")})`,
          );
        }
        if (ins.hasMermaid) {
          points.push(`diagrama visual Mermaid`);
        }
        if (ins.hasTables) {
          points.push(`tabelas de dados`);
        }
      }
      const detailsStr = points.length > 0 ? ` — *${points.join("; ")}*` : "";
      const linesStr =
        ins && (ins.additions > 0 || ins.deletions > 0)
          ? ` (\`+${ins.additions}\` / \`-${ins.deletions}\` linhas)`
          : "";
      structuralHighlights.push(
        `- **\`${f.path}\`** (${f.action})${linesStr}${detailsStr}`,
      );
    }

    const autoDescription =
      `> 💡 **Nota:** Resumo gerado via análise estruturada de alterações (Git Diff). Configure uma chave de IA (Gemini, OpenAI, Claude ou Ollama) nas Configurações para obter resumos semânticos contextuais avançados.\n\n` +
      `## 📋 Visão Geral da Proposta\n\n` +
      `Esta proposta de evolução reúne alterações em **${fileDetails.length} documento(s)** no repositório \`${repoName}\`${totalAdditions > 0 || totalDeletions > 0 ? ` com total de \`+${totalAdditions}\` adições e \`-${totalDeletions}\` deleções` : ""}.\n\n` +
      `### 🔍 Alterações Estruturais Identificadas:\n\n` +
      (structuralHighlights.length > 0
        ? structuralHighlights.join("\n")
        : "- Nenhuma alteração estrutural específica detectada.") +
      `\n\n### 📂 Documentos Impactados:\n\n` +
      `| Documento | Módulo / Domínio | Ação | Título Canônico |\n` +
      `| :--- | :--- | :--- | :--- |\n` +
      fileDetails
        .map(
          (f) =>
            `| \`${f.path}\` | \`${f.module}\` | **${f.action}** | ${f.title} |`,
        )
        .join("\n") +
      `\n\n### 🎯 Objetivos de Governança:\n` +
      `- Manter a documentação viva e canônica sincronizada com a arquitetura.\n` +
      `- Rastrear as evoluções através do fluxo formal de revisão e Pull Request.\n\n` +
      `*Gerado automaticamente pelo motor de governança do Contexos.*`;

    return {
      success: true,
      title: autoTitle,
      description: autoDescription,
      body: autoDescription,
      type: "docs",
      layer: "Especificações",
      is_ai_generated: false,
    };
  }

  async checkConflictingProposals(
    repoNameParam?: string,
    filesToCheck?: string[],
  ) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = prsStorageService.getRepoDir(repoName);
    const prs = prsStorageService.loadRepoPRs(repoName);
    const openPRs = prs.filter((p: { status?: string }) => p.status === "OPEN" || !p.status);

    if (openPRs.length === 0) {
      return { hasConflicts: false, conflicts: [] };
    }

    let targetFiles = filesToCheck || [];
    if (targetFiles.length === 0) {
      const gitStatus = await getGitStatus(repoDir);
      targetFiles = (gitStatus.files || []).map((f) => f.path);
    }

    const conflicts: Array<{
      id: number | string;
      title: string;
      branch: string;
      author?: string;
      matchingFiles: string[];
    }> = [];

    for (const pr of openPRs) {
      let prFiles: string[] = [];
      try {
        const diffRes = await executeGit(
          [
            "diff",
            "--name-only",
            `${pr.base_sha || "main"}...${pr.head_sha || pr.branch}`,
          ],
          repoDir,
        );
        if (diffRes.success && diffRes.stdout) {
          prFiles = diffRes.stdout.trim().split("\n").filter(Boolean);
        }
      } catch {}

      const matching = targetFiles.filter((tf) => prFiles.includes(tf));
      if (matching.length > 0) {
        conflicts.push({
          id: pr.id,
          title: pr.title,
          branch: pr.branch,
          author: pr.author?.login || pr.author?.name || "Autor",
          matchingFiles: matching,
        });
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  }
}

export const prsSummaryService = new PRsSummaryService();
