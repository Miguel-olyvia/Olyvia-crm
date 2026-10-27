/** Na linha aberta do módulo «Custos»: o que conta neste mês para a pessoa, item a item, com «Como conta» e o valor do mês. */
import { useMemo } from "react";
import { useCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { useAvulsosReais } from "@/components/rh-exemplo/custo/lancamentosCusto";
import { itensDoMes } from "@/components/rh-exemplo/lib/custoItens";
import { useTranslation } from "@/hooks/useTranslation";
import { euros, nomeDoMes } from "@/components/rh-exemplo/custo/formato";
import { rotuloDaConta } from "@/components/rh-exemplo/custo/rotuloConta";

export function ItensDoMes({ pessoaId }: { pessoaId: string }) {
  const { t, language } = useTranslation();
  const mes = useCusto((e) => e.mes);
  const equipamentos = useCusto((e) => e.equipamentos);
  // Os avulsos sao os lancamentos reais do periodo (da base), nao os do store de exemplo.
  const avulsosPorPessoa = useAvulsosReais();
  const avulsos = avulsosPorPessoa.get(pessoaId);
  const itens = useMemo(() => itensDoMes(pessoaId, equipamentos, avulsos ?? [], mes), [pessoaId, equipamentos, avulsos, mes]);
  const titulo = t("rhCustos.itens.titulo", { mes: nomeDoMes(mes, language) });
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{titulo}</p>
      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("rhCustos.itens.vazio")}</p>
      ) : (
        <ul aria-label={titulo} className="divide-y rounded-md border bg-background text-sm">
          {itens.map((i) => (
            <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-1.5">
              <span className="min-w-0">
                <span className="text-xs text-muted-foreground">{t(`rhCustos.itens.${i.tipo}`)}: </span>
                {i.descricao}
                <span className="block text-xs text-muted-foreground">{t("rhCustos.conta.titulo")}: {rotuloDaConta(t, i.conta, language)}</span>
              </span>
              <span className="tabular-nums font-medium">{euros(i.valorMes, "—")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
