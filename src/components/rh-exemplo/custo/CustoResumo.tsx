/**
 * O quadro do custo do mês (fluxo 11): bruto, encargos, outros custos e custo total; ao lado o custo repartido por 14 em 12,
 * o saldo do banco de horas em euros (fora do custo) e o custo por hora; e os acumulados. Só para quem vê salários.
 * Sem salário registado o bruto e o custo ficam «sem valor».
 */
import { Badge } from "@/components/ui/badge";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { useTranslation } from "@/hooks/useTranslation";
import { useLanguage } from "@/contexts/LanguageContext";
import { euros, nomeDoMes } from "./formato";
import { SALDO_BANCO_HORAS_EXEMPLO } from "@/components/rh-exemplo/lib/custoOrganizacao";
import type { CustoDaPessoa } from "./custoLido";

interface LinhaProps {
  rotulo: string;
  valor: string;
  ajuda?: string;
  forte?: boolean;
}

function Linha({ rotulo, valor, ajuda, forte }: LinhaProps) {
  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5 ${forte ? "border-t font-semibold" : ""}`}>
      <dt className="text-sm">
        {rotulo}
        {ajuda && <span className="block text-xs font-normal text-muted-foreground">{ajuda}</span>}
      </dt>
      <dd className="text-sm tabular-nums">{valor}</dd>
    </div>
  );
}

export function CustoResumo({ custo }: { custo: CustoDaPessoa }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { atual: c } = custo;
  const sem = t("rhA.custo.semValor");
  const eur = (v: number | null) => euros(v, sem);
  const horas = (n: number) => t("rhA.custo.horas", { n });

  return (
    <div className="space-y-4">
      <Seccao titulo={t("rhA.custo.mesTitulo", { mes: nomeDoMes(custo.mes, language) })} marca={c.total === null && <Badge variant="outline" className="font-normal">{t("rhA.custo.semSalario")}</Badge>}>
        <dl className="max-w-xl divide-y divide-border/60">
          <Linha rotulo={t("rhCustos.resumo.retribuicao")} ajuda={t("rhCustos.resumo.retribuicaoAjuda")} valor={eur(custo.retribuicaoMes)} />
          <Linha rotulo={t("rhA.custo.bruto")} ajuda={t("rhA.custo.brutoAjuda")} valor={eur(c.bruto)} />
          <Linha rotulo={t("rhA.custo.encargos")} ajuda={t("rhA.custo.encargosAjuda")} valor={eur(c.bruto === null ? null : c.encargos)} />
          <Linha rotulo={t("rhCustos.resumo.equipamentos")} ajuda={t("rhCustos.resumo.equipamentosAjuda", { n: c.nEquipamentos })} valor={eur(c.outrosCustos)} />
          <Linha forte rotulo={t("rhA.custo.total")} valor={eur(c.total)} />
        </dl>
      </Seccao>

      <Seccao titulo={t("rhA.custo.aoLado")}>
        <dl className="max-w-xl divide-y divide-border/60">
          <Linha rotulo={t("rhA.custo.repartido")} ajuda={t("rhA.custo.repartidoAjuda")} valor={eur(c.repartido)} />
          <Linha rotulo={t("rhA.custo.bancoHoras", { n: SALDO_BANCO_HORAS_EXEMPLO })} ajuda={t("rhA.custo.bancoHorasAjuda")} valor={eur(c.saldoEuros)} />
          <Linha rotulo={t("rhA.custo.porHoraPrevista", { n: horas(c.horasPrevistas) })} valor={eur(c.porHoraPrevista)} />
          <Linha rotulo={t("rhA.custo.porHoraFeita", { n: horas(c.horasFeitas) })} valor={eur(c.porHoraFeita)} />
        </dl>
      </Seccao>

      <Seccao titulo={t("rhA.custo.acumulados")}>
        <dl className="max-w-xl divide-y divide-border/60">
          <Linha rotulo={t("rhA.custo.acumuladoAno")} valor={eur(custo.acumuladoAno)} />
          <Linha rotulo={t("rhA.custo.acumuladoAdmissao")} valor={eur(custo.acumuladoAdmissao)} />
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">{t("rhA.custo.exemploNota")}</p>
      </Seccao>
    </div>
  );
}
