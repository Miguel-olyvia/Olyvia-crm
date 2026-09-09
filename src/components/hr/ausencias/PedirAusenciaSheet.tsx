/**
 * O gesto de PEDIR uma ausencia.
 *
 * E UM PEDIDO, NAO UMA MARCACAO
 * -----------------------------
 * O botao diz "Enviar pedido" e o painel diz para onde vai. Quem submete tem
 * de perceber, no mesmo instante, que a ausencia NAO ficou marcada -- e por
 * isso a linha do encaminhamento ("vai para a Ana e depois para o RH") esta
 * escrita antes de submeter e nao descoberta depois.
 *
 * A ORDEM DOS CAMPOS TEM RAZAO DE SER
 * -----------------------------------
 * O tipo vem antes das datas porque e ele que diz se ha meio dia, se contam
 * fins de semana e feriados, e quantos dias de antecedencia sao precisos. Sem
 * tipo escolhido as datas ficam desactivadas, com a razao escrita -- em vez de
 * deixar escolher e recusar depois.
 *
 * O SALDO AVISA, NAO TRAVA
 * ------------------------
 * `rpc_hr_ausencia_pedir` valida permissao, tipo, meio dia, antecedencia, dias
 * uteis e sobreposicao -- e mais nada sobre saldo (lido na migration
 * 20261121110000). Pedir acima do disponivel e legitimo e ha tipos que nem
 * descontam. Por isso o aviso e visivel, viaja com o pedido ate quem decide, e
 * o botao continua activo: prometer um bloqueio que a base nao faz e pior do
 * que nao o ter.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2, Send } from "lucide-react";
import {
  CampoInterruptor,
  CampoSelect,
  CampoTexto,
  CamposTocadosProvider,
} from "@/components/hr/form/Campos";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import {
  calcularPedido,
  dataMinimaDoTipo,
  efeitoNoSaldo,
  formatarDias,
  hojeIso,
  problemasDoPedido,
  type IndiceFeriados,
} from "@/lib/hr/ausencias";
import type { AusenciaDireito, AusenciaSaldo, AusenciaTipo } from "@/types/hrAusencias";

export interface PedidoSubmetido {
  tipoId: string;
  dataInicio: string;
  dataFim: string;
  meioDiaInicio: boolean;
  meioDiaFim: boolean;
  motivo: string | null;
}

interface PedirAusenciaSheetProps {
  aberto: boolean;
  onFechar: () => void;
  tipos: AusenciaTipo[];
  saldos: AusenciaSaldo[];
  direitos: AusenciaDireito[];
  feriados: IndiceFeriados;
  /** Nome de quem vai ficar ausente. O painel nunca deixa duvidas sobre isso. */
  pessoaNome: string;
  /** Resolvido de `hr_ausencias_aprovador_chefia`: null = passo DISPENSADO. */
  aprovadorChefiaNome?: string | null;
  dataInicial?: string | null;
  /** Verdadeiro quando o painel foi aberto de um quadro de agendas. */
  vindoDoBoard?: boolean;
  saving: boolean;
  onPedir: (pedido: PedidoSubmetido) => Promise<string | null>;
  idPrefixo?: string;
}

export function PedirAusenciaSheet({
  aberto,
  onFechar,
  tipos,
  saldos,
  direitos,
  feriados,
  pessoaNome,
  aprovadorChefiaNome,
  dataInicial,
  vindoDoBoard,
  saving,
  onPedir,
  idPrefixo = "hr-pedir-ausencia",
}: PedirAusenciaSheetProps) {
  const { t } = useTranslation();
  const hoje = hojeIso();

  const [tipoId, setTipoId] = useState("");
  const [dataInicio, setDataInicio] = useState(dataInicial ?? "");
  const [dataFim, setDataFim] = useState(dataInicial ?? "");
  const [meioDiaInicio, setMeioDiaInicio] = useState(false);
  const [meioDiaFim, setMeioDiaFim] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  // Ao submeter mostram-se todos, mesmo os campos em que ninguem entrou.
  const [mostrarTodos, setMostrarTodos] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setTipoId("");
    setDataInicio(dataInicial ?? "");
    setDataFim(dataInicial ?? "");
    setMeioDiaInicio(false);
    setMeioDiaFim(false);
    setMotivo("");
    setTocados(new Set());
    setMostrarTodos(false);
  }, [aberto, dataInicial]);

  const tocar = useCallback((campoId: string) => {
    setTocados((anteriores) => {
      if (anteriores.has(campoId)) return anteriores;
      const proximos = new Set(anteriores);
      proximos.add(campoId);
      return proximos;
    });
  }, []);

  const tipo = useMemo(() => tipos.find((t2) => t2.id === tipoId) ?? null, [tipos, tipoId]);

  const periodos = useMemo(
    () =>
      direitos
        .filter((direito) => !tipo || direito.tipo_id === tipo.id)
        .map((direito) => ({
          periodo_inicio: direito.periodo_inicio,
          periodo_fim: direito.periodo_fim,
        })),
    [direitos, tipo],
  );

  const calculo = useMemo(
    () =>
      tipo
        ? calcularPedido({
            dataInicio,
            dataFim,
            tipo,
            feriados,
            meioDiaInicio,
            meioDiaFim,
            periodos,
          })
        : { diasCivis: 0, dias: [], total: 0, porPeriodo: [] },
    [tipo, dataInicio, dataFim, feriados, meioDiaInicio, meioDiaFim, periodos],
  );

  const saldoDoTipo = useMemo(() => {
    if (!tipo) return null;
    const periodoDoPedido = calculo.porPeriodo[0]?.periodoInicio;
    const candidatos = saldos.filter((saldo) => saldo.tipo_id === tipo.id);
    return (
      candidatos.find((saldo) => saldo.periodo_inicio === periodoDoPedido) ??
      candidatos[0] ??
      null
    );
  }, [saldos, tipo, calculo]);

  const efeito = useMemo(
    () => efeitoNoSaldo(saldoDoTipo, calculo.total),
    [saldoDoTipo, calculo.total],
  );

  const problemas = useMemo(
    () =>
      problemasDoPedido({
        tipo,
        dataInicio,
        dataFim,
        meioDiaInicio,
        meioDiaFim,
        motivo,
        calculo,
        hoje,
      }),
    [tipo, dataInicio, dataFim, meioDiaInicio, meioDiaFim, motivo, calculo, hoje],
  );

  const erroDe = (campo: "tipo" | "dataInicio" | "dataFim" | "motivo", campoId: string) => {
    const problema = problemas.find((p) => p.campo === campo);
    if (!problema) return null;
    if (!mostrarTodos && !tocados.has(campoId)) return null;
    return t(problema.mensagemKey);
  };

  const idTipo = `${idPrefixo}-tipo`;
  const idInicio = `${idPrefixo}-inicio`;
  const idFim = `${idPrefixo}-fim`;
  const idMotivo = `${idPrefixo}-motivo`;

  /** A quem o pedido vai, em texto claro, resolvido do tipo e da cadeia. */
  const encaminhamento = useMemo(() => {
    if (!tipo) return null;
    const comChefia = tipo.exige_aprovacao_chefia && Boolean(aprovadorChefiaNome);
    if (comChefia && tipo.exige_aprovacao_rh) {
      return t("hr.ausencias.pedir.vaiParaChefiaERh", { nome: aprovadorChefiaNome as string });
    }
    if (comChefia) {
      return t("hr.ausencias.pedir.vaiParaChefia", { nome: aprovadorChefiaNome as string });
    }
    if (tipo.exige_aprovacao_chefia && !aprovadorChefiaNome) {
      // Aprovador nulo significa passo DISPENSADO, nao passo em aberto.
      return t("hr.ausencias.pedir.semChefiaVaiParaRh");
    }
    if (tipo.exige_aprovacao_rh) return t("hr.ausencias.pedir.vaiParaRh");
    return t("hr.ausencias.pedir.semAprovacao");
  }, [tipo, aprovadorChefiaNome, t]);

  const submeter = async () => {
    setMostrarTodos(true);
    if (problemas.length > 0) {
      // Nao se manda a base o que ela vai recusar: a mensagem de um CHECK nao
      // diz a ninguem qual o campo nem qual o limite.
      toast.error(t(problemas[0].mensagemKey));
      return;
    }
    const erro = await onPedir({
      tipoId,
      dataInicio,
      dataFim,
      meioDiaInicio,
      meioDiaFim,
      motivo: motivo.trim() === "" ? null : motivo.trim(),
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.ausencias.pedir.enviado"));
    onFechar();
  };

  const semTipos = tipos.length === 0;
  const dataMinima = tipo ? dataMinimaDoTipo(tipo, hoje) : hoje;

  return (
    <Sheet open={aberto} onOpenChange={(estado) => !estado && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("hr.ausencias.pedir.titulo")}</SheetTitle>
          <SheetDescription>
            {vindoDoBoard
              ? t("hr.ausencias.pedir.descricaoBoard")
              : t("hr.ausencias.pedir.descricao", { nome: pessoaNome })}
          </SheetDescription>
        </SheetHeader>

        {semTipos ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {t("hr.ausencias.tipos.semTipos")}
          </div>
        ) : (
          <CamposTocadosProvider onTocar={tocar}>
            <div className="space-y-4 py-4">
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t("hr.ausencias.pedir.para")}: </span>
                <span className="font-medium">{pessoaNome}</span>
              </div>

              <CampoSelect
                id={idTipo}
                label={t("hr.ausencias.campo.tipo")}
                valor={tipoId}
                onChange={setTipoId}
                erro={erroDe("tipo", idTipo)}
                placeholder={t("hr.ausencias.campo.tipoPlaceholder")}
                opcoes={tipos.map((opcao) => ({ value: opcao.id, label: opcao.nome }))}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <CampoTexto
                  id={idInicio}
                  label={t("hr.ausencias.campo.dataInicio")}
                  tipo="date"
                  valor={dataInicio}
                  disabled={!tipo}
                  onChange={(valor) => {
                    setDataInicio(valor);
                    if (!dataFim || dataFim < valor) setDataFim(valor);
                  }}
                  erro={erroDe("dataInicio", idInicio)}
                  ajuda={
                    tipo && tipo.antecedencia_minima_dias > 0
                      ? t("hr.ausencias.pedir.antecedencia", {
                          dias: tipo.antecedencia_minima_dias,
                          data: dataMinima,
                        })
                      : !tipo
                        ? t("hr.ausencias.pedir.escolheTipoPrimeiro")
                        : undefined
                  }
                />
                <CampoTexto
                  id={idFim}
                  label={t("hr.ausencias.campo.dataFim")}
                  tipo="date"
                  valor={dataFim}
                  disabled={!tipo}
                  onChange={setDataFim}
                  erro={erroDe("dataFim", idFim)}
                />
              </div>

              {tipo?.permite_meio_dia && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <CampoInterruptor
                    id={`${idPrefixo}-meio-inicio`}
                    label={t("hr.ausencias.campo.meioDiaInicio")}
                    checked={meioDiaInicio}
                    onChange={setMeioDiaInicio}
                  />
                  <CampoInterruptor
                    id={`${idPrefixo}-meio-fim`}
                    label={t("hr.ausencias.campo.meioDiaFim")}
                    checked={meioDiaFim}
                    onChange={setMeioDiaFim}
                  />
                </div>
              )}

              {tipo && calculo.diasCivis > 0 && (
                <div className="space-y-2 rounded-md border p-3 text-sm">
                  <p>
                    {t("hr.ausencias.pedir.resumo", {
                      civis: calculo.diasCivis,
                      contaveis: formatarDias(calculo.total),
                    })}
                  </p>
                  {calculo.porPeriodo.length > 1 && (
                    <ul className="space-y-0.5 text-xs text-muted-foreground">
                      {calculo.porPeriodo.map((parte) => (
                        <li key={parte.periodoInicio}>
                          {t("hr.ausencias.pedir.porPeriodo", {
                            periodo: parte.periodoInicio,
                            dias: formatarDias(parte.dias),
                          })}
                        </li>
                      ))}
                    </ul>
                  )}
                  <dl className="grid grid-cols-3 gap-2 border-t pt-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t("hr.ausencias.pedir.disponiveisHoje")}
                      </dt>
                      <dd className="tabular-nums">{formatarDias(efeito.disponiveisAntes)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t("hr.ausencias.pedir.estePedido")}
                      </dt>
                      <dd className="tabular-nums">−{formatarDias(efeito.pedido)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t("hr.ausencias.pedir.ficaCom")}
                      </dt>
                      <dd className="tabular-nums">{formatarDias(efeito.disponiveisDepois)}</dd>
                    </div>
                  </dl>
                </div>
              )}

              {efeito.ultrapassa && tipo?.desconta_saldo && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {t("hr.ausencias.pedir.avisoSaldo", {
                      dias: formatarDias(Math.abs(efeito.disponiveisDepois)),
                    })}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor={idMotivo}>
                  {tipo?.exige_justificacao && !tipo.justificacao_sensivel
                    ? t("hr.ausencias.campo.motivoObrigatorio")
                    : t("hr.ausencias.campo.motivo")}
                </Label>
                <Textarea
                  id={idMotivo}
                  value={motivo}
                  rows={3}
                  aria-invalid={erroDe("motivo", idMotivo) ? true : undefined}
                  aria-describedby={
                    [
                      erroDe("motivo", idMotivo) ? `${idMotivo}-erro` : null,
                      `${idMotivo}-aviso`,
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  onChange={(evento) => setMotivo(evento.target.value)}
                  onBlur={() => tocar(idMotivo)}
                />
                {/* Visivel para todos os tipos: o texto vai para quem aprova
                    (chefia incluida), e ninguem deve la por um dado de saude
                    sem saber isso -- sensivel demais fica a cargo do
                    documento em pessoas_ausencias_justificacoes, nao daqui. */}
                <p id={`${idMotivo}-aviso`} className="text-xs text-muted-foreground">
                  {t("hr.ausencias.campo.motivoAviso")}
                </p>
                {tipo?.justificacao_sensivel && (
                  <p className="text-xs text-muted-foreground">
                    {t("hr.ausencias.campo.motivoSensivelAviso")}
                  </p>
                )}
                {erroDe("motivo", idMotivo) && (
                  <p id={`${idMotivo}-erro`} className="text-xs text-destructive">
                    {erroDe("motivo", idMotivo)}
                  </p>
                )}
              </div>

              {encaminhamento && (
                <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {encaminhamento}
                </p>
              )}

              {/* O que muda com as datas e anunciado, nao so pintado. */}
              <p aria-live="polite" className="sr-only">
                {tipo && calculo.total > 0
                  ? t("hr.ausencias.pedir.anuncio", {
                      contaveis: formatarDias(calculo.total),
                      restantes: formatarDias(efeito.disponiveisDepois),
                    })
                  : ""}
              </p>

              <div className="flex gap-2 pt-2">
                <Button onClick={submeter} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {t("hr.ausencias.pedir.submeter")}
                </Button>
                <Button variant="ghost" onClick={onFechar} disabled={saving}>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          </CamposTocadosProvider>
        )}
      </SheetContent>
    </Sheet>
  );
}
