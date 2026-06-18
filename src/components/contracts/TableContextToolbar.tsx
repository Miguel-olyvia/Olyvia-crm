import { useMemo } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  Trash2,
  Rows,
  Columns,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import type { TableSelectionInfo } from "@/hooks/useTableSelectionToolbar";

interface Props {
  info: TableSelectionInfo;
  containerEl: HTMLElement;
  onChange: () => void;
}

/**
 * Floating contextual toolbar that appears above the currently selected
 * cell inside a manual contract table. Operates on the live DOM and
 * triggers `onChange` after each mutation so the parent editor can
 * sanitize and persist the new HTML.
 */
export function TableContextToolbar({ info, containerEl, onChange }: Props) {
  const { tableEl, cellEl, rowIndex, colIndex } = info;

  const position = useMemo(() => {
    const cellRect = cellEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    return {
      top: Math.max(4, cellRect.top - containerRect.top - 40),
      left: Math.max(4, cellRect.left - containerRect.left),
    };
  }, [cellEl, containerEl]);

  const inHeader = cellEl.parentElement?.parentElement?.tagName === "THEAD";

  const commit = (focusCell?: HTMLElement | null) => {
    if (focusCell && focusCell.isConnected) {
      try {
        const range = document.createRange();
        range.selectNodeContents(focusCell);
        range.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch {
        /* ignore */
      }
    }
    onChange();
  };

  const buildEmptyCell = (tag: "td" | "th") => {
    const c = document.createElement(tag);
    if (tag === "th") {
      c.setAttribute(
        "style",
        "border:1px solid #d1d5db;padding:8px;vertical-align:top;background-color:#f3f4f6;font-weight:600;text-align:left;",
      );
    } else {
      c.setAttribute(
        "style",
        "border:1px solid #d1d5db;padding:8px;vertical-align:top;",
      );
    }
    c.innerHTML = "&nbsp;";
    return c;
  };

  const getOrCreateTbody = (): HTMLTableSectionElement => {
    let tbody = tableEl.querySelector(":scope > tbody") as HTMLTableSectionElement | null;
    if (!tbody) {
      tbody = document.createElement("tbody");
      tableEl.appendChild(tbody);
    }
    return tbody;
  };

  const addRow = (after: boolean) => {
    const rows = Array.from(tableEl.querySelectorAll("tr"));
    const refRow = rows[rowIndex];
    if (!refRow) return;
    const colCount = refRow.children.length;

    // If caret is in <thead>, a new data row should always go to the top of <tbody>.
    // We treat both "above" and "below" as "first row of tbody" since headers shouldn't
    // be duplicated.
    if (inHeader) {
      const tbody = getOrCreateTbody();
      const newRow = document.createElement("tr");
      for (let i = 0; i < colCount; i++) newRow.appendChild(buildEmptyCell("td"));
      if (tbody.firstChild) tbody.insertBefore(newRow, tbody.firstChild);
      else tbody.appendChild(newRow);
      commit(newRow.firstElementChild as HTMLElement);
      return;
    }

    const newRow = document.createElement("tr");
    for (let i = 0; i < colCount; i++) newRow.appendChild(buildEmptyCell("td"));
    if (after) refRow.after(newRow);
    else refRow.before(newRow);
    commit(newRow.firstElementChild as HTMLElement);
  };

  const addCol = (after: boolean) => {
    const rows = Array.from(tableEl.querySelectorAll("tr"));
    let firstNewCell: HTMLElement | null = null;
    rows.forEach((row) => {
      const refCell = row.children[colIndex] as HTMLElement | undefined;
      const rowInHead = row.parentElement?.tagName === "THEAD";
      const tag: "td" | "th" = rowInHead ? "th" : "td";
      const newCell = buildEmptyCell(tag);
      if (!refCell) {
        row.appendChild(newCell);
      } else if (after) {
        refCell.after(newCell);
      } else {
        refCell.before(newCell);
      }
      if (!firstNewCell) firstNewCell = newCell;
    });
    commit(firstNewCell);
  };

  const deleteRow = () => {
    const rows = Array.from(tableEl.querySelectorAll("tr"));
    if (rows.length <= 1) return;
    rows[rowIndex]?.remove();
    commit();
  };

  const deleteCol = () => {
    const rows = Array.from(tableEl.querySelectorAll("tr"));
    if (!rows[0] || rows[0].children.length <= 1) return;
    rows.forEach((row) => row.children[colIndex]?.remove());
    commit();
  };

  const deleteTable = () => {
    tableEl.remove();
    commit();
  };

  const alignCell = (align: "left" | "center" | "right") => {
    cellEl.style.textAlign = align;
    commit();
  };

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  const node = (
    <div
      className="absolute z-50 flex items-center gap-0.5 rounded-md border bg-popover p-1 shadow-md"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title={inHeader ? "Inserir linha (no início do corpo)" : "Linha acima"}
        onClick={stop(() => addRow(false))}
      >
        <ArrowUpToLine className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title={inHeader ? "Inserir linha (no início do corpo)" : "Linha abaixo"}
        onClick={stop(() => addRow(true))}
      >
        <ArrowDownToLine className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Coluna à esquerda" onClick={stop(() => addCol(false))}>
        <ArrowLeftToLine className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Coluna à direita" onClick={stop(() => addCol(true))}>
        <ArrowRightToLine className="h-3.5 w-3.5" />
      </Button>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Eliminar linha" onClick={stop(deleteRow)}>
        <Rows className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Eliminar coluna" onClick={stop(deleteCol)}>
        <Columns className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Eliminar tabela" onClick={stop(deleteTable)}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Alinhar à esquerda" onClick={stop(() => alignCell("left"))}>
        <AlignLeft className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Centrar" onClick={stop(() => alignCell("center"))}>
        <AlignCenter className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Alinhar à direita" onClick={stop(() => alignCell("right"))}>
        <AlignRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  return createPortal(node, containerEl);
}
