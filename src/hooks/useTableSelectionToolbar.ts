import { useEffect, useState, RefObject } from "react";

export interface TableSelectionInfo {
  tableEl: HTMLTableElement;
  cellEl: HTMLTableCellElement;
  rowIndex: number;
  colIndex: number;
  rect: DOMRect;
}

/**
 * Tracks the current selection within `editorRef` and, when the caret
 * lives inside a cell of a manual contract table
 * (`table[data-contract-manual-table="true"]`), returns information
 * useful to render a floating contextual toolbar.
 *
 * Returns `null` when the selection is outside the editor, outside a
 * manual table, or inside a `contenteditable="false"` chip.
 */
export function useTableSelectionToolbar(
  editorRef: RefObject<HTMLElement | null>,
): TableSelectionInfo | null {
  const [info, setInfo] = useState<TableSelectionInfo | null>(null);

  useEffect(() => {
    const handler = () => {
      const root = editorRef.current;
      if (!root) {
        setInfo(null);
        return;
      }
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        setInfo(null);
        return;
      }
      const node = sel.anchorNode;
      if (!node || !root.contains(node)) {
        setInfo(null);
        return;
      }
      const startEl: HTMLElement | null =
        node.nodeType === Node.ELEMENT_NODE
          ? (node as HTMLElement)
          : node.parentElement;
      if (!startEl) {
        setInfo(null);
        return;
      }
      // Ignore caret inside non-editable chips (data tables, formulas, variables).
      if (startEl.closest('[contenteditable="false"]')) {
        setInfo(null);
        return;
      }
      const cellEl = startEl.closest("td, th") as HTMLTableCellElement | null;
      if (!cellEl || !root.contains(cellEl)) {
        setInfo(null);
        return;
      }
      const tableEl = cellEl.closest(
        'table[data-contract-manual-table="true"]',
      ) as HTMLTableElement | null;
      if (!tableEl || !root.contains(tableEl)) {
        setInfo(null);
        return;
      }
      const rowEl = cellEl.parentElement as HTMLTableRowElement | null;
      if (!rowEl) {
        setInfo(null);
        return;
      }
      const rowIndex = Array.prototype.indexOf.call(
        tableEl.querySelectorAll("tr"),
        rowEl,
      );
      const colIndex = Array.prototype.indexOf.call(rowEl.children, cellEl);
      setInfo({
        tableEl,
        cellEl,
        rowIndex,
        colIndex,
        rect: cellEl.getBoundingClientRect(),
      });
    };

    document.addEventListener("selectionchange", handler);
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      document.removeEventListener("selectionchange", handler);
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [editorRef]);

  return info;
}
