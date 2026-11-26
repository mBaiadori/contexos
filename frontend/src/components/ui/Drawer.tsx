import React, { useCallback, useEffect } from "react";
import { IconButton } from "./IconButton";
import { X } from "lucide-react";
import { useBackdropClose } from "./useBackdropClose";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  zIndex?: number;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  ariaLabel?: string;
}

/**
 * Shared right-side overlay drawer with safe backdrop-close and Escape handling.
 */
export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  headerActions,
  children,
  footer,
  maxWidth = "580px",
  zIndex = 1000,
  closeOnBackdrop = true,
  closeOnEscape = true,
  ariaLabel,
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
    if (!isOpen) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
        zIndex,
        display: "flex",
        justifyContent: "flex-end",
      }}
      {...backdropHandlers}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        style={{
          width: "100%",
          maxWidth,
          height: "100%",
          background: "var(--color-surface, #ffffff)",
          color: "var(--color-on-surface, #202124)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "-12px 0 36px rgba(15, 23, 42, 0.16)",
        }}
      >
        {(title || subtitle || headerActions) && (
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--color-outline-variant, #e2e8f0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexShrink: 0,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              {title && (
                <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>
                  {title}
                </h3>
              )}
              {subtitle && (
                <div style={{ marginTop: "2px" }}>{subtitle}</div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              {headerActions}
              <IconButton
                size="sm"
                variant="ghost"
                tooltip="Fechar (Esc)"
                onClick={onClose}
              >
                <X size={18} />
              </IconButton>
            </div>
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {children}
        </div>
        {footer && (
          <div
            style={{
              padding: "14px 20px",
              borderTop: "1px solid var(--color-outline-variant, #e2e8f0)",
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
