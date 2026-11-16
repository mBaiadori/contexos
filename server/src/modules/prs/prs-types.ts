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
