// Secção "Histórico" da folha de uma Encomenda Cliente (EcFolha do 2.0): lista
// do mais recente para o mais antigo, "data hora — o que aconteceu".
import { Loader2 } from "lucide-react";
import type { ClientOrderOrigin } from "./clientOrderFilters";
import { useClientOrderHistory } from "./clientOrderHistory";

const fmtDateTime = (v: string): string => {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export function ClientOrderHistorySection({
  organizationId,
  contractId,
  origin,
  version,
}: {
  organizationId: string | null | undefined;
  contractId: string;
  origin: ClientOrderOrigin;
  version: number;
}) {
  const { data, isLoading, isError } = useClientOrderHistory(organizationId, contractId, origin, version);
  return (
    <section aria-labelledby={`ec-hist-${contractId}`} className="mt-1">
      <h3 id={`ec-hist-${contractId}`} className="mb-1.5 text-sm font-semibold">Histórico</h3>
      {isLoading ? (
        <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />A carregar…
        </p>
      ) : isError ? (
        <p className="text-[13px] text-muted-foreground">Não foi possível carregar o histórico.</p>
      ) : !data || data.entries.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Sem registos.</p>
      ) : (
        <>
          <ol className="m-0 list-decimal space-y-0.5 pl-[18px] text-[13px]">
            {data.entries.map((e) => (
              <li key={e.key}>
                <span className="tabular-nums">{fmtDateTime(e.at)}</span> — {e.text}
              </li>
            ))}
          </ol>
          {data.partial ? (
            <p className="mt-1 text-xs text-muted-foreground">Parte do histórico não se conseguiu ler.</p>
          ) : null}
        </>
      )}
    </section>
  );
}
