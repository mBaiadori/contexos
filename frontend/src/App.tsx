import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { SecurityProvider } from './context/SecurityContext';
import { AIProvider } from './context/AIContext';
import { AuthView } from './views/AuthView';
import { AdminAuthView } from './views/AdminAuthView';
import { DashboardView } from './views/DashboardView';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { useUpdaterStore } from './stores/updaterStore';

// Inicializa o monitoramento global de atualizações para o ambiente Desktop
useUpdaterStore.getState().init();

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const { t } = useTranslation('common');

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--color-surface, #1e1e2e)',
          color: 'var(--color-outline, #a6adc8)',
          fontFamily: 'var(--font-sans, system-ui)'
        }}
      >
        {t('loadingPlatform')}
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const CollaboratorAuthRoute: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { t } = useTranslation('common');
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--color-surface, #1e1e2e)',
          color: 'var(--color-outline, #a6adc8)',
          fontFamily: 'var(--font-sans, system-ui)',
        }}
      >
        {t('loadingPlatform')}
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <AuthView onLoginSuccess={() => navigate('/')} />;
};

const AdminAuthRoute: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { t } = useTranslation('common');
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--color-surface, #1e1e2e)',
          color: 'var(--color-outline, #a6adc8)',
          fontFamily: 'var(--font-sans, system-ui)',
        }}
      >
        {t('loadingPlatform')}
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <AdminAuthView onLoginSuccess={() => navigate('/')} />;
};

const OrgRepoRedirect: React.FC = () => {
  const { org, repoName } = useParams<{ org: string; repoName: string }>();
  return <Navigate to={`/org/${encodeURIComponent(org || '')}/repo/${encodeURIComponent(repoName || '')}/editor`} replace />;
};

const RepoRedirect: React.FC = () => {
  const { repoName } = useParams<{ repoName: string }>();
  return <Navigate to={`/repo/${encodeURIComponent(repoName || '')}/editor`} replace />;
};

const RootRedirect: React.FC = () => {
  const { activeRepo, repos, isLoadingWorkspace, activeOrg } = useWorkspace();
  const { t } = useTranslation('common');

  if (isLoadingWorkspace && !activeRepo && repos.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--color-surface, #1e1e2e)',
          color: 'var(--color-outline, #a6adc8)',
          fontFamily: 'var(--font-sans, system-ui)',
        }}
      >
        {t('loadingPlatform')}
      </div>
    );
  }

  // Redireciona apenas se houver repositório ativo explicitamente clonado localmente.
  // NUNCA seleciona automaticamente repos[0] na inicialização, mantendo o estado neutro.
  if (activeRepo && activeRepo.is_cloned_locally) {
    const owner = activeRepo.owner || (activeRepo.full_name?.includes('/') ? activeRepo.full_name.split('/')[0] : '');
    const repoName = activeRepo.name || (activeRepo.full_name?.includes('/') ? activeRepo.full_name.split('/')[1] : activeRepo.full_name) || '';
    if (owner && owner !== 'local' && owner !== 'personal') {
      return <Navigate to={`/org/${encodeURIComponent(owner)}/repo/${encodeURIComponent(repoName)}/editor`} replace />;
    }
    return <Navigate to={`/repo/${encodeURIComponent(repoName)}/editor`} replace />;
  }

  if (activeOrg && activeOrg.login && activeOrg.login !== 'local' && !activeOrg.is_personal) {
    return <Navigate to={`/org/${encodeURIComponent(activeOrg.login)}/editor`} replace />;
  }

  return <Navigate to="/editor" replace />;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WorkspaceProvider>
          <SecurityProvider>
            <AIProvider>
              <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <ErrorBoundary>
                  <Routes>
                    {/* Rotas de Autenticação */}
                    <Route path="/login" element={<CollaboratorAuthRoute />} />
                    <Route path="/admin" element={<AdminAuthRoute />} />
                    <Route path="/login/admin" element={<AdminAuthRoute />} />
                    <Route path="/auth" element={<Navigate to="/login" replace />} />

                    {/* Rotas COM Organização: /org/:org/repo/:repoName */}
                    <Route
                      path="/org/:org/repo/:repoName"
                      element={
                        <ProtectedRoute>
                          <OrgRepoRedirect />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/org/:org/repo/:repoName/:subview"
                      element={
                        <ProtectedRoute>
                          <DashboardView />
                        </ProtectedRoute>
                      }
                    />

                    {/* Rotas de Subview por Organização (sem repositório selecionado) */}
                    <Route
                      path="/org/:org/:subview"
                      element={
                        <ProtectedRoute>
                          <DashboardView />
                        </ProtectedRoute>
                      }
                    />

                    {/* Rotas SEM Organização (ou repositórios locais/pessoais): /repo/:repoName */}
                    <Route
                      path="/repo/:repoName"
                      element={
                        <ProtectedRoute>
                          <RepoRedirect />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/repo/:repoName/:subview"
                      element={
                        <ProtectedRoute>
                          <DashboardView />
                        </ProtectedRoute>
                      }
                    />

                    {/* Rotas de Subview Globais (sem organização ou repositório) */}
                    <Route
                      path="/:subview"
                      element={
                        <ProtectedRoute>
                          <DashboardView />
                        </ProtectedRoute>
                      }
                    />

                    {/* Rota raiz e Fallback */}
                    <Route
                      path="/"
                      element={
                        <ProtectedRoute>
                          <RootRedirect />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </ErrorBoundary>
              </div>
            </AIProvider>
          </SecurityProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
