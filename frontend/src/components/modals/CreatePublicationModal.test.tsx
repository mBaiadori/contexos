import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CreatePublicationModal } from "./CreatePublicationModal";
import { API } from "../../services/api";
import type { VersionNode } from "../../types";

vi.mock("../../services/api", () => ({
  API: {
    compareBranches: vi.fn(),
    getWorkspaceChanges: vi.fn(),
    getGitStatus: vi.fn(),
    generatePRSummaryAI: vi.fn(),
    createPR: vi.fn(),
  },
}));

vi.mock("../editor/VisualMarkdownDiff", () => ({
  VisualMarkdownDiff: () => <div data-testid="visual-diff" />,
}));

vi.mock("../common", () => ({
  DiffViewer: ({ diffText }: { diffText: string }) => <pre>{diffText}</pre>,
}));

describe("CreatePublicationModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filtra arquivos ocultos (.translations) da contagem da branch e da listagem de alterações", async () => {
    vi.mocked(API.compareBranches).mockResolvedValue({
      ok: true,
      data: { files: [] },
    } as any);
    vi.mocked(API.getWorkspaceChanges).mockResolvedValue({
      changes: [
        { path: "doc-visivel.md", type: "MODIFIED", additions: 2, deletions: 1 },
        { path: ".translations/en/inserção nomercado.md", type: "ADDED", additions: 3, deletions: 0 },
      ],
    } as any);
    vi.mocked(API.getGitStatus).mockResolvedValue({
      ok: true,
      data: {
        isRepo: true,
        branch: "main",
        ahead: 0,
        behind: 0,
        isClean: false,
        files: [
          { path: "doc-visivel.md", status: "M", staged: false },
          { path: ".translations/en/inserção nomercado.md", status: "??", staged: false },
        ],
      },
    } as any);

    const nodes: VersionNode[] = [
      {
        name: "main",
        displayName: "Principal",
        isCurrent: true,
        isDefault: true,
        type: "main",
        ahead: 0,
        behind: 0,
        uncommittedFiles: [
          { path: "doc-visivel.md", status: "M", staged: false },
          { path: ".translations/en/inserção nomercado.md", status: "??", staged: false },
        ],
      },
    ];

    render(
      <CreatePublicationModal
        isOpen={true}
        onClose={() => {}}
        repoName="demo"
        nodes={nodes}
        defaultBranch="main"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Alterações que serão enviadas (1)")).toBeTruthy();
    });

    expect(screen.getByText("1 arquivo")).toBeTruthy();
    expect(screen.getByText("doc-visivel.md")).toBeTruthy();
    expect(screen.queryByText(".translations/en/inserção nomercado.md")).toBeNull();
  });

  it("mescla arquivos commitados da branch e pendentes locais sem duplicar nem vazar para outra branch", async () => {
    vi.mocked(API.compareBranches).mockResolvedValue({
      ok: true,
      data: {
        files: [
          {
            path: "guia.md",
            status: "MODIFIED",
            additions: 4,
            deletions: 1,
            diff: "@@ ...",
            oldContent: "old",
            newContent: "committed",
          },
        ],
      },
    } as any);
    vi.mocked(API.getWorkspaceChanges).mockResolvedValue({
      changes: [
        { path: "guia.md", type: "MODIFIED", additions: 1, deletions: 0, old_content: "committed", new_content: "local" },
        { path: "novo-local.md", type: "ADDED", additions: 5, deletions: 0, old_content: "", new_content: "# Novo" },
      ],
    } as any);
    vi.mocked(API.getGitStatus).mockResolvedValue({
      ok: true,
      data: {
        isRepo: true,
        branch: "rascunho-1",
        ahead: 1,
        behind: 0,
        isClean: false,
        files: [
          { path: "guia.md", status: "M", staged: false },
          { path: "novo-local.md", status: "??", staged: false },
        ],
      },
    } as any);

    const nodes: VersionNode[] = [
      {
        name: "main",
        displayName: "Principal",
        isCurrent: false,
        isDefault: true,
        type: "main",
        ahead: 0,
        behind: 0,
      },
      {
        name: "rascunho-1",
        displayName: "Rascunho 1",
        isCurrent: true,
        isDefault: false,
        type: "draft",
        ahead: 1,
        behind: 0,
        uncommittedFiles: [
          { path: "guia.md", status: "M", staged: false },
          { path: "novo-local.md", status: "??", staged: false },
        ],
      },
    ];

    render(
      <CreatePublicationModal
        isOpen={true}
        onClose={() => {}}
        repoName="demo"
        nodes={nodes}
        defaultBranch="main"
        initialSourceBranch="rascunho-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Alterações que serão enviadas (2)")).toBeTruthy();
    });

    expect(screen.getAllByText("guia.md").length).toBe(1);
    expect(screen.getByText("novo-local.md")).toBeTruthy();
  });
});
