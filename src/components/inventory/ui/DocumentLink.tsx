// Ligação a um documento (PO, EC, guia, contagem…) — .link.mono do mockup:
// monoespaçado, sublinhado, cor primária, sem quebra de linha.
//
// API: <DocumentLink to?="/purchase-orders?open=…" onClick?={fn} title? className?>PO-0042</DocumentLink>
//   to      → <Link> do react-router (use os builders de inventoryLinks.ts).
//   onClick → botão (abre folha/diálogo no próprio ecrã).
//   nenhum  → texto simples monoespaçado (sem permissão ou documento inexistente).
//   children vazio → "—".
// Dentro de linhas clicáveis o clique não chega à linha (stopPropagation).
import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface DocumentLinkProps {
  children: ReactNode;
  to?: string;
  onClick?: () => void;
  title?: string;
  /** false = texto normal (ex.: nome de fornecedor); por omissão monoespaçado. */
  mono?: boolean;
  className?: string;
}

const MONO = "whitespace-nowrap font-mono text-[0.92em]";
const LINK =
  "cursor-pointer text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

export function DocumentLink({ children, to, onClick, title, mono = true, className }: DocumentLinkProps) {
  if (children == null || children === "") return <>—</>;
  const stop = (e: MouseEvent) => e.stopPropagation();
  const cls = cn(mono && MONO, className);
  if (to) {
    return (
      <Link
        to={to}
        title={title}
        className={cn(LINK, cls)}
        onClick={(e) => {
          stop(e);
          onClick?.();
        }}
      >
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        title={title}
        className={cn("border-0 bg-transparent p-0 text-left", LINK, cls)}
        onClick={(e) => {
          stop(e);
          onClick();
        }}
      >
        {children}
      </button>
    );
  }
  return (
    <span title={title} className={cls}>
      {children}
    </span>
  );
}
