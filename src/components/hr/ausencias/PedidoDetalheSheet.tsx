/**
 * O detalhe de um pedido: os dois passos, o historico, e as accoes.
 *
 * A FITA DOS DOIS PASSOS
 * ----------------------
 * Chefia e RH lado a lado, sempre os dois, sempre visiveis. Um passo
 * `dispensado` NAO se esconde: escondido, o pedido parece ter saltado uma
 * etapa; escrito, diz que aquela etapa nao se aplica a este tipo. Um passo em
 * aberto diz de quem se espera.
 *
 * O HISTORICO E A FONTE DA VERDADE
 * --------------------------------
 * `pessoas_ausencias_pedido_decisoes` e append-only: uma devolucao seguida de
 * nova aprovacao da duas linhas de chefia, ordem 1 e ordem 2, e as duas ficam
 * a vista. O `estado` do pedido e so uma cache disto.
 *
 * O QUE NAO SE OFERECE
 * --------------------
 * Nao ha "editar datas" de um pedido aprovado: `rpc_hr_ausencia_corrigir_aprovado`
 * cancela com rasto e obriga a pedir de novo. O botao chama-se
 * "corrigir (cancela e refaz)" porque chamar-lhe editar seria mentir.
 * Nao ha botao de anexar justificacao: nao existe RPC nem politica de insert em
 * `pessoas_ausencias_justificacoes` -- um botao que falhava sempre.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CalendarOff, Check, Eye, Loader2, Undo2, X } from "lucide-react";
import { MotivoDialog, type ResultadoMotivo } from "@/components/hr/ausencias/MotivoDialog";
import { TipoEtiqueta } from "@/components/hr/ausencias/TipoEtiqueta";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { isPermissionError } from "@/lib/hr/hrDb";
import { accoesDoPedido, formatarDias, lerPedido } from "@/lib/hr/ausencias";
import type {
  AusenciaDecisao,
  AusenciaJustificacaoRevelada,
  AusenciaPedido,
  AusenciaTipo,
} from "@/types/hrAusencias";
import type { LeituraDoPedido, PassoLido } from "@/lib/hr/ausencias";

export interface PermissoesAusencias {
  aprovarChefia: boolean;
  aprovarRh: boolean;
  editarHistorico: boolean;
  verJustificacao: boolean;
}

interface PedidoDetalheSheetProps {
  pedido: AusenciaPedido | null;
  decisoes: AusenciaDecisao[];
  tipo: AusenciaTipo | null;
  pessoaNome: string;
  /** Nome de quem decidiu, por `pessoa_id`, quando se conhece. */
  nomePorPessoaId?: Map<string, string>;
  permissoes: PermissoesAusencias;
  souOAutor: boolean;
  saving: boolean;
  onFechar: () => void;
  onDecidirChefia: (args: {
    pedidoId: string;
    resultado: "aprovado" | "recusado" | "ajustado";
    motivo?: string | null;
    ajusteDataInicio?: string | null;
    ajusteDataFim?: string | null;
  }) => Promise<string | null>;
  onDecidirRh: (args: {
    pedidoId: string;
    resultado: "aprovado" | "recusado" | "devolvido";
    motivo?: string | null;
  }) => Promise<string | null>;
  onCancelar: (pedidoId: string, motivo: string) => Promise<string | null>;
  onCorrigirAprovado: (pedidoId: string, motivo: string) => Promise<string | null>;
  onRevelarJustificacao?: (pedidoId: string) => Promise<AusenciaJustificacaoRevelada[]>;
  /**
   * O motivo do pedido ja nao vem na leitura da lista: la-se so por esta RPC,
   * uma vez por pedido, quando o detalhe abre. Ver `rpc_hr_ausencia_ver_motivo`.
   */
  onVerMotivo: (pedidoId: string) => Promise<string | null>;
  /** Presente nas vistas de organizacao: salta para a ficha da pessoa. */
  onIrParaFicha?: () => void;
}

type Accao = "recusarChefia" | "ajustar" | "recusarRh" | "devolver" | "cancelar" | "corrigir";

/**
 * Os quatro desfechos de `rpc_hr_ausencia_ver_motivo`: a carregar, visivel,
 * sem motivo escrito, oculto por ser sensivel sem permissao, ou uma falha real
 * (rede, sessao) que nao e uma recusa de acesso e por isso vai ao Sentry.
 */
type EstadoMotivo =
  | { tipo: "carregando" }
  | { tipo: "visivel"; texto: string }
  | { tipo: "vazio" }
  | { tipo: "oculto" }
  | { tipo: "erro" };

function BlocoPasso({ passo, nome }: { passo: PassoLido; nome: string | null }) {
  const { t } = useTranslation();
  const dispensado = passo.situacao === "dispensado";
  const aberto = passo.situacao === "aberto";

  return (
    <div
      className={
        "flex-1 rounded-md border p-3 text-sm " +
        (dispensado ? "opacity-60" : aberto ? "border-primary/60 bg-primary/5" : "")
      }
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {t(`hr.ausencias.passo.${passo.passo}`)}
      </p>
      <p className="font-medium">{t(`hr.ausencias.situacao.${passo.situacao}`)}</p>
      {aberto && nome && (
        <p className="text-xs text-muted-foreground">
          {t("hr.ausencias.passo.aEsperaDe", { nome })}
        </p>
      )}
      {passo.decisao && !aberto && !dispensado && (
        <p className="text-xs text-muted-foreground">
          {new Date(passo.decisao.decidido_em).toLocaleDateString()}
          {nome ? ` · ${nome}` : ""}
        </p>
      )}
    </div>
  );
}

export function PedidoDetalheSheet(props: PedidoDetalheSheetProps) {
  const { t } = useTranslation();
  const { pedido, decisoes, tipo, permissoes, saving } = props;
  const [accao, setAccao] = useState<Accao | null>(null);
  const [justificacoes, setJustificacoes] = useState<AusenciaJustificacaoRevelada[] | null>(null);
  const [aRevelar, setARevelar] = useState(false);
  const [motivo, setMotivo] = useState<EstadoMotivo>({ tipo: "carregando" });

  // So aqui: uma vez por pedido, quando o detalhe abre -- nunca na lista nem
  // no mapa. `onVerMotivo` decide na base se o tipo e sensivel; um erro de
  // permissao e a resposta CORRECTA (oculta o motivo), qualquer outro erro e
  // um defeito e vai ao Sentry.
  useEffect(() => {
    if (!pedido) return;
    let cancelado = false;
    setMotivo({ tipo: "carregando" });
    props
      .onVerMotivo(pedido.id)
      .then((texto) => {
        if (cancelado) return;
        setMotivo(texto ? { tipo: "visivel", texto } : { tipo: "vazio" });
      })
      .catch((erro: unknown) => {
        if (cancelado) return;
        if (isPermissionError(erro)) {
          setMotivo({ tipo: "oculto" });
          return;
        }
        captureFlowError(erro, "hr-ausencias-load");
        setMotivo({ tipo: "erro" });
        toast.error(t("hr.ausencias.campo.motivoErro"));
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido?.id]);

  const leitura: LeituraDoPedido | null = useMemo(
    () => (pedido ? lerPedido(pedido.estado, decisoes) : null),
    [pedido, decisoes],
  );

  const accoes = useMemo(
    () =>
      pedido
        ? accoesDoPedido({
            estado: pedido.estado,
            souOAutor: props.souOAutor,
            podeAprovarChefia: permissoes.aprovarChefia,
            podeAprovarRh: permissoes.aprovarRh,
            podeEditarHistorico: permissoes.editarHistorico,
            temChefiaResoluvel: Boolean(pedido.aprovador_chefia_pessoa_id),
          })
        : null,
    [pedido, props.souOAutor, permissoes],
  );

  if (!pedido || !leitura || !accoes) return null;

  const nomeDe = (pessoaId: string | null) =>
    pessoaId ? (props.nomePorPessoaId?.get(pessoaId) ?? null) : null;

  const tratar = async (promessa: Promise<string | null>, chaveSucesso: string) => {
    const erro = await promessa;
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t(chaveSucesso));
    setAccao(null);
  };

  const confirmarAccao = async (resultado: ResultadoMotivo) => {
    switch (accao) {
      case "recusarChefia":
        await tratar(
          props.onDecidirChefia({
            pedidoId: pedido.id,
            resultado: "recusado",
            motivo: resultado.motivo,
          }),
          "hr.ausencias.decisao.recusadoOk",
        );
        return;
      case "ajustar":
        await tratar(
          props.onDecidirChefia({
            pedidoId: pedido.id,
            resultado: "ajustado",
            motivo: resultado.motivo,
            ajusteDataInicio: resultado.dataInicio ?? null,
            ajusteDataFim: resultado.dataFim ?? null,
          }),
          "hr.ausencias.decisao.ajustadoOk",
        );
        return;
      case "recusarRh":
        await tratar(
          props.onDecidirRh({ pedidoId: pedido.id, resultado: "recusado", motivo: resultado.motivo }),
          "hr.ausencias.decisao.recusadoOk",
        );
        return;
      case "devolver":
        await tratar(
          props.onDecidirRh({
            pedidoId: pedido.id,
            resultado: "devolvido",
            motivo: resultado.motivo,
          }),
          "hr.ausencias.decisao.devolvidoOk",
        );
        return;
      case "cancelar":
        await tratar(
          props.onCancelar(pedido.id, resultado.motivo),
          "hr.ausencias.decisao.canceladoOk",
        );
        return;
      case "corrigir":
        await tratar(
          props.onCorrigirAprovado(pedido.id, resultado.motivo),
          "hr.ausencias.decisao.corrigidoOk",
        );
        return;
      default:
        return;
    }
  };

  const revelar = async () => {
    if (!props.onRevelarJustificacao) return;
    setARevelar(true);
    try {
      setJustificacoes(await props.onRevelarJustificacao(pedido.id));
    } catch (erro) {
      toast.error(
        erro instanceof Error ? erro.message : t("hr.ausencias.justificacao.erroRevelar"),
      );
    } finally {
      setARevelar(false);
    }
  };

  const textoDialogo: Record<Accao, { titulo: string; descricao: string; rotulo: string }> = {
    recusarChefia: {
      titulo: t("hr.ausencias.accao.recusar"),
      descricao: t("hr.ausencias.accao.recusarDescricao"),
      rotulo: t("hr.ausencias.accao.recusar"),
    },
    recusarRh: {
      titulo: t("hr.ausencias.accao.recusar"),
      descricao: t("hr.ausencias.accao.recusarDescricao"),
      rotulo: t("hr.ausencias.accao.recusar"),
    },
    ajustar: {
      titulo: t("hr.ausencias.accao.ajustar"),
      // Ajustar grava a contraproposta e NAO faz o pedido avancar. Quem
      // carrega aqui a pensar que aprova com outras datas fica sem perceber
      // porque e que o pedido continua pendente.
      descricao: t("hr.ausencias.accao.ajustarDescricao"),
      rotulo: t("hr.ausencias.accao.ajustar"),
    },
    devolver: {
      titulo: t("hr.ausencias.accao.devolver"),
      descricao: t("hr.ausencias.accao.devolverDescricao"),
      rotulo: t("hr.ausencias.accao.devolver"),
    },
    cancelar: {
      titulo: t("hr.ausencias.accao.cancelar"),
      descricao: t("hr.ausencias.accao.cancelarDescricao"),
      rotulo: t("hr.ausencias.accao.cancelar"),
    },
    corrigir: {
      titulo: t("hr.ausencias.accao.corrigir"),
      descricao: t("hr.ausencias.accao.corrigirDescricao"),
      rotulo: t("hr.ausencias.accao.corrigir"),
    },
  };

  return (
    <>
      <Sheet open onOpenChange={(estado) => !estado && props.onFechar()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <TipoEtiqueta tipo={tipo} nomeAlternativo={t("hr.ausencias.tipoDesconhecido")} />
            </SheetTitle>
            <SheetDescription>
              {t("hr.ausencias.detalhe.subtitulo", {
                nome: props.pessoaNome,
                inicio: pedido.data_inicio,
                fim: pedido.data_fim,
                dias: formatarDias(Number(pedido.dias_solicitados)),
              })}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{t(`hr.ausencias.estado.${pedido.estado}`)}</Badge>
              {props.onIrParaFicha && (
                <Button size="sm" variant="link" className="h-auto p-0" onClick={props.onIrParaFicha}>
                  {t("hr.ausencias.detalhe.irParaFicha")}
                </Button>
              )}
              {pedido.schedule_item_id === null && (
                <Badge variant="secondary">{t("hr.ausencias.detalhe.semBoard")}</Badge>
              )}
            </div>

            {pedido.schedule_item_id === null && (
              // Um pedido que existe e nao se ve no calendario, sem explicacao,
              // e a pior falha silenciosa deste modulo.
              <Alert>
                <CalendarOff className="h-4 w-4" />
                <AlertDescription>{t("hr.ausencias.detalhe.semBoardExplicacao")}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <BlocoPasso
                passo={leitura.chefia}
                nome={
                  leitura.chefia.situacao === "aberto"
                    ? nomeDe(pedido.aprovador_chefia_pessoa_id)
                    : nomeDe(leitura.chefia.decisao?.decidido_por_pessoa_id ?? null)
                }
              />
              <BlocoPasso
                passo={leitura.rh}
                nome={nomeDe(leitura.rh.decisao?.decidido_por_pessoa_id ?? null)}
              />
            </div>

            {/* Um tipo sensivel pode ter motivo escrito na mesma -- o campo
                nao bloqueia texto, so deixou de o exigir. Por isso o texto
                livre segue a MESMA guarda que o documento, agora decidida na
                BASE por `rpc_hr_ausencia_ver_motivo`: so quem tem
                hr.ausencias.justificacao.view o ve. A chefia continua a
                aprovar sem o ler. */}
            {motivo.tipo === "carregando" && (
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                {t("hr.ausencias.campo.motivoACarregar")}
              </div>
            )}
            {motivo.tipo === "visivel" && (
              <div className="rounded-md border p-3 text-sm">
                <p className="text-xs text-muted-foreground">{t("hr.ausencias.campo.motivo")}</p>
                <p>{motivo.texto}</p>
              </div>
            )}
            {motivo.tipo === "vazio" && (
              <p className="text-xs text-muted-foreground">{t("hr.ausencias.campo.semMotivo")}</p>
            )}
            {motivo.tipo === "oculto" && (
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                {t("hr.ausencias.campo.motivoOculto")}
              </div>
            )}
            {motivo.tipo === "erro" && (
              <div className="rounded-md border p-3 text-sm text-destructive">
                {t("hr.ausencias.campo.motivoErro")}
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-medium">{t("hr.ausencias.detalhe.historico")}</h3>
              {decisoes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("hr.ausencias.detalhe.semDecisoes")}
                </p>
              ) : (
                <ol className="space-y-2">
                  {[...decisoes]
                    .sort((a, b) => a.decidido_em.localeCompare(b.decidido_em))
                    .map((decisao) => (
                      <li key={decisao.id} className="rounded-md border p-2 text-sm">
                        <p className="flex flex-wrap items-center gap-x-2">
                          <span className="font-medium">
                            {t(`hr.ausencias.passo.${decisao.passo}`)}
                          </span>
                          <Badge variant="outline" className="font-normal">
                            {t(`hr.ausencias.situacao.${decisao.resultado}`)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {t("hr.ausencias.detalhe.volta", { ordem: decisao.ordem })}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(decisao.decidido_em).toLocaleString()}
                          {nomeDe(decisao.decidido_por_pessoa_id)
                            ? ` · ${nomeDe(decisao.decidido_por_pessoa_id)}`
                            : ""}
                        </p>
                        {decisao.ajuste_data_inicio && decisao.ajuste_data_fim && (
                          <p className="text-xs">
                            {t("hr.ausencias.detalhe.contraproposta", {
                              inicio: decisao.ajuste_data_inicio,
                              fim: decisao.ajuste_data_fim,
                            })}
                          </p>
                        )}
                        {decisao.motivo && <p className="mt-1">{decisao.motivo}</p>}
                      </li>
                    ))}
                </ol>
              )}
            </div>

            {permissoes.verJustificacao && props.onRevelarJustificacao && (
              <div className="rounded-md border p-3">
                <h3 className="mb-1 text-sm font-medium">
                  {t("hr.ausencias.justificacao.titulo")}
                </h3>
                {justificacoes === null ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {t("hr.ausencias.justificacao.aviso")}
                    </p>
                    <Button size="sm" variant="outline" disabled={aRevelar} onClick={revelar}>
                      {aRevelar ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {t("hr.ausencias.justificacao.revelar")}
                    </Button>
                  </div>
                ) : justificacoes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("hr.ausencias.justificacao.semRegisto")}
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {justificacoes.map((justificacao) => (
                      <li key={justificacao.id}>
                        <p className="font-medium">{justificacao.tipo_documento ?? "—"}</p>
                        {justificacao.entidade_emissora && <p>{justificacao.entidade_emissora}</p>}
                        {justificacao.documento_ref && <p>{justificacao.documento_ref}</p>}
                        {justificacao.texto && (
                          <p className="text-muted-foreground">{justificacao.texto}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <Separator />

            <div className="flex flex-wrap gap-2">
              {accoes.aprovarChefia && (
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    tratar(
                      props.onDecidirChefia({ pedidoId: pedido.id, resultado: "aprovado" }),
                      "hr.ausencias.decisao.aprovadoOk",
                    )
                  }
                >
                  {saving ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {t("hr.ausencias.accao.aprovarComoChefia")}
                </Button>
              )}
              {accoes.recusarChefia && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setAccao("recusarChefia")}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  {t("hr.ausencias.accao.recusar")}
                </Button>
              )}
              {accoes.ajustarChefia && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setAccao("ajustar")}
                >
                  {t("hr.ausencias.accao.ajustar")}
                </Button>
              )}
              {accoes.aprovarRh && (
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    tratar(
                      props.onDecidirRh({ pedidoId: pedido.id, resultado: "aprovado" }),
                      "hr.ausencias.decisao.aprovadoOk",
                    )
                  }
                >
                  {saving ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {t("hr.ausencias.accao.aprovarComoRh")}
                </Button>
              )}
              {accoes.recusarRh && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setAccao("recusarRh")}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  {t("hr.ausencias.accao.recusar")}
                </Button>
              )}
              {accoes.devolverAChefia && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setAccao("devolver")}
                >
                  <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                  {t("hr.ausencias.accao.devolver")}
                </Button>
              )}
            </div>

            {(accoes.cancelar || accoes.corrigirAprovado) && (
              <div className="space-y-2 rounded-md border border-destructive/40 p-3">
                <p className="text-xs text-muted-foreground">
                  {t("hr.ausencias.detalhe.zonaDestrutiva")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {accoes.cancelar && (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={saving}
                      onClick={() => setAccao("cancelar")}
                    >
                      {t("hr.ausencias.accao.cancelar")}
                    </Button>
                  )}
                  {accoes.corrigirAprovado && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => setAccao("corrigir")}
                    >
                      {t("hr.ausencias.accao.corrigir")}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {accao && (
        <MotivoDialog
          aberto
          titulo={textoDialogo[accao].titulo}
          descricao={textoDialogo[accao].descricao}
          rotuloConfirmar={textoDialogo[accao].rotulo}
          comDatas={accao === "ajustar"}
          datasIniciais={{ inicio: pedido.data_inicio, fim: pedido.data_fim }}
          destrutivo={accao === "cancelar" || accao === "corrigir"}
          aGravar={saving}
          onFechar={() => setAccao(null)}
          onConfirmar={confirmarAccao}
          idPrefixo={`hr-pedido-${accao}`}
        />
      )}
    </>
  );
}
