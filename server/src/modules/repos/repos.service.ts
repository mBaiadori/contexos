import type {
  RepoDiagnosisCheckItem,
  RepoDiagnosis,
  RepoInitializePayload,
} from "./repos-types.js";
import {
  clearReposCache,
  ReposQueryService,
  reposQueryService,
} from "./repos-query.service.js";
import {
  ReposDiagnosisService,
  reposDiagnosisService,
} from "./repos-diagnosis.service.js";
import {
  ReposLifecycleService,
  reposLifecycleService,
} from "./repos-lifecycle.service.js";

export type { RepoDiagnosisCheckItem, RepoDiagnosis, RepoInitializePayload };
export {
  clearReposCache,
  ReposQueryService,
  reposQueryService,
  ReposDiagnosisService,
  reposDiagnosisService,
  ReposLifecycleService,
  reposLifecycleService,
};

/**
 * ReposService (Facade)
 * Mantém 100% de retrocompatibilidade com todas as rotas e módulos consumidores,
 * delegando responsabilidades para os serviços especializados de Query, Diagnóstico e Ciclo de Vida.
 */
export class ReposService {
  async listRepos(targetOrg?: string) {
    return reposQueryService.listRepos(targetOrg);
  }

  async diagnoseRepo(
    repoName: string,
    ownerOrOrg?: string,
    checkRemote: boolean = false,
  ): Promise<RepoDiagnosis> {
    return reposDiagnosisService.diagnoseRepo(repoName, ownerOrOrg, checkRemote);
  }

  async selectRepo(repo: Parameters<ReposLifecycleService['selectRepo']>[0]) {
    return reposLifecycleService.selectRepo(repo);
  }

  async cloneLocalRepo(payload: { name: string; owner?: string }) {
    return reposLifecycleService.cloneLocalRepo(payload);
  }

  async createRepo(payload: {
    name: string;
    owner?: string;
    description?: string;
    is_private?: boolean;
    enable_protection?: boolean;
    required_approvals?: number;
    auto_initialize?: boolean;
    initialTeams?: Array<{ slug: string; permission?: string }>;
    initialCollaborators?: Array<{ username: string; permission?: string }>;
  }) {
    return reposLifecycleService.createRepo(payload);
  }

  async initializeRepo(payload: RepoInitializePayload) {
    return reposLifecycleService.initializeRepo(payload);
  }

  async deleteRepo(payload: {
    name: string;
    owner?: string;
    delete_remote?: boolean;
    delete_local?: boolean;
  }) {
    return reposLifecycleService.deleteRepo(payload);
  }

  async updateRepo(payload: {
    current_name: string;
    new_name?: string;
    description?: string;
    is_private?: boolean;
    owner?: string;
  }) {
    return reposLifecycleService.updateRepo(payload);
  }

  async cloneRepo(payload: {
    source_name: string;
    new_name: string;
    owner?: string;
    description?: string;
    is_private?: boolean;
  }) {
    return reposLifecycleService.cloneRepo(payload);
  }

  async listOrgs() {
    return reposQueryService.listOrgs();
  }

  async createOrg(payload: {
    username: string;
    full_name?: string;
    description?: string;
    visibility?: string;
  }) {
    return reposQueryService.createOrg(payload);
  }
}

export const reposService = new ReposService();
