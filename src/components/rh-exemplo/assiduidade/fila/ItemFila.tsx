/**
 * UMA pendencia de uma pessoa, no painel da fila de trabalho: a etiqueta do tipo, a linha de detalhe e as accoes.
 * As accoes vem decididas por `accoesDoItem`: uma sem permissao fica DESACTIVADA e o motivo aparece escrito por baixo
 * (ligado aos botoes por `aria-describedby`), nunca escondido em silencio. O texto de uma justificacao de saude nunca
 * aparece aqui: diz «Texto reservado».
 */
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { EstadoHoraExtraBadge } from "@/components/rh-exemplo/fluxosC/EstadoHoraExtraBadge";
import { dataCurta, minutosEmHoras } from "@/components/rh-exemplo/fluxosC/formatosC";
import { formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import type { AccaoDoItem, IdDeAccao, ItemFila } from "@/components/rh-exemplo/hooks/useFilaDeTrabalho";
import { horaCurta } from "@/components/rh-exemplo/lib/assiduidade";
import { diasDesdeEnvio, resumoDoMotivo, textoEhSensivel } from "@/components/rh-exemplo/lib/justificacaoDia";
import { EtiquetaDoTipo } from "./aspectoTipoFila";

interface ItemDaFilaProps {
  item: ItemFila;
  /** O nome da pessoa, para os nomes acessiveis dos botoes. */
  nome: string;
  hoje: string;
  accoes: readonly AccaoDoItem[];
  aoAccionar: (item: ItemFila, accao: IdDeAccao) => void;
}

const ROTULO: Record<IdDeAccao, string> = {
  confirmar: "rhFluxosC.he.acao.confirmar",
  rejeitar: "rhFluxosC.he.acao.rejeitar",
  aceitar: "rhJust.rh.aceitar",
  recusar: "rhJust.rh.recusar",
  corrigir: "rhExemplo.pic.accao.corrigir",
  marcar_falta: "rhExemplo.pic.accao.marcar_falta",
  anular_por_ausencia: "hr.assiduidade.accao.anularPorAusencia",
};

const PRINCIPAIS: readonly IdDeAccao[] = ["confirmar", "aceitar"];

const SLUG: Record<ItemFila["tipo"], string> = { hora_extra: "hora-extra", justificacao: "justificacao", alerta: "alerta" };

/** O id de teste/DOM de um item: `item-fila-<tipo>-<id>`. */
export const idDoItemNoDom = (item: ItemFila): string => `item-fila-${SLUG[item.tipo]}-${item.id.slice(item.id.indexOf(":") + 1)}`;

export function ItemDaFila({ item, nome, hoje, accoes, aoAccionar }: ItemDaFilaProps) {
  const { t } = useTranslation();
  const idDom = idDoItemNoDom(item);
  const dia = dataCurta(item.data);
  const idPorque = `${idDom}-porque`;
  const razoes = [...new Set(accoes.filter((a) => !a.permitida && a.porque).map((a) => a.porque as string))];

  const nomeAcessivel = (id: IdDeAccao): string => {
    if (id === "confirmar") return t("rhFluxosD.fila.accaoConfirmar", { pessoa: nome, dia });
    if (id === "rejeitar") return t("rhFluxosD.fila.accaoRejeitar", { pessoa: nome, dia });
    if (id === "aceitar") return t("rhJust.rh.ariaAceitar", { pessoa: nome, dia });
    if (id === "recusar") return t("rhJust.rh.ariaRecusar", { pessoa: nome, dia });
    return t("rhFila.accao.alerta", { accao: t(ROTULO[id]), pessoa: nome, dia });
  };

  return (
    <li data-testid={idDom} className="space-y-2 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {item.tipo === "hora_extra" && (
          <>
            <EtiquetaDoTipo tipo="hora_extra" />
            <span className="tabular-nums">{t("rhFluxosD.fila.tempoAMais", { t: minutosEmHoras(item.hora.minutos) })}</span>
            {item.hora.acimaDoLimite && <EstadoHoraExtraBadge estado="acima_limite" />}
            {item.hora.semAutorizacao === true && (
              <span className="inline-flex items-center rounded-full border border-destructive/50 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                {t("rhHeReal.semAutorizacao")}
              </span>
            )}
            {item.hora.nocturnoMin > 0 && (
              <span className="tabular-nums text-muted-foreground">{t("rhHeReal.nocturnas", { t: minutosEmHoras(item.hora.nocturnoMin) })}</span>
            )}
            <span className="text-muted-foreground">{t(`rhFluxosC.he.origem.${item.hora.origem}`)}</span>
            {item.hora.horaInicio && item.hora.horaFim && (
              <span className="tabular-nums text-muted-foreground">{t("rhHeReal.tramo", { de: item.hora.horaInicio, ate: item.hora.horaFim })}</span>
            )}
          </>
        )}
        {item.tipo === "justificacao" && (
          <>
            <EtiquetaDoTipo tipo="justificacao" />
            <span>{t(`rhJust.tipo.${item.justificacao.tipo}`)}</span>
            {item.justificacao.minutos ? <span className="tabular-nums text-muted-foreground">{minutosEmHoras(item.justificacao.minutos)}</span> : null}
            <span className="text-xs text-muted-foreground">
              {(() => {
                const dias = diasDesdeEnvio(item.justificacao.enviadaEm, hoje);
                return dias === 0 ? t("rhJust.fila.hoje") : t("rhJust.fila.haDias", { n: String(dias) });
              })()}
            </span>
          </>
        )}
        {item.tipo === "alerta" && (
          <>
            <EtiquetaDoTipo tipo="alerta" texto={t("rhFila.item.alerta", { tipo: t(`hr.assiduidade.desvios.tipo.${item.desvio.tipo}`) })} />
            <span className="tabular-nums text-muted-foreground">
              {item.desvio.hora_inicio
                ? item.desvio.hora_fim
                  ? `${horaCurta(item.desvio.hora_inicio)}–${horaCurta(item.desvio.hora_fim)}`
                  : horaCurta(item.desvio.hora_inicio)
                : ""}
              {item.desvio.minutos ? ` · ${formatarHorasMinutos(item.desvio.minutos)}` : ""}
            </span>
          </>
        )}
      </div>

      {item.tipo === "hora_extra" && item.hora.motivoOrigem && <p className="text-xs text-muted-foreground">{item.hora.motivoOrigem}</p>}
      {item.tipo === "justificacao" && (
        <p className="text-muted-foreground">
          {textoEhSensivel(item.justificacao) ? t("rhFila.item.textoReservado") : resumoDoMotivo(item.justificacao.motivo)}
        </p>
      )}
      {item.tipo === "alerta" && item.desvio.detalhe && <p className="text-xs text-muted-foreground">{item.desvio.detalhe}</p>}

      {accoes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {accoes.map((accao) => (
            <Button
              key={accao.id}
              type="button"
              size="sm"
              variant={PRINCIPAIS.includes(accao.id) ? "default" : "outline"}
              className={cn("min-h-11", !accao.permitida && "cursor-not-allowed opacity-50")}
              // `aria-disabled` e nao `disabled`: o botao continua na ordem do Tab e o motivo (ligado por
              // `aria-describedby`) chega a quem usa teclado ou leitor de ecra.
              aria-disabled={!accao.permitida ? "true" : undefined}
              aria-describedby={!accao.permitida ? idPorque : undefined}
              aria-label={nomeAcessivel(accao.id)}
              onClick={() => {
                if (!accao.permitida) return;
                aoAccionar(item, accao.id);
              }}
            >
              {t(ROTULO[accao.id])}
            </Button>
          ))}
        </div>
      )}
      {razoes.length > 0 && (
        <p id={idPorque} data-testid={`${idDom}-porque`} className="text-xs text-muted-foreground">
          {razoes.map((chave) => t(chave)).join(" · ")}
        </p>
      )}
    </li>
  );
}
