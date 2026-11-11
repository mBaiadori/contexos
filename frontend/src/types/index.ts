// Domain Types for Spec-Driven Context OS

export interface User {
  login: string;
  name: string;
  avatar_url?: string;
  role?: string;
  is_local?: boolean;
}

export interface RepoPermissions {
  admin: boolean;
  push: boolean;
  pull: boolean;
  maintain?: boolean;
  triage?: boolean;
}

export interface RepoDiagnosisCheckItem {
  exists: boolean;
  valid: boolean;
  path: string;
  label: string;
  details?: string;
}

export interface RepoDiagnosis {
  name: string;
  full_name: string;
  is_local: boolean;
  is_cloned_locally: boolean;
  is_owner: boolean;
  can_admin: boolean;
  checks: {
    project_config: RepoDiagnosisCheckItem;
    docs_metadata: RepoDiagnosisCheckItem;
    hidden_files: RepoDiagnosisCheckItem;
    codeowners: RepoDiagnosisCheckItem;
    dictionary: RepoDiagnosisCheckItem;
    templates: RepoDiagnosisCheckItem;
    spec_memory: RepoDiagnosisCheckItem;
    branch_protection: {
      supported: boolean;
      active: boolean;
      label: string;
      details?: string;
    };
  };
  is_ready: boolean;
  missing_essentials: string[];
}

export interface RepoInitializePayload {
  name: string;
  preset?: 'recommended' | 'custom' | 'minimal';
  project_config?: {
    name?: string;
    description?: string;
    categories?: Array<{ id: string; label: string; color?: string; description?: string }>;
    tags?: Array<{ id: string; label: string; color?: string }>;
    statuses?: Array<{ id: string; label: string; color?: string }>;
    badges?: Array<{ id: string; label: string; color?: string }>;
    governance_rules?: { min_approvals_default: number };
  };
  security?: {
    enable_branch_protection?: boolean;
    required_approvals?: number;
    create_codeowners?: boolean;
  };
  folders?: string[];
  include_spec_memory?: boolean;
}

export interface Repo {
  id?: string | number;
  name: string;
  full_name?: string;
  html_url?: string;
  owner?: string;
  owner_type?: 'User' | 'Organization';
  is_owner?: boolean;
  is_org?: boolean;
  is_fork?: boolean;
  is_local?: boolean;
  is_cloned_locally?: boolean;
  is_private?: boolean;
  private?: boolean;
  default_branch?: string;
  description?: string;
  stars?: number;
  forks?: number;
  updated_at?: string;
  permissions?: RepoPermissions;
  has_access?: boolean;
  is_locked?: boolean;
  is_pending_invitation?: boolean;
  invitation_id?: number;
  inviter?: string;
}

export interface RepoInvitation {
  id: number;
  type: 'repository';
  repo_name: string;
  full_name: string;
  owner: string;
  inviter: string;
  permissions: string;
  created_at: string;
  html_url: string;
}

export interface OrgInvitation {
  id: number;
  type: 'org';
  org_login: string;
  org_name: string;
  avatar_url?: string;
  role: string;
  state: string;
}

export interface PendingInvitationsResult {
  repository_invitations: RepoInvitation[];
  org_invitations: OrgInvitation[];
  total: number;
}

export interface SavedAccount {
  id: string;
  user: User;
  git_provider: 'github' | 'local' | string;
  git_provider_url?: string;
  orgs?: any[];
  is_active: boolean;
  last_active?: string;
}

export interface WorkspaceStatus {
  version?: string;
  authenticated: boolean;
  user: User | null;
  active_repo: Repo | null;
  git_provider?: string;
  git_provider_url?: string;
  accounts?: SavedAccount[];
  pending_changes_count: number;
  ai_settings: {
    provider: string;
    model: string;
    has_key: boolean;
    custom_endpoint: string;
  };
}

export interface WorkspaceChange {
  path: string;
  old_content?: string;
  new_content?: string;
  additions?: number;
  deletions?: number;
  type?: 'MODIFIED' | 'ADDED' | 'DELETED';
  guardrail?: string;
  diff?: string;
  diff_text?: string;
  timestamp?: string;
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'dir' | string;
  children?: TreeNode[];
  title?: string;
  is_directory?: boolean;
  status?: string;
  badge?: string;
  desc?: string;
  department?: string;
}

export interface DocumentMetadataItem {
  id: string;
  name: string;
  title?: string;
  ext: string;
  path: string;
  status: string;
  categories: string;
  category?: string;
  tags: string[];
  updated_at: string;
  approvers: string[];
  links: string[];
  templateId: string;
  prompt?: string;
  department?: string;
  [key: string]: any;
}

export interface TaxonomyItem {
  id?: string;
  name: string;
  label?: string;
  color: string;
  description?: string;
}

export type CategoryOption = string | TaxonomyItem;
export type TagOption = string | TaxonomyItem;

export interface StatusItem {
  name?: string;
  color?: string;
  key?: string;
  label?: string;
  badge?: string;
}

export interface BadgeOption {
  name: string;
  color?: string;
  description?: string;
}

export interface DepartmentConfig {
  id: string;
  name: string;
  folder: string;
  color: string;
  icon?: string;
  description?: string;
}

export interface CollaboratorInfo {
  login: string;
  name?: string;
  id: number;
  avatar_url: string;
  html_url: string;
  permission: 'pull' | 'triage' | 'push' | 'maintain' | 'admin' | string;
  role?: string;
  role_name?: string;
  departments?: string[];
  allowed_paths?: string[];
  denied_paths?: string[];
  is_owner?: boolean;
  invited_at?: string;
  status?: 'active' | 'pending';
}

export interface OrganizationTeamInfo {
  id: number;
  slug: string;
  name: string;
  description?: string;
  permission?: 'pull' | 'triage' | 'push' | 'maintain' | 'admin' | string;
  members_count?: number;
  privacy?: string;
}

export interface OrganizationMemberInfo {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
  role?: 'admin' | 'member' | string;
}

export interface RepoTeamInfo {
  id: number;
  slug: string;
  name: string;
  description?: string;
  members_count?: number;
  permission: 'pull' | 'triage' | 'push' | 'maintain' | 'admin' | string;
  permissions?: {
    pull?: boolean;
    triage?: boolean;
    push?: boolean;
    maintain?: boolean;
    admin?: boolean;
  };
}

export interface OrgTeamMemberInfo {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
  role: 'member' | 'maintainer' | string;
}

export interface CreateOrgTeamPayload {
  org: string;
  name: string;
  description?: string;
  privacy?: 'closed' | 'secret';
}

export interface OrgInvitePayload {
  org: string;
  username?: string;
  email?: string;
  role?: 'admin' | 'direct_member' | 'billing_manager';
  team_ids?: number[];
}

export interface EffectiveUserPermission {
  login: string;
  isOrgOwner: boolean;
  isOrgMember: boolean;
  isOutsideCollaborator: boolean;
  repoPermission: 'admin' | 'maintain' | 'push' | 'triage' | 'pull' | 'none';
  roleName: string;
  allowedActions: {
    canRead: boolean;
    canWrite: boolean;
    canTriage: boolean;
    canMaintain: boolean;
    canAdmin: boolean;
    canManageGovernance: boolean;
    canManageTeams: boolean;
    canDeleteRepo: boolean;
    canManageBranchProtection: boolean;
  };
  teamMemberships: string[];
}

export interface GovernanceActionWorkflowStatus {
  installed: boolean;
  path: string;
  content?: string;
}


export interface ProjectMetadataOptions {
  categories: CategoryOption[];
  statuses: StatusItem[];
  tags: TagOption[];
  badges?: (BadgeOption | string)[];
  departments?: DepartmentConfig[];
}

export interface PRApproval {
  user: string;
  role?: string;
  timestamp: string;
  commit_hash?: string;
  status: 'APPROVED' | 'CHANGES_REQUESTED' | 'INVALIDATED';
  comment?: string;
  invalidated_at?: string;
  invalidated_by_commit?: string;
}

export interface MergeabilityResult {
  mergeable: boolean;
  behind_by: number;
  ahead_by: number;
  conflicts: Array<{ path: string; is_encrypted: boolean }>;
}

export interface ConflictBundle {
  filePath: string;
  base: string;
  ours: string;
  theirs: string;
  merged: string;
  hasConflicts: boolean;
  conflictCount: number;
}

export interface PR {
  id: number | string;
  repo_name?: string;
  repo_full_name?: string;
  github_id?: number;
  github_number?: number;
  title: string;
  description: string;
  file_path?: string;
  changes?: WorkspaceChange[];
  files?: Array<{
    path: string;
    type?: string;
    additions?: number;
    deletions?: number;
    restricted?: boolean;
    diff_text?: string;
    old_content?: string;
    new_content?: string;
  }>;
  branch: string;
  target_branch?: string;
  head_sha?: string;
  base_sha?: string;
  author: string;
  status: 'OPEN' | 'MERGED' | 'CLOSED' | 'open' | 'merged' | 'closed' | string;
  approvals: (string | PRApproval)[];
  min_approvals?: number;
  is_solo_mode?: boolean;
  created_at: string;
  merged_at?: string;
  closed_at?: string;
  rejection_reason?: string;
  type?: string;
  layer?: string;
  domain?: string;
  html_url?: string;
  is_direct_commit?: boolean;
  commit_hash?: string;
  short_id?: string;
  history?: Array<{
    action: string;
    actor: string;
    timestamp: string;
    file?: string;
    commit?: string;
  }>;
}

export interface ADR {
  id: string;
  title: string;
  status: 'PROPOSED' | 'ACCEPTED' | 'SUPERSEDED' | 'DEPRECATED';
  date?: string;
  context?: string;
  decision?: string;
  consequences?: string;
  author?: string;
  path?: string;
}

export interface DictionaryTerm {
  id?: string;
  term: string;
  codename: string;
  code_name?: string;
  definition: string;
  domain?: string;
  category?: string;
  context?: string;
  synonyms?: string[];
  aliases?: string[];
}

export interface AIProviderMeta {
  id: string;
  name: string;
  model: string;
  has_key: boolean;
  custom_endpoint: string;
  needs_key: boolean;
  has_endpoint: boolean;
  configured: boolean;
  is_active: boolean;
}

export interface AISettingsState {
  active_provider: string;
  active_model: string;
  provider?: string;
  model?: string;
  has_key?: boolean;
  custom_endpoint?: string;
  providers?: Record<string, AIProviderMeta>;
  default_provider?: string;
  antigravity_cli_path?: string;
  claude_cli_path?: string;
  agent_effort?: 'low' | 'medium' | 'high';
  agent_model?: string;
}

export interface TemplateItem {
  id: string;
  templateName?: string;
  title: string;
  ext?: string;
  category: string;
  description?: string;
  tags?: string[];
  badge?: string;
  filename?: string;
  content: string;
  prompt: string;
  systemPrompt?: string;
  path?: string;
  source?: 'local' | 'community' | string;
  icon?: string;
  installed?: boolean;
  skills?: string[];
  assistant?: string;
  assistant_prompt?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface TutorialItem {
  id: string;
  title: string;
  badge: string;
  category?: string;
  content: string;
}

export interface RawTurnMetrics {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  is_estimated?: boolean;
  cost_usd: number;
  pricing_formula?: string;
  duration_ms?: number;
}

export interface RawTurnTelemetry {
  turn_id: string;
  turn_index: number;
  session_id: string;
  timestamp: string;
  duration_ms?: number;
  provider: string;
  model: string;
  raw_mode: boolean;
  skill_id?: string;
  request: {
    prompt: string;
    system_prompt?: string;
    context_files?: Array<{ path: string; size?: number; snippet?: string }>;
    dynamic_context?: string;
    history_messages?: Array<{ role?: string; sender?: string; content?: string; text?: string }>;
    tools_schema?: any[];
    full_payload?: any;
  };
  response: {
    reply: string;
    tool_calls?: ToolCallRecord[];
    stream_events?: any[];
    finish_reason?: string;
    raw_response?: any;
  };
  metrics: RawTurnMetrics;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  diff?: {
    path: string;
    old_content: string;
    new_content: string;
    rationale?: string;
  };
  contextBadges?: string[];
  isStreaming?: boolean;
  tool_calls?: ToolCallRecord[];
  skill_id?: string;
  steps_count?: number;
  raw_turn_id?: string;
  turn_index?: number;
  metrics?: RawTurnMetrics;
}

export interface GitFileStatus {
  path: string;
  status: 'M' | 'A' | 'D' | 'U' | 'R' | 'C' | '??';
  staged: boolean;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string;
  tracking?: string;
  ahead: number;
  behind: number;
  isClean: boolean;
  files: GitFileStatus[];
  systemFiles?: GitFileStatus[];
  remoteUrl?: string;
  repo_name?: string;
}

export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
}

export interface VersionProposalInfo {
  id: number | string;
  title: string;
  description?: string;
  status: 'OPEN' | 'MERGED' | 'CLOSED' | 'REJECTED';
  author: string;
  created_at: string;
  approvals_count: number;
}

export interface VersionNode {
  name: string;
  displayName?: string;
  parentDisplayName?: string;
  isCurrent: boolean;
  isDefault: boolean;
  type: 'main' | 'proposal' | 'draft';
  parentBranch?: string;
  proposal?: VersionProposalInfo;
  lastCommit?: {
    hash: string;
    shortHash: string;
    author: string;
    date: string;
    message: string;
  };
  ahead: number;
  behind: number;
  isMerged?: boolean;
  mergedDate?: string;
  mergeCommitHash?: string;
  commits?: GitCommitInfo[];
  baseHash?: string;
  baseDate?: string;
  hasStash?: boolean;
  stashes?: Array<{ id: string; message: string; date: string }>;
  uncommittedFiles?: GitFileStatus[];
}

export interface VersionGraphData {
  repo: string;
  defaultBranch: string;
  currentBranch: string;
  stashes?: Array<{ id: string; message: string; date: string }>;
  mainCommits?: GitCommitInfo[];
  nodes: VersionNode[];
}

export interface SafeSwitchResult {
  success?: boolean;
  canSwitch?: boolean;
  hasUncommitted?: boolean;
  changedCount?: number;
  files?: GitFileStatus[];
  currentBranch?: string;
  targetBranch?: string;
  targetCommit?: string;
  branch?: string;
  commitHash?: string;
  message?: string;
  error?: string;
  stashed?: boolean;
  discarded?: boolean;
}

export interface StashDetails {
  id: string;
  message: string;
  date: string;
  fromBranch: string;
  targetBranch?: string;
  fileCount: number;
  files: Array<{
    path: string;
    additions: number;
    deletions: number;
  }>;
}

export interface DiscardedDraftItem {
  id: string;
  discardedAt: string;
  fromBranch: string;
  source: "stash" | "workspace" | "safe_switch";
  message?: string;
  fileCount: number;
  files: Array<{
    path: string;
    additions?: number;
    deletions?: number;
    status?: string;
  }>;
  patch?: string;
  summary?: string;
}

export interface ConflictingProposal {
  id: number | string;
  title: string;
  branch: string;
  author?: string;
  matchingFiles: string[];
}

export interface WhatsNewItem {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
}

export interface WhatsNewFile {
  path: string;
  status: 'A' | 'M' | 'D';
  statusLabel: string;
  additions: number;
  deletions: number;
  repo_name?: string;
  repoName?: string;
}

export interface WhatsNewProposal {
  id: string | number;
  title: string;
  author?: string;
  commitHash?: string;
  status?: string;
  repo_name?: string;
  repoName?: string;
}

export interface WhatsNewSummary {
  hasNewUpdates: boolean;
  latestHash: string;
  lastSeenHash?: string;
  totalNewCommits: number;
  commits: WhatsNewItem[];
  files: WhatsNewFile[];
  proposals: WhatsNewProposal[];
  summaryMessage: string;
}

export interface SkillItem {
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
  content?: string;
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

export interface ToolCallRecord {
  tool: string;
  args: Record<string, any>;
  result: {
    success: boolean;
    data?: any;
    error?: string;
    message?: string;
  };
  timestamp: string;
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

export interface ToolItem {
  name: string;
  description: string;
  parameters: any;
}

export interface CustomToolItem {
  id: string;
  name: string;
  title: string;
  description: string;
  category?: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  handler_type: 'javascript' | 'http' | 'shell';
  handler_code?: string;
  handler_config?: {
    url?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    command?: string;
  };
  is_active?: boolean;
  source?: 'project' | 'global';
  created_at?: string;
  updated_at?: string;
}

export interface CommunityToolItem {
  id: string;
  name: string;
  title: string;
  description: string;
  category: string;
  server_id?: string;
  server_name?: string;
  parameters?: any;
  source: 'community';
  author?: string;
  license?: string;
  icon?: string;
  command_snippet?: string;
}

// Translations & SSOT Types
export interface SupportedLanguage {
  code: string;
  label: string;
  flag: string;
}

export interface DocumentTranslationItem {
  lang: string;
  langLabel: string;
  langFlag: string;
  filePath: string;
  translationPath: string;
  lastModified: number;
  sourceLastModified: number;
  isOutdated: boolean;
  isMain: boolean;
}

export interface TranslationEngineInfo {
  id: string;
  name: string;
  description: string;
  isLocal: boolean;
}

export interface DocumentTranslationsResponse {
  defaultLanguage: string;
  supportedLanguages: SupportedLanguage[];
  translations: DocumentTranslationItem[];
}

export interface DocumentTranslationFileResponse {
  path: string;
  lang: string;
  content: string;
  isMain: boolean;
  isOutdated: boolean;
  lastModified: number;
}

export interface SyncToMainPreview {
  filePath: string;
  targetLang: string;
  sourceLang: string;
  originalMainContent: string;
  translatedToMainContent: string;
  summary: string;
}

export interface Organization {
  login: string;
  full_name?: string;
  avatar_url?: string;
  description?: string;
  is_owner?: boolean;
  is_personal?: boolean;
  role?: 'admin' | 'member';
  public_repos?: number;
  total_private_repos?: number;
}

export interface OrgTeam {
  id: number | string;
  name: string;
  slug: string;
  description?: string;
  privacy?: 'closed' | 'secret';
  permission?: 'pull' | 'triage' | 'push' | 'maintain' | 'admin';
  members_count?: number;
  repos_count?: number;
  repos?: string[];
}
