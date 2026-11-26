import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Modal } from "./Modal";
import { Drawer } from "./Drawer";

describe("Modal & Drawer backdrop close behavior", () => {
  it("Modal does NOT close when mousedown starts inside content and click finishes on backdrop", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Criar Rascunho">
        <input data-testid="modal-input" defaultValue="Texto" />
      </Modal>,
    );

    const input = document.querySelector('[data-testid="modal-input"]')!;
    const backdrop = document.querySelector(".ui-modal__backdrop")!;

    fireEvent.mouseDown(input);
    fireEvent.click(backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("Modal closes when both mousedown and click happen directly on backdrop", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Criar Rascunho">
        <div>Conteúdo</div>
      </Modal>,
    );

    const backdrop = document.querySelector(".ui-modal__backdrop")!;

    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Drawer does NOT close when mousedown starts inside content and click finishes on backdrop", () => {
    const onClose = vi.fn();
    const { getByTestId } = render(
      <Drawer isOpen={true} onClose={onClose} title="Detalhes">
        <div data-testid="drawer-content">Conteúdo</div>
      </Drawer>,
    );

    const content = getByTestId("drawer-content");
    const dialog = content.closest('[role="dialog"]')!;
    const backdrop = dialog.parentElement!;

    fireEvent.mouseDown(content);
    fireEvent.click(backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("Drawer closes when both mousedown and click happen directly on backdrop", () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <Drawer isOpen={true} onClose={onClose} title="Detalhes">
        <div>Conteúdo</div>
      </Drawer>,
    );

    const backdrop = getByRole("dialog").parentElement!;

    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
