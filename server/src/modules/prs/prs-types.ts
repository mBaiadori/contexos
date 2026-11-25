export interface PRApprovalAudit {
  user: string;
  role?: string;
  timestamp: string;
  commit_hash?: string;
  status: "APPROVED" | "INVALIDATED" | "CHANGES_REQUESTED";
  comment?: string;
  invalidated_at?: string;
  invalidated_by_commit?: string;
}

export interface PRFileItem {
  path: string;
  type?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  restricted?: boolean;
  is_encrypted?: boolean;
  old_content?: string;
  new_content?: string;
  diff_text?: string;
}

export interface PRHistoryItem {
  type: string;
  actor: string;
  file?: string;
  commit?: string;
  timestamp: string;
  comment?: string;
  [key: string]: unknown;
}

export interface PRRecord {
  id: number | string;
  short_id?: string;
  github_id?: number | string;
  github_number?: number;
  repo_name?: string;
  title: string;
  description?: string;
  branch: string;
  target_branch?: string;
  base_sha?: string;
  head_sha?: string;
  commit_hash?: string;
  merge_commit?: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  merged_at?: string;
  closed_at?: string;
  author?: string;
  min_approvals?: number;
  approvals?: Array<PRApprovalAudit | string>;
  history?: PRHistoryItem[];
  type?: string;
  layer?: string;
  domain?: string;
  squash?: boolean;
  files?: PRFileItem[];
  html_url?: string;
  is_commit_revision?: boolean;
  rejection_reason?: string;
  rejected_by?: string;
  [key: string]: unknown;
}
