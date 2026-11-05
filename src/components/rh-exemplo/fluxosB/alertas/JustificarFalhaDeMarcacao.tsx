/**
 * A pessoa que se esqueceu de picar JUSTIFICA a falha de marcacao (fluxo 5): hora real + motivo (+ anexo, se
 * quiser), ate ao fecho do periodo da folha. Mostra quantos dias restam; passado o prazo a diferenca fica «sem
 * justificacao» (falta sugerida). A pessoa nao corrige a propria picagem: so o RH aceita (lanca a picagem a mao)
 * ou recusa com motivo.
 */
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquareWarning } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { usePrazoJustificacao } from "@/components/rh-exemplo/hooks/usePrazoJustificacao";
import { formatarData } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import {
  diasRestantes,
  prazoDaJustificacao,
  situacaoDoPrazo,
  type JustificacaoPicagem,
} from "@/components/rh-exemplo/lib/alertasFimDia";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import { useJustificacoesDeDiaDaPessoa } from "@/components/rh-exemplo/calendarioPessoa/situacaoDoMes";
import { ESTADO_DA_JUSTIFICACAO, textoEhSensivel, type EstadoJustificacaoDia, type JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import type { JustificacoesDaPessoa } from "./useJustificacoesDaPessoa";

function LinhaEnviada({ j }: { j: JustificacaoPicagem }) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Badge variant="secondary" className="font-normal">
        {t(`rhExemplo.pic.justEstado.${j.estado}`)}
      </Badge>
      <span className="tabular-nums">{t("rhExemplo.pic.justificacaoDe", { hora: j.horaReal })}</span>
      <span className="text-muted-foreground">{j.motivo}</span>
      {j.estado === "recusada" && j.motivoRecusa && (
        <span className="text-destructive">{t("rhExemplo.pic.motivoRecusa", { motivo: j.motivoRecusa })}</span>
      )}
    </li>
  );
}

/** Uma justificação de falta sugerida ou atraso, com os mesmos estados que as de picagem esquecida. */
function LinhaEnviadaDia({ j }: { j: JustificacaoDia }) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid={`rha-jd-${j.id}`}>
      <Badge variant="secondary" className="font-normal">{t(`rhJust.estado.${ESTADO_DA_JUSTIFICACAO[j.estado]}`)}</Badge>
      <span className="tabular-nums">{t("rhJust.aba.linha", { dia: formatarData(j.data), tipo: t(`rhJust.tipo.${j.tipo}`) })}</span>
      <span className="text-muted-foreground">{j.motivo === "" && textoEhSensivel(j) ? t("rhJust.rh.textoReservadoCurto") : j.motivo}</span>
      {j.estado === "recusada" && j.motivoRecusa && <span className="text-destructive">{t("rhJust.motivoRH", { motivo: j.motivoRecusa })}</span>}
    </li>
  );
}

const GRUPO_DO_ESTADO: Record<EstadoJustificacaoDia, "pendentes" | "aceites" | "recusadas"> = {
  pendente: "pendentes", aceite_paga: "aceites", aceite_nao_paga: "aceites", recusada: "recusadas",
};

/** Um grupo das justificações já enviadas (pendentes, aceites ou recusadas), com o número no título. */
function GrupoEnviadas({ chave, itens, doDia }: { chave: "pendentes" | "aceites" | "recusadas"; itens: JustificacaoPicagem[]; doDia: JustificacaoDia[] }) {
  const { t } = useTranslation();
  const dia = doDia.filter((j) => GRUPO_DO_ESTADO[j.estado] === chave);
  if (itens.length + dia.length === 0) return null;
  return (
    <section aria-label={t(`rhAbas.just.${chave}`)} className="space-y-2 border-t pt-3 text-sm" data-testid={`rha-just-${chave}`}>
      <h4 className="font-medium">
        {t(`rhAbas.just.${chave}`)} <span className="tabular-nums text-muted-foreground">({itens.length + dia.length})</span>
      </h4>
      <ul className="space-y-1">
        {itens.map((j) => <LinhaEnviada key={j.id} j={j} />)}
        {dia.map((j) => <LinhaEnviadaDia key={j.id} j={j} />)}
      </ul>
    </section>
  );
}

/**
 * As marcações por justificar vêm da base (`hr_assiduidade_desvios`) e quem as lê é o chamador, uma só vez para a aba
 * inteira (a pastilha da aba usa os mesmos números). Só se lêem, não se justificam aqui: a base não tem onde guardar a
 * justificação de uma picagem esquecida.
 */
export function JustificarFalhaDeMarcacao({ pessoaId, justificacoes }: { pessoaId: string; justificacoes: JustificacoesDaPessoa }) {
  const { t } = useTranslation();
  const { porJustificar: meus, menorPrazoDias, pendentes, aceites, recusadas, loading, erro, recusado } = justificacoes;
  // As justificações de dia vêm da base (últimos 90 dias); a leitura pode demorar, falhar ou ainda não existir nesta base.
  const { justificacoes: doDia, loading: aLerDia, erro: erroDia, indisponivel: indisponivelDia } = useJustificacoesDeDiaDaPessoa(pessoaId);
  const hoje = hojeIso();
  const datasDoPrazo = useMemo(() => meus.map((a) => a.data), [meus]);
  const { prazoDe, estimativaDe } = usePrazoJustificacao(datasDoPrazo);
  const textoDoPrazo = (data: string): string => {
    const restantes = diasRestantes(data, hoje, prazoDe);
    const ate = formatarData(prazoDaJustificacao(data, prazoDe));
    const frase =
      restantes === 0 ? t("rhExemplo.pic.ultimoDia", { ate }) : restantes === 1 ? t("rhExemplo.pic.diasRestantesUm", { ate }) : t("rhExemplo.pic.diasRestantes", { dias: String(restantes), ate });
    return estimativaDe(data) ? `${frase} ${t("rhJust.prazo.estimativa")}` : frase;
  };
  const semNada =
    !loading && !erro && !recusado && !aLerDia && !erroDia && !indisponivelDia && meus.length === 0 &&
    pendentes.length + aceites.length + recusadas.length + doDia.length === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareWarning className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t("rhExemplo.pic.justificarTitulo")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("rhExemplo.pic.justificarAjuda")}</p>
        {menorPrazoDias !== null && (
          <p role="status" className="text-sm font-medium" data-testid="rha-just-prazo">
            {t("rhAbas.just.menorPrazo", { dias: String(menorPrazoDias) })}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p role="status" className="py-6 text-center text-sm text-muted-foreground">{t("rhAbas.just.carregando")}</p>}
        {erro && <p role="alert" className="text-sm font-medium text-destructive">{t("rhAbas.just.erro")}</p>}
        {recusado && <p role="alert" className="text-sm font-medium text-destructive">{t("rhAbas.just.recusado")}</p>}
        {erroDia && <p role="alert" className="text-sm font-medium text-destructive" data-testid="rha-jd-erro">{t("rhJust.erro.leitura")}</p>}
        {indisponivelDia && <p role="status" className="text-sm text-muted-foreground" data-testid="rha-jd-indisponivel">{t("rhJust.erro.indisponivel")}</p>}
        {semNada && <p className="py-6 text-center text-sm text-muted-foreground">{t("rhAbas.just.vazio")}</p>}
        <ul className="space-y-3">
          {meus.map((alerta) => {
            const dentro = situacaoDoPrazo(alerta, hoje, prazoDe) === "dentro_do_prazo";
            return (
              <li key={alerta.id} className="space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium tabular-nums">{formatarData(alerta.data)}</span>
                  <Badge variant="outline" className="font-normal">
                    {t(`rhExemplo.pic.alerta.${alerta.tipo}`)}
                  </Badge>
                  {alerta.estado === "justificacao_pedida" && (
                    <Badge variant="secondary" className="font-normal">
                      {t("rhExemplo.pic.estado.justificacao_pedida")}
                    </Badge>
                  )}
                  {dentro ? (
                    <span className="text-xs text-muted-foreground">
                      {textoDoPrazo(alerta.data)}
                    </span>
                  ) : (
                    <Badge variant="outline" className="border-destructive font-normal text-destructive">
                      {t("rhExemplo.pic.prazoAcabou")}
                    </Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <GrupoEnviadas chave="pendentes" itens={pendentes} doDia={doDia} />
        <GrupoEnviadas chave="aceites" itens={aceites} doDia={doDia} />
        <GrupoEnviadas chave="recusadas" itens={recusadas} doDia={doDia} />
      </CardContent>
    </Card>
  );
}
