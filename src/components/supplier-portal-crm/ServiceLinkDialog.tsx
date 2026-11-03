import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { nomesDistritos, unidadeServicoLabel, type Distrito } from "@/lib/supplierPortal/servicoCatalogo";
import {
  SERVICE_REASON_LABEL,
  callRpcLocal,
  confidenceOf,
  formatMoney,
  type CrmCatalogItem,
  type ServiceSearchResult,
  type ServiceSuggestion,
} from "./types";

export interface ServiceLinkChoice {
  serviceId: string;
  serviceName: string;
  applyCatalogPrice: boolean;
}

interface ServiceLinkDialogProps {
  item: CrmCatalogItem | null;
  supplierId: string;
  canViewPricing: boolean;
  /** services.manage_prices (can_manage_service_prices). Sem ela liga-se sem preço. */
  canManagePrices: boolean;
  distritos: Distrito[] | null;
  linking: boolean;
  onClose: () => void;
  onConfirm: (choice: ServiceLinkChoice) => void;
}

const SEARCH_LIMIT = 30;

// Fase 5: ligar um serviço do fornecedor (subempreiteiro) a um serviço nosso
// (os do orçamento). Sugestões e pesquisa vêm de rpc_catalog_service_search;
// a ligação é feita por quem abre o diálogo (rpc_catalog_link_service).
export default function ServiceLinkDialog({
  item,
  supplierId,
  canViewPricing,
  canManagePrices,
  distritos,
  linking,
  onClose,
  onConfirm,
}: ServiceLinkDialogProps) {
  const priceOptionAvailable = canViewPricing && canManagePrices;
  const [suggestions, setSuggestions] = useState<ServiceSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ServiceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [applyPrice, setApplyPrice] = useState(priceOptionAvailable);

  // Abrir com outro artigo: sugestões pelo nome e escolha na melhor livre.
  useEffect(() => {
    setSuggestions([]);
    setSelected(null);
    setQuery("");
    setHits([]);
    setSearchError(null);
    setSuggestionsError(null);
    setApplyPrice(priceOptionAvailable);
    if (!item) return;
    let cancelled = false;
    setSuggestionsLoading(true);
    void callRpcLocal<ServiceSearchResult>("rpc_catalog_service_search", {
      p_supplier_id: supplierId,
      p_catalog_item_id: item.id,
      p_query: null,
      p_limit: 5,
    }).then(({ data, error }) => {
      if (cancelled) return;
      setSuggestionsLoading(false);
      if (error) {
        setSuggestionsError(error.message || "Não foi possível calcular as sugestões.");
        return;
      }
      const list = data?.items ?? [];
      setSuggestions(list);
      const top = list.find((s) => !s.linked_to_other);
      if (top) setSelected({ id: top.service_id, name: top.service_name });
    });
    return () => {
      cancelled = true;
    };
  }, [item, supplierId, priceOptionAvailable]);

  useEffect(() => {
    const term = query.trim();
    if (!item || term.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      const { data, error } = await callRpcLocal<ServiceSearchResult>("rpc_catalog_service_search", {
        p_supplier_id: supplierId,
        p_catalog_item_id: item.id,
        p_query: term.slice(0, 100),
        p_limit: SEARCH_LIMIT,
      });
      if (cancelled) return;
      setSearching(false);
      if (error) {
        setSearchError(error.message);
        setHits([]);
        return;
      }
      setSearchError(null);
      setHits(data?.items ?? []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, item, supplierId]);

  const optionClass = (active: boolean, disabled = false) =>
    cn(
      "w-full text-left rounded-md border px-3 py-2 text-sm flex items-start gap-2 min-h-[44px] transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      disabled ? "opacity-60 cursor-not-allowed" : active ? "border-primary bg-primary/5" : "hover:bg-muted/60",
    );

  const renderOption = (s: ServiceSuggestion, showConfidence: boolean) => {
    const active = selected?.id === s.service_id;
    const conf = confidenceOf({ score: s.score, exact: s.exact });
    return (
      <button
        key={`${s.service_id}-${s.reason}`}
        type="button"
        role="radio"
        aria-checked={active}
        aria-disabled={s.linked_to_other}
        disabled={s.linked_to_other}
        className={optionClass(active, s.linked_to_other)}
        onClick={() => setSelected({ id: s.service_id, name: s.service_name })}
      >
        <Check className={cn("w-4 h-4 mt-0.5 shrink-0", active ? "opacity-100 text-primary" : "opacity-0")} />
        <span className="flex-1 min-w-0">
          <span className="block font-medium truncate">{s.service_name}</span>
          <span className="block text-xs text-muted-foreground">
            {s.service_sku ? `SKU ${s.service_sku}` : "Sem SKU"}
            {s.unidade ? ` · ${s.unidade}` : ""}
            {s.is_active === false ? " · inativo" : ""}
            {s.item_supplier_id && !s.linked_to_other ? " · já associado a este fornecedor" : ""}
            {s.linked_to_other ? " · já ligado a outra referência deste fornecedor" : ""}
          </span>
        </span>
        {showConfidence && (
          <span className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant="outline" className="whitespace-nowrap">{SERVICE_REASON_LABEL[s.reason]}</Badge>
            <Badge variant={conf.variant} className="whitespace-nowrap">{conf.label}</Badge>
          </span>
        )}
      </button>
    );
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v && !linking) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ligar serviço do fornecedor</DialogTitle>
          <DialogDescription>
            {item && (
              <>
                <span className="font-mono">{item.supplier_ref}</span> — {item.name}
                {` · ${unidadeServicoLabel(item.unit_label)}`}
                {canViewPricing && item.base_price != null ? ` · ${formatMoney(item.base_price, item.currency)}` : ""}
                <span className="block mt-1">
                  Zona: {nomesDistritos(item.service_districts, distritos, 99)}
                  {item.mobilization_days != null ? ` · mobilização em ${item.mobilization_days} dia(s)` : ""}
                </span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="space-y-2" aria-labelledby="service-link-suggestions">
            <h4 id="service-link-suggestions" className="text-sm font-medium">Sugestões</h4>
            {suggestionsLoading ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> A procurar sugestões...</p>
            ) : suggestionsError ? (
              <p className="text-xs text-destructive">{suggestionsError}</p>
            ) : suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem sugestões para este serviço. Pesquisa o serviço abaixo.</p>
            ) : (
              <div className="space-y-1.5" role="radiogroup" aria-label="Sugestões de serviço">
                {suggestions.map((s) => renderOption(s, true))}
              </div>
            )}
          </section>

          <section className="space-y-2" aria-labelledby="service-link-search">
            <h4 id="service-link-search" className="text-sm font-medium">Escolher outro serviço</h4>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pesquisar serviço por nome ou SKU"
                className="pl-10"
                aria-label="Pesquisar serviço"
              />
            </div>
            {searching && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> A pesquisar...</p>}
            {searchError && <p className="text-xs text-destructive">{searchError}</p>}
            {!searching && query.trim().length >= 2 && hits.length === 0 && !searchError && (
              <p className="text-xs text-muted-foreground">Nenhum serviço encontrado.</p>
            )}
            {hits.length > 0 && (
              <div className="space-y-1.5 max-h-60 overflow-y-auto" role="radiogroup" aria-label="Serviços encontrados">
                {hits.map((s) => renderOption(s, false))}
                {hits.length >= SEARCH_LIMIT && (
                  <p className="text-xs text-muted-foreground">A mostrar os primeiros {SEARCH_LIMIT} — refina a pesquisa.</p>
                )}
              </div>
            )}
          </section>

          {priceOptionAvailable && item?.base_price != null && (
            <div className="flex items-start gap-2">
              <Checkbox id="service-link-apply-price" checked={applyPrice} onCheckedChange={(v) => setApplyPrice(!!v)} />
              <Label htmlFor="service-link-apply-price" className="text-sm font-normal leading-snug cursor-pointer">
                Usar o preço do catálogo como preço deste fornecedor
                <span className="block text-sm">{formatMoney(item.base_price, item.currency)} por {unidadeServicoLabel(item.unit_label)}.</span>
                <span className="block text-xs text-muted-foreground">
                  Se desmarcado, nenhum preço muda: uma associação existente mantém o preço; uma nova fica sem preço. O preço do serviço no orçamento não muda.
                </span>
              </Label>
            </div>
          )}
          {canViewPricing && !canManagePrices && item?.base_price != null && (
            <p className="text-xs text-muted-foreground">
              Sem permissão para gerir preços de serviços: a ligação não mexe no preço do fornecedor.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={linking}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!selected || linking}
            onClick={() =>
              selected &&
              onConfirm({
                serviceId: selected.id,
                serviceName: selected.name,
                applyCatalogPrice: priceOptionAvailable && applyPrice && item?.base_price != null,
              })
            }
          >
            {linking && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            <span className="truncate max-w-[18rem]">{selected ? `Ligar a «${selected.name}»` : "Escolhe um serviço"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
