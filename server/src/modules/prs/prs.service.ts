import type { PRApprovalAudit } from "./prs-types.js";
import { prsStorageService } from "./prs-storage.service.js";
import type { PRRecord } from "./prs-types.js";
import { prsQueryService } from "./prs-query.service.js";
import { prsSummaryService } from "./prs-summary.service.js";
import { prsLifecycleService } from "./prs-lifecycle.service.js";

export type { PRApprovalAudit } from "./prs-types.js";
export { prsStorageService, PRsStorageService } from "./prs-storage.service.js";
export { prsQueryService, PRsQueryService } from "./prs-query.service.js";
export { prsSummaryService, PRsSummaryService } from "./prs-summary.service.js";
export { prsLifecycleService, PRsLifecycleService } from "./prs-lifecycle.service.js";

/**
 * PRsService Facade
 * Orquestra as operações de Pull Requests e propostas de versão divididas em submódulos especializados:
 * - PRsStorageService: Localização, leitura e persistência de PRs em disco (.prs.json)
 * - PRsQueryService: Consultas, paginação, sincronização GitHub, permissões e diffs
 * - PRsSummaryService: Geração de resumos com IA / heurística e análise de conflitos
 * - PRsLifecycleService: Ciclo de vida (criação, edição, aprovação, quorum, merge, rejeição e rollback)
 */
export class PRsService {
  getRepoDir(repoName?: string): string {
    return prsStorageService.getRepoDir(repoName);
  }

  getAllLocalRepos(): Array<{ name: string; owner?: string; dir: string }> {
    return prsStorageService.getAllLocalRepos();
  }

  findPRAcrossRepos(
    prId: number | string,
    preferredRepo?: string,
  ): { pr: PRRecord; repoName: string; prs: PRRecord[] } | null {
    return prsStorageService.findPRAcrossRepos(prId, preferredRepo);
  }

  getRepoPRsPath(repoName: string): string {
    return prsStorageService.getRepoPRsPath(repoName);
  }

  loadRepoPRs(repoName: string): PRRecord[] {
    return prsStorageService.loadRepoPRs(repoName);
  }

  saveRepoPRs(repoName: string, prs: Array<Partial<PRRecord>>): void {
    prsStorageService.saveRepoPRs(repoName, prs);
  }

  async getPRs(
    targetRepoQuery?: string,
    userLogin?: string,
    paginationOptions?: {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
    },
  ) {
    return prsQueryService.getPRs(targetRepoQuery, userLogin, paginationOptions);
  }

  async getPRFileDiff(
    repoName: string,
    filePath: string,
    commitHash?: string,
    prId?: string | number,
    userLogin?: string,
  ) {
    return prsQueryService.getPRFileDiff(repoName, filePath, commitHash, prId, userLogin);
  }

  async getPRFileContent(
    repoName: string,
    prId: number | string,
    filePath: string,
    userLogin?: string,
  ) {
    return prsQueryService.getPRFileContent(repoName, prId, filePath, userLogin);
  }

  parseDiffInsights(diffText: string) {
    return prsSummaryService.parseDiffInsights(diffText);
  }

  async generatePRSummary(repoNameQuery?: string) {
    return prsSummaryService.generatePRSummary(repoNameQuery);
  }

  async checkConflictingProposals(
    repoNameParam?: string,
    filesToCheck?: string[],
  ) {
    return prsSummaryService.checkConflictingProposals(repoNameParam, filesToCheck);
  }

  afterPRHeadChanged(
    repoName: string,
    pr: PRRecord,
    ctx: { actor: string; file?: string; newHead?: string },
  ): void {
    prsLifecycleService.afterPRHeadChanged(repoName, pr, ctx);
  }

  async createPR(payload: {
    title: string;
    description: string;
    branch?: string;
    sourceBranch?: string;
    squash?: boolean;
    type?: string;
    layer?: string;
    domain?: string;
    repo?: string;
    targetProposalId?: number | string;
  }) {
    return prsLifecycleService.createPR(payload);
  }

  async approvePR(
    prId: number | string,
    payloadOrApprover?:
      | string
      | { approver?: string; role?: string; comment?: string; repo?: string },
  ) {
    return prsLifecycleService.approvePR(prId, payloadOrApprover);
  }

  async editPRFile(
    payload: {
      id: number | string;
      filePath: string;
      content: string;
      base_sha?: string;
      expectedBaseSha?: string;
      commitMessage?: string;
      author?: string;
      repo?: string;
    },
    userLogin?: string,
  ) {
    return prsLifecycleService.editPRFile(payload, userLogin);
  }

  async mergePR(prId: number | string, repoNameParam?: string) {
    return prsLifecycleService.mergePR(prId, repoNameParam);
  }

  async rejectPR(
    prId: number | string,
    reason?: string,
    repoNameParam?: string,
  ) {
    return prsLifecycleService.rejectPR(prId, reason, repoNameParam);
  }

  async rollbackRevision(payload: {
    id?: string | number;
    commit_hash?: string;
    repo?: string;
  }) {
    return prsLifecycleService.rollbackRevision(payload);
  }
}

export const prsService = new PRsService();
