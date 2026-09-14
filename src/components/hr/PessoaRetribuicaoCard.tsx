/**
 * Retribuicao versionada (`pessoas_retribuicoes`, 20261120060000), na ficha
 * da pessoa -- mesmo molde de `PessoaVinculoHorasCard`.
 *
 * ALTERAR != CORRIGIR, E TEM DE SE VER A DIFERENCA
 * --------------------------------------------------
 * "Alterar" fecha a versao em vigor (se existir) e abre outra com data de
 * efeito -- o gesto normal (um aumento, uma promocao), `hr.pessoas.
 * retribuicao.edit` (a mesma permissao que ja escreve na admissao,
 * reaproveitada). "Corrigir" reescreve uma versao ja decorrida -- "o que
 * registamos para Marco estava errado" -- `hr.pessoas.retribuicao.corrigir`,
 * permissao a parte, mais perigosa (20261201040000). Por isso os dois botoes
 * tem rotulo, cor e dialogo diferentes -- nunca o mesmo botao com o texto
 * trocado.
 *
 * ANTES DESTE CARTAO
 * -------------------
 * `PessoaContratoTab` so MOSTRAVA a retribuicao em leitura -- nao havia
 * NENHUMA forma de dar um aumento, promover ou corrigir um valor errado
 * depois da admissao. Este cartao e o UNICO caminho de escrita depois da
 * admissao; quem nao tem `podeAlterar` continua a ver o cartao (se tiver
 * `hr.pessoas.retribuicao.view`), so sem o botao.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Wallet } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import { dataDeHojeISO } from "@/lib/hr/afectacoes";
import { usePessoaRetribuicao } from "@/hooks/usePessoaRetribuicao";
import type { Periodicidade, PessoaRetribuicao, SubsidioAlimentacaoModo } from "@/types/hr";

interface PessoaRetribuicaoCardProps {
  pessoaId: string;
  organizationId: string;
  /** Vinculo activo (ou suspenso) da pessoa, para ligar a versao nova --
   *  o mesmo criterio de `PessoaVinculoHorasCard`. */
  vinculoActivoId: string | null;
  podeAlterar: boolean;
  podeCorrigir: boolean;
}

/**
 * `pessoas_retribuicoes_periodicidade_valida` (20261120060000) so aceita
 * estas tres -- nao as cinco de `PERIODICIDADES` (que tambem serve
 * `pessoas_vinculos.horas_frequencia`, com diaria/semanal incluidas).
 */
const PERIODICIDADES_RETRIBUICAO: readonly Periodicidade[] = ["hora", "mensal", "anual"];
const MODOS_SUBSIDIO: readonly SubsidioAlimentacaoModo[] = ["dinheiro", "cartao"];
const DUODECIMOS_OPCOES: readonly (0 | 50 | 100)[] = [0, 50, 100];

type Rascunho = {
  valorBase: string;
  moeda: string;
  periodicidade: Periodicidade;
  subsidioAlimentacao: string;
  subsidioAlimentacaoModo: SubsidioAlimentacaoModo | "";
  duodecimosPct: "" | "0" | "50" | "100";
  validoDe: string;
  validoAte: string;
  motivo: string;
};

function rascunhoVazio(validoDe: string): Rascunho {
  return {
    valorBase: "",
    moeda: "EUR",
    periodicidade: "mensal",
    subsidioAlimentacao: "",
    subsidioAlimentacaoModo: "",
    duodecimosPct: "",
    validoDe,
    validoAte: "",
    motivo: "",
  };
}

function duodecimosPctDe(rascunho: Rascunho): 0 | 50 | 100 | null {
  if (rascunho.duodecimosPct === "") return null;
  return Number(rascunho.duodecimosPct) as 0 | 50 | 100;
}

function subsidioAlimentacaoDe(rascunho: Rascunho): number | null {
  const limpo = rascunho.subsidioAlimentacao.trim().replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function subsidioModoDe(rascunho: Rascunho): SubsidioAlimentacaoModo | null {
  return rascunho.subsidioAlimentacaoModo === "" ? null : rascunho.subsidioAlimentacaoModo;
}

export function PessoaRetribuicaoCard({
  pessoaId,
  organizationId,
  vinculoActivoId,
  podeAlterar,
  podeCorrigir,
}: PessoaRetribuicaoCardProps) {
  const { t } = useTranslation();
  const { versoes, aberta, loading, saving, alterar, corrigir } = usePessoaRetribuicao(
    pessoaId,
    organizationId,
  );

  const historico = versoes.filter((v) => v.id !== aberta?.id);

  // -- Dialogo "Alterar" (fecha a versao em vigor, abre outra) --------------
  const [alterarAberto, setAlterarAberto] = useState(false);
  const [rascunhoAlterar, setRascunhoAlterar] = useState<Rascunho>(() =>
    rascunhoVazio(dataDeHojeISO()),
  );

  const abrirAlterar = () => {
    setRascunhoAlterar({
      valorBase: aberta ? String(aberta.valor_base) : "",
      moeda: aberta?.moeda ?? "EUR",
      periodicidade: aberta?.periodicidade ?? "mensal",
      subsidioAlimentacao:
        aberta?.subsidio_alimentacao != null ? String(aberta.subsidio_alimentacao) : "",
      subsidioAlimentacaoModo: aberta?.subsidio_alimentacao_modo ?? "",
      duodecimosPct: aberta?.duodecimos_pct != null ? (String(aberta.duodecimos_pct) as "0" | "50" | "100") : "",
      validoDe: dataDeHojeISO(),
      validoAte: "",
      motivo: "",
    });
    setAlterarAberto(true);
  };

  const numeroAlterar = Number(rascunhoAlterar.valorBase.replace(",", "."));
  const valorLegivelAlterar =
    rascunhoAlterar.valorBase.trim() !== "" && Number.isFinite(numeroAlterar);

  const concluirAlterar = async () => {
    if (rascunhoAlterar.validoDe.trim() === "") {
      toast.error(t("hr.retribuicaoCartao.erroSemData"));
      return;
    }
    if (!valorLegivelAlterar || numeroAlterar < 0) {
      toast.error(t("hr.retribuicaoCartao.erroValorInvalido"));
      return;
    }
    if (rascunhoAlterar.moeda.trim().length !== 3) {
      toast.error(t("hr.retribuicaoCartao.erroMoedaInvalida"));
      return;
    }
    if (aberta && rascunhoAlterar.validoDe <= aberta.valido_de) {
      toast.error(t("hr.retribuicaoCartao.erroDatas"));
      return;
    }
    const erro = await alterar({
      vinculoId: vinculoActivoId,
      valorBase: numeroAlterar,
      moeda: rascunhoAlterar.moeda.trim().toUpperCase(),
      periodicidade: rascunhoAlterar.periodicidade,
      subsidioAlimentacao: subsidioAlimentacaoDe(rascunhoAlterar),
      subsidioAlimentacaoModo: subsidioModoDe(rascunhoAlterar),
      duodecimosPct: duodecimosPctDe(rascunhoAlterar),
      dataEfeito: rascunhoAlterar.validoDe,
      motivo: rascunhoAlterar.motivo.trim() || null,
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
    setAlterarAberto(false);
  };

  // -- Dialogo "Corrigir" (reescreve uma versao ja decorrida) ---------------
  const [linhaACorrigir, setLinhaACorrigir] = useState<PessoaRetribuicao | null>(null);
  const [rascunhoCorrigir, setRascunhoCorrigir] = useState<Rascunho>(() => rascunhoVazio(""));

  const abrirCorrigir = (linha: PessoaRetribuicao) => {
    setLinhaACorrigir(linha);
    setRascunhoCorrigir({
      valorBase: String(linha.valor_base),
      moeda: linha.moeda,
      periodicidade: linha.periodicidade,
      subsidioAlimentacao: linha.subsidio_alimentacao != null ? String(linha.subsidio_alimentacao) : "",
      subsidioAlimentacaoModo: linha.subsidio_alimentacao_modo ?? "",
      duodecimosPct: linha.duodecimos_pct != null ? (String(linha.duodecimos_pct) as "0" | "50" | "100") : "",
      validoDe: linha.valido_de,
      validoAte: linha.valido_ate ?? "",
      motivo: linha.motivo ?? "",
    });
  };

  const numeroCorrigir = Number(rascunhoCorrigir.valorBase.replace(",", "."));
  const valorLegivelCorrigir =
    rascunhoCorrigir.valorBase.trim() !== "" && Number.isFinite(numeroCorrigir);

  const concluirCorrigir = async () => {
    if (!linhaACorrigir) return;
    if (rascunhoCorrigir.validoDe.trim() === "" || rascunhoCorrigir.validoAte.trim() === "") {
      toast.error(t("hr.retribuicaoCartao.erroSemData"));
      return;
    }
    if (!valorLegivelCorrigir || numeroCorrigir < 0) {
      toast.error(t("hr.retribuicaoCartao.erroValorInvalido"));
      return;
    }
    if (rascunhoCorrigir.moeda.trim().length !== 3) {
      toast.error(t("hr.retribuicaoCartao.erroMoedaInvalida"));
      return;
    }
    if (rascunhoCorrigir.validoAte < rascunhoCorrigir.validoDe) {
      toast.error(t("hr.retribuicaoCartao.erroDatas"));
      return;
    }
    const erro = await corrigir(linhaACorrigir.id, {
      valorBase: numeroCorrigir,
      moeda: rascunhoCorrigir.moeda.trim().toUpperCase(),
      periodicidade: rascunhoCorrigir.periodicidade,
      subsidioAlimentacao: subsidioAlimentacaoDe(rascunhoCorrigir),
      subsidioAlimentacaoModo: subsidioModoDe(rascunhoCorrigir),
      duodecimosPct: duodecimosPctDe(rascunhoCorrigir),
      validoDe: rascunhoCorrigir.validoDe,
      validoAte: rascunhoCorrigir.validoAte,
      motivo: rascunhoCorrigir.motivo.trim() || null,
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
    setLinhaACorrigir(null);
  };

  const opcoesSubsidioModo = MODOS_SUBSIDIO.map((m) => ({
    value: m,
    label: t(`hr.subsidioAlimentacaoModo.${m}`),
  }));
  const opcoesDuodecimos = DUODECIMOS_OPCOES.map((d) => ({ value: String(d), label: `${d}%` }));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          {t("hr.retribuicaoCartao.titulo")}
        </CardTitle>
        {podeAlterar && (
          <Button size="sm" variant="outline" onClick={abrirAlterar} disabled={saving}>
            {t("hr.retribuicaoCartao.alterar")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {loading ? (
          <p className="py-4 text-center text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <>
            {aberta ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <span className="tabular-nums font-medium">
                  {aberta.valor_base} {aberta.moeda}
                </span>
                <span className="text-muted-foreground">
                  {t(`hr.periodicidade.${aberta.periodicidade}`)}
                </span>
                <span className="text-muted-foreground">
                  {t("hr.contrato.validoDe")}: {aberta.valido_de}
                </span>
                {aberta.duodecimos_pct !== null && (
                  <span className="text-muted-foreground">
                    {t("hr.contrato.duodecimos")}: {aberta.duodecimos_pct}%
                  </span>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">{t("hr.retribuicaoCartao.semVersoes")}</p>
            )}

            {historico.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("hr.afectacoes.de")}</TableHead>
                      <TableHead>{t("hr.afectacoes.ate")}</TableHead>
                      <TableHead>{t("hr.retribuicaoCartao.valor")}</TableHead>
                      <TableHead className="text-right">{t("hr.afectacoes.accoes")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historico.map((linha) => (
                      <TableRow key={linha.id}>
                        <TableCell className="tabular-nums">{linha.valido_de}</TableCell>
                        <TableCell className="tabular-nums">{linha.valido_ate ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">
                          {linha.valor_base} {linha.moeda} ({t(`hr.periodicidade.${linha.periodicidade}`)})
                        </TableCell>
                        <TableCell className="text-right">
                          {podeCorrigir && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-500"
                              onClick={() => abrirCorrigir(linha)}
                            >
                              {t("hr.retribuicaoCartao.corrigir")}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Alterar: fecha a versao em vigor (se existir) e abre outra, com data
          de efeito. */}
      <Dialog open={alterarAberto} onOpenChange={setAlterarAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("hr.retribuicaoCartao.tituloAlterar")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <CampoTexto
                id="hr-retribuicao-alterar-valor"
                label={t("hr.retribuicaoCartao.valor")}
                tipo="number"
                min={0}
                step="0.01"
                valor={rascunhoAlterar.valorBase}
                onChange={(v) => setRascunhoAlterar((a) => ({ ...a, valorBase: v }))}
              />
              <CampoTexto
                id="hr-retribuicao-alterar-moeda"
                label={t("hr.retribuicaoCartao.moeda")}
                valor={rascunhoAlterar.moeda}
                onChange={(v) => setRascunhoAlterar((a) => ({ ...a, moeda: v.toUpperCase() }))}
              />
            </div>
            <CampoSelect
              id="hr-retribuicao-alterar-periodicidade"
              label={t("hr.contrato.periodicidade")}
              valor={rascunhoAlterar.periodicidade}
              opcoes={PERIODICIDADES_RETRIBUICAO.map((p) => ({
                value: p,
                label: t(`hr.periodicidade.${p}`),
              }))}
              onChange={(v) => setRascunhoAlterar((a) => ({ ...a, periodicidade: v as Periodicidade }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <CampoTexto
                id="hr-retribuicao-alterar-subsidio"
                label={t("hr.retribuicaoCartao.subsidioAlimentacao")}
                tipo="number"
                min={0}
                step="0.01"
                valor={rascunhoAlterar.subsidioAlimentacao}
                onChange={(v) => setRascunhoAlterar((a) => ({ ...a, subsidioAlimentacao: v }))}
              />
              <CampoSelect
                id="hr-retribuicao-alterar-subsidio-modo"
                label={t("hr.retribuicaoCartao.subsidioAlimentacaoModo")}
                valor={rascunhoAlterar.subsidioAlimentacaoModo}
                opcoes={opcoesSubsidioModo}
                vazioLabel={t("common.none")}
                onChange={(v) =>
                  setRascunhoAlterar((a) => ({
                    ...a,
                    subsidioAlimentacaoModo: v as SubsidioAlimentacaoModo | "",
                  }))
                }
              />
            </div>
            <CampoSelect
              id="hr-retribuicao-alterar-duodecimos"
              label={t("hr.contrato.duodecimos")}
              valor={rascunhoAlterar.duodecimosPct}
              opcoes={opcoesDuodecimos}
              vazioLabel={t("common.none")}
              onChange={(v) =>
                setRascunhoAlterar((a) => ({ ...a, duodecimosPct: v as Rascunho["duodecimosPct"] }))
              }
            />
            <CampoTexto
              id="hr-retribuicao-alterar-data-efeito"
              label={t("hr.retribuicaoCartao.dataEfeito")}
              tipo="date"
              valor={rascunhoAlterar.validoDe}
              onChange={(v) => setRascunhoAlterar((a) => ({ ...a, validoDe: v }))}
            />
            <CampoTexto
              id="hr-retribuicao-alterar-motivo"
              label={t("hr.contrato.motivoTermo")}
              valor={rascunhoAlterar.motivo}
              onChange={(v) => setRascunhoAlterar((a) => ({ ...a, motivo: v }))}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAlterarAberto(false)} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button onClick={concluirAlterar} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t("employees.form.update")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Corrigir: reescreve uma versao ja decorrida. Dialogo e cor
          deliberadamente diferentes de "Alterar" -- ver o cabecalho. */}
      <Dialog
        open={linhaACorrigir !== null}
        onOpenChange={(aberto) => !aberto && setLinhaACorrigir(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-700 dark:text-amber-500">
              {t("hr.retribuicaoCartao.tituloCorrigir")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-amber-600 dark:text-amber-500">
            {t("hr.retribuicaoCartao.avisoCorrigir")}
          </p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <CampoTexto
                id="hr-retribuicao-corrigir-valor"
                label={t("hr.retribuicaoCartao.valor")}
                tipo="number"
                min={0}
                step="0.01"
                valor={rascunhoCorrigir.valorBase}
                onChange={(v) => setRascunhoCorrigir((a) => ({ ...a, valorBase: v }))}
              />
              <CampoTexto
                id="hr-retribuicao-corrigir-moeda"
                label={t("hr.retribuicaoCartao.moeda")}
                valor={rascunhoCorrigir.moeda}
                onChange={(v) => setRascunhoCorrigir((a) => ({ ...a, moeda: v.toUpperCase() }))}
              />
            </div>
            <CampoSelect
              id="hr-retribuicao-corrigir-periodicidade"
              label={t("hr.contrato.periodicidade")}
              valor={rascunhoCorrigir.periodicidade}
              opcoes={PERIODICIDADES_RETRIBUICAO.map((p) => ({
                value: p,
                label: t(`hr.periodicidade.${p}`),
              }))}
              onChange={(v) =>
                setRascunhoCorrigir((a) => ({ ...a, periodicidade: v as Periodicidade }))
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <CampoTexto
                id="hr-retribuicao-corrigir-subsidio"
                label={t("hr.retribuicaoCartao.subsidioAlimentacao")}
                tipo="number"
                min={0}
                step="0.01"
                valor={rascunhoCorrigir.subsidioAlimentacao}
                onChange={(v) => setRascunhoCorrigir((a) => ({ ...a, subsidioAlimentacao: v }))}
              />
              <CampoSelect
                id="hr-retribuicao-corrigir-subsidio-modo"
                label={t("hr.retribuicaoCartao.subsidioAlimentacaoModo")}
                valor={rascunhoCorrigir.subsidioAlimentacaoModo}
                opcoes={opcoesSubsidioModo}
                vazioLabel={t("common.none")}
                onChange={(v) =>
                  setRascunhoCorrigir((a) => ({
                    ...a,
                    subsidioAlimentacaoModo: v as SubsidioAlimentacaoModo | "",
                  }))
                }
              />
            </div>
            <CampoSelect
              id="hr-retribuicao-corrigir-duodecimos"
              label={t("hr.contrato.duodecimos")}
              valor={rascunhoCorrigir.duodecimosPct}
              opcoes={opcoesDuodecimos}
              vazioLabel={t("common.none")}
              onChange={(v) =>
                setRascunhoCorrigir((a) => ({ ...a, duodecimosPct: v as Rascunho["duodecimosPct"] }))
              }
            />
            <CampoTexto
              id="hr-retribuicao-corrigir-de"
              label={t("hr.afectacoes.de")}
              tipo="date"
              valor={rascunhoCorrigir.validoDe}
              onChange={(v) => setRascunhoCorrigir((a) => ({ ...a, validoDe: v }))}
            />
            <CampoTexto
              id="hr-retribuicao-corrigir-ate"
              label={t("hr.afectacoes.ate")}
              tipo="date"
              valor={rascunhoCorrigir.validoAte}
              onChange={(v) => setRascunhoCorrigir((a) => ({ ...a, validoAte: v }))}
            />
            <CampoTexto
              id="hr-retribuicao-corrigir-motivo"
              label={t("hr.contrato.motivoTermo")}
              valor={rascunhoCorrigir.motivo}
              onChange={(v) => setRascunhoCorrigir((a) => ({ ...a, motivo: v }))}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinhaACorrigir(null)} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={concluirCorrigir}
              disabled={saving}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t("employees.form.update")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
