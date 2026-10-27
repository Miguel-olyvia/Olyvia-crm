// Separador "Histórico" da folha da encomenda (TabHistorico do Olyvia 2.0): o registo de auditoria da PO em texto.
// Só leitura; os dados vêm de usePoAuditLog (a mesma leitura serve a linha de etapas).
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDayTime } from "./poSheetFlow";
import { poHistoryEntries } from "./poHistory";
import type { PoAuditState } from "./usePoAuditLog";

export function PoHistoryTab({ audit, onRetry }: { audit: PoAuditState; onRetry: () => void }) {
  if (audit.loading && audit.rows.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />A ler o histórico…
      </p>
    );
  }
  if (audit.error) {
    return (
      <p className="text-sm text-muted-foreground">
        Não foi possível ler o histórico.{" "}
        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onRetry}>
          Tentar de novo
        </Button>
      </p>
    );
  }
  const entries = poHistoryEntries(audit.rows, audit.names);
  if (!entries.length) {
    return <p className="text-sm text-muted-foreground">Sem histórico registado para esta encomenda (ou sem permissão para o ver).</p>;
  }
  return (
    <ol className="space-y-2 pl-5 text-sm [list-style:decimal]" aria-label="Histórico da encomenda">
      {entries.map((e) => (
        <li key={e.id}>
          <b className="tabular-nums">{fmtDayTime(e.at)}</b> — {e.title}
          {e.actor ? <span className="text-muted-foreground"> · {e.actor}</span> : null}
          {e.details.length > 0 && (
            <ul className="mt-0.5 text-xs text-muted-foreground">
              {e.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
