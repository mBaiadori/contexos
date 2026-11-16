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
  preset?: "recommended" | "custom" | "minimal";
  project_config?: {
    name?: string;
    description?: string;
    categories?: Array<{
      id: string;
      label: string;
      color?: string;
      description?: string;
    }>;
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
