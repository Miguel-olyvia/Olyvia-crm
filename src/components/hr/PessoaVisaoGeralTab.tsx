/**
 * Visao geral da ficha: o painel agregador, no molde do Factorial.
 *
 * QUATRO cartoes ja tem modulo real por tras -- Estado do ponto e Folha de
 * horas (`pessoas_horario_realizado`, ja trazido pela ficha), Ausencias
 * (pedidos pendentes, unica consulta nova desta ronda) e Compensacoes
 * (`pessoas_retribuicoes`, ja trazido pela ficha). Marca-los como "Em
 * construcao" quando ja respondem e pior do que nao ter o cartao: manda quem
 * usa a ficha para um separador vazio quando o separador ao lado ja tinha a
 * resposta.
 *
 * Os outros quatro (Formacoes, Tarefas, Despesas, Ativos) ficam mesmo vazios:
 * nao ha modulo nenhum por tras. `formacao_inicio`/`formacao_fim` no vinculo
 * sao so as datas do periodo de formacao inicial do contrato -- nao um
 * registo de formacoes (cursos, certificacoes, validade) -- por isso o
 * cartao de Formacoes NAO usa essas datas e continua em construcao.
 *
 * A barra lateral DETALHES continua a ser dados reais, lidos do nucleo
 * `pessoas`.
 */
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import { formatarDuracao, hojeIso } from "@/lib/hr/assiduidade";
import type { DiaSemana, HorarioRealizado, Pessoa, PessoaRetribuicao, PessoaVinculo } from "@/types/hr";

interface PessoaVisaoGeralTabProps {
  pessoa: Pessoa;
  /** Nome de quem a pessoa reporta, ja resolvido. `null` = sem chefia definida. */
  reportaANome: string | null;
  /** Nome da entidade legal, ja resolvido. */
  entidadeLegalNome: string | null;
  /**
   * Os vinculos da pessoa. Os dias de trabalho vem do EM VIGOR (activo ou
   * suspenso) -- `pessoas.dias_trabalho` e legenda legada desde 20261120140000
   * e a coluna foi largada em 20261125040000.
   */
  vinculos: PessoaVinculo[];
  /** Ja trazido pela ficha (`usePessoa`) -- sem consulta propria. */
  horarioRealizado: HorarioRealizado[];
  /** Ja trazido pela ficha (`usePessoa`) -- sem consulta propria. */
  retribuicao: PessoaRetribuicao | null;
  /** `hr.pessoas.horario_realizado.view`. Sem ela, Ponto e Folha de horas ficam sem numero. */
  podeVerRealizado: boolean;
  /**
   * `hr.ausencias.view || souAPessoa || hr.ausencias.aprovar.chefia` -- o
   * mesmo criterio de `PessoaAusenciasTab`. Sem ela, o cartao fica sem numero.
   */
  podeVerAusencias: boolean;
  /**
   * `hr.pessoas.retribuicao.view`. CRITICO: ser chefe de alguem nao da acesso
   * ao vencimento dessa pessoa -- sem esta permissao o cartao NUNCA mostra o
   * valor, so o estado de acesso.
   */
  podeVerRetribuicao: boolean;
  /** Muda o separador activo da ficha (o mesmo `?tab=` que a ficha ja usa). */
  onAbrirSeparador: (separador: string) => void;
}

const ESTADOS_PEDIDO_PENDENTE = ["pendente_chefia", "pendente_rh"];

/** Um cartao com moldura mas sem destino nem dados: o estado "em construcao". */
function CartaoVazio({ labelKey, icon: Icon }: { labelKey: string; icon: typeof Clock }) {
  const { t } = useTranslation();
  return (
    <Card className="border-dashed">
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
  );
}

/** Um cartao com dados reais: clicavel, leva ao separador onde a coisa vive. */
function CartaoComDados({
  labelKey,
  icon: Icon,
  valor,
  ariaLabel,
  onAbrir,
}: {
  labelKey: string;
  icon: typeof Clock;
  valor: string;
  ariaLabel: string;
  onAbrir: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={ariaLabel}
      className={cn(
        "w-full rounded-lg border bg-card text-left text-card-foreground shadow-sm transition-all duration-200",
        "hover:shadow-md hover:bg-accent/50",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{t(labelKey)}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-sm font-medium tabular-nums">{valor}</p>
      </CardContent>
    </button>
  );
}

export function PessoaVisaoGeralTab({
  pessoa,
  reportaANome,
  entidadeLegalNome,
  vinculos,
  horarioRealizado,
  retribuicao,
  podeVerRealizado,
  podeVerAusencias,
  podeVerRetribuicao,
  onAbrirSeparador,
}: PessoaVisaoGeralTabProps) {
  const { t } = useTranslation();

  const vinculoEmVigor = vinculos.find(
    (vinculo) => vinculo.estado === "activo" || vinculo.estado === "suspenso",
  );

  const hoje = hojeIso();
  const mesActual = hoje.slice(0, 7);

  const minutosHoje = horarioRealizado
    .filter((linha) => linha.data === hoje)
    .reduce((soma, linha) => soma + (linha.minutos ?? 0), 0);

  const minutosEsteMes = horarioRealizado
    .filter((linha) => linha.data.startsWith(mesActual))
    .reduce((soma, linha) => soma + (linha.minutos ?? 0), 0);

  /**
   * Unica consulta nova desta ronda: pedidos de ausencia pendentes. So corre
   * quando ha permissao para ver, e o resto da ficha (assiduidade,
   * compensacoes) continua a vir so da ficha ja carregada.
   */
  const [ausenciasPendentes, setAusenciasPendentes] = useState<number | null>(null);

  useEffect(() => {
    if (!podeVerAusencias) {
      setAusenciasPendentes(null);
      return;
    }
    let cancelado = false;
    hrFrom("pessoas_ausencias_pedidos")
      .select("id", { count: "exact", head: true })
      .eq("pessoa_id", pessoa.id)
      .in("estado", ESTADOS_PEDIDO_PENDENTE)
      .then(({ count, error }: { count: number | null; error: unknown }) => {
        if (cancelado) return;
        if (error) {
          if (!isPermissionError(error)) captureFlowError(error, "hr-ausencias-load");
          setAusenciasPendentes(null);
          return;
        }
        setAusenciasPendentes(count ?? 0);
      });
    return () => {
      cancelado = true;
    };
  }, [podeVerAusencias, pessoa.id]);

  const detalhes: Array<{ labelKey: string; valor: string | null }> = [
    { labelKey: "hr.detalhes.reportaA", valor: reportaANome },
    { labelKey: "hr.laborais.emailTrabalho", valor: pessoa.email_trabalho },
    { labelKey: "hr.detalhes.entidadeLegal", valor: entidadeLegalNome },
    { labelKey: "hr.detalhes.dataInicio", valor: pessoa.data_admissao },
    {
      labelKey: "hr.detalhes.diasTrabalho",
      valor:
        vinculoEmVigor?.dias_uteis && vinculoEmVigor.dias_uteis.length > 0
          ? vinculoEmVigor.dias_uteis.map((dia: DiaSemana) => t(`hr.dias.${dia}`)).join(" · ")
          : null,
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {podeVerRealizado ? (
          <CartaoComDados
            labelKey="hr.visaoGeral.cards.ponto"
            icon={Clock}
            valor={
              minutosHoje > 0
                ? t("hr.visaoGeral.pontoHoje", { duracao: formatarDuracao(minutosHoje) })
                : t("hr.visaoGeral.pontoSemRegisto")
            }
            ariaLabel={t("hr.visaoGeral.cards.ponto")}
            onAbrir={() => onAbrirSeparador("planeamento")}
          />
        ) : (
          <CartaoVazio labelKey="hr.visaoGeral.cards.ponto" icon={Clock} />
        )}

        <CartaoComDados
          labelKey="hr.pessoa.tabs.ausencias"
          icon={CalendarClock}
          valor={
            !podeVerAusencias
              ? t("hr.semAcesso")
              : ausenciasPendentes === null
                ? "…"
                : ausenciasPendentes > 0
                  ? t("hr.visaoGeral.ausenciasPendentes", { contagem: ausenciasPendentes })
                  : t("hr.visaoGeral.semPedidosPendentes")
          }
          ariaLabel={t("hr.pessoa.tabs.ausencias")}
          onAbrir={() => onAbrirSeparador("ausencias")}
        />

        {podeVerRealizado ? (
          <CartaoComDados
            labelKey="hr.visaoGeral.cards.folhaHoras"
            icon={ListChecks}
            valor={
              minutosEsteMes > 0
                ? t("hr.visaoGeral.horasEsteMes", { duracao: formatarDuracao(minutosEsteMes) })
                : t("hr.visaoGeral.semHorasEsteMes")
            }
            ariaLabel={t("hr.visaoGeral.cards.folhaHoras")}
            onAbrir={() => onAbrirSeparador("planeamento")}
          />
        ) : (
          <CartaoVazio labelKey="hr.visaoGeral.cards.folhaHoras" icon={ListChecks} />
        )}

        <CartaoVazio labelKey="hr.visaoGeral.cards.formacoes" icon={GraduationCap} />
        <CartaoVazio labelKey="hr.pessoa.tabs.tarefas" icon={Award} />
        <CartaoVazio labelKey="hr.visaoGeral.cards.despesas" icon={Receipt} />
        <CartaoVazio labelKey="hr.visaoGeral.cards.activos" icon={Laptop} />

        <CartaoComDados
          labelKey="hr.visaoGeral.cards.compensacoes"
          icon={Banknote}
          valor={
            !podeVerRetribuicao
              ? t("hr.semAcesso")
              : retribuicao
                ? `${retribuicao.valor_base} ${retribuicao.moeda}`
                : t("hr.visaoGeral.semRetribuicao")
          }
          ariaLabel={t("hr.visaoGeral.cards.compensacoes")}
          onAbrir={() => onAbrirSeparador("contratos")}
        />
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
