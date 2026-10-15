/**
 * O CALENDARIO DO MES da pessoa: uma celula por dia com o previsto (resolvido pelo tipo de horario em vigor,
 * excepcoes, feriados e ausencias), o feito (picagens) e a diferenca (atraso, falta, hora extra, banco de horas).
 * Clicar num dia abre o detalhe. Em ecra estreito a grelha passa a lista de dias.
 *
 * O mes e controlado pelo pai (a aba Assiduidade), que carrega com ele o resto da aba. So o banco de horas tem
 * saldo; para os outros tipos o cabecalho nao mostra saldo nem movimentos.
 */
import { useMemo, useState, type ReactNode } from "react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { permissoesDaVista } from "@/components/rh-exemplo/lib/vistaDaPessoa";
import { useTranslation } from "@/hooks/useTranslation";
import type { PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";
import { CabecalhoMes } from "./CabecalhoMes";
import { CelulaDia } from "./CelulaDia";
import { DetalheDoDia } from "./DetalheDoDia";
import { useSituacoesDoMes } from "./situacaoDoMes";
import { useMesDaPessoa } from "./useMesDaPessoa";

export interface MesVisivel {
  ano: number;
  /** 1 a 12. */
  mes: number;
}

interface Props {
  pessoaId: string;
  pessoaNome: string;
  mes: MesVisivel;
  aoMudarMes: (mes: MesVisivel) => void;
  souAPessoa: boolean;
  permissoes: PermissoesAssiduidade;
  /** Abre o registo do dia (picagens, faltas, correccoes e justificacoes). */
  aoAbrirRegisto: (data: string) => void;
  acoes?: ReactNode;
}

const COLUNA_INICIAL = ["md:col-start-7", "md:col-start-1", "md:col-start-2", "md:col-start-3", "md:col-start-4", "md:col-start-5", "md:col-start-6"];
/** 2024-01-01 foi uma segunda-feira: serve para dar os nomes dos dias da semana, de segunda a domingo. */
const SEGUNDA_DE_REFERENCIA = Date.UTC(2024, 0, 1);

export function CalendarioPessoa({ pessoaId, pessoaNome, mes, aoMudarMes, souAPessoa, permissoes, aoAbrirRegisto, acoes }: Props) {
  const { t, language } = useTranslation();
  const dados = useMesDaPessoa(pessoaId, mes.ano, mes.mes);
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const situacoes = useSituacoesDoMes(pessoaId, dados?.dias);

  const formatar = useMemo(() => ({
    mes: new Intl.DateTimeFormat(language, { month: "long", year: "numeric", timeZone: "UTC" }),
    dia: new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
    curto: new Intl.DateTimeFormat(language, { weekday: "short", timeZone: "UTC" }),
  }), [language]);
  const noDia = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
  const nomeDoMes = formatar.mes.format(new Date(Date.UTC(mes.ano, mes.mes - 1, 1)));

  if (!dados) return <OlyviaLoader />;
  const aberto = dados.dias.find((d) => d.data === diaAberto) ?? null;
  const mudar = (passo: number) => {
    const novo = new Date(Date.UTC(mes.ano, mes.mes - 1 + passo, 1));
    aoMudarMes({ ano: novo.getUTCFullYear(), mes: novo.getUTCMonth() + 1 });
  };
  const irParaHoje = () => {
    const hoje = hojeIso();
    aoMudarMes({ ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) });
  };
  const { corrigir, faltasEdit, justificacaoEdit } = permissoesDaVista(permissoes, souAPessoa);
  const podeCorrigir = corrigir || faltasEdit || justificacaoEdit;

  return (
    <div className="space-y-4" data-testid="rhcal-calendario">
      <CabecalhoMes nomeDoMes={nomeDoMes} totais={dados.totais} aoMudar={mudar} aoIrParaHoje={irParaHoje} acoes={acoes} />
      <div aria-hidden="true" className="hidden grid-cols-7 gap-1.5 text-center text-xs font-medium capitalize text-muted-foreground md:grid">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i}>{formatar.curto.format(new Date(SEGUNDA_DE_REFERENCIA + i * 86_400_000))}</span>
        ))}
      </div>
      <ol className="grid grid-cols-1 gap-1.5 md:grid-cols-7" aria-label={t("rhCal.aria.grelha", { mes: nomeDoMes })}>
        {dados.dias.map((dia) => (
          <li key={dia.data} className={dia.data.endsWith("-01") ? COLUNA_INICIAL[dia.diaSemana] : undefined}>
            <CelulaDia
              dia={dia}
              dataLonga={formatar.dia.format(noDia(dia.data))}
              diaSemanaCurto={formatar.curto.format(noDia(dia.data))}
              aoAbrir={setDiaAberto}
              justificacao={situacoes.get(dia.data)?.situacao.estado}
              souAPessoa={souAPessoa}
            />
          </li>
        ))}
      </ol>
      <DetalheDoDia
        dia={aberto}
        dataLonga={aberto ? formatar.dia.format(noDia(aberto.data)) : ""}
        pessoaNome={pessoaNome}
        podeDecidir={permissoes.gerir && !souAPessoa}
        podeCorrigir={podeCorrigir}
        souAPessoa={souAPessoa}
        pessoaId={pessoaId}
        aoFechar={() => setDiaAberto(null)}
        aoAbrirRegisto={(data) => { setDiaAberto(null); aoAbrirRegisto(data); }}
      />
    </div>
  );
}
