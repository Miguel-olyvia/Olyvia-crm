import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";
import { buildOpenQuoteUrl } from "@/lib/quotes/dealQuoteLink";
import { format, parseISO } from "date-fns";
import { ExternalLink, FileText, Loader2 } from "lucide-react";

interface DealQuoteRow {
  id: string;
  quote_number: string | null;
  title: string | null;
  estado: string | null;
  created_at: string;
}

interface DealQuotesPanelProps {
  dealId: string;
}

/**
 * Orçamentos de um pedido de proposta, no detalhe do negócio: a contagem e a
 * lista dos que já existem, com ligação para os abrir. O botão
 * "Criar orçamento" fica no rodapé do detalhe (Deals.tsx) e cria sempre um
 * orçamento NOVO, mesmo que já haja outros.
 */
export function DealQuotesPanel({ dealId }: DealQuotesPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<DealQuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      const { data, error: err } = await (supabase as any)
        .from("quotes")
        .select("id, quote_number, title, estado, created_at")
        .eq("deal_id", dealId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (err) {
        console.error("[DealQuotesPanel] failed to load quotes", err);
        setError(true);
        setQuotes([]);
      } else {
        setQuotes((data || []) as DealQuoteRow[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [dealId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t("deals.quotes.title")}</span>
          {!loading && !error && (
            <Badge variant="secondary" className="text-xs">
              {t("deals.quotes.count", { count: quotes.length })}
            </Badge>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t("deals.quotes.loading")}
        </p>
      ) : error ? (
        <p className="text-xs text-destructive">{t("deals.quotes.loadError")}</p>
      ) : quotes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("deals.quotes.none")}</p>
      ) : (
        <ul className="space-y-1">
          {quotes.map((q) => (
            <li key={q.id}>
              <button
                type="button"
                className="w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left hover:bg-muted"
                onClick={() => navigate(buildOpenQuoteUrl(q.id))}
                title={t("deals.quotes.open")}
              >
                <span className="min-w-0 flex flex-col">
                  <span className="text-sm font-medium truncate">
                    {q.quote_number || t("deals.quotes.noNumber")}
                    {q.title ? <span className="font-normal text-muted-foreground"> · {q.title}</span> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(q.created_at), "dd/MM/yyyy")}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {q.estado && <Badge variant="outline" className="text-xs capitalize">{q.estado.replace(/_/g, " ")}</Badge>}
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
