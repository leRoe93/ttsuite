import { createContext, useCallback, useContext, useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';

/**
 * Lightweight pointer-based drag & drop (mouse, pen and touch) without a library.
 *  - Drag handles call `startDrag` on pointerdown; dragging begins after a 5px move.
 *  - Drop lists are marked with data-drop-list="<listId>", their items with data-drop-item.
 *  - The insertion index is derived from the pointer position relative to the items.
 *  - Escape cancels; the page auto-scrolls near the viewport edge.
 * Keyboard users use the explicit move controls rendered next to each item (accessible alternative).
 */

export interface DropTarget {
  listId: string;
  index: number;
}

interface DragState {
  itemId: string;
  label: string;
  x: number;
  y: number;
  over: DropTarget | null;
}

interface DndCtx {
  drag: DragState | null;
  startDrag: (e: RPointerEvent, itemId: string, label: string) => void;
}

const Ctx = createContext<DndCtx>({ drag: null, startDrag: () => {} });

export function DndProvider({ onDrop, children }: { onDrop: (itemId: string, target: DropTarget) => void; children: ReactNode }) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const pending = useRef<{ itemId: string; label: string; x0: number; y0: number; pointerId: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const scrollTimer = useRef<number | null>(null);

  const hitTest = useCallback((x: number, y: number): DropTarget | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const list = el?.closest<HTMLElement>('[data-drop-list]');
    if (!list) return null;
    const items = [...list.querySelectorAll<HTMLElement>('[data-drop-item]')].filter((n) => n.closest('[data-drop-list]') === list);
    let index = items.length;
    for (let i = 0; i < items.length; i++) {
      const r = items[i]!.getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        index = i;
        break;
      }
    }
    return { listId: list.dataset['dropList']!, index };
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (p && !dragRef.current) {
        if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 5) return;
        setDrag({ itemId: p.itemId, label: p.label, x: e.clientX, y: e.clientY, over: hitTest(e.clientX, e.clientY) });
        document.body.classList.add('is-dragging');
        return;
      }
      if (!dragRef.current) return;
      e.preventDefault();
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, over: hitTest(e.clientX, e.clientY) } : d));
      const edge = 60;
      const dy = e.clientY < edge ? -12 : e.clientY > window.innerHeight - edge ? 12 : 0;
      if (scrollTimer.current) cancelAnimationFrame(scrollTimer.current);
      if (dy) {
        const step = () => {
          window.scrollBy(0, dy);
          scrollTimer.current = requestAnimationFrame(step);
        };
        scrollTimer.current = requestAnimationFrame(step);
      }
    };
    const end = (e: PointerEvent) => {
      const d = dragRef.current;
      pending.current = null;
      if (scrollTimer.current) cancelAnimationFrame(scrollTimer.current);
      document.body.classList.remove('is-dragging');
      if (!d) return;
      const target = e.type === 'pointerup' ? hitTest(e.clientX, e.clientY) : null;
      setDrag(null);
      if (target) onDropRef.current(d.itemId, target);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragRef.current) {
        pending.current = null;
        document.body.classList.remove('is-dragging');
        setDrag(null);
      }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('keydown', key);
    };
  }, [hitTest]);

  const startDrag = useCallback((e: RPointerEvent, itemId: string, label: string) => {
    if (e.button !== 0) return;
    pending.current = { itemId, label, x0: e.clientX, y0: e.clientY, pointerId: e.pointerId };
  }, []);

  return (
    <Ctx.Provider value={{ drag, startDrag }}>
      {children}
      {drag && (
        <div className="drag-ghost" style={{ transform: `translate(${drag.x + 12}px, ${drag.y + 8}px)` }} aria-hidden>
          {drag.label}
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useDnd = () => useContext(Ctx);
