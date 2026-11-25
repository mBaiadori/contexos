import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { API } from '../services/api';
import { useWorkspace } from './WorkspaceContext';
import { useAuth } from './AuthContext';
import type { DepartmentConfig, TreeNode } from '../types';

export const DEFAULT_DEPARTMENTS: DepartmentConfig[] = [];

export interface VaultFolderItem {
  id: string;
  name: string;
  folder: string;
  color: string;
  icon?: string;
  fileCount: number;
  authorizedMembers: string[];
  hasAccess: boolean;
}

export interface UserVaultAccess {
  login: string;
  status: 'active' | 'pending';
  isOwner: boolean;
  folders: VaultFolderItem[];
}

interface SecurityContextType {
  departments: DepartmentConfig[];
  myAccess: UserVaultAccess | null;
  activeAIToken: { token: string; expires_at: string } | null;
  hasFolderAccess: (folderName: string) => boolean;
  canAccessDoc: (doc: { department?: string; path?: string }) => boolean;
  grantFolderAccess: (user: string, folders: string[]) => Promise<{ success: boolean; message?: string; error?: string }>;
  revokeFolderAccess: (user: string, folders: string[]) => Promise<{ success: boolean; message?: string; error?: string }>;
  generateAIToken: (ttlMinutes?: number) => Promise<{ success: boolean; token?: string; error?: string }>;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeRepo, projectConfig, projectMetaOptions, tree } = useWorkspace();
  const currentRepoName = activeRepo?.name;
  const { user } = useAuth();

  const [activeAIToken, setActiveAIToken] = useState<{ token: string; expires_at: string } | null>(null);

  const departments = useMemo<DepartmentConfig[]>(() => {
    if (projectConfig?.departments && Array.isArray(projectConfig.departments) && projectConfig.departments.length > 0) {
      return projectConfig.departments;
    }
    if (projectMetaOptions?.departments && Array.isArray(projectMetaOptions.departments) && projectMetaOptions.departments.length > 0) {
      return projectMetaOptions.departments;
    }

    // Extrai pastas dinâmicas da árvore de arquivos do workspace
    const dynamicFolders: DepartmentConfig[] = [];
    const colors = ['#6366f1', '#10b981', '#a855f7', '#ec4899', '#f59e0b', '#06b6d4', '#3b82f6'];
    let colorIdx = 0;

    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes || []) {
        if (node.type === 'directory' || (node.children && node.children.length > 0)) {
          const clean = (node.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
          if (!clean) continue;
          if (!dynamicFolders.some((d) => d.folder === clean || d.id === clean.toLowerCase())) {
            dynamicFolders.push({
              id: clean.toLowerCase(),
              name: node.name || clean.split('/').pop() || clean,
              folder: clean,
              color: colors[colorIdx % colors.length],
              icon: 'folder',
            });
            colorIdx++;
          }
        }
      }
    };
    walk(tree || []);

    return dynamicFolders;
  }, [projectConfig?.departments, projectMetaOptions?.departments, tree]);

  const myAccess = useMemo<UserVaultAccess>(() => {
    const cleanLogin = (user?.login || 'local_user').toLowerCase().replace(/^@/, '');
    const isOwner = Boolean(
      (activeRepo?.owner && activeRepo.owner.toLowerCase() === cleanLogin) ||
      !activeRepo ||
      activeRepo.is_local
    );
    const collabs = (projectConfig?.governance_collaborators || {}) as Record<
      string,
      { departments?: string[]; allowed_paths?: string[] }
    >;
    const userMeta = Object.entries(collabs).find(([k]) => k.toLowerCase() === cleanLogin)?.[1];
    const userDepts: string[] = isOwner ? ['*'] : (userMeta?.departments || ['*']);

    return {
      login: cleanLogin,
      status: 'active',
      isOwner,
      folders: departments.map((d) => ({
        id: d.id,
        name: d.name,
        folder: d.folder,
        color: d.color,
        icon: d.icon,
        fileCount: 0,
        authorizedMembers: [],
        hasAccess: isOwner || userDepts.includes('*') || userDepts.includes(d.id) || userDepts.includes(d.folder.toLowerCase()),
      })),
    };
  }, [user?.login, activeRepo, projectConfig?.governance_collaborators, departments]);

  /**
   * Verifica se o usuário atual tem acesso à pasta segura/departamento
   */
  const hasFolderAccess = useCallback(
    (folderName: string): boolean => {
      if (!folderName || folderName === 'public' || folderName === 'docs/public') return true;
      if (myAccess?.isOwner) return true;
      const cleanFolder = folderName.replace(/\\/g, '/').replace(/^\/+/, '').split('/')[0].toLowerCase();
      const folderItem = myAccess?.folders?.find(
        (f) => f.folder.toLowerCase() === cleanFolder || f.id.toLowerCase() === cleanFolder
      );
      if (folderItem) {
        return folderItem.hasAccess;
      }
      return true;
    },
    [myAccess]
  );

  const userAllowedPaths = useMemo(() => {
    const userLogin = user?.login?.toLowerCase();
    if (!userLogin) return null;
    const collabs = (projectConfig?.governance_collaborators || {}) as Record<
      string,
      { departments?: string[]; allowed_paths?: string[] }
    >;
    const userMeta = Object.entries(collabs).find(([k]) => k.toLowerCase() === userLogin)?.[1];
    if (userMeta?.allowed_paths && Array.isArray(userMeta.allowed_paths)) {
      if (!userMeta.allowed_paths.includes('*') && !userMeta.allowed_paths.includes('/**')) {
        return userMeta.allowed_paths.map((pattern: string) =>
          pattern.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/\*+$/, '').toLowerCase()
        );
      }
    }
    return null;
  }, [user?.login, projectConfig?.governance_collaborators]);

  /**
   * Avalia autorização de acesso ao documento com base em departamento e rotas de governança
   */
  const canAccessDoc = useCallback(
    (doc: { department?: string; path?: string }): boolean => {
      if (myAccess?.isOwner) return true;

      // 1. Verifica acesso à pasta / departamento
      if (doc.path) {
        const folderPart = doc.path.replace(/\\/g, '/').replace(/^\/+/, '').split('/')[0];
        if (!hasFolderAccess(folderPart)) {
          return false;
        }
      } else if (doc.department) {
        if (!hasFolderAccess(doc.department)) {
          return false;
        }
      }

      // 2. Verifica rota permitida para o colaborador se houver restrição pré-calculada
      if (doc.path && userAllowedPaths && userAllowedPaths.length > 0) {
        const cleanDocPath = doc.path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
        const hasPathAccess = userAllowedPaths.some(
          (cleanPattern: string) => cleanDocPath === cleanPattern || cleanDocPath.startsWith(cleanPattern + '/')
        );
        if (!hasPathAccess) {
          return false;
        }
      }

      return true;
    },
    [myAccess, hasFolderAccess, userAllowedPaths]
  );

  const grantFolderAccess = async (_targetUser: string, _folders: string[]) => {
    return { success: true, message: 'Permissões gerenciadas via Governança de Colaboradores.' };
  };

  const revokeFolderAccess = async (_targetUser: string, _folders: string[]) => {
    return { success: true, message: 'Permissões gerenciadas via Governança de Colaboradores.' };
  };

  const generateAIToken = async (ttlMinutes: number = 60) => {
    const res = await API.createSecureAIToken({ ttlMinutes, repo: currentRepoName });
    if (res.ok && res.data?.token) {
      const tokenObj = { token: res.data.token, expires_at: res.data.expiresAt || '' };
      setActiveAIToken(tokenObj);
      return { success: true, token: res.data.token };
    }
    return { success: false, error: res.data?.error || 'Falha ao gerar token de IA' };
  };

  return (
    <SecurityContext.Provider
      value={{
        departments,
        myAccess,
        activeAIToken,
        hasFolderAccess,
        canAccessDoc,
        grantFolderAccess,
        revokeFolderAccess,
        generateAIToken,
      }}
    >
      {children}
    </SecurityContext.Provider>
  );
};

export const useSecurity = (): SecurityContextType => {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurity deve ser usado dentro de um SecurityProvider');
  }
  return context;
};
