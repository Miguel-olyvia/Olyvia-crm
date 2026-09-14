import { useEffect, useRef, useState, type ReactNode } from "react";
import { useBundleCatalogItems } from "@/hooks/useBundleCatalogItems";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Search, Wrench, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export interface DiagnosticServicePickerService {
  id: string;
  name: string;
  sku?: string;
}

interface DiagnosticServicePickerProps {
  organizationId: string;
  onSelect: (service: DiagnosticServicePickerService) => void;
  trigger?: ReactNode;
}

/**
 * Picker de seleção de um serviço do catálogo, clonado de
 * ServiceMaterialsEditor.tsx (secção "Adicionar materiais"), mas:
 *   - usa useBundleCatalogItems em modo 'service' (catalog.changeType("service")
 *     ao montar — o hook começa sempre em 'product', não aceita tipo inicial);
 *   - não persiste nada sozinho — devolve o serviço escolhido via onSelect e
 *     fecha o diálogo; quem chama decide o que fazer com a escolha
 *     (ver QuoteDiagnosticPhase.tsx / handleAcceptManualService).
 */
export default function DiagnosticServicePicker({ organizationId, onSelect, trigger }: DiagnosticServicePickerProps) {
  const [open, setOpen] = useState(false);
  const [localSearchTerm, setLocalSearchTerm] = useState("");

  const debouncedSearch = useDebounce(localSearchTerm, 300);

  const catalog = useBundleCatalogItems(organizationId);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  // O hook começa sempre em modo 'product' — muda para 'service' assim que
  // este picker monta.
  useEffect(() => {
    catalog.changeType("service");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    catalog.changeSearch(debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    if (open) {
      setLocalSearchTerm("");
      catalog.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && catalog.hasMore && !catalog.loading) {
          catalog.loadMore();
        }
      },
      { threshold: 0.1 },
    );

    if (loadMoreTriggerRef.current) {
      observer.observe(loadMoreTriggerRef.current);
    }

    return () => observer.disconnect();
  }, [open, catalog.hasMore, catalog.loading, catalog.loadMore]);

  const handlePick = (item: { id: string; name: string; sku?: string }) => {
    onSelect({ id: item.id, name: item.name, sku: item.sku });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Adicionar serviço
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Selecionar serviço</DialogTitle>
          <DialogDescription>
            Escolha o serviço do catálogo necessário para esta área.
          </DialogDescription>
        </DialogHeader>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar serviços..."
            value={localSearchTerm}
            onChange={(e) => setLocalSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <ScrollArea className="h-[350px] border rounded-md" ref={scrollContainerRef}>
          <div className="p-2 space-y-1">
            {catalog.loading && catalog.items.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                A carregar...
              </div>
            ) : catalog.items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nenhum serviço encontrado.</div>
            ) : (
              <>
                {catalog.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 rounded-md cursor-pointer transition-colors hover:bg-muted"
                    onClick={() => handlePick(item)}
                  >
                    <Wrench className="h-4 w-4 text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      {item.sku && (
                        <Badge variant="outline" className="text-xs">{item.sku}</Badge>
                      )}
                    </div>
                    <p className="font-semibold shrink-0">{formatCurrency(item.retail_price)}</p>
                  </div>
                ))}

                <div ref={loadMoreTriggerRef} className="h-4">
                  {catalog.loading && catalog.items.length > 0 && (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  )}
                </div>

                {catalog.loadError && (
                  <div className="flex flex-col items-center gap-2 py-3">
                    <p className="text-xs text-destructive text-center">{catalog.loadError}</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => catalog.loadMore()}>
                      Tentar novamente
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
