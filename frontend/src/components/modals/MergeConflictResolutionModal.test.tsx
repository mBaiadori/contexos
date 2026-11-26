import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MergeConflictResolutionModal } from "./MergeConflictResolutionModal";

describe("MergeConflictResolutionModal", () => {
  it("parseia múltiplos blocos de conflito (incluindo CRLF e fim sem quebra de linha) e aplica resoluções individuais", () => {
    const onSaveResolved = vi.fn();
    const onClose = vi.fn();

    const conflicted = [
      "# Documento",
      "<<<<<<< Sua Proposta",
      "Bloco 1 nosso",
      "=======",
      "Bloco 1 oficial",
      ">>>>>>> Versão Oficial",
      "Texto intermediário",
      "<<<<<<< Sua Proposta",
      "Bloco 2 nosso",
      "=======",
      "Bloco 2 oficial",
      ">>>>>>> Versão Oficial",
    ].join("\r\n");

    render(
      <MergeConflictResolutionModal
        isOpen={true}
        onClose={onClose}
        filePath="docs/spec.md"
        content={conflicted}
        onSaveResolved={onSaveResolved}
      />,
    );

    expect(screen.getByText(/Detectamos 2 trecho\(s\)/)).toBeTruthy();

    // Bloco 1: escolher "Manter Oficial"; Bloco 2: escolher "Unir as Duas"
    const keepOfficialBtns = screen.getAllByText("✓ Manter Oficial");
    const mergeBothBtns = screen.getAllByText("Unir as Duas");
    fireEvent.click(keepOfficialBtns[0]);
    fireEvent.click(mergeBothBtns[1]);

    fireEvent.click(screen.getByText(/Concluir & Publicar Versão Unificada/));

    expect(onSaveResolved).toHaveBeenCalledTimes(1);
    const resolved = onSaveResolved.mock.calls[0][0] as string;
    expect(resolved).not.toContain("<<<<<<<");
    expect(resolved).not.toContain("=======");
    expect(resolved).not.toContain(">>>>>>>");
    expect(resolved).toContain("Bloco 1 oficial");
    expect(resolved).not.toContain("Bloco 1 nosso");
    expect(resolved).toContain("Texto intermediário");
    expect(resolved).toContain("Bloco 2 nosso\nBloco 2 oficial");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("permite resolver todos os blocos de uma vez mantendo a Versão Oficial", () => {
    const onSaveResolved = vi.fn();
    const conflicted =
      "<<<<<<< A\nnosso-1\n=======\noficial-1\n>>>>>>> B\nmeio\n<<<<<<< A\nnosso-2\n=======\noficial-2\n>>>>>>> B\n";

    render(
      <MergeConflictResolutionModal
        isOpen={true}
        onClose={() => {}}
        filePath="docs/regra.md"
        content={conflicted}
        onSaveResolved={onSaveResolved}
      />,
    );

    fireEvent.click(screen.getByText("Manter Oficial em Todos"));
    fireEvent.click(screen.getByText(/Concluir & Publicar Versão Unificada/));

    const resolved = onSaveResolved.mock.calls[0][0] as string;
    expect(resolved).toContain("oficial-1");
    expect(resolved).toContain("oficial-2");
    expect(resolved).not.toContain("nosso-1");
    expect(resolved).not.toContain("nosso-2");
  });
});
