/**
 * «As contas do mes»: o custo da pessoa passo a passo, numa tabela (salario base, duodecimos, extras, IHT, km, ajudas, manuais,
 * a retribuicao, a TSU, o seguro do cargo, os equipamentos e o custo total), cada linha com a sua formula. Mostra o que o calculo
 * devolveu, nunca outra conta: as linhas vem de `contasDoMes` com a entrada que o proprio custo usou, por isso a soma bate.
 * Num mes fechado so a retribuicao e as horas sao as gravadas no fecho; a TSU, o seguro e os equipamentos sao os de hoje, e o ecra di-lo.
 */
import { Seccao } from "@/components/ficha-comum/Seccao";
import type { LinhaConta } from "@/components/rh-exemplo/lib/contasDoMes";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { CustoDaPessoa } from "./custoLido";
import { euros, nomeDoMes } from "./formato";
import { useContasDoMes } from "./useContasDoMes";

interface CustoContasProps {
  custo: CustoDaPessoa;
  nome: string;
  /** O periodo do mes esta fechado: as contas assentam so no gravado no fecho. */
  fechado: boolean;
}

/** Subtotais e total levam «=» no rotulo e linha forte: nao dependem so da cor ou do peso. */
const eFecho = (l: LinhaConta): boolean => l.tipo !== "parcela";

export function CustoContas({ custo, nome, fechado }: CustoContasProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const contas = useContasDoMes(custo);
  const estimado = custo.estimadoPeloCargo !== undefined;

  return (
    <Seccao nivel={4} titulo={t("rhContas.titulo")}>
      <p className="mb-2 max-w-3xl text-sm text-muted-foreground">{t("rhContas.intro")}</p>
      {fechado && <p role="status" className="mb-2 text-sm text-muted-foreground">{t("rhContas.fechado")}</p>}
      {contas.linhas.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">{t("rhContas.semRetribuicao")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <caption className="sr-only">{t("rhContas.caption", { nome, mes: nomeDoMes(custo.mes, language) })}</caption>
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="py-1.5 pr-3 font-medium">{t("rhContas.col.conta")}</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">{t("rhContas.col.formula")}</th>
                <th scope="col" className="py-1.5 text-right font-medium">{t("rhContas.col.valor")}</th>
              </tr>
            </thead>
            <tbody>
              {contas.linhas.map((l) => (
                <tr key={l.chave} className={cn("border-b border-border/60 align-baseline", eFecho(l) && "border-t font-semibold")}>
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                    <span className={cn(eFecho(l) && "font-semibold")}>{eFecho(l) ? "= " : ""}{t(`rhContas.linha.${l.chave}`)}</span>
                    {l.nota && <span className="block text-xs font-normal text-muted-foreground">{t(`rhContas.nota.${l.nota}`)}</span>}
                  </th>
                  <td className="py-1.5 pr-3 text-muted-foreground tabular-nums">{l.formula}</td>
                  <td className="whitespace-nowrap py-1.5 text-right tabular-nums">
                    {euros(l.valor, "")}
                    {l.estimado && <span className="ml-1 text-xs font-normal text-muted-foreground">({t("rhContas.estimado")})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {contas.linhas.length > 0 && (
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          <p>{t("rhContas.notaTsu")}</p>
          {estimado && <p>{t("rhContas.notaEstimado")}</p>}
        </div>
      )}
    </Seccao>
  );
}
