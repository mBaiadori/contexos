import path from 'node:path';
import fs from 'node:fs';
import { resolveRepoDir, FRAMEWORK_DEFAULT_DIR } from '../../../config/constants.js';

export interface ContextPointerOptions {
  repoName: string;
  activeFilePath?: string;
  skillId?: string;
  skillIds?: string[];
  skillsMeta?: Array<{ id: string; title: string; path?: string; description?: string }>;
}

export class ContextPointerService {
  /**
   * Constrói as diretrizes de contexto baseadas em ponteiros de arquivos e regras locais
   */
  buildContextPointers(options: ContextPointerOptions): string[] {
    const { repoName, activeFilePath, skillId, skillIds, skillsMeta } = options;
    const pointers: string[] = [];

    const projectRoot = resolveRepoDir(repoName || 'local');
    pointers.push(`- Diretório raiz do projeto ativo: ${projectRoot}`);

    // Dicionário Ubíquo
    const projectDict = path.join(projectRoot, '.dictionary.json');
    const defaultDict = path.join(FRAMEWORK_DEFAULT_DIR, '.dictionary.json');
    if (fs.existsSync(projectDict)) {
      pointers.push(`- Dicionário Ubíquo do projeto: ${projectDict} (consulte para termos de domínio e tipos)`);
    } else if (fs.existsSync(defaultDict)) {
      pointers.push(`- Dicionário Ubíquo padrão: ${defaultDict} (consulte para regras gerais de domínio)`);
    }

    // Configuração do Projeto
    const projectConfig = path.join(projectRoot, '.project.config.json');
    if (fs.existsSync(projectConfig)) {
      pointers.push(`- Configurações e stack do projeto: ${projectConfig}`);
    }

    // Documento Ativo
    if (activeFilePath) {
      const fullActivePath = path.isAbsolute(activeFilePath) 
        ? activeFilePath 
        : path.join(projectRoot, activeFilePath);
      pointers.push(`- Arquivo atualmente em foco no editor: ${fullActivePath}`);
      pointers.push(`- Nota de Edição: Se a solicitação pedir alteração neste documento, leia as seções necessárias e aplique a modificação diretamente no disco.`);
    }

    // Skills On-Demand
    const effectiveSkillIds = Array.isArray(skillIds) && skillIds.length > 0 
      ? skillIds 
      : (skillId ? [skillId] : []);

    if (skillsMeta && skillsMeta.length > 0) {
      pointers.push(`\n[CATÁLOGO DE SKILLS SELECIONADAS (ON-DEMAND)]`);
      for (const sm of skillsMeta) {
        pointers.push(`- Skill '${sm.title || sm.id}': ${sm.path ? `Arquivo ${sm.path}` : `ID: ${sm.id}`} - ${sm.description || 'Diretrizes especializadas'}`);
      }
      pointers.push(`*Instrução: Se a sua tarefa exigir conhecimento das regras de uma Skill acima, use sua ferramenta 'view_file' para ler o arquivo correspondente.*`);
    } else if (effectiveSkillIds.length > 0) {
      const skillsDir = path.join(projectRoot, '.skills');
      pointers.push(`\n[SKILLS ATIVAS]`);
      for (const sId of effectiveSkillIds) {
        const targetSkillPath = path.join(skillsDir, sId, 'SKILL.md');
        if (fs.existsSync(targetSkillPath)) {
          pointers.push(`- Skill ${sId}: ${targetSkillPath}`);
        } else {
          pointers.push(`- Skill ${sId}`);
        }
      }
    }

    // Memória, Wiki e Handoffs
    const memoryDir = path.join(projectRoot, '.ai-memory');
    if (fs.existsSync(memoryDir)) {
      pointers.push(`- Memória viva e histórico de decisões: ${memoryDir}`);
      const wikiDir = path.join(memoryDir, 'wiki');
      if (fs.existsSync(wikiDir)) {
        pointers.push(`- Base de Conhecimento Wiki: ${wikiDir} (contém subpastas decisions/, _rules/, concepts/, gotchas/, handoffs/)`);
        pointers.push(`*Dica de Agente: Use as ferramentas 'memory_wiki_search', 'memory_wiki_get' e 'memory_wiki_upsert' para consultar e atualizar a Wiki.*`);
      }
    }

    return pointers;
  }
}

export const contextPointerService = new ContextPointerService();
