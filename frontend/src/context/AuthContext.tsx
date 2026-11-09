import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, SavedAccount } from '../types';
import { API } from '../services/api';
import { useRepoStore } from '../stores/repoStore';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  version: string;
  provider: 'github' | 'local';
  providerUrl?: string;
  accounts: SavedAccount[];
  loginWithToken: (token: string) => Promise<{ success: boolean; error?: string }>;
  loginLocal: () => Promise<{ success: boolean }>;
  switchAccount: (accountId: string) => Promise<{ success: boolean; error?: string }>;
  removeAccount: (accountId: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [version, setVersion] = useState<string>('1.0.6');
  const [provider, setProvider] = useState<'github' | 'local'>('github');
  const [providerUrl, setProviderUrl] = useState<string | undefined>(undefined);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAuth = async () => {
    try {
      const status = await API.getStatus();
      if (status.version) {
        setVersion(status.version);
      }
      if (status.authenticated && status.user) {
        setUser(status.user);
        if (status.git_provider) {
          setProvider(status.git_provider as any);
        }
        if (status.git_provider_url) {
          setProviderUrl(status.git_provider_url);
        }
      } else {
        setUser(null);
      }
      if (Array.isArray(status.accounts)) {
        setAccounts(status.accounts);
      }
    } catch (err) {
      console.error('[AuthContext] Erro ao obter status:', err);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshAuth();
    if (typeof window !== 'undefined' && (window as any).desktopBridge?.getVersion) {
      (window as any).desktopBridge.getVersion().then((v: string) => {
        if (v) setVersion(v);
      }).catch(() => {});
    }
  }, []);

  const loginWithToken = async (token: string) => {
    try {
      const res = await API.loginWithToken(token);
      if (res.ok && res.data.user) {
        setUser(res.data.user);
        setProvider('github');
        useRepoStore.getState().clearPermissionsCache();
        await refreshAuth();
        useRepoStore.getState().refreshEffectivePermission();
        return { success: true };
      }
      return { success: false, error: res.data.error || 'Falha ao autenticar com token GitHub' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro de conexão com o servidor' };
    }
  };

  const switchAccount = async (accountId: string) => {
    try {
      setIsLoading(true);
      const res = await API.switchAccount(accountId);
      if (res.ok && res.data.user) {
        setUser(res.data.user);
        if (res.data.accounts) {
          setAccounts(res.data.accounts);
        }
        useRepoStore.getState().clearPermissionsCache();
        await refreshAuth();
        useRepoStore.getState().refreshEffectivePermission();
        return { success: true };
      }
      return { success: false, error: res.data.error || 'Falha ao alternar conta' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao alternar perfil' };
    } finally {
      setIsLoading(false);
    }
  };

  const removeAccount = async (accountId: string) => {
    try {
      const res = await API.removeAccount(accountId);
      if (res.ok) {
        if (res.data.accounts) {
          setAccounts(res.data.accounts);
        }
        if (res.data.user !== undefined) {
          setUser(res.data.user);
        }
        useRepoStore.getState().clearPermissionsCache();
        await refreshAuth();
        useRepoStore.getState().refreshEffectivePermission();
        return { success: true };
      }
      return { success: false, error: 'Falha ao remover conta' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao remover conta' };
    }
  };

  const loginLocal = async () => {
    try {
      const res = await API.loginWithToken('local_mode');
      if (res.ok && res.data.user) {
        setUser(res.data.user);
        setProvider('local');
        useRepoStore.getState().clearPermissionsCache();
        await refreshAuth();
        useRepoStore.getState().refreshEffectivePermission();
        return { success: true };
      }
      setUser({ login: 'local_dev', name: 'Desenvolvedor Local', role: 'Administrador Local', is_local: true });
      setProvider('local');
      useRepoStore.getState().clearPermissionsCache();
      return { success: true };
    } catch (err) {
      setUser({ login: 'local_dev', name: 'Desenvolvedor Local', role: 'Administrador Local', is_local: true });
      setProvider('local');
      useRepoStore.getState().clearPermissionsCache();
      return { success: true };
    }
  };

  const logout = async () => {
    try {
      await API.logout();
    } catch (err) {
      console.error('[AuthContext] Erro ao deslogar:', err);
    } finally {
      useRepoStore.getState().clearPermissionsCache();
      setUser(null);
      await refreshAuth();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        version,
        provider,
        providerUrl,
        accounts,
        loginWithToken,
        loginLocal,
        switchAccount,
        removeAccount,
        logout,
        refreshAuth
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
};
