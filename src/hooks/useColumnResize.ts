import { useState, useCallback, useEffect, useRef } from "react";

export interface ColumnWidths { [key: string]: number; }

interface UseColumnResizeOptions {
  storageKey: string;
  defaultWidths: ColumnWidths;
  minWidth?: number;
}

export function useColumnResize({ storageKey, defaultWidths, minWidth = 60 }: UseColumnResizeOptions) {
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) { try { return { ...defaultWidths, ...JSON.parse(saved) }; } catch { return defaultWidths; } }
    return defaultWidths;
  });

  const resizing = useRef<{ columnKey: string; startX: number; startWidth: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent, columnKey: string) => {
    e.preventDefault(); e.stopPropagation();
    resizing.current = { columnKey, startX: e.clientX, startWidth: columnWidths[columnKey] || defaultWidths[columnKey] || 150 };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [columnWidths, defaultWidths]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const newWidth = Math.max(minWidth, resizing.current.startWidth + (e.clientX - resizing.current.startX));
      setColumnWidths(prev => ({ ...prev, [resizing.current!.columnKey]: newWidth }));
    };
    const handleMouseUp = () => {
      if (resizing.current) {
        setColumnWidths(prev => { localStorage.setItem(storageKey, JSON.stringify(prev)); return prev; });
        resizing.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => { document.removeEventListener("mousemove", handleMouseMove); document.removeEventListener("mouseup", handleMouseUp); };
  }, [storageKey, minWidth]);

  const resetWidths = useCallback(() => { setColumnWidths(defaultWidths); localStorage.removeItem(storageKey); }, [defaultWidths, storageKey]);

  return { columnWidths, handleMouseDown, resetWidths, isResizing: () => resizing.current !== null };
}
