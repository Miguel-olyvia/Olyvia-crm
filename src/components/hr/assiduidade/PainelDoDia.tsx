/**
 * O dia de uma pessoa, lido pelo INTERVALO e nunca pelo dia.
 *
 * A ORDEM E SEMPRE ESTA: planeado, realizado, faltas, ausencias. E a ordem da
 * pergunta que quem gere faz -- "o que e que era para acontecer, o que
 * aconteceu, o que ficou por explicar, e o que ja estava justificado a
 * partida".
 *
 * NAO HA COLUNA "ENTRADA" NEM COLUNA "SAIDA" DO DIA, e nao ha um local do dia.
 * Um dia e uma pilha de intervalos: 09-14 numa empresa e 15-19 noutra sao duas
 * filas com bolinhas diferentes. O dia com um intervalo so e a mesma lista com
 * um elemento -- nao e o caso normal com os outros escondidos.
 *
 * AO LADO DE CADA INTERVALO PLANEADO diz-se o que aconteceu nele: coberto, sem
 * horas registadas, parcial, ou em falta. O intervalo sem horas oferece
 * "marcar falta neste periodo", e o formulario abre com AS HORAS DAQUELE
 * INTERVALO -- 09:00 e 13:00, e nao 09:00 e 18:00. E isto que responde ao
 * pedido de marcar a falta ao periodo.
 *
 * O rodape e uma regiao `aria-live` com o total do dia e o total POR LOCAL,
 * como o `HorarioEditor` ja faz: e a pergunta que quem gere tem mesmo, que e
 * quantas horas se pagam a cada sitio.
 */
import { useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CalendarPlus, Check, Plus, RefreshCw, X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { MotivoDialog } from "@/components/hr/ausencias/MotivoDialog";
import { LocalEtiqueta } from "@/components/hr/assiduidade/LocalEtiqueta";
import { HistoricoCorreccoes } from "@/components/hr/assiduidade/HistoricoCorreccoes";
import { JustificacaoFalta } from "@/components/hr/assiduidade/JustificacaoFalta";
import { MarcarFaltaSheet, type FaltaInicial } from "@/components/hr/assiduidade/MarcarFaltaSheet";
import { PicagemSheet } from "@/components/hr/assiduidade/PicagemSheet";
import { CorrigirRealizadoSheet } from "@/components/hr/assiduidade/CorrigirRealizadoSheet";
import {
  LEITOR_FALTAS,
  LEITOR_PICAGENS,
  LEITOR_REALIZADO,
  cadeiaDeCorreccoes,
  emVigor,
  formatarDuracao,
  horaCurta,
  minutosEntre,
  situacaoDoIntervalo,
  totaisPorLocal,
} from "@/lib/hr/assiduidade";
import { leituraDoPlaneado } from "@/lib/hr/planeadoDoDia";
import type { AssiduidadeDaPessoa } from "@/hooks/useAssiduidadeDaPessoa";
import type { Falta, PermissoesAssiduidade, Picagem } from "@/types/hrAssiduidade";
import type { LocalTrabalho } from "@/types/hr";

interface PainelDoDiaProps {
  aberto: boolean;
  data: string;
  pessoaNome: string;
  /** A ficha e a de quem esta autenticado: ninguem valida as proprias horas. */
  souAPessoa: boolean;
  assiduidade: AssiduidadeDaPessoa;
  locais: LocalTrabalho[];
  permissoes: PermissoesAssiduidade;
  onFechar: () => void;
}

type PedidoDeMotivo =
  | { tipo: "anularPicagem"; id: string }
  | { tipo: "anularFalta"; id: string }
  | { tipo: "rejeitarRealizado"; id: string }
  | { tipo: "recusarJustificacao"; id: string };

export function PainelDoDia({
  aberto,
  data,
  pessoaNome,
  souAPessoa,
  assiduidade,
  locais,
  permissoes,
  onFechar,
}: PainelDoDiaProps) {
  const { t } = useTranslation();

  const [faltaInicial, setFaltaInicial] = useState<FaltaInicial | null>(null);
  const [picagemSheet, setPicagemSheet] = useState<
    { modo: "lancar" | "corrigir"; picagem: Picagem | null } | null
  >(null);
  const [realizadoACorrigir, setRealizadoACorrigir] = useState<string | null>(null);
  const [pedidoDeMotivo, setPedidoDeMotivo] = useState<PedidoDeMotivo | null>(null);

  /* ---- O que existe neste dia, ja em vigor ---- */

  const picagensDoDia = useMemo(
    () => assiduidade.picagens.filter((p) => p.data_local === data),
    [assiduidade.picagens, data],
  );
  const realizadoDoDia = useMemo(
    () => assiduidade.realizado.filter((r) => r.data === data),
    [assiduidade.realizado, data],
  );
  const faltasDoDia = useMemo(
    () => assiduidade.faltas.filter((f) => f.data === data),
    [assiduidade.faltas, data],
  );

  const picagensEmVigor = useMemo(
    () => emVigor(picagensDoDia, LEITOR_PICAGENS),
    [picagensDoDia],
  );
  const realizadoEmVigor = useMemo(
    () => emVigor(realizadoDoDia, LEITOR_REALIZADO).filter((r) => !r.deleted_at),
    [realizadoDoDia],
  );
  const faltasEmVigor = useMemo(() => emVigor(faltasDoDia, LEITOR_FALTAS), [faltasDoDia]);

  const planeadoDoDia = useMemo(
    () => leituraDoPlaneado(assiduidade.planeado, data),
    [assiduidade.planeado, data],
  );

  const ausencia = assiduidade.ausenciaAprovadaPorDia.get(data) ?? null;

  const totais = useMemo(
    () => totaisPorLocal(realizadoEmVigor.map((r) => ({ ...r, local_id: r.local_id }))),
    [realizadoEmVigor],
  );
  const totalDoDia = useMemo(
    () =>
      realizadoEmVigor.reduce(
        (soma, linha) => soma + (minutosEntre(linha.hora_inicio, linha.hora_fim) ?? 0),
        0,
      ),
    [realizadoEmVigor],
  );

  /* ---- Accoes ---- */

  const comMotivo = async (motivo: string) => {
    if (!pedidoDeMotivo) return;
    const erro =
      pedidoDeMotivo.tipo === "anularPicagem"
        ? await assiduidade.anularPicagem(pedidoDeMotivo.id, motivo)
        : pedidoDeMotivo.tipo === "anularFalta"
          ? await assiduidade.anularFalta(pedidoDeMotivo.id, motivo)
          : pedidoDeMotivo.tipo === "rejeitarRealizado"
            ? await assiduidade.rejeitarRealizado(pedidoDeMotivo.id, motivo)
            : await assiduidade.decidirJustificacao({
                faltaId: pedidoDeMotivo.id,
                resultado: "recusada",
                motivo,
              });
    setPedidoDeMotivo(null);
    if (erro) {
      toast.error(t(erro));
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
  };

  const consolidar = async () => {
    const erro = await assiduidade.consolidarDia(data);
    if (erro) {
      toast.error(t(erro));
      return;
    }
    toast.success(t("hr.assiduidade.dia.consolidado"));
  };

  const validar = async (realizadoId: string) => {
    const erro = await assiduidade.validarRealizado(realizadoId);
    if (erro) {
      toast.error(t(erro));
      return;
    }
    toast.success(t("hr.assiduidade.realizado.validado"));
  };

  const aceitarJustificacao = async (faltaId: string) => {
    const erro = await assiduidade.decidirJustificacao({ faltaId, resultado: "justificada" });
    if (erro) {
      toast.error(t(erro));
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
  };

  const anularPorAusencia = async (falta: Falta) => {
    if (!ausencia) return;
    const erro = await assiduidade.anularFaltaPorAusencia(falta.id, ausencia.id);
    if (erro) {
      toast.error(t(erro));
      return;
    }
    toast.success(t("hr.assiduidade.falta.anuladaPorAusencia"));
  };

  const realizadoEmCorreccao = realizadoEmVigor.find((r) => r.id === realizadoACorrigir);

  return (
    <>
      <Sheet open={aberto} onOpenChange={(estado) => !estado && onFechar()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{pessoaNome}</SheetTitle>
            <SheetDescription className="tabular-nums">{data}</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* -------- Ausencia aprovada, se houver -------- */}
            {ausencia && (
              <p className="rounded-md border border-dashed p-3 text-xs">
                {ausencia.fraccao_dia >= 1
                  ? t("hr.assiduidade.dia.ausenciaDiaInteiro")
                  : t("hr.assiduidade.dia.ausenciaParcial", {
                      fraccao: String(ausencia.fraccao_dia),
                    })}
              </p>
            )}

            {/* -------- Planeado -------- */}
            <section aria-labelledby="hr-dia-planeado">
              <h3 id="hr-dia-planeado" className="text-sm font-medium">
                {t("hr.assiduidade.dia.planeado")}
              </h3>

              {planeadoDoDia.naoTrabalha ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("hr.assiduidade.dia.naoTrabalha")}
                </p>
              ) : planeadoDoDia.intervalos.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("hr.assiduidade.dia.semPlaneado")}
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {planeadoDoDia.intervalos.map((intervalo) => {
                    const periodo = {
                      hora_inicio: intervalo.hora_inicio ?? "00:00",
                      hora_fim: intervalo.hora_fim ?? "00:00",
                    };
                    const situacao = situacaoDoIntervalo(
                      periodo,
                      realizadoEmVigor,
                      faltasEmVigor,
                    );
                    return (
                      <li
                        key={intervalo.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2 text-sm"
                      >
                        <span className="tabular-nums">
                          {horaCurta(intervalo.hora_inicio)} — {horaCurta(intervalo.hora_fim)}
                        </span>
                        <LocalEtiqueta locais={locais} localId={intervalo.local_id} />
                        <Badge variant="outline" className="font-normal">
                          {t(`hr.assiduidade.situacao.${situacao.situacao}`)}
                        </Badge>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatarDuracao(situacao.minutosRealizados)} /{" "}
                          {formatarDuracao(situacao.minutosPlaneados)}
                        </span>

                        {permissoes.faltasEdit && situacao.situacao !== "coberto" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="ml-auto h-7"
                            onClick={() =>
                              setFaltaInicial({
                                data,
                                horaInicio: horaCurta(intervalo.hora_inicio),
                                horaFim: horaCurta(intervalo.hora_fim),
                                planeadoId: intervalo.id,
                              })
                            }
                          >
                            <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                            {t("hr.assiduidade.dia.marcarFaltaNestePeriodo")}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <Separator />

            {/* -------- Picagens -------- */}
            <section aria-labelledby="hr-dia-picagens">
              <div className="flex flex-wrap items-center gap-2">
                <h3 id="hr-dia-picagens" className="text-sm font-medium">
                  {t("hr.assiduidade.dia.picagens")}
                </h3>
                {(permissoes.picar || permissoes.picarOutros) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7"
                    onClick={() => setPicagemSheet({ modo: "lancar", picagem: null })}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {t("hr.assiduidade.dia.lancarPicagem")}
                  </Button>
                )}
                {permissoes.gerir && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    disabled={assiduidade.saving}
                    onClick={() => void consolidar()}
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    {t("hr.assiduidade.dia.consolidar")}
                  </Button>
                )}
              </div>

              {picagensEmVigor.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("hr.assiduidade.dia.semPicagens")}
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {picagensEmVigor.map((picagem) => {
                    const cadeia = cadeiaDeCorreccoes(picagem, picagensDoDia, LEITOR_PICAGENS);
                    return (
                      <li
                        key={picagem.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2 text-sm"
                      >
                        <span className="tabular-nums">{horaCurta(picagem.hora_local)}</span>
                        <Badge variant="outline" className="font-normal">
                          {t(`hr.assiduidade.sentido.${picagem.sentido}`)}
                        </Badge>
                        <LocalEtiqueta locais={locais} localId={picagem.local_id} />
                        <span className="text-xs text-muted-foreground">
                          {t(`hr.assiduidade.origem.${picagem.origem}`)}
                        </span>
                        {!picagem.realizado_id && (
                          <Badge variant="secondary" className="font-normal">
                            {t("hr.assiduidade.dia.porEmparelhar")}
                          </Badge>
                        )}

                        <HistoricoCorreccoes
                          titulo={t("hr.assiduidade.historico.picagemTitulo")}
                          descricao={t("hr.assiduidade.historico.descricao")}
                          rotulo={t("hr.assiduidade.historico.rotulo", {
                            quantas: String(cadeia.length - 1),
                          })}
                          passos={cadeia.map((linha) => ({
                            id: linha.id,
                            valor: `${horaCurta(linha.hora_local)} · ${t(
                              `hr.assiduidade.sentido.${linha.sentido}`,
                            )}`,
                            autor: linha.registado_por_pessoa_id,
                            quando: linha.created_at?.slice(0, 16).replace("T", " ") ?? null,
                            tipo: linha.correccao_tipo
                              ? t(`hr.assiduidade.tipoCorreccao.${linha.correccao_tipo}`)
                              : null,
                            motivo: linha.correccao_motivo,
                            anulada: linha.estado === "anulada",
                            anulacaoMotivo: linha.anulacao_motivo,
                          }))}
                        />

                        {permissoes.corrigir && (
                          <span className="ml-auto flex gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7"
                              onClick={() => setPicagemSheet({ modo: "corrigir", picagem })}
                            >
                              {t("hr.assiduidade.accao.corrigir")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-destructive"
                              onClick={() =>
                                setPedidoDeMotivo({ tipo: "anularPicagem", id: picagem.id })
                              }
                            >
                              {t("hr.assiduidade.accao.anular")}
                            </Button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <Separator />

            {/* -------- Horas realizadas -------- */}
            <section aria-labelledby="hr-dia-realizado">
              <h3 id="hr-dia-realizado" className="text-sm font-medium">
                {t("hr.assiduidade.dia.realizado")}
              </h3>
              {souAPessoa && permissoes.validarRealizado && (
                // A base recusa a autovalidacao com 42501. Diz-se aqui, uma
                // vez, em vez de deixar a pessoa descobrir pelo toast de erro.
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("hr.assiduidade.realizado.naoValidaAsSuas")}
                </p>
              )}

              {realizadoEmVigor.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("hr.assiduidade.dia.semRealizado")}
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {realizadoEmVigor.map((linha) => {
                    const cadeia = cadeiaDeCorreccoes(linha, realizadoDoDia, LEITOR_REALIZADO);
                    return (
                      <li
                        key={linha.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2 text-sm"
                      >
                        <span className="tabular-nums">
                          {horaCurta(linha.hora_inicio)} — {horaCurta(linha.hora_fim)}
                        </span>
                        <LocalEtiqueta locais={locais} localId={linha.local_id} />
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatarDuracao(linha.minutos ?? 0)}
                        </span>
                        <Badge variant="outline" className="font-normal">
                          {t(`hr.horario.estados.${linha.estado}`)}
                        </Badge>

                        <HistoricoCorreccoes
                          titulo={t("hr.assiduidade.historico.realizadoTitulo")}
                          descricao={t("hr.assiduidade.historico.descricao")}
                          rotulo={t("hr.assiduidade.historico.rotulo", {
                            quantas: String(cadeia.length - 1),
                          })}
                          passos={cadeia.map((versao) => ({
                            id: versao.id,
                            valor: `${horaCurta(versao.hora_inicio)} — ${horaCurta(versao.hora_fim)}`,
                            autor: versao.corrigido_por_pessoa_id,
                            quando: null,
                            motivo: versao.correccao_motivo,
                          }))}
                        />

                        <span className="ml-auto flex gap-1">
                          {permissoes.corrigir && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7"
                              onClick={() => setRealizadoACorrigir(linha.id)}
                            >
                              {t("hr.assiduidade.accao.corrigir")}
                            </Button>
                          )}
                          {/* Na propria ficha o botao de validar NAO se desenha
                              -- nem desactivado: a regra e da base e nao e uma
                              opcao indisponivel. */}
                          {permissoes.validarRealizado && !souAPessoa && linha.estado !== "validado" && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7"
                                disabled={assiduidade.saving}
                                onClick={() => void validar(linha.id)}
                              >
                                <Check className="mr-1.5 h-3.5 w-3.5" />
                                {t("hr.assiduidade.accao.validar")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 text-destructive"
                                onClick={() =>
                                  setPedidoDeMotivo({ tipo: "rejeitarRealizado", id: linha.id })
                                }
                              >
                                <X className="mr-1.5 h-3.5 w-3.5" />
                                {t("hr.assiduidade.accao.rejeitar")}
                              </Button>
                            </>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <Separator />

            {/* -------- Faltas -------- */}
            {permissoes.faltasView && (
              <section aria-labelledby="hr-dia-faltas">
                <h3 id="hr-dia-faltas" className="text-sm font-medium">
                  {t("hr.assiduidade.dia.faltas")}
                </h3>

                {faltasEmVigor.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("hr.assiduidade.dia.semFaltas")}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-3">
                    {faltasEmVigor.map((falta) => (
                      <li key={falta.id} className="space-y-2 rounded-md border p-2 text-sm">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="tabular-nums">
                            {horaCurta(falta.hora_inicio)} — {horaCurta(falta.hora_fim)}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatarDuracao(falta.minutos ?? 0)}
                          </span>
                          <Badge variant="outline" className="font-normal">
                            {t(`hr.assiduidade.motivoFalta.${falta.motivo_codigo}`)}
                          </Badge>

                          <span className="ml-auto flex gap-1">
                            {permissoes.faltasEdit && ausencia && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7"
                                disabled={assiduidade.saving}
                                onClick={() => void anularPorAusencia(falta)}
                              >
                                {t("hr.assiduidade.accao.anularPorAusencia")}
                              </Button>
                            )}
                            {permissoes.corrigir && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 text-destructive"
                                onClick={() =>
                                  setPedidoDeMotivo({ tipo: "anularFalta", id: falta.id })
                                }
                              >
                                {t("hr.assiduidade.accao.anular")}
                              </Button>
                            )}
                          </span>
                        </div>

                        <JustificacaoFalta
                          faltaId={falta.id}
                          estado={falta.justificacao_estado}
                          decididaEm={falta.justificacao_decidida_em}
                          decididaPorNome={null}
                          motivoDaDecisao={falta.justificacao_motivo}
                          podeVerDocumento={permissoes.justificacaoView}
                          podeDecidir={permissoes.justificacaoEdit}
                          aGravar={assiduidade.saving}
                          onRevelar={assiduidade.revelarJustificacao}
                          onDecidir={(resultado) =>
                            resultado === "justificada"
                              ? void aceitarJustificacao(falta.id)
                              : setPedidoDeMotivo({ tipo: "recusarJustificacao", id: falta.id })
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* -------- Totais -------- */}
            <div aria-live="polite" className="rounded-md bg-muted/50 p-3 text-sm">
              <p className="font-medium tabular-nums">
                {t("hr.assiduidade.dia.totalDoDia", { total: formatarDuracao(totalDoDia) })}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {[...totais.entries()].map(([localId, minutos]) => (
                  <li key={localId ?? "sem-local"} className="flex items-center gap-2">
                    <LocalEtiqueta locais={locais} localId={localId} />
                    <span className="tabular-nums">{formatarDuracao(minutos)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* -------- Os paineis que este painel abre -------- */}

      {faltaInicial && (
        <MarcarFaltaSheet
          aberto
          inicial={faltaInicial}
          fraccaoAusenciaAprovada={ausencia?.fraccao_dia ?? null}
          podeRegistarJustificacao={permissoes.justificacaoEdit}
          aGravar={assiduidade.saving}
          onFechar={() => setFaltaInicial(null)}
          onMarcar={assiduidade.marcarFalta}
          idPrefixo="hr-dia-falta"
        />
      )}

      {picagemSheet && (
        <PicagemSheet
          aberto
          modo={picagemSheet.modo}
          picagem={picagemSheet.picagem}
          data={data}
          locais={locais}
          aGravar={assiduidade.saving}
          onFechar={() => setPicagemSheet(null)}
          onLancar={(args) =>
            assiduidade.picar({
              sentido: args.sentido,
              momento: args.momento,
              localId: args.localId,
              origem: "manual_rh",
            })
          }
          onCorrigir={assiduidade.corrigirPicagem}
          idPrefixo="hr-dia-picagem"
        />
      )}

      {realizadoEmCorreccao && (
        <CorrigirRealizadoSheet
          aberto
          realizadoId={realizadoEmCorreccao.id}
          horaInicioActual={realizadoEmCorreccao.hora_inicio}
          horaFimActual={realizadoEmCorreccao.hora_fim}
          localActual={realizadoEmCorreccao.local_id}
          locais={locais}
          aGravar={assiduidade.saving}
          onFechar={() => setRealizadoACorrigir(null)}
          onCorrigir={assiduidade.corrigirRealizado}
          idPrefixo="hr-dia-realizado"
        />
      )}

      <MotivoDialog
        aberto={pedidoDeMotivo !== null}
        titulo={t(`hr.assiduidade.motivo.${pedidoDeMotivo?.tipo ?? "anularPicagem"}.titulo`)}
        descricao={t(`hr.assiduidade.motivo.${pedidoDeMotivo?.tipo ?? "anularPicagem"}.descricao`)}
        rotuloConfirmar={t("hr.assiduidade.accao.confirmar")}
        destrutivo
        aGravar={assiduidade.saving}
        onFechar={() => setPedidoDeMotivo(null)}
        onConfirmar={({ motivo }) => void comMotivo(motivo)}
        idPrefixo="hr-dia-motivo"
      />
    </>
  );
}
