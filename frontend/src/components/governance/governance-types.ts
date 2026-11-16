export interface SelectedGovernanceTeam {
  slug: string;
  name: string;
  permission: "pull" | "triage" | "push" | "maintain" | "admin" | string;
  members_count?: number;
}

export interface SelectedGovernanceMember {
  username: string;
  name?: string;
  avatar_url?: string;
  permission: "pull" | "triage" | "push" | "maintain" | "admin" | string;
  role?: string;
  is_owner?: boolean;
  status?: "active" | "pending" | string;
}

export interface AccessGovernanceManagerProps {
  /** Organização alvo para sincronizar times e membros */
  orgLogin: string;
  /** Nome do repositório (opcional para modo direto/live) */
  repoName?: string;
  /** Modo: 'org' (gerenciamento global da org), 'repo' (gerenciamento de acesso ao repo) ou 'form' (criando repo) */
  mode?: "org" | "repo" | "form" | "live";
  /** Estado de times selecionados (modo form) */
  selectedTeams?: SelectedGovernanceTeam[];
  /** Callback para alteração de times (modo form) */
  onChangeTeams?: (teams: SelectedGovernanceTeam[]) => void;
  /** Estado de membros selecionados (modo form) */
  selectedMembers?: SelectedGovernanceMember[];
  /** Callback para alteração de membros (modo form) */
  onChangeMembers?: (members: SelectedGovernanceMember[]) => void;
  /** Estilo de layout compacto para modais */
  compact?: boolean;
}

export interface PermissionOption {
  id: string;
  label: string;
  description: string;
  color: string;
  bg: string;
}

export const PERMISSION_OPTIONS: PermissionOption[] = [
  {
    id: "pull",
    label: "Leitura",
    description: "Visualizar e ler documentos do projeto",
    color: "#0284c7", // Sky
    bg: "rgba(2, 132, 199, 0.12)",
  },
  {
    id: "triage",
    label: "Triagem",
    description: "Criar tarefas, apontar pendências e gerenciar discussões",
    color: "#0d9488", // Teal
    bg: "rgba(13, 148, 136, 0.12)",
  },
  {
    id: "push",
    label: "Edição e Escrita",
    description: "Criar rascunhos, editar documentos e propor alterações",
    color: "#10b981", // Emerald
    bg: "rgba(16, 185, 129, 0.12)",
  },
  {
    id: "maintain",
    label: "Coordenação",
    description: "Revisar, aprovar e integrar propostas à versão oficial",
    color: "#8b5cf6", // Indigo / Purple
    bg: "rgba(139, 92, 246, 0.12)",
  },
  {
    id: "admin",
    label: "Administração",
    description: "Acesso total, governança e configurações do repositório",
    color: "#ec4899", // Rose / Pink
    bg: "rgba(236, 72, 153, 0.12)",
  },
];
