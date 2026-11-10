/**
 * UMA pendencia de uma pessoa, no painel da fila de trabalho: a etiqueta do tipo, a linha de detalhe e as accoes.
 * As accoes vem decididas por `accoesDoItem`: uma sem permissao fica DESACTIVADA e o motivo aparece escrito por baixo
 * (ligado aos botoes por `aria-describedby`), nunca escondido em silencio. O texto de uma justificacao de saude nunca
 * aparece aqui: diz «Texto reservado». O motivo de um pedido de ausencia tambem nao: le-se no detalhe do pedido (que regista
 * a revelacao nos tipos sensiveis).
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { EstadoHoraExtraBadge } from "@/components/rh-exemplo/fluxosC/EstadoHoraExtraBadge";
import { dataCurta, minutosEmHoras } from "@/components/rh-exemplo/fluxosC/formatosC";
import { formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import type { AccaoDoItem, IdDeAccao, ItemFila } from "@/components/rh-exemplo/hooks/useFilaDeTrabalho";
import { formatarDias } from "@/components/rh-exemplo/lib/ausencias";
import { horaCurta } from "@/components/rh-exemplo/lib/assiduidade";
import { textoDoDesvio } from "@/components/rh-exemplo/lib/alertasFimDia";
import { diasDesdeEnvio, resumoDoMotivo, textoEhSensivel } from "@/components/rh-exemplo/lib/justificacaoDia";
import { EtiquetaDoTipo } from "./aspectoTipoFila";

interface ItemDaFilaProps {
  item: ItemFila;
  /** O nome da pessoa, para os nomes acessiveis dos botoes. */
  nome: string;
  hoje: string;
  accoes: readonly AccaoDoItem[];
  aoAccionar: (item: ItemFila, accao: IdDeAccao) => void;
  /** Quando existe, o item de ausencia leva o botao «Ver detalhe» (abre o pedido inteiro, onde se cancela ou le o motivo). */
  aoAbrirDetalhe?: (item: ItemFila) => void;
}

const ROTULO: Record<IdDeAccao, string> = {
  confirmar: "rhFluxosC.he.acao.confirmar",
  rejeitar: "rhFluxosC.he.acao.rejeitar",
  aceitar: "rhJust.rh.aceitar",
  recusar: "rhJust.rh.recusar",
  corrigir: "rhExemplo.pic.accao.corrigir",
  lancar_picagem: "rhExemplo.pic.accao.lancar_picagem",
  lancar_saida: "rhExemplo.pic.accao.lancar_saida",
  marcar_falta: "rhExemplo.pic.accao.marcar_falta",
  anular_por_ausencia: "hr.assiduidade.accao.anularPorAusencia",
  aprovar_chefia: "hr.ausencias.accao.aprovarComoChefia",
  recusar_chefia: "hr.ausencias.accao.recusar",
  ajustar: "hr.ausencias.accao.ajustar",
  aprovar_rh: "hr.ausencias.accao.aprovarComoRh",
  recusar_rh: "hr.ausencias.accao.recusar",
  devolver: "hr.ausencias.accao.devolver",
  validar_normal: "rhFila.accao.validar_normal",
  validar_hora_extra: "rhFila.accao.validar_hora_extra",
  validar_aceitar_desvio: "rhFila.accao.validar_aceitar_desvio",
};

const PRINCIPAIS: readonly IdDeAccao[] = ["confirmar", "aceitar", "aprovar_chefia", "aprovar_rh", "validar_normal"];

const ACCOES_DE_AUSENCIA: readonly IdDeAccao[] = ["aprovar_chefia", "recusar_chefia", "ajustar", "aprovar_rh", "recusar_rh", "devolver"];

const SLUG: Record<ItemFila["tipo"], string> = {
  hora_extra: "hora-extra",
  justificacao: "justificacao",
  alerta: "alerta",
  desvio_a_validar: "desvio-a-validar",
  ausencia: "ausencia",
};

/** «+1h», «-30min», «0min»: o sinal escreve-se sempre, para nao depender so da cor ou da posicao. */
const minutosComSinal = (minutos: number): string => (minutos > 0 ? `+${formatarHorasMinutos(minutos)}` : minutos < 0 ? `-${formatarHorasMinutos(-minutos)}` : formatarHorasMinutos(0));

/** O id de teste/DOM de um item: `item-fila-<tipo>-<id>`. */
export const idDoItemNoDom = (item: ItemFila): string => `item-fila-${SLUG[item.tipo]}-${item.id.slice(item.id.indexOf(":") + 1)}`;

export function ItemDaFila({ item, nome, hoje, accoes, aoAccionar, aoAbrirDetalhe }: ItemDaFilaProps) {
  const { t } = useTranslation();
  const idDom = idDoItemNoDom(item);
  const dia = dataCurta(item.data);
  const textoAlerta = item.tipo === "alerta" ? textoDoDesvio(item.desvio, t) : null;
  const idPorque = `${idDom}-porque`;
  const razoes = [...new Set(accoes.filter((a) => !a.permitida && a.porque).map((a) => a.porque as string))];

  const nomeAcessivel = (id: IdDeAccao): string => {
    if (id === "confirmar") return t("rhFluxosD.fila.accaoConfirmar", { pessoa: nome, dia });
    if (id === "rejeitar") return t("rhFluxosD.fila.accaoRejeitar", { pessoa: nome, dia });
    if (id === "aceitar") return t("rhJust.rh.ariaAceitar", { pessoa: nome, dia });
    if (id === "recusar") return t("rhJust.rh.ariaRecusar", { pessoa: nome, dia });
    if (ACCOES_DE_AUSENCIA.includes(id)) return t("rhFila.accao.ausencia", { accao: t(ROTULO[id]), pessoa: nome, dia });
    if (id.startsWith("validar_")) return t("rhFila.accao.validar", { accao: t(ROTULO[id]), pessoa: nome, dia });
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
        {item.tipo === "ausencia" && (
          <>
            <EtiquetaDoTipo tipo="ausencia" texto={t("rhFila.item.ausencia", { tipo: item.nomeDoTipo })} />
            <span className="tabular-nums">
              {t(item.pedido.data_inicio === item.pedido.data_fim ? "rhFila.item.ausenciaDia" : "rhFila.item.ausenciaPeriodo", {
                inicio: dataCurta(item.pedido.data_inicio),
                fim: dataCurta(item.pedido.data_fim),
                dias: formatarDias(Number(item.pedido.dias_solicitados)),
              })}
            </span>
            {/* O passo por extenso («a aguardar a chefia»), nunca so a cor ou um codigo. */}
            <Badge variant="secondary" className="font-normal">
              {t(`hr.ausencias.estado.${item.pedido.estado}`)}
            </Badge>
            {item.pedido.substitui_pedido_id && (
              <Badge variant="outline" className="font-normal">
                {t("hr.ausencias.lista.etiquetaAlteracao")}
              </Badge>
            )}
          </>
        )}
        {item.tipo === "desvio_a_validar" && (
          <>
            <EtiquetaDoTipo tipo="desvio_a_validar" texto={t("rhFila.item.desvioAValidar", { natureza: t(`rhFila.validar.natureza.${item.validacao.natureza}`) })} />
            <span className="tabular-nums text-muted-foreground">
              {item.validacao.horaInicio
                ? item.validacao.horaFim
                  ? `${horaCurta(item.validacao.horaInicio)}–${horaCurta(item.validacao.horaFim)}`
                  : horaCurta(item.validacao.horaInicio)
                : ""}
              {item.validacao.minutos ? `${item.validacao.horaInicio ? " · " : ""}${formatarHorasMinutos(item.validacao.minutos)}` : ""}
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
      {textoAlerta && <p className="text-xs text-muted-foreground">{textoAlerta}</p>}
      {item.tipo === "desvio_a_validar" && item.validacao.detalhe && <p className="text-xs text-muted-foreground">{item.validacao.detalhe}</p>}
      {item.tipo === "desvio_a_validar" && item.validacao.planeadoMin !== undefined && item.validacao.realizadoMin !== undefined && (
        <p data-testid={`${idDom}-medidas`} className="text-xs tabular-nums text-muted-foreground">
          {t(item.validacao.margemMin === null || item.validacao.margemMin === undefined ? "rhDesvios.detalheSemMargem" : "rhDesvios.detalhe", {
            planeado: formatarHorasMinutos(item.validacao.planeadoMin),
            realizado: formatarHorasMinutos(item.validacao.realizadoMin),
            diferenca: minutosComSinal(item.validacao.diferencaMin ?? item.validacao.realizadoMin - item.validacao.planeadoMin),
            horario: formatarHorasMinutos(item.validacao.desvioHorarioMin ?? 0),
            margem: `${item.validacao.margemMin ?? 0} min`,
          })}
        </p>
      )}

      {(accoes.length > 0 || (item.tipo === "ausencia" && aoAbrirDetalhe)) && (
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
          {item.tipo === "ausencia" && aoAbrirDetalhe && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11"
              aria-label={t("rhFila.ausencias.verDetalheAria", { pessoa: nome, dia })}
              onClick={() => aoAbrirDetalhe(item)}
            >
              {t("rhFila.ausencias.verDetalhe")}
            </Button>
          )}
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
