import { useCallback, useRef } from "react";
import type React from "react";

/**
 * Returns backdrop mouse handlers that only trigger `onClose` when BOTH
 * `mousedown` and `click` originate directly on the backdrop element.
 *
 * Prevents accidental closes when the user starts a click or text selection
 * inside a modal/drawer and releases the mouse button outside on the backdrop.
 */
export function useBackdropClose(onClose: () => void, enabled = true) {
  const startedOnBackdropRef = useRef(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      startedOnBackdropRef.current = enabled && e.target === e.currentTarget;
    },
    [enabled],
  );

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const shouldClose =
        enabled && startedOnBackdropRef.current && e.target === e.currentTarget;
      startedOnBackdropRef.current = false;
      if (shouldClose) {
        onClose();
      }
    },
    [enabled, onClose],
  );

  return { onMouseDown, onClick };
}
