type Bounds = { left: number; right: number; top: number; bottom: number };

/** Keep a dragged floating player within the visible viewport. */
export function clampPlayerDrag(bounds: Bounds, viewportWidth: number, viewportHeight: number, deltaX: number, deltaY: number) {
  const padding = 8;
  return {
    x: Math.max(padding - bounds.left, Math.min(viewportWidth - padding - bounds.right, deltaX)),
    y: Math.max(padding - bounds.top, Math.min(viewportHeight - padding - bounds.bottom, deltaY)),
  };
}
