import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface ProductOption {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
}

const MAX_RESULTS = 50;

const productText = (p: ProductOption) => [p.name, p.sku, p.barcode].filter(Boolean).join(" ").toLowerCase();

interface ProductPickerProps {
  id?: string;
  products: ProductOption[];
  value: string;
  onChange: (productId: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  /**
   * Texto a mostrar quando `value` está preenchido mas o produto não está em
   * `products` (lista ainda a carregar, ou produto inativo/apagado que só
   * chega aqui bloqueado a partir de outra página).
   */
  fallbackLabel?: string;
  /** true enquanto `products` está a ser carregado. */
  loading?: boolean;
}

/**
 * Campo "Produto" do protótipo ("Pesquisar nome, SKU ou EAN") sobre o catálogo
 * `products` da organização ativa. Filtra no cliente e mostra no máximo 50.
 * Popover `modal`: dentro de um Dialog, sem isto o focus trap rouba o foco.
 */
export function ProductPicker({
  id, products, value, onChange, disabled, invalid, fallbackLabel, loading,
}: ProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = products.find((p) => p.id === value);
  const isLoading = loading ?? products.length === 0;
  // Valor escolhido mas fora da lista: nunca mostrar o placeholder, que fazia
  // parecer que não havia produto nenhum.
  const triggerLabel = selected
    ? `${selected.name}${selected.sku ? ` · ${selected.sku}` : ""}`
    : value
      ? fallbackLabel || (isLoading ? "A carregar…" : "Produto inativo ou indisponível")
      : "Pesquisar nome, SKU ou EAN";

  const results = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = terms.length === 0
      ? products
      : products.filter((p) => {
        const text = productText(p);
        return terms.every((t) => text.includes(t));
      });
    return matches.slice(0, MAX_RESULTS);
  }, [products, search]);

  return (
    <Popover modal open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", invalid && "border-destructive")}
        >
          <span className={cn("truncate", !selected && !(value && fallbackLabel) && "text-muted-foreground")}>
            {triggerLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[22rem] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Nome, SKU ou EAN…" value={search} onValueChange={setSearch} />
          <CommandList className="max-h-72 overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
            <CommandGroup>
              {results.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => { onChange(p.id); setOpen(false); setSearch(""); }}
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value === p.id ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.sku ? <span className="ml-2 shrink-0 text-xs text-muted-foreground">{p.sku}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
            {results.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">
                {isLoading ? "A carregar produtos…" : "Nenhum produto encontrado."}
              </p>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
