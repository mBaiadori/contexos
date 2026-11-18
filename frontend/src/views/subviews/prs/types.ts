import type { PR } from "../../../types";

export interface PRsSubViewProps {
  onOpenDiffModal?: () => void;
}

export type PRStatusFilter = "all" | "open" | "merged" | "closed";

export interface MergeabilityInfo {
  mergeable: boolean;
  behind_by: number;
  ahead_by: number;
  conflicts: Array<{ path: string; is_encrypted: boolean }>;
}

export interface PRFileDiffData {
  diff?: string;
  old_content?: string;
  new_content?: string;
  restricted?: boolean;
  error?: string;
}

export interface ActionLoadingState {
  id: number | string;
  action: "merge" | "reject" | "rollback";
}

export interface ActionFeedbackState {
  id: number | string;
  message: string;
  type: "success" | "error";
}

export interface ActiveConflictPR {
  pr: PR;
  filePath: string;
  bundle: any;
}
