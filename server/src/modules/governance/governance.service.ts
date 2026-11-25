import {
  CollaboratorInfo,
  GitHubPermission,
  GovernanceQuorumRules,
  BranchProtectionStatus,
  GovernanceAuditLogEntry,
  DepartmentConfig,
  SecretScanResult,
  OrganizationTeamInfo,
  OrganizationMemberInfo,
  RepoTeamInfo,
  OrgTeamMemberInfo,
  CreateOrgTeamPayload,
  OrgInvitePayload,
  EffectiveUserPermission,
  GovernanceActionWorkflowStatus,
} from "./governance.types.js";
import { governanceConfigService } from "./governance-config.service.js";
import { governanceCollaboratorsService } from "./governance-collaborators.service.js";
import { governanceRulesService } from "./governance-rules.service.js";
import { governanceTeamsService } from "./governance-teams.service.js";
import {
  governancePermissionsService,
  clearEffectivePermissionCache,
} from "./governance-permissions.service.js";

export { clearEffectivePermissionCache };
export { governanceConfigService, GovernanceConfigService } from "./governance-config.service.js";
export { governanceCollaboratorsService, GovernanceCollaboratorsService } from "./governance-collaborators.service.js";
export { governanceRulesService, GovernanceRulesService } from "./governance-rules.service.js";
export { governanceTeamsService, GovernanceTeamsService } from "./governance-teams.service.js";
export { governancePermissionsService, GovernancePermissionsService } from "./governance-permissions.service.js";

/**
 * GovernanceService Facade
 * Orquestra as operações de Governança, Regras de Proteção, Controle de Departamentos e Integrações GitHub
 * subdivididas em módulos coesos e especializados.
 */
export class GovernanceService {
  public readProjectConfig(repoName?: string): Record<string, any> {
    return governanceConfigService.readProjectConfig(repoName);
  }

  public writeProjectConfig(repoName: string | undefined, data: unknown): void {
    governanceConfigService.writeProjectConfig(repoName, data);
  }

  public logAudit(
    repoName: string | undefined,
    entry: Omit<GovernanceAuditLogEntry, "id" | "timestamp">,
  ): void {
    governanceConfigService.logAudit(repoName, entry);
  }

  async getAuditLogs(repoName?: string): Promise<GovernanceAuditLogEntry[]> {
    return governanceConfigService.getAuditLogs(repoName);
  }

  createSecureAIToken(payload: {
    user: string;
    folder?: string;
    repo?: string;
    ttlMinutes?: number;
  }): { token: string; expiresAt: string } {
    return governanceConfigService.createSecureAIToken(payload);
  }

  async getSecureContextForAI(payload: {
    filePath: string;
    token: string;
    repo?: string;
  }): Promise<{
    success: boolean;
    filePath: string;
    content?: string;
    error?: string;
  }> {
    return governanceConfigService.getSecureContextForAI(payload);
  }

  async getCollaborators(repoName?: string): Promise<{
    collaborators: CollaboratorInfo[];
    isSoloMode: boolean;
    activeCount: number;
    owner: string;
    resolvedFullName: string;
    githubAuthError?: string | null;
  }> {
    return governanceCollaboratorsService.getCollaborators(repoName);
  }

  async inviteCollaborator(payload: {
    repo?: string;
    username: string;
    permission: GitHubPermission;
    role?: string;
    role_name?: string;
    departments?: string[];
    allowed_paths?: string[];
    denied_paths?: string[];
  }): Promise<{
    success: boolean;
    message: string;
    collaborator: CollaboratorInfo;
  }> {
    return governanceCollaboratorsService.inviteCollaborator(payload);
  }

  async removeCollaborator(payload: {
    repo?: string;
    username: string;
  }): Promise<{ success: boolean; message: string }> {
    return governanceCollaboratorsService.removeCollaborator(payload);
  }

  async updateCollaboratorClearance(payload: {
    repo?: string;
    username: string;
    role?: string;
    role_name?: string;
    permission?: GitHubPermission;
    departments?: string[];
    allowed_paths?: string[];
    denied_paths?: string[];
  }): Promise<{ success: boolean; message: string }> {
    return governanceCollaboratorsService.updateCollaboratorClearance(payload);
  }

  handleFolderRename(
    oldFolderPath: string,
    newFolderPath: string,
    repoName?: string,
  ): void {
    governanceCollaboratorsService.handleFolderRename(oldFolderPath, newFolderPath, repoName);
  }

  async getDepartments(repoName?: string): Promise<DepartmentConfig[]> {
    return governanceCollaboratorsService.getDepartments(repoName);
  }

  async saveDepartments(
    departments: DepartmentConfig[],
    repoName?: string,
  ): Promise<{ success: boolean; departments: DepartmentConfig[] }> {
    return governanceCollaboratorsService.saveDepartments(departments, repoName);
  }

  async getBranchProtection(
    repoName?: string,
  ): Promise<BranchProtectionStatus> {
    return governanceRulesService.getBranchProtection(repoName);
  }

  async applyBranchProtection(payload: {
    repo?: string;
    min_approvals?: number;
    enforce_admins?: boolean;
    dismiss_stale_reviews?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    protection: BranchProtectionStatus;
  }> {
    return governanceRulesService.applyBranchProtection(payload);
  }

  async getQuorumRules(repoName?: string): Promise<{
    rules: GovernanceQuorumRules;
    isSoloMode: boolean;
    activeCollaboratorsCount: number;
    effectiveMinApprovals: number;
  }> {
    return governanceRulesService.getQuorumRules(repoName);
  }

  async updateQuorumRules(payload: {
    repo?: string;
    rules: Partial<GovernanceQuorumRules>;
  }): Promise<{ success: boolean; rules: GovernanceQuorumRules }> {
    return governanceRulesService.updateQuorumRules(payload);
  }

  async scanRepositorySecrets(repoName?: string): Promise<SecretScanResult> {
    return governanceRulesService.scanRepositorySecrets(repoName);
  }

  async getGovernanceWorkflowStatus(
    repoName?: string,
  ): Promise<GovernanceActionWorkflowStatus> {
    return governanceRulesService.getGovernanceWorkflowStatus(repoName);
  }

  async installGovernanceWorkflow(
    repoName?: string,
  ): Promise<{ success: boolean; message: string }> {
    return governanceRulesService.installGovernanceWorkflow(repoName);
  }

  async getOrgTeams(orgLogin: string): Promise<OrganizationTeamInfo[]> {
    return governanceTeamsService.getOrgTeams(orgLogin);
  }

  async getOrgMembers(orgLogin: string): Promise<OrganizationMemberInfo[]> {
    return governanceTeamsService.getOrgMembers(orgLogin);
  }

  async getRepoTeams(owner: string, repo: string): Promise<RepoTeamInfo[]> {
    return governanceTeamsService.getRepoTeams(owner, repo);
  }

  async addTeamToRepo(payload: {
    org: string;
    teamSlug: string;
    owner: string;
    repo: string;
    permission: string;
  }): Promise<{ success: boolean; message?: string }> {
    return governanceTeamsService.addTeamToRepo(payload);
  }

  async removeTeamFromRepo(payload: {
    org: string;
    teamSlug: string;
    owner: string;
    repo: string;
  }): Promise<{ success: boolean; message?: string }> {
    return governanceTeamsService.removeTeamFromRepo(payload);
  }

  async createOrgTeam(payload: CreateOrgTeamPayload): Promise<{
    success: boolean;
    team?: OrganizationTeamInfo;
    message?: string;
  }> {
    return governanceTeamsService.createOrgTeam(payload);
  }

  async deleteOrgTeam(
    org: string,
    teamSlug: string,
  ): Promise<{ success: boolean; message?: string }> {
    return governanceTeamsService.deleteOrgTeam(org, teamSlug);
  }

  async getOrgTeamMembers(
    org: string,
    teamSlug: string,
  ): Promise<OrgTeamMemberInfo[]> {
    return governanceTeamsService.getOrgTeamMembers(org, teamSlug);
  }

  async addMemberToOrgTeam(
    org: string,
    teamSlug: string,
    username: string,
    role: "member" | "maintainer" = "member",
  ): Promise<{ success: boolean; message?: string }> {
    return governanceTeamsService.addMemberToOrgTeam(org, teamSlug, username, role);
  }

  async removeMemberFromOrgTeam(
    org: string,
    teamSlug: string,
    username: string,
  ): Promise<{ success: boolean; message?: string }> {
    return governanceTeamsService.removeMemberFromOrgTeam(org, teamSlug, username);
  }

  async inviteOrgMember(
    payload: OrgInvitePayload,
  ): Promise<{ success: boolean; message: string }> {
    return governanceTeamsService.inviteOrgMember(payload);
  }

  async removeOrgMember(
    org: string,
    username: string,
  ): Promise<{ success: boolean; message: string }> {
    return governanceTeamsService.removeOrgMember(org, username);
  }

  async getEffectiveUserPermission(
    repoName?: string,
    orgLogin?: string,
  ): Promise<EffectiveUserPermission> {
    return governancePermissionsService.getEffectiveUserPermission(repoName, orgLogin);
  }

  clearCache(): void {
    governancePermissionsService.clearCache();
  }
}

export const governanceService = new GovernanceService();
