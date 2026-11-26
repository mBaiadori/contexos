import React, { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./IconButton";
import { X } from "lucide-react";
import { useBackdropClose } from "./useBackdropClose";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  size?: ModalSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  size = "md",
  children,
  footer,
  closeOnBackdrop = true,
  closeOnEscape = true,
  className = "",
}) => {
  const backdropHandlers = useBackdropClose(onClose, closeOnBackdrop);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === "Escape") {
        onClose();
      }
    },
    [closeOnEscape, onClose],
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="ui-modal__backdrop"
      {...backdropHandlers}
    >
      <div className={`ui-modal ui-modal--${size} ${className}`.trim()} role="dialog" aria-modal="true">
        {(title || subtitle || icon) && (
          <div className="ui-modal__header">
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
              {icon && (
                <div style={{ color: "var(--color-primary)", display: "flex", alignItems: "center" }}>
                  {icon}
                </div>
              )}
              <div className="ui-modal__title-wrap" style={{ flex: 1, minWidth: 0 }}>
                {title && <h2 className="ui-modal__title">{title}</h2>}
                {subtitle && <p className="ui-modal__subtitle">{subtitle}</p>}
              </div>
            </div>
            <IconButton
              size="sm"
              variant="ghost"
              tooltip="Fechar (Esc)"
              onClick={onClose}
            >
              <X size={18} />
            </IconButton>
          </div>
        )}
        <div className="ui-modal__body">{children}</div>
        {footer && <div className="ui-modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};
