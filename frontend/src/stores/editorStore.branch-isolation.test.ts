import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DraftStore } from "../services/draft-store";
import { useEditorStore } from "./editorStore";
import { useRepoStore } from "./repoStore";
import { useGitStore } from "./gitStore";
import { API } from "../services/api";

vi.mock("../services/api", () => ({
  API: {
    getProjectFile: vi.fn(),
    saveWorkspaceFile: vi.fn(),
    getWorkspaceChanges: vi.fn(),
    getGitStatus: vi.fn(),
  },
}));

describe("editorStore & DraftStore - Isolamento por branch e prevenção de sobrescrita", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();

    useEditorStore.getState().clearFileCache(true);
    useEditorStore.setState({
      activeFile: "",
      activeDocRepo: "",
      fileContent: "",
      originalContent: "",
      fileMetadata: {},
      hasUnsavedChanges: false,
      saveStatus: "Pronto",
      isSaving: false,
      isLoadingFile: false,
    });

    useRepoStore.setState({
      activeRepo: {
        name: "demo-repo",
        full_name: "local/demo-repo",
        default_branch: "main",
        is_local: true,
        is_cloned_locally: true,
      } as never,
    });

    useGitStore.setState({
      gitStatus: {
        isRepo: true,
        branch: "rascunho-1",
        ahead: 0,
        behind: 0,
        isClean: true,
        files: [],
      } as never,
    });

    vi.mocked(API.saveWorkspaceFile).mockResolvedValue({ ok: true, data: { meta: {} } } as never);
    vi.mocked(API.getWorkspaceChanges).mockResolvedValue({ changes: [] } as never);
    vi.mocked(API.getGitStatus).mockResolvedValue({
      ok: true,
      data: { isRepo: true, branch: "rascunho-1", ahead: 0, behind: 0, isClean: true, files: [] },
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("DraftStore isola rascunhos do mesmo arquivo em branches diferentes", () => {
    DraftStore.saveDocDraft("demo-repo", "docs/spec.md", { body: "v-draft", rawContent: "v-draft" }, 100, "rascunho-1");
    DraftStore.saveDocDraft("demo-repo", "docs/spec.md", { body: "v-main", rawContent: "v-main" }, 100, "main");
    vi.advanceTimersByTime(150);

    expect(DraftStore.getDocDraft("demo-repo", "docs/spec.md", "rascunho-1")?.rawContent).toBe("v-draft");
    expect(DraftStore.getDocDraft("demo-repo", "docs/spec.md", "main")?.rawContent).toBe("v-main");

    DraftStore.clearDocDraft("demo-repo", "docs/spec.md", "rascunho-1");
    expect(DraftStore.getDocDraft("demo-repo", "docs/spec.md", "rascunho-1")).toBeNull();
    expect(DraftStore.getDocDraft("demo-repo", "docs/spec.md", "main")?.rawContent).toBe("v-main");
  });

  it("aborta autosave pendente se o usuário trocar de branch durante o debounce de 750ms", async () => {
    vi.mocked(API.getProjectFile).mockResolvedValue({
      path: "docs/spec.md",
      content: "Conteúdo original",
      meta: {},
    } as never);

    await useEditorStore.getState().loadFile("docs/spec.md", "demo-repo");

    // Usuário edita em rascunho-1 (agenda autosave para daqui a 750ms)
    useEditorStore.getState().setFileContent("Edição na branch rascunho-1");

    // Antes dos 750ms, branch muda para `main`
    useGitStore.setState({
      gitStatus: {
        isRepo: true,
        branch: "main",
        ahead: 0,
        behind: 0,
        isClean: true,
        files: [],
      } as never,
    });

    await vi.advanceTimersByTimeAsync(1000);

    // Autosave da branch antiga NÃO pode gravar em cima da branch `main`!
    expect(API.saveWorkspaceFile).not.toHaveBeenCalled();
  });

  it("não reaproveita fileCache nem DraftStore da branch anterior ao recarregar o mesmo arquivo após trocar de branch", async () => {
    // 1. Carrega e edita em rascunho-1
    vi.mocked(API.getProjectFile).mockResolvedValueOnce({
      path: "docs/spec.md",
      content: "Versão rascunho-1",
      meta: {},
    } as never);

    await useEditorStore.getState().loadFile("docs/spec.md", "demo-repo");
    useEditorStore.getState().setFileContent("Edição não salva de rascunho-1");
    vi.advanceTimersByTime(550); // salva no DraftStore da branch rascunho-1 (antes dos 750ms de disk save)

    // 2. Troca para `main` e limpa activeFile para simular abertura do mesmo doc na nova branch
    useEditorStore.getState().clearFileCache(true);
    useEditorStore.setState({ activeFile: "" });
    useGitStore.setState({
      gitStatus: {
        isRepo: true,
        branch: "main",
        ahead: 0,
        behind: 0,
        isClean: true,
        files: [],
      } as never,
    });

    vi.mocked(API.getProjectFile).mockResolvedValueOnce({
      path: "docs/spec.md",
      content: "Versão oficial da main",
      meta: {},
    } as never);

    await useEditorStore.getState().loadFile("docs/spec.md", "demo-repo");

    expect(useEditorStore.getState().fileContent).toBe("Versão oficial da main");
    expect(useEditorStore.getState().hasUnsavedChanges).toBe(false);
  });
});
