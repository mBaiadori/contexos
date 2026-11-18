export type TabType = "drafts";

export interface DraftItem {
  path: string;
  repoName: string;
  status?: string;
  type?: string;
  additions?: number;
  deletions?: number;
  diff_text?: string;
  old_content?: string;
  new_content?: string;
}

export interface VersionsSubViewProps {
  onOpenFile?: (path: string) => void;
  onOpenDiffModal?: () => void;
}
