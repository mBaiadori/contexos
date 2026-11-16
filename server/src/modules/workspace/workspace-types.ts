export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
  title?: string;
  categories?: string;
  category?: string;
  status?: string;
  last_modified?: number;
}
