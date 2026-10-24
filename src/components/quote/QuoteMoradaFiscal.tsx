import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ExternalLink, Landmark, Loader2, RefreshCw } from "lucide-react";
import { fetchMoradaFiscal, textoMoradaFiscal, type MoradaFiscal } from "@/lib/quotes/quoteMoradas";

export interface QuoteMoradaFiscalProps {
  /** Entidade da lead/cliente escolhida no orçamento. */
  entityId: string | null;
  /** Orçamento já gravado (permite ler pela permissão do orçamento). */
  quoteId?: string | null;
  /**
   * Ficha onde se acrescenta a morada que falta (abre noutro separador:
   * /clients?open=<id> ou /leads?open=<id>). Sem isto só se mostra o aviso.
   */
  ficha?: { kind: "client" | "lead"; id: string } | null;
}


/**
 * Morada fiscal do orçamento: só leitura, é a morada principal da entidade
 * (a mesma da ficha da lead/cliente). Sem morada, avisa e dá o atalho para a
 * ficha, onde se preenche com os campos e o validador de sempre.
 */
export const QuoteMoradaFiscal = ({ entityId, quoteId, ficha }: QuoteMoradaFiscalProps) => {
  const [morada, setMorada] = useState<MoradaFiscal | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!entityId) return;
    const request = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchMoradaFiscal({ entityId, quoteId });
      if (request !== requestRef.current) return;
      setMorada(result);
    } catch (error: unknown) {
      if (request !== requestRef.current) return;
      console.error("[QuoteMoradaFiscal] load failed:", error, { entityId, quoteId });
      setLoadError((error as { message?: string })?.message || "Erro desconhecido");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [entityId, quoteId]);

  useEffect(() => {
    setMorada(null);
    setLoadError(null);
    if (!entityId) {
      requestRef.current++;
      return;
    }
    void load();
  }, [entityId, load]);

  if (!entityId) return null;

  const texto = textoMoradaFiscal(morada);
  const fichaHref = ficha?.id
    ? `${ficha.kind === "client" ? "/clients" : "/leads"}?open=${encodeURIComponent(ficha.id)}`
    : null;

  return (
    <div className="space-y-1">
      <Label className="flex items-center gap-2">
        <Landmark className="h-4 w-4" />Morada fiscal
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="A carregar morada fiscal" />}
      </Label>
      {loadError ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
          <p className="text-sm text-destructive">Não foi possível carregar a morada fiscal: {loadError}</p>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void load()}>
            <RefreshCw className="h-3 w-3 mr-1" />Tentar de novo
          </Button>
        </div>
      ) : texto ? (
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm" data-testid="quote-morada-fiscal">{texto}</p>
      ) : !loading ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-950/30">
          <p className="flex items-center gap-1.5 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />Sem morada fiscal
          </p>
          <div className="flex items-center gap-1">
            {fichaHref && (
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" asChild>
                <a href={fichaHref} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Acrescentar na ficha {ficha?.kind === "client" ? "do cliente" : "da lead"}
                </a>
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void load()}>
              <RefreshCw className="h-3 w-3 mr-1" />Atualizar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
