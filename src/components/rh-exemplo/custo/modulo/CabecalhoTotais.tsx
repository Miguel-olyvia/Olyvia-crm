/** Os totais da organização no mês escolhido: custo total, retribuição, encargos, avulsos, equipamentos e número de pessoas. */
import { Card, CardContent } from "@/components/ui/card";
import type { TotaisCusto } from "@/components/rh-exemplo/lib/custoOrganizacao";
import { useTranslation } from "@/hooks/useTranslation";
import { euros } from "@/components/rh-exemplo/custo/formato";

interface Cartao {
  chave: string;
  valor: string;
  nota?: string;
  forte?: boolean;
}

export function CabecalhoTotais({ totais }: { totais: TotaisCusto }) {
  const { t } = useTranslation();
  const eur = (v: number) => euros(v, "—");
  const cartoes: Cartao[] = [
    { chave: "total", valor: eur(totais.total), forte: true, nota: totais.semValor > 0 ? t("rhCustos.totais.semValor", { n: totais.semValor }) : undefined },
    { chave: "retribuicao", valor: eur(totais.retribuicao) },
    { chave: "encargos", valor: eur(totais.encargos + totais.seguro) },
    { chave: "avulsos", valor: eur(totais.avulsos) },
    { chave: "equipamentos", valor: eur(totais.equipamentos), nota: t("rhCustos.totais.equipamentosN", { n: totais.nEquipamentos }) },
    { chave: "pessoas", valor: String(totais.pessoas) },
  ];
  return (
    <section aria-label={t("rhCustos.totais")}>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cartoes.map((c) => (
          <Card key={c.chave} className={c.forte ? "border-primary/50" : undefined}>
            <CardContent className="space-y-0.5 p-3">
              <dt className="text-xs text-muted-foreground">{t(`rhCustos.totais.${c.chave}`)}</dt>
              <dd className={`tabular-nums ${c.forte ? "text-xl font-bold" : "text-lg font-semibold"}`} data-testid={`rhcustos-total-${c.chave}`}>{c.valor}</dd>
              {c.nota && <dd className="text-xs text-muted-foreground">{c.nota}</dd>}
            </CardContent>
          </Card>
        ))}
      </dl>
    </section>
  );
}
