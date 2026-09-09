/**
 * Visao geral da ficha: o painel agregador, no molde do Factorial.
 *
 * A grelha de cartoes (Estado do ponto, Ausencias, Folha de horas, Formacoes,
 * Tarefas, Despesas, Ativos, Compensacoes) esta TODA em estado vazio nesta
 * ronda: nenhum desses modulos existe ainda. A moldura fica de pe porque e ela
 * que da a forma ao ecra -- e porque cada modulo que chegar preenche o seu
 * cartao sem se mexer no resto.
 *
 * A barra lateral DETALHES e a unica parte com dados reais, lidos do nucleo
 * `pessoas`.
 */
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Award,
  Banknote,
  CalendarClock,
  Clock,
  GraduationCap,
  Laptop,
  ListChecks,
  Receipt,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type { DiaSemana, Pessoa } from "@/types/hr";

interface PessoaVisaoGeralTabProps {
  pessoa: Pessoa;
  /** Nome de quem a pessoa reporta, ja resolvido. `null` = sem chefia definida. */
  reportaANome: string | null;
  /** Nome da entidade legal, ja resolvido. */
  entidadeLegalNome: string | null;
}

export function PessoaVisaoGeralTab({
  pessoa,
  reportaANome,
  entidadeLegalNome,
}: PessoaVisaoGeralTabProps) {
  const { t } = useTranslation();

  const cartoes = [
    { key: "ponto", labelKey: "hr.visaoGeral.cards.ponto", icon: Clock },
    { key: "ausencias", labelKey: "hr.pessoa.tabs.ausencias", icon: CalendarClock },
    { key: "folhaHoras", labelKey: "hr.visaoGeral.cards.folhaHoras", icon: ListChecks },
    { key: "formacoes", labelKey: "hr.visaoGeral.cards.formacoes", icon: GraduationCap },
    { key: "tarefas", labelKey: "hr.pessoa.tabs.tarefas", icon: Award },
    { key: "despesas", labelKey: "hr.visaoGeral.cards.despesas", icon: Receipt },
    { key: "activos", labelKey: "hr.visaoGeral.cards.activos", icon: Laptop },
    { key: "compensacoes", labelKey: "hr.visaoGeral.cards.compensacoes", icon: Banknote },
  ] as const;

  const detalhes: Array<{ labelKey: string; valor: string | null }> = [
    { labelKey: "hr.detalhes.reportaA", valor: reportaANome },
    { labelKey: "hr.laborais.emailTrabalho", valor: pessoa.email_trabalho },
    { labelKey: "hr.detalhes.entidadeLegal", valor: entidadeLegalNome },
    { labelKey: "hr.detalhes.dataInicio", valor: pessoa.data_admissao },
    {
      labelKey: "hr.detalhes.diasTrabalho",
      valor:
        pessoa.dias_trabalho && pessoa.dias_trabalho.length > 0
          ? pessoa.dias_trabalho.map((dia: DiaSemana) => t(`hr.dias.${dia}`)).join(" · ")
          : null,
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cartoes.map(({ key, labelKey, icon: Icon }) => (
          <Card key={key} className="border-dashed">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t(labelKey)}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                {t("hr.emConstrucao.title")}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="h-fit">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("hr.detalhes.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {detalhes.map(({ labelKey, valor }) => (
            <div key={labelKey} className="space-y-0.5">
              <p className="text-xs text-muted-foreground">{t(labelKey)}</p>
              <p className="text-sm">
                {valor ?? <span className="text-muted-foreground">{t("hr.campos.semValor")}</span>}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
