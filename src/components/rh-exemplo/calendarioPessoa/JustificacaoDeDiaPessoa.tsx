/**
 * O que a PRÓPRIA pessoa pode fazer num dia com falta sugerida ou atraso: justificar (dentro do prazo da organização),
 * ver o estado do que enviou (a aguardar o RH, aceite paga ou não paga, recusada com o motivo do RH, e voltar a enviar se ainda
 * houver prazo) ou ver que o prazo terminou. Nunca corrige nem decide: quem decide é o RH.
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { podeEnviar, type SituacaoDoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import { useTranslation } from "@/hooks/useTranslation";
import { FormularioJustificacaoDia } from "./FormularioJustificacaoDia";
import { IndicadorJustificacao } from "./IndicadorJustificacao";
import { useJustificacoesDeDiaDaPessoa, situacaoDeUmDia } from "./situacaoDoMes";
import type { DiaCalendario } from "./montarMes";
import { useFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";

function TextoDoPrazo({ situacao }: { situacao: SituacaoDoDia }) {
  const { t } = useTranslation();
  if (!situacao.prazoAte) return null;
  const ate = formatarData(situacao.prazoAte);
  if (situacao.estado === "prazo_terminado" || situacao.estado === "recusada_sem_prazo") {
    return <p className="text-sm text-muted-foreground">{t("rhJust.prazo.terminou", { ate })}</p>;
  }
  if (!podeEnviar(situacao.estado)) return null;
  return (
    <p className="text-sm text-muted-foreground">
      {situacao.diasRestantes > 0 ? t("rhJust.prazo.restam", { dias: String(situacao.diasRestantes), ate }) : t("rhJust.prazo.ultimo", { ate })}
    </p>
  );
}

function DetalheEnviado({ situacao }: { situacao: SituacaoDoDia }) {
  const { t } = useTranslation();
  const j = situacao.justificacao;
  if (!j) return null;
  return (
    <div className="space-y-1 rounded-md border p-3 text-sm">
      <p className="text-xs text-muted-foreground">{t("rhJust.tipo." + j.tipo)} · {t("rhJust.enviadaEm", { data: formatarData(j.enviadaEm.slice(0, 10)) })}</p>
      <p>{j.motivo}</p>
      {j.estado === "recusada" && j.motivoRecusa && <p className="text-destructive">{t("rhJust.motivoRH", { motivo: j.motivoRecusa })}</p>}
    </div>
  );
}

export function JustificacaoDeDiaPessoa({ dia, pessoaId }: { dia: DiaCalendario; pessoaId: string }) {
  const { t } = useTranslation();
  const justificacoes = useJustificacoesDeDiaDaPessoa(pessoaId);
  const prazoDias = useFluxosB((e) => e.prazoFaltaDias);
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const { situacao, desvio } = situacaoDeUmDia(dia, justificacoes, prazoDias, hojeIso());
  if (situacao.estado === "nao_aplica") return null;

  const fechar = () => {
    setAberto(false);
    requestAnimationFrame(() => botao.current?.focus());
  };
  return (
    <section className="space-y-3" aria-label={t("rhJust.titulo")} data-testid="rhjd-pessoa">
      <h4 className="text-sm font-medium text-muted-foreground">{t("rhJust.titulo")}</h4>
      <div className="flex flex-wrap items-center gap-2" data-testid="rhjd-estado">
        <IndicadorJustificacao estado={situacao.estado} souAPessoa completo />
        {situacao.estado === "prazo_terminado" && <span className="text-sm font-medium">{t("rhJust.semJustificacao")}</span>}
      </div>
      <DetalheEnviado situacao={situacao} />
      <TextoDoPrazo situacao={situacao} />
      {podeEnviar(situacao.estado) && desvio && !aberto && (
        <Button ref={botao} type="button" variant="outline" className="min-h-11 w-full" onClick={() => setAberto(true)}>
          {t(situacao.estado === "recusada_com_prazo" ? "rhJust.botao.denovo" : "rhJust.botao.justificar")}
        </Button>
      )}
      {aberto && desvio && <FormularioJustificacaoDia pessoaId={pessoaId} data={dia.data} desvio={desvio} aoFechar={fechar} />}
    </section>
  );
}
