// Caixa de pesquisa global do topo (TopHeader), como a gSearch do Olyvia 2.0:
// uma caixa inline com a lista de resultados por baixo, agrupada por tipo
// (PO, EC, produto, fornecedor, guia). Setas sobem/descem, Enter abre, Esc
// fecha e limpa. Cada resultado leva à página/ficha certa (inventoryLinks.ts).
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command as CommandPrimitive } from "cmdk";
import { Loader2, Search } from "lucide-react";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { GLOBAL_SEARCH_MAX_CHARS, GLOBAL_SEARCH_MIN_CHARS } from "./globalSearchResults";
import { useInventoryGlobalSearch } from "./useInventoryGlobalSearch";

export const GLOBAL_SEARCH_PLACEHOLDER = "Procurar PO, EC, produto, SKU, EAN, fornecedor, guia…";

interface GlobalSearchProps {
  hasPermission: (permission: string) => boolean;
  className?: string;
}

function StatusLine({ children, busy }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <div role="status" className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      <span>{children}</span>
    </div>
  );
}

export function GlobalSearch({ hasPermission, className }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { status, groups, query: shownQuery, retry } = useInventoryGlobalSearch(query, { hasPermission });

  const showPanel = open && status !== "idle";
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  const choose = (href: string) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    navigate(href);
  };

  // Leitores de ecrã: os estados (a pesquisar, sem resultados…) são role=status
  // e o erro role=alert; aqui só o número de resultados encontrados.
  const liveText = status === "ready" && total ? `${total} resultado${total === 1 ? "" : "s"}` : "";

  return (
    <div role="search" aria-label="Pesquisa global" className={cn("w-full", className)}>
      <Command shouldFilter={false} loop label="Pesquisa global" className="overflow-visible bg-transparent text-inherit">
        <Popover open={showPanel} onOpenChange={setOpen}>
          <PopoverAnchor asChild>
            <div ref={anchorRef} className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sidebar-foreground/70" aria-hidden="true" />
              <CommandPrimitive.Input
                ref={inputRef}
                value={query}
                maxLength={GLOBAL_SEARCH_MAX_CHARS}
                onValueChange={(v) => {
                  setQuery(v);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setQuery("");
                    setOpen(false);
                  }
                }}
                placeholder={GLOBAL_SEARCH_PLACEHOLDER}
                aria-label="Pesquisa global"
                autoComplete="off"
                spellCheck={false}
                className="flex h-10 w-full rounded-md border-none bg-sidebar-accent py-2 pl-10 pr-9 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/50 focus-visible:ring-1 focus-visible:ring-ring"
              />
              {status === "loading" ? (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-sidebar-foreground/70" aria-hidden="true" />
              ) : null}
            </div>
          </PopoverAnchor>
          <PopoverContent
            align="start"
            sideOffset={6}
            className="w-[var(--radix-popover-trigger-width)] min-w-[320px] p-0"
            // O foco fica na caixa (escrever e setas); a lista é controlada pelo cmdk.
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
            }}
          >
            <span className="sr-only" aria-live="polite">{liveText}</span>
            <CommandList className="max-h-[70vh]" aria-label="Resultados da pesquisa">
              {status === "short" ? (
                <StatusLine>Escreva pelo menos {GLOBAL_SEARCH_MIN_CHARS} caracteres.</StatusLine>
              ) : null}
              {status === "loading" ? <StatusLine busy>A pesquisar…</StatusLine> : null}
              {status === "unavailable" ? (
                <StatusLine>A pesquisa global ainda não está disponível.</StatusLine>
              ) : null}
              {status === "error" ? (
                <div className="flex items-center justify-between gap-2 px-3 py-4 text-sm text-destructive" role="alert">
                  <span>Não foi possível pesquisar.</span>
                  <button
                    type="button"
                    className="rounded px-2 py-1 text-xs font-medium underline underline-offset-2 hover:bg-muted"
                    onClick={retry}
                  >
                    Tentar de novo
                  </button>
                </div>
              ) : null}
              {status === "ready" && total === 0 ? (
                <StatusLine>Sem resultados para “{shownQuery}”.</StatusLine>
              ) : null}
              {status === "ready"
                ? groups.map((g) => (
                    <CommandGroup key={g.key} heading={g.label}>
                      {g.items.map((it) => (
                        <CommandItem
                          key={it.key}
                          value={it.key}
                          onSelect={() => choose(it.href)}
                          className="flex cursor-pointer flex-col items-start gap-0.5 py-2"
                        >
                          <span className="font-medium">{it.title}</span>
                          {it.subtitle ? <span className="text-xs text-muted-foreground">{it.subtitle}</span> : null}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))
                : null}
            </CommandList>
          </PopoverContent>
        </Popover>
      </Command>
    </div>
  );
}
