/**
 * Retribuicao versionada (`pessoas_retribuicoes`, 20261120060000), na ficha
 * da pessoa -- mesmo molde de `PessoaVinculoHorasCard`.
 *
 * O VALOR BASE VEM SO DO CARGO (fluxo 2)
 * -----------------------------------------
 * O cartao mostra o salario base em LEITURA ("vem do cargo X"), por
 * `periodoDoCargoEm(hoje)`, e a subida agendada do cargo se houver. Nao ha
 * nenhum botao que o mude: muda-se mudando o cargo da pessoa (separador
 * Detalhes laborais) ou o salario do cargo (separador Cargos de Pessoas). Sem
 * cargo, o cartao di-lo e nao oferece nenhum botao de escrita: sem cargo nao ha
 * salario base.
 *
 * O QUE E DA PESSOA: MODO DO SUBSIDIO E DUODECIMOS
 * ------------------------------------------------
 * O VALOR do subsidio de alimentacao ja NAO e da pessoa: vem da regra salarial da
 * organizacao (obrigatorio no cargo, sem excepcoes) e o cartao mostra-o so em leitura.
 * O unico gesto de escrita e "Alterar subsidio e duodecimos" (ou "Definir ...",
 * quando ainda nao ha versao): cria uma versao nova a partir de uma data com o
 * valor base do cargo NESSA data, o modo do subsidio (dinheiro ou cartao) e os
 * duodecimos escolhidos. Vai por `rpc_hr_retribuicao_definir_pessoal`
 * (`hr.pessoas.retribuicao.edit`, a mesma permissao que ja escrevia na
 * admissao); a base recusa o INSERT directo. Os duodecimos propoem 50 quando a
 * pessoa ainda nao tem valor (decisao do fluxo 1).
 *
 * "Alterar subsidio" != CORRIGIR
 * --------------------------------
 * "Corrigir" reescreve uma versao ja decorrida -- "o que registamos para Marco
 * estava errado" -- `hr.pessoas.retribuicao.corrigir`, permissao a parte, mais
 * perigosa (20261201040000). Os dois botoes tem rotulo, cor e dialogo
 * diferentes. Ao corrigir, o valor base e a periodicidade aparecem em leitura
 * (os da propria linha) e nunca se enviam.
 *
 * O historico diz porque nasceu cada versao (`origem`): escolha da pessoa,
 * mudanca de cargo ou subida do cargo.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Wallet } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { CampoSelect, CampoTexto } from "@/components/rh-exemplo/form/Campos";
import { dataDeHojeISO, periodoDecorrido } from "@/components/rh-exemplo/lib/afectacoes";
import {
  formatarSalario,
  periodoDoCargoEm,
  proximoPeriodoAgendado,
  type HrCargoPeriodo,
} from "@/components/rh-exemplo/lib/cargosPeriodos";
import { DUODECIMOS_PROPOSTO } from "@/components/rh-exemplo/lib/novaPessoaCargo";
import { usePessoaRetribuicao } from "@/components/rh-exemplo/hooks/usePessoaRetribuicao";
import { useRegrasSalariais } from "@/components/rh-exemplo/hooks/useRegrasSalariais";
import type { HrCargo } from "@/components/rh-exemplo/hooks/useCargos";
import type { PessoaRetribuicao, SubsidioAlimentacaoModo } from "@/components/rh-exemplo/tipos";

interface PessoaRetribuicaoCardProps {
  pessoaId: string;
  organizationId: string;
  /** Vinculo activo (ou suspenso) da pessoa -- a RPC escolhe-o sozinha; fica
   *  na interface para os chamadores nao terem de mudar. */
  vinculoActivoId: string | null;
  podeAlterar: boolean;
  podeCorrigir: boolean;
  /** Cargo desta pessoa (`pessoas.cargo_id`), ou `null` sem cargo -- ver o
   *  cabecalho: sem cargo nao ha salario base nem botao de escrita. */
  cargo: HrCargo | null;
  /** Os periodos do salario dos cargos (`hr_cargos_periodos`): de onde vem o
   *  valor base em cada data. */
  periodosDoCargo: HrCargoPeriodo[];
  /** Os cargos ou os seus periodos ainda a carregar: nao se diz "sem cargo" nem "sem salario". */
  periodosLoading?: boolean;
  /** Falhou a leitura dos cargos ou dos periodos: o cartao di-lo em vez de "sem cargo". */
  periodosError?: boolean;
  /** Depois de definir ou corrigir a retribuicao: o pai recarrega a ficha (cargo, salario em vigor). */
  onMudou?: () => void;
}

const MODOS_SUBSIDIO: readonly SubsidioAlimentacaoModo[] = ["dinheiro", "cartao"];
const DUODECIMOS_OPCOES: readonly (0 | 50 | 100)[] = [0, 50, 100];

type DuodecimosEscolha = "" | "0" | "50" | "100";

/** O que se escolhe ao definir o que e da pessoa. */
type RascunhoPessoal = {
  subsidioAlimentacaoModo: SubsidioAlimentacaoModo | "";
  duodecimosPct: DuodecimosEscolha;
  validoDe: string;
  motivo: string;
};

/** O que se corrige numa versao ja decorrida (valor base e periodicidade ficam como estao). */
type RascunhoCorrecao = RascunhoPessoal & { moeda: string; validoAte: string };

function duodecimosDe(valor: number | null | undefined): DuodecimosEscolha {
  return valor === null || valor === undefined ? "" : (String(valor) as DuodecimosEscolha);
}

function duodecimosPctDe(escolha: DuodecimosEscolha): 0 | 50 | 100 | null {
  return escolha === "" ? null : (Number(escolha) as 0 | 50 | 100);
}

function modoDe(escolha: SubsidioAlimentacaoModo | ""): SubsidioAlimentacaoModo | null {
  return escolha === "" ? null : escolha;
}

export function PessoaRetribuicaoCard({
  pessoaId,
  organizationId,
  podeAlterar,
  podeCorrigir,
  cargo,
  periodosDoCargo,
  periodosLoading = false,
  periodosError = false,
  onMudou,
}: PessoaRetribuicaoCardProps) {
  const { t } = useTranslation();
  const { emVigor: regra } = useRegrasSalariais();
  const { versoes, aberta, loading, saving, definirPessoal, corrigir } = usePessoaRetribuicao(
    pessoaId,
    organizationId,
  );

  const hoje = dataDeHojeISO();
  const historico = versoes.filter((v) => v.id !== aberta?.id);
  const traduzir = (chave: string) => t(chave);

  /** O valor base do cargo da pessoa numa data, ja formatado; `null` sem cargo ou sem periodo. */
  const baseDoCargoEm = (data: string): string | null => {
    if (!cargo) return null;
    const periodo = periodoDoCargoEm(periodosDoCargo, cargo.id, data);
    if (!periodo) return null;
    return formatarSalario(
      { salarioBase: periodo.salario_base, periodicidade: periodo.periodicidade },
      traduzir,
    );
  };
  const baseHoje = baseDoCargoEm(hoje);
  const subida = cargo ? proximoPeriodoAgendado(periodosDoCargo, cargo.id, hoje) : null;

  // -- Dialogo "Alterar subsidio e duodecimos" -----------------------------
  const [pessoalAberto, setPessoalAberto] = useState(false);
  const [rascunho, setRascunho] = useState<RascunhoPessoal>({
    subsidioAlimentacaoModo: "",
    duodecimosPct: "",
    validoDe: hoje,
    motivo: "",
  });

  const abrirPessoal = () => {
    setRascunho({
      subsidioAlimentacaoModo: aberta?.subsidio_alimentacao_modo ?? "",
      // Sem valor, propoe-se 50 (decisao do fluxo 1).
      duodecimosPct:
        aberta?.duodecimos_pct != null
          ? duodecimosDe(aberta.duodecimos_pct)
          : (String(DUODECIMOS_PROPOSTO) as DuodecimosEscolha),
      validoDe: hoje,
      motivo: "",
    });
    setPessoalAberto(true);
  };

  const concluirPessoal = async () => {
    if (rascunho.validoDe.trim() === "") {
      toast.error(t("hr.retribuicaoCartao.erroSemData"));
      return;
    }
    // Uma versao de origem "pessoa" em vigor so se substitui com data POSTERIOR ao
    // seu inicio; as de cargo ou subida fecham-se na data que a base decidir.
    if (aberta && (aberta.origem ?? "pessoa") === "pessoa" && rascunho.validoDe <= aberta.valido_de) {
      toast.error(t("hr.retribuicaoCartao.erroDataAnterior"));
      return;
    }
    const erro = await definirPessoal(
      rascunho.validoDe,
      modoDe(rascunho.subsidioAlimentacaoModo),
      duodecimosPctDe(rascunho.duodecimosPct),
      rascunho.motivo.trim() || null,
    );
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
    setPessoalAberto(false);
    onMudou?.();
  };

  // -- Dialogo "Corrigir" (reescreve uma versao ja decorrida) ---------------
  const [linhaACorrigir, setLinhaACorrigir] = useState<PessoaRetribuicao | null>(null);
  const [correcao, setCorrecao] = useState<RascunhoCorrecao>({
    subsidioAlimentacaoModo: "",
    duodecimosPct: "",
    validoDe: "",
    motivo: "",
    moeda: "EUR",
    validoAte: "",
  });

  const abrirCorrigir = (linha: PessoaRetribuicao) => {
    setLinhaACorrigir(linha);
    setCorrecao({
      subsidioAlimentacaoModo: linha.subsidio_alimentacao_modo ?? "",
      duodecimosPct: duodecimosDe(linha.duodecimos_pct),
      validoDe: linha.valido_de,
      motivo: linha.motivo ?? "",
      moeda: linha.moeda,
      validoAte: linha.valido_ate ?? "",
    });
  };

  const concluirCorrigir = async () => {
    if (!linhaACorrigir) return;
    if (correcao.validoDe.trim() === "" || correcao.validoAte.trim() === "") {
      toast.error(t("hr.retribuicaoCartao.erroSemData"));
      return;
    }
    if (correcao.moeda.trim().length !== 3) {
      toast.error(t("hr.retribuicaoCartao.erroMoedaInvalida"));
      return;
    }
    if (correcao.validoAte < correcao.validoDe) {
      toast.error(t("hr.retribuicaoCartao.erroDatas"));
      return;
    }
    const erro = await corrigir(linhaACorrigir.id, {
      moeda: correcao.moeda.trim().toUpperCase(),
      subsidioAlimentacaoModo: modoDe(correcao.subsidioAlimentacaoModo),
      duodecimosPct: duodecimosPctDe(correcao.duodecimosPct),
      validoDe: correcao.validoDe,
      validoAte: correcao.validoAte,
      motivo: correcao.motivo.trim() || null,
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
    setLinhaACorrigir(null);
    onMudou?.();
  };

  const dinheiro = (n: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);
  const textoDoSubsidioDaRegra = regra
    ? t("hr.retribuicaoCartao.subsidioDaRegra", {
        dia: dinheiro(regra.subsidio_valor_dia),
        hora: dinheiro(regra.subsidio_valor_hora),
        limite: String(Math.round((regra.subsidio_limite_min / 60) * 100) / 100).replace(".", ","),
      })
    : t("hr.retribuicaoCartao.subsidioSemRegra");

  const opcoesSubsidioModo = MODOS_SUBSIDIO.map((m) => ({
    value: m,
    label: t(`hr.subsidioAlimentacaoModo.${m}`),
  }));
  const opcoesDuodecimos = DUODECIMOS_OPCOES.map((d) => ({ value: String(d), label: `${d}%` }));

  /** O subsidio (so leitura, vem da regra da organizacao) e os campos da pessoa: iguais no dialogo de alterar e no de corrigir. */
  const camposDaPessoa = (
    prefixo: string,
    valor: RascunhoPessoal,
    mudar: (patch: Partial<RascunhoPessoal>) => void,
  ) => (
    <>
      <p id={`${prefixo}-subsidio-regra`} className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t("hr.retribuicaoCartao.subsidioAlimentacao")}: </span>
        {textoDoSubsidioDaRegra}
      </p>
      <div className="grid grid-cols-1 gap-3">
        <CampoSelect
          id={`${prefixo}-subsidio-modo`}
          label={t("hr.retribuicaoCartao.subsidioAlimentacaoModo")}
          valor={valor.subsidioAlimentacaoModo}
          opcoes={opcoesSubsidioModo}
          vazioLabel={t("common.none")}
          onChange={(v) => mudar({ subsidioAlimentacaoModo: v as SubsidioAlimentacaoModo | "" })}
        />
      </div>
      <CampoSelect
        id={`${prefixo}-duodecimos`}
        label={t("hr.contrato.duodecimos")}
        valor={valor.duodecimosPct}
        opcoes={opcoesDuodecimos}
        vazioLabel={t("common.none")}
        onChange={(v) => mudar({ duodecimosPct: v as DuodecimosEscolha })}
      />
    </>
  );

  const baseNaDataEscolhida = baseDoCargoEm(rascunho.validoDe || hoje);
  // So quem tem cargo pode definir o que e da pessoa: sem cargo nao ha salario base.
  const podeDefinir = podeAlterar && cargo !== null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          {t("hr.retribuicaoCartao.titulo")}
        </CardTitle>
        {podeDefinir && (
          <Button size="sm" variant="outline" onClick={abrirPessoal} disabled={saving}>
            {t(aberta ? "hr.retribuicaoCartao.alterarPessoal" : "hr.retribuicaoCartao.definirPessoal")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {loading ? (
          <p className="py-4 text-center text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <>
            {periodosError && (
              <p className="text-destructive" role="alert">
                {t("hr.retribuicaoCartao.periodosErro")}
              </p>
            )}
            {cargo === null ? (
              periodosError ? null : periodosLoading ? (
                <p className="text-muted-foreground">{t("common.loading")}</p>
              ) : (
                <p className="text-muted-foreground">{t("hr.retribuicaoCartao.semCargo")}</p>
              )
            ) : (
              <div className="space-y-0.5">
                {baseHoje !== null && (
                  <p className="font-medium">
                    {t("hr.retribuicaoCartao.baseDoCargo", { valor: baseHoje, cargo: cargo.nome })}
                  </p>
                )}
                {baseHoje === null && !periodosError && (
                  <p className="text-muted-foreground">
                    {periodosLoading
                      ? t("common.loading")
                      : t("hr.retribuicaoCartao.cargoSemSalario")}
                  </p>
                )}
                {subida && (
                  <p className="text-xs text-muted-foreground">
                    {t("hr.cargos.sobeEm", {
                      valor: formatarSalario(
                        { salarioBase: subida.salario_base, periodicidade: subida.periodicidade },
                        traduzir,
                      ),
                      data: subida.valido_de,
                    })}
                  </p>
                )}
              </div>
            )}

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
                  <TableCaption className="sr-only">{t("hr.retribuicaoCartao.historicoTitulo")}</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("hr.afectacoes.de")}</TableHead>
                      <TableHead>{t("hr.afectacoes.ate")}</TableHead>
                      <TableHead>{t("hr.retribuicaoCartao.valor")}</TableHead>
                      <TableHead>{t("hr.retribuicaoCartao.colunaOrigem")}</TableHead>
                      <TableHead className="text-right">{t("hr.afectacoes.accoes")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historico.map((linha) => (
                      <TableRow key={linha.id}>
                        <TableCell className="tabular-nums">
                          {linha.valido_de}
                          {linha.valido_de > hoje && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-400">
                              {t("hr.retribuicaoCartao.agendada")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">{linha.valido_ate ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">
                          {linha.valor_base} {linha.moeda} ({t(`hr.periodicidade.${linha.periodicidade}`)})
                        </TableCell>
                        <TableCell>
                          {linha.origem ? t(`hr.retribuicaoCartao.origem.${linha.origem}`) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {/* So se corrige o que ja decorreu: a base recusa mexer numa versao em vigor ou futura por acesso directo. */}
                          {podeCorrigir && periodoDecorrido(linha.valido_ate) && (
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

      {/* Subsidio e duodecimos: cria uma versao nova a partir da data, com o
          valor base do cargo nessa data (so em leitura). */}
      <Dialog open={pessoalAberto} onOpenChange={setPessoalAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("hr.retribuicaoCartao.tituloPessoal")}</DialogTitle>
            <DialogDescription>{t("hr.retribuicaoCartao.ajudaPessoal")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {cargo && (
              <div className="space-y-1 rounded-md bg-muted/50 p-3">
                {baseNaDataEscolhida !== null && (
                  <p className="font-medium">
                    {t("hr.retribuicaoCartao.baseDoCargo", {
                      valor: baseNaDataEscolhida,
                      cargo: cargo.nome,
                    })}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {t("hr.retribuicaoCartao.avisoCargo", { cargo: cargo.nome })}
                </p>
              </div>
            )}
            {camposDaPessoa("hr-retribuicao-alterar", rascunho, (patch) =>
              setRascunho((a) => ({ ...a, ...patch })),
            )}
            <CampoTexto
              id="hr-retribuicao-alterar-data-efeito"
              label={t("hr.retribuicaoCartao.dataEfeito")}
              tipo="date"
              valor={rascunho.validoDe}
              onChange={(v) => setRascunho((a) => ({ ...a, validoDe: v }))}
            />
            <CampoTexto
              id="hr-retribuicao-alterar-motivo"
              label={t("hr.laborais.cargoMotivo")}
              valor={rascunho.motivo}
              onChange={(v) => setRascunho((a) => ({ ...a, motivo: v }))}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPessoalAberto(false)} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button onClick={concluirPessoal} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t("employees.form.update")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Corrigir: reescreve uma versao ja decorrida. Dialogo e cor
          deliberadamente diferentes -- ver o cabecalho. */}
      <Dialog
        open={linhaACorrigir !== null}
        onOpenChange={(aberto) => !aberto && setLinhaACorrigir(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-700 dark:text-amber-500">
              {t("hr.retribuicaoCartao.tituloCorrigir")}
            </DialogTitle>
            <DialogDescription>{t("hr.retribuicaoCartao.ajudaCorrigir")}</DialogDescription>
          </DialogHeader>
          <p className="text-xs text-amber-600 dark:text-amber-500">
            {t("hr.retribuicaoCartao.avisoCorrigir")}
          </p>
          <div className="space-y-4">
            {linhaACorrigir && (
              <div className="space-y-1 rounded-md bg-muted/50 p-3">
                <p className="tabular-nums font-medium">
                  {t("hr.retribuicaoCartao.valor")}: {linhaACorrigir.valor_base} {linhaACorrigir.moeda} (
                  {t(`hr.periodicidade.${linhaACorrigir.periodicidade}`)})
                </p>
                <p className="text-xs text-muted-foreground">{t("hr.retribuicaoCartao.valorSoLeitura")}</p>
              </div>
            )}
            <CampoTexto
              id="hr-retribuicao-corrigir-moeda"
              label={t("hr.retribuicaoCartao.moeda")}
              valor={correcao.moeda}
              onChange={(v) => setCorrecao((a) => ({ ...a, moeda: v.toUpperCase() }))}
            />
            {camposDaPessoa("hr-retribuicao-corrigir", correcao, (patch) =>
              setCorrecao((a) => ({ ...a, ...patch })),
            )}
            <CampoTexto
              id="hr-retribuicao-corrigir-de"
              label={t("hr.afectacoes.de")}
              tipo="date"
              valor={correcao.validoDe}
              onChange={(v) => setCorrecao((a) => ({ ...a, validoDe: v }))}
            />
            <CampoTexto
              id="hr-retribuicao-corrigir-ate"
              label={t("hr.afectacoes.ate")}
              tipo="date"
              valor={correcao.validoAte}
              onChange={(v) => setCorrecao((a) => ({ ...a, validoAte: v }))}
            />
            <CampoTexto
              id="hr-retribuicao-corrigir-motivo"
              label={t("hr.laborais.cargoMotivo")}
              valor={correcao.motivo}
              onChange={(v) => setCorrecao((a) => ({ ...a, motivo: v }))}
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
