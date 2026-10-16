/**
 * O historico do processo, do mais recente para o mais antigo: o que aconteceu, quem (RH, a pessoa ou o sistema), quando e a
 * transicao de estado. So metadados (acao, ator, estados, data): a base nunca grava tokens, codigos nem dados sensiveis nos
 * eventos. Uma acao que o ecra nao conhece cai num texto generico, nunca numa chave.
 */
import { History } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { formatarDataHora } from "@/lib/hr/conviteAdmissaoEcra";
import { ACOES_EVENTO, ATORES_EVENTO, eventosRecentesPrimeiro, type EventoRevisao } from "@/lib/hr/admissaoRevisao";

const ACOES_CONHECIDAS: readonly string[] = ACOES_EVENTO;
const ATORES_CONHECIDOS: readonly string[] = ATORES_EVENTO;

function LinhaDoEvento({ evento }: { evento: EventoRevisao }) {
  const { t } = useTranslation();
  const acao = ACOES_CONHECIDAS.includes(evento.acao) ? evento.acao : "desconhecida";
  const ator = ATORES_CONHECIDOS.includes(evento.atorTipo) ? evento.atorTipo : "sistema";
  const de = evento.estadoAnterior ? t(`hr.convite.estadoAdmissao.${evento.estadoAnterior}`) : null;
  const para = evento.estadoPosterior ? t(`hr.convite.estadoAdmissao.${evento.estadoPosterior}`) : null;
  const transicao = para ? (de ? t("rhAdm.historico.transicao", { de, para }) : t("rhAdm.historico.para", { para })) : null;
  return (
    <li className="py-2 text-sm">
      <p>
        <span className="font-medium">{t(`rhAdm.historico.acao.${acao}`)}</span>
        <span className="text-muted-foreground">
          {" — "}
          {t(`rhAdm.historico.ator.${ator}`)}
          {" · "}
          <time dateTime={evento.criadoEm} className="tabular-nums">
            {formatarDataHora(evento.criadoEm)}
          </time>
        </span>
      </p>
      {transicao && <p className="text-xs text-muted-foreground">{transicao}</p>}
    </li>
  );
}

export function HistoricoAdmissao({ eventos }: { eventos: readonly EventoRevisao[] }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {t("rhAdm.revisao.historico")}
      </h3>
      {eventos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("rhAdm.revisao.historicoVazio")}</p>
      ) : (
        <ol aria-label={t("rhAdm.revisao.historico")} className="divide-y rounded-md border px-3">
          {eventosRecentesPrimeiro(eventos).map((evento, i) => (
            <LinhaDoEvento key={`${evento.criadoEm}-${evento.acao}-${i}`} evento={evento} />
          ))}
        </ol>
      )}
    </section>
  );
}
