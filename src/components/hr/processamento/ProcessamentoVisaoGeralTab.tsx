/**
 * Separador "Visao geral" do Processamento Salarial -- FASE 1: ciclo de vida
 * do periodo (abrir/fechar), o resumo por pessoa dentro do periodo, e
 * premios/lancamentos pontuais.
 *
 * O RECIBO EM SI E A EXPORTACAO FICAM PARA A FASE 2 -- de proposito, fora
 * deste ecra.
 *
 * O RESUMO POR PESSOA REAPROVEITA `useRelatorioAssiduidadeMensal`
 * -----------------------------------------------------------------
 * Nada aqui recalcula dias trabalhados, faltas ou horas extra -- esses
 * numeros vem sempre do relatorio de assiduidade, atraves de uma instancia
 * OCULTA por pessoa (`ResumoPessoaProcessamentoOculto`), o mesmo padrao de
 * `RelatorioAssiduidadeMensalOrganizacao.tsx`.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { usePessoas } from "@/hooks/usePessoas";
import { useCodigosProcessamento } from "@/hooks/useCodigosProcessamento";
import { useProcessamentoPeriodo } from "@/hooks/useProcessamentoPeriodo";
import {
  useProcessamentoLancamentos,
  type NovoLancamentoProcessamento,
} from "@/hooks/useProcessamentoLancamentos";
import { ResumoPessoaProcessamentoOculto } from "@/components/hr/processamento/ResumoPessoaProcessamentoOculto";
import type { TotaisRelatorioMensal } from "@/hooks/useRelatorioAssiduidadeMensal";
import type { HrProcessamentoLancamento } from "@/types/hr";
import { toast } from "@/lib/toast";
import { Loader2, Lock, Plus } from "lucide-react";

function mesDeHoje(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

/** Minutos -> horas com no maximo 2 casas decimais, sem zeros a mais. */
function horasDeMinutos(minutos: number): string {
  return String(Math.round((minutos / 60) * 100) / 100);
}

function formatarValor(valor: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(valor);
}

const FORM_LANCAMENTO_VAZIO = { descricao: "", valor: "", codigoProcessamentoId: "" };

export function ProcessamentoVisaoGeralTab() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const { pessoas, loading: pessoasLoading } = usePessoas();
  const { codigos } = useCodigosProcessamento();

  const podeVerPeriodo = hasPermission("hr.processamento.periodo.view");
  const podeGerirPeriodo = hasPermission("hr.processamento.periodo.gerir");
  const podeGerirLancamentos = hasPermission("hr.processamento.lancamentos.gerir");

  const [mesSelecionado, setMesSelecionado] = useState(mesDeHoje);
  const ano = Number(mesSelecionado.slice(0, 4));
  const mes = Number(mesSelecionado.slice(5, 7));

  const periodoHook = useProcessamentoPeriodo(ano, mes);
  const { periodo } = periodoHook;
  const lancamentosHook = useProcessamentoLancamentos(periodo?.id);
  const { lancamentos } = lancamentosHook;

  const [totaisPorPessoa, setTotaisPorPessoa] = useState<Record<string, TotaisRelatorioMensal>>({});
  const [confirmarFecho, setConfirmarFecho] = useState(false);
  const [pessoaParaLancamento, setPessoaParaLancamento] = useState<string | null>(null);
  const [formLancamento, setFormLancamento] = useState(FORM_LANCAMENTO_VAZIO);
  const [lancamentoParaAnular, setLancamentoParaAnular] = useState<HrProcessamentoLancamento | null>(
    null,
  );
  const [motivoAnulacao, setMotivoAnulacao] = useState("");

  const pessoasActivas = useMemo(
    () => pessoas.filter((p) => p.estado_registo === "activo"),
    [pessoas],
  );

  const marcarTotais = (pessoaId: string, totais: TotaisRelatorioMensal) => {
    setTotaisPorPessoa((atual) => ({ ...atual, [pessoaId]: totais }));
  };

  const lancamentosPorPessoa = useMemo(() => {
    const mapa = new Map<string, HrProcessamentoLancamento[]>();
    for (const lancamento of lancamentos) {
      const lista = mapa.get(lancamento.pessoa_id) ?? [];
      lista.push(lancamento);
      mapa.set(lancamento.pessoa_id, lista);
    }
    return mapa;
  }, [lancamentos]);

  const codigosActivos = useMemo(() => codigos.filter((c) => c.activo), [codigos]);

  const periodoFechado = periodo?.estado === "fechado";

  const abrirPeriodo = async () => {
    const erro = await periodoHook.abrir();
    if (erro) toast.error(erro);
    else toast.success(t("hr.vencimento.visaoGeral.periodoAbertoSucesso"));
  };

  const fecharPeriodo = async () => {
    setConfirmarFecho(false);
    const erro = await periodoHook.fechar();
    if (erro) toast.error(erro);
    else toast.success(t("hr.vencimento.visaoGeral.periodoFechadoSucesso"));
  };

  const abrirFormularioLancamento = (pessoaId: string) => {
    setFormLancamento(FORM_LANCAMENTO_VAZIO);
    setPessoaParaLancamento(pessoaId);
  };

  const submeterLancamento = async () => {
    if (!pessoaParaLancamento) return;
    const valor = Number(formLancamento.valor);
    if (!formLancamento.descricao.trim() || !Number.isFinite(valor) || valor === 0) return;
    const novo: NovoLancamentoProcessamento = {
      pessoaId: pessoaParaLancamento,
      descricao: formLancamento.descricao.trim(),
      valor,
      codigoProcessamentoId: formLancamento.codigoProcessamentoId || null,
    };
    const erro = await lancamentosHook.criar(novo);
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.vencimento.visaoGeral.lancamentoCriarSucesso"));
    setPessoaParaLancamento(null);
    setFormLancamento(FORM_LANCAMENTO_VAZIO);
  };

  const submeterAnulacao = async () => {
    if (!lancamentoParaAnular || !motivoAnulacao.trim()) return;
    const erro = await lancamentosHook.anular(lancamentoParaAnular.id, motivoAnulacao.trim());
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.vencimento.visaoGeral.lancamentoAnularSucesso"));
    setLancamentoParaAnular(null);
    setMotivoAnulacao("");
  };

  if (!podeVerPeriodo) {
    return <SemAcessoCard className="m-0" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-48">
          <Label htmlFor="hr-processamento-mes" className="mb-1.5 block">
            {t("hr.vencimento.visaoGeral.mes")}
          </Label>
          <input
            id="hr-processamento-mes"
            type="month"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={mesSelecionado}
            onChange={(evento) => setMesSelecionado(evento.target.value)}
          />
        </div>

        {periodo && (
          <div className="flex items-center gap-3">
            <Badge variant={periodoFechado ? "secondary" : "default"}>
              {periodoFechado
                ? t("hr.vencimento.visaoGeral.estadoFechado")
                : t("hr.vencimento.visaoGeral.estadoAberto")}
            </Badge>
            {podeGerirPeriodo && !periodoFechado && (
              <Button variant="outline" onClick={() => setConfirmarFecho(true)}>
                <Lock className="mr-2 h-4 w-4" />
                {t("hr.vencimento.visaoGeral.fecharPeriodo")}
              </Button>
            )}
          </div>
        )}
      </div>

      {periodoHook.loading || pessoasLoading ? (
        <div className="flex justify-center py-12">
          <OlyviaLoader />
        </div>
      ) : !periodo ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-muted-foreground">{t("hr.vencimento.visaoGeral.semPeriodo")}</p>
            {podeGerirPeriodo ? (
              <Button onClick={abrirPeriodo} disabled={periodoHook.saving}>
                {periodoHook.saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("hr.vencimento.visaoGeral.abrirPeriodo")}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("hr.vencimento.visaoGeral.semPermissaoAbrir")}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {pessoasActivas.map((pessoa) => (
            <ResumoPessoaProcessamentoOculto
              key={pessoa.id}
              pessoaId={pessoa.id}
              ano={ano}
              mes={mes}
              aoTerminarCarregamento={marcarTotais}
            />
          ))}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("hr.vencimento.visaoGeral.resumoTitulo")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">{t("hr.vencimento.visaoGeral.colunaPessoa")}</th>
                    <th className="px-4 py-2">{t("hr.vencimento.visaoGeral.colunaDiasTrabalhados")}</th>
                    <th className="px-4 py-2">{t("hr.vencimento.visaoGeral.colunaFaltaCompleta")}</th>
                    <th className="px-4 py-2">{t("hr.vencimento.visaoGeral.colunaFaltaIncompleta")}</th>
                    <th className="px-4 py-2">{t("hr.vencimento.visaoGeral.colunaHorasExtra")}</th>
                    <th className="px-4 py-2 text-right">{t("hr.vencimento.visaoGeral.colunaAccoes")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pessoasActivas.map((pessoa) => {
                    const totais = totaisPorPessoa[pessoa.id];
                    const lancamentosDaPessoa = lancamentosPorPessoa.get(pessoa.id) ?? [];
                    return (
                      <tr key={pessoa.id} className="border-b last:border-b-0 align-top">
                        <td className="px-4 py-3 font-medium">{pessoa.nome_completo}</td>
                        <td className="px-4 py-3 tabular-nums">
                          {totais ? totais.diasTrabalhados : <OlyviaLoader size={16} />}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {totais ? totais.diasComFaltaCompleta : "-"}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {totais ? totais.diasComFaltaIncompleta : "-"}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {totais ? `${horasDeMinutos(totais.horasExtraMinutos)}h` : "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {podeGerirLancamentos && !periodoFechado && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => abrirFormularioLancamento(pessoa.id)}
                            >
                              <Plus className="mr-1 h-3 w-3" />
                              {t("hr.vencimento.visaoGeral.acrescentarValor")}
                            </Button>
                          )}
                          {lancamentosDaPessoa.length > 0 && (
                            <ul className="mt-2 space-y-1 text-left text-xs">
                              {lancamentosDaPessoa.map((lancamento) => (
                                <li
                                  key={lancamento.id}
                                  className={
                                    lancamento.anulado_em
                                      ? "text-muted-foreground line-through"
                                      : undefined
                                  }
                                >
                                  <span>{lancamento.descricao}</span>{" "}
                                  <span className="tabular-nums">{formatarValor(lancamento.valor)}</span>
                                  {!lancamento.anulado_em && podeGerirLancamentos && !periodoFechado && (
                                    <button
                                      type="button"
                                      className="ml-2 text-destructive underline"
                                      onClick={() => setLancamentoParaAnular(lancamento)}
                                    >
                                      {t("hr.vencimento.visaoGeral.anular")}
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Confirmar fecho -- irreversivel nesta fase */}
      <AlertDialog open={confirmarFecho} onOpenChange={setConfirmarFecho}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hr.vencimento.visaoGeral.confirmarFechoTitulo")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("hr.vencimento.visaoGeral.confirmarFechoDescricao")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={fecharPeriodo}>
              {t("hr.vencimento.visaoGeral.fecharPeriodo")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Acrescentar valor pontual */}
      <Dialog
        open={!!pessoaParaLancamento}
        onOpenChange={(open) => !open && setPessoaParaLancamento(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("hr.vencimento.visaoGeral.acrescentarValor")}</DialogTitle>
            <DialogDescription>
              {t("hr.vencimento.visaoGeral.acrescentarValorDescricao")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lancamento-descricao">
                {t("hr.vencimento.visaoGeral.campoDescricao")}
              </Label>
              <Textarea
                id="lancamento-descricao"
                value={formLancamento.descricao}
                onChange={(e) => setFormLancamento((f) => ({ ...f, descricao: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lancamento-valor">{t("hr.vencimento.visaoGeral.campoValor")}</Label>
              <Input
                id="lancamento-valor"
                type="number"
                step="0.01"
                value={formLancamento.valor}
                onChange={(e) => setFormLancamento((f) => ({ ...f, valor: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lancamento-codigo">{t("hr.vencimento.visaoGeral.campoCodigo")}</Label>
              <Select
                value={formLancamento.codigoProcessamentoId || "nenhum"}
                onValueChange={(v) =>
                  setFormLancamento((f) => ({
                    ...f,
                    codigoProcessamentoId: v === "nenhum" ? "" : v,
                  }))
                }
              >
                <SelectTrigger id="lancamento-codigo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">{t("hr.vencimento.visaoGeral.semCodigo")}</SelectItem>
                  {codigosActivos.map((codigo) => (
                    <SelectItem key={codigo.id} value={codigo.id}>
                      {codigo.codigo} -- {codigo.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPessoaParaLancamento(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={submeterLancamento}
              disabled={
                lancamentosHook.saving ||
                !formLancamento.descricao.trim() ||
                !Number.isFinite(Number(formLancamento.valor)) ||
                Number(formLancamento.valor) === 0
              }
            >
              {lancamentosHook.saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("hr.vencimento.visaoGeral.acrescentarValor")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Anular lancamento -- motivo obrigatorio */}
      <Dialog
        open={!!lancamentoParaAnular}
        onOpenChange={(open) => {
          if (!open) {
            setLancamentoParaAnular(null);
            setMotivoAnulacao("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("hr.vencimento.visaoGeral.anular")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="lancamento-motivo-anulacao">
              {t("hr.vencimento.visaoGeral.campoMotivoAnulacao")}
            </Label>
            <Textarea
              id="lancamento-motivo-anulacao"
              value={motivoAnulacao}
              onChange={(e) => setMotivoAnulacao(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLancamentoParaAnular(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={submeterAnulacao}
              disabled={lancamentosHook.saving || !motivoAnulacao.trim()}
            >
              {lancamentosHook.saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("hr.vencimento.visaoGeral.anular")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
