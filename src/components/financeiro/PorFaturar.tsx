import { useState } from "react";
import { FileText, Hammer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { RegistarFaturaForm } from "./RegistarFaturaForm";
import { formatarData } from "./formatar";
import type { DadosFatura, TranchePorFaturar } from "@/hooks/financeiro/financeiro";

const chave = (t: Pick<TranchePorFaturar, "contract_id" | "tranche_ordem">) => `${t.contract_id}:${t.tranche_ordem}`;

/**
 * "Por faturar": uma linha por tranche de contrato assinado sem fatura ativa.
 * "Registar" abre o formulário na própria linha.
 */
export function PorFaturar({
  lista,
  podeRegistar,
  aGravar,
  aoRegistar,
}: {
  lista: TranchePorFaturar[];
  podeRegistar: boolean;
  /** A chave da linha que está a gravar (ou null). */
  aGravar: string | null;
  aoRegistar: (tranche: TranchePorFaturar, dados: DadosFatura, pdf: File | null) => Promise<boolean>;
}) {
  const [aberta, setAberta] = useState<string | null>(null);

  if (lista.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Nada por faturar. Os contratos assinados aparecem aqui, uma linha por tranche.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-md border">
      {lista.map((t) => {
        const k = chave(t);
        return (
          <li key={k} className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className="truncate font-medium">{t.cliente_nome}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{t.contrato_numero ?? "Contrato s/ número"}</span>
                  {t.assinado_em && <> · assinado a {formatarData(t.assinado_em)}</>}
                  {t.contrato_valor != null && <> · contrato {formatCurrency(t.contrato_valor)}</>}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <Badge variant="secondary">
                    {t.tranche_descricao}
                    {t.n_tranches > 1 && ` · ${t.tranche_ordem} de ${t.n_tranches}`}
                  </Badge>
                  {t.dispara_obra && (
                    <Badge variant="outline" className="gap-1 border-emerald-500/50 text-emerald-700">
                      <Hammer className="h-3 w-3" /> o 1.º pagamento cria a obra
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold tabular-nums">{formatCurrency(t.valor_sugerido)}</span>
                {podeRegistar && aberta !== k && (
                  <Button size="sm" onClick={() => setAberta(k)} aria-label={`Registar fatura: ${t.cliente_nome}, ${t.tranche_descricao}`}>
                    <FileText className="mr-1 h-4 w-4" /> Registar
                  </Button>
                )}
              </div>
            </div>
            {aberta === k && (
              <RegistarFaturaForm
                tranche={t}
                aGravar={aGravar === k}
                aoCancelar={() => setAberta(null)}
                aoRegistar={async (dados, pdf) => {
                  if (await aoRegistar(t, dados, pdf)) setAberta(null);
                }}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export { chave as chaveDaTranche };
