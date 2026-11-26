import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { usePRsData } from "./usePRsData";
import { API } from "../../../../services/api";

const mockUser = { login: "alice", name: "Alice" };
vi.mock("../../../../context/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    provider: "local",
  }),
}));

const refreshGitStatus = vi.fn();
const refreshPendingChanges = vi.fn();
const refreshVersionGraph = vi.fn();
const getRepoOwnerOrOrg = vi.fn(() => "local");
const mockActiveRepo = { name: "demo", default_branch: "main", is_cloned_locally: true };
const mockRepos = [mockActiveRepo];
const mockProjectConfig = {};

vi.mock("../../../../context/WorkspaceContext", () => ({
  useWorkspace: () => ({
    activeRepo: mockActiveRepo,
    repos: mockRepos,
    refreshGitStatus,
    refreshPendingChanges,
    refreshVersionGraph,
    projectConfig: mockProjectConfig,
    getRepoOwnerOrOrg,
  }),
}));

vi.mock("../../../../services/api", () => ({
  API: {
    pullLocalRepo: vi.fn(),
    getPRs: vi.fn(),
    getPRMergeability: vi.fn(),
    getPRConflict: vi.fn(),
    resolvePRConflict: vi.fn(),
    updatePRFromBase: vi.fn(),
    mergePR: vi.fn(),
    rejectPR: vi.fn(),
    rollbackVersion: vi.fn(),
    getPRFileDiff: vi.fn(),
  },
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe("usePRsData - Fluxos de conflito, erro de merge e sync com base", () => {
  const samplePR = {
    id: 42,
    repo_name: "demo",
    title: "PR Conflitante",
    branch: "rascunho-42",
    target_branch: "main",
    status: "OPEN",
    files: [{ path: "docs/spec.md", type: "MODIFIED", additions: 2, deletions: 1 }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(API.pullLocalRepo).mockResolvedValue({ ok: true, data: { success: true, message: "ok" } });
    vi.mocked(API.getPRs).mockResolvedValue({
      prs: [samplePR as never],
      total: 1,
      page: 1,
      limit: 15,
      total_pages: 1,
      counts: { all: 1, open: 1, merged: 0, closed: 0 },
      repoOpenCounts: { demo: 1 },
    });
    vi.mocked(API.getPRMergeability).mockResolvedValue({
      ok: true,
      data: { mergeable: false, behind_by: 1, ahead_by: 1, conflicts: [{ path: "docs/spec.md", is_encrypted: false }] },
    });
  });

  it("carrega conflito com merged/mergedContent, salva resolução e atualiza mergeabilidade", async () => {
    vi.mocked(API.getPRConflict).mockResolvedValue({
      ok: true,
      data: {
        filePath: "docs/spec.md",
        base: "base",
        ours: "ours",
        theirs: "theirs",
        merged: "<<<<<<< A\nours\n=======\ntheirs\n>>>>>>> B\n",
        hasConflicts: true,
        conflictCount: 1,
      },
    });
    vi.mocked(API.resolvePRConflict).mockResolvedValue({
      ok: true,
      data: { success: true, commitHash: "abc1234" },
    });

    const { result } = renderHook(() => usePRsData(), { wrapper });
    await waitFor(() => expect(result.current.filteredPRs.length).toBe(1));

    await act(async () => {
      await result.current.handleOpenConflictResolution(samplePR as never, "docs/spec.md");
    });
    expect(result.current.activeConflictPR?.bundle.merged).toContain("<<<<<<<");

    await act(async () => {
      await result.current.handleSaveConflictResolution("conteúdo resolvido");
    });

    expect(API.resolvePRConflict).toHaveBeenCalledWith({
      pr_id: 42,
      filePath: "docs/spec.md",
      resolvedContent: "conteúdo resolvido",
      repo: "demo",
    });
    expect(result.current.activeConflictPR).toBeNull();
    expect(result.current.actionFeedback?.type).toBe("success");
    expect(API.getPRMergeability).toHaveBeenCalled();
  });

  it("expõe feedback de erro claro quando mergePR ou updatePRFromBase falham por conflito", async () => {
    vi.mocked(API.mergePR).mockResolvedValue({
      ok: false,
      data: { error: "Existem edições concorrentes entre 'rascunho-42' e 'main'." },
    });
    vi.mocked(API.updatePRFromBase).mockResolvedValue({
      ok: false,
      data: { error: "Existem conflitos entre a branch do PR e a branch 'main'." },
    });

    const { result } = renderHook(() => usePRsData(), { wrapper });
    await waitFor(() => expect(result.current.filteredPRs.length).toBe(1));

    await act(async () => {
      await result.current.handleMerge(42, "demo");
    });
    expect(result.current.actionFeedback?.type).toBe("error");
    expect(result.current.actionFeedback?.message).toContain("edições concorrentes");

    await act(async () => {
      await result.current.handleUpdateFromBase(samplePR as never);
    });
    expect(result.current.actionFeedback?.type).toBe("error");
    expect(result.current.actionFeedback?.message).toContain("Existem conflitos");
  });
});
