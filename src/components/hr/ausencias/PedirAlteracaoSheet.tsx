/**
 * O gesto de PEDIR A ALTERACAO DE DIAS de uma ausencia JA APROVADA.
 *
 * FICHEIRO PROPRIO, NAO UM MODO DE `PedirAusenciaSheet`
 * ------------------------------------------------------
 * As validacoes sao outras: aqui o tipo, a pessoa, o vinculo e a organizacao
 * vem herdados do pedido original (nao sao escolha nesta tela), a fronteira
 * e `data_inicio` do ORIGINAL ter de ser ainda futura, e a base recusa se ja
 * houver uma alteracao pendente sobre o mesmo original. Tentar encaixar isto
 * como mais um `modo` de `PedirAusenciaSheet` obrigava esse ficheiro a saber
 * de regras que nao lhe dizem respeito.
 *
 * NAO SE REESCREVEM AS DATAS DO ORIGINAL
 * ---------------------------------------
 * Isto e um PEDIDO, sujeito a aprovacao: enquanto pendente, o pedido
 * original continua aprovado e a ocupar as suas datas antigas -- por isso o
 * painel mostra as duas lado a lado, e diz explicitamente que nada muda ate
 * haver decisao.
 *
 * O SALDO AVISA, NAO TRAVA
 * ------------------------
 * `rpc_hr_ausencia_pedir_alteracao` so avisa (RAISE NOTICE) se as novas datas
 * ultrapassarem o saldo disponivel -- nunca recusa por isso. O mesmo aqui.
 */
import { useEffect, useMemo, useState } from "react";
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
import { CampoInterruptor, CampoTexto, CamposTocadosProvider } from "@/components/hr/form/Campos";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import {
  calcularPedido,
  efeitoNoSaldo,
  formatarDias,
  type IndiceFeriados,
} from "@/lib/hr/ausencias";
import type {
  AusenciaDireito,
  AusenciaPedido,
  AusenciaSaldo,
  AusenciaTipo,
} from "@/types/hrAusencias";

export interface AlteracaoSubmetida {
  novaDataInicio: string;
  novaDataFim: string;
  novoMeioDiaInicio: boolean;
  novoMeioDiaFim: boolean;
  motivo: string | null;
}

interface PedirAlteracaoSheetProps {
  aberto: boolean;
  onFechar: () => void;
  /** O pedido JA APROVADO que se pretende alterar. */
  pedidoOriginal: AusenciaPedido;
  tipo: AusenciaTipo | null;
  saldos: AusenciaSaldo[];
  direitos: AusenciaDireito[];
  feriados: IndiceFeriados;
  pessoaNome: string;
  saving: boolean;
  onPedir: (alteracao: AlteracaoSubmetida) => Promise<string | null>;
  idPrefixo?: string;
}

export function PedirAlteracaoSheet({
  aberto,
  onFechar,
  pedidoOriginal,
  tipo,
  saldos,
  direitos,
  feriados,
  pessoaNome,
  saving,
  onPedir,
  idPrefixo = "hr-pedir-alteracao",
}: PedirAlteracaoSheetProps) {
  const { t } = useTranslation();

  const [dataInicio, setDataInicio] = useState(pedidoOriginal.data_inicio);
  const [dataFim, setDataFim] = useState(pedidoOriginal.data_fim);
  const [meioDiaInicio, setMeioDiaInicio] = useState(pedidoOriginal.meio_dia_inicio);
  const [meioDiaFim, setMeioDiaFim] = useState(pedidoOriginal.meio_dia_fim);
  const [motivo, setMotivo] = useState("");
  const [mostrarErros, setMostrarErros] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setDataInicio(pedidoOriginal.data_inicio);
    setDataFim(pedidoOriginal.data_fim);
    setMeioDiaInicio(pedidoOriginal.meio_dia_inicio);
    setMeioDiaFim(pedidoOriginal.meio_dia_fim);
    setMotivo("");
    setMostrarErros(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, pedidoOriginal.id]);

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

  // As guardas espelham `rpc_hr_ausencia_pedir_alteracao`, migration
  // 20261201020000: datas validas, dias contaveis, e meio dia so quando o
  // tipo o permite. NAO se repete aqui a antecedencia minima de
  // `rpc_hr_ausencia_pedir` -- a RPC de alteracao nao a exige.
  const erroChave = useMemo((): string | null => {
    if (!dataInicio) return "hr.ausencias.erro.semDataInicio";
    if (!dataFim) return "hr.ausencias.erro.semDataFim";
    if (dataFim < dataInicio) return "hr.ausencias.erro.fimAntesDoInicio";
    if ((meioDiaInicio || meioDiaFim) && tipo && !tipo.permite_meio_dia) {
      return "hr.ausencias.erro.meioDiaNaoPermitido";
    }
    if (calculo.total <= 0) return "hr.ausencias.erro.semDiasContaveis";
    return null;
  }, [dataInicio, dataFim, meioDiaInicio, meioDiaFim, tipo, calculo.total]);

  const idInicio = `${idPrefixo}-inicio`;
  const idFim = `${idPrefixo}-fim`;
  const idMotivo = `${idPrefixo}-motivo`;

  const submeter = async () => {
    setMostrarErros(true);
    if (erroChave) {
      toast.error(t(erroChave));
      return;
    }
    const erro = await onPedir({
      novaDataInicio: dataInicio,
      novaDataFim: dataFim,
      novoMeioDiaInicio: meioDiaInicio,
      novoMeioDiaFim: meioDiaFim,
      motivo: motivo.trim() === "" ? null : motivo.trim(),
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.ausencias.alteracao.enviado"));
    onFechar();
  };

  return (
    <Sheet open={aberto} onOpenChange={(estado) => !estado && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("hr.ausencias.alteracao.titulo")}</SheetTitle>
          <SheetDescription>
            {t("hr.ausencias.alteracao.descricao", { nome: pessoaNome })}
          </SheetDescription>
        </SheetHeader>

        <CamposTocadosProvider onTocar={() => {}}>
          <div className="space-y-4 py-4">
            <Alert>
              <AlertDescription>{t("hr.ausencias.alteracao.aviso")}</AlertDescription>
            </Alert>

            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("hr.ausencias.alteracao.datasActuais")}
              </p>
              <p className="tabular-nums">
                {pedidoOriginal.data_inicio} → {pedidoOriginal.data_fim}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <CampoTexto
                id={idInicio}
                label={t("hr.ausencias.alteracao.novaDataInicio")}
                tipo="date"
                valor={dataInicio}
                onChange={(valor) => {
                  setDataInicio(valor);
                  if (!dataFim || dataFim < valor) setDataFim(valor);
                }}
                erro={mostrarErros ? (erroChave ? t(erroChave) : null) : null}
              />
              <CampoTexto
                id={idFim}
                label={t("hr.ausencias.alteracao.novaDataFim")}
                tipo="date"
                valor={dataFim}
                onChange={setDataFim}
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
                <dl className="grid grid-cols-3 gap-2 border-t pt-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("hr.ausencias.pedir.disponiveisHoje")}
                    </dt>
                    <dd className="tabular-nums">{formatarDias(efeito.disponiveisAntes)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("hr.ausencias.alteracao.novoPedido")}
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

            {/* AVISO, nao bloqueio: a RPC nunca recusa por saldo insuficiente. */}
            {efeito.ultrapassa && tipo?.desconta_saldo && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t("hr.ausencias.alteracao.avisoSaldo", {
                    dias: formatarDias(Math.abs(efeito.disponiveisDepois)),
                  })}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor={idMotivo}>{t("hr.ausencias.campo.motivo")}</Label>
              <Textarea
                id={idMotivo}
                value={motivo}
                rows={3}
                onChange={(evento) => setMotivo(evento.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={submeter} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t("hr.ausencias.alteracao.submeter")}
              </Button>
              <Button variant="ghost" onClick={onFechar} disabled={saving}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </CamposTocadosProvider>
      </SheetContent>
    </Sheet>
  );
}
