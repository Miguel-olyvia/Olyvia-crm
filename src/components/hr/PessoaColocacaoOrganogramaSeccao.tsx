/**
 * Colocacao no organograma, na ficha da pessoa (`pessoas_colocacao_organograma`,
 * 20261130080000) -- a filial/estrutura a que a pessoa esta classificada.
 *
 * DUAS CLASSIFICACOES INDEPENDENTES -- NAO CONFUNDIR COM "AFECTACOES A CENTROS"
 * ---------------------------------------------------------------------------
 * Esta seccao NAO diz onde a pessoa trabalha fisicamente -- isso e a seccao
 * "Afectacoes a centros", ao lado (`PessoaAfectacoesSeccao`). Sao DUAS
 * classificacoes que coexistem sem se calcularem uma da outra: um centro tem
 * a SUA filial (`hr_locais_trabalho.organograma_node_id`, simples, sem
 * historico); a pessoa tem a SUA, aqui, versionada. Alguem classificado em
 * Lisboa afecto a um centro do Porto continua "de Lisboa" -- e isso mostra-se
 * como "centro fora da filial habitual", nao se esconde nem se corrige
 * sozinho. A classificacao NUNCA limita a que centros a pessoa pode ser
 * afecta -- por isso nao ha aqui nenhum selector filtrado pela colocacao.
 *
 * ALTERAR != CORRIGIR, E TEM DE SE VER A DIFERENCA
 * --------------------------------------------------
 * "Alterar" fecha a colocacao em vigor e abre outra -- o gesto normal, do
 * dia-a-dia (`hr.pessoas.colocacao.edit`). "Corrigir" reescreve um periodo
 * que ja decorreu (`hr.pessoas.colocacao.corrigir`, permissao a parte, mais
 * perigosa). Por isso os dois botoes tem rotulo, cor e dialogo diferentes --
 * o mesmo padrao de `PessoaAfectacoesSeccao`, nunca o mesmo botao com o texto
 * trocado.
 *
 * SEM CLASSIFICACAO E UMA OPCAO VALIDA
 * --------------------------------------
 * `organograma_node_id` e anulavel: uma colocacao "sem filial" e uma linha
 * legitima, nao um estado invalido. O selector oferece sempre essa opcao.
 *
 * SO OFERECE NOS DA ARVORE DA PROPRIA ORGANIZACAO
 * ---------------------------------------------------
 * `useFiliaisDaArvore` resolve a mesma arvore (organizacao activa +
 * descendentes) que o trigger `hr_no_pertence_a_arvore_da_org` exige -- o
 * mesmo hook que `RhCentros.tsx` ja usa para `hr_locais_trabalho`. Se mesmo
 * assim um no fora da arvore escapar (hierarquia mudada por outra pessoa
 * entretanto), o erro do trigger chega traduzido via `friendlyError.ts`
 * (`hr.locais.erroFilialForaDaArvore`, partilhado com `RhCentros.tsx`).
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Loader2, Network } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import { bucketDePermissao, dataDeHojeISO, diaSeguinte, estaEmAberto } from "@/lib/hr/afectacoes";
import { usePessoaColocacaoOrganograma } from "@/hooks/usePessoaColocacaoOrganograma";
import { useFiliaisDaArvore } from "@/hooks/useFiliaisDaArvore";
import type { PessoaColocacaoOrganograma } from "@/types/hr";

interface PessoaColocacaoOrganogramaSeccaoProps {
  pessoaId: string;
  organizationId: string;
  podeVer: boolean;
  podeEditar: boolean;
  podeCorrigir: boolean;
}

/** Valor sentinela do selector para "sem classificacao" -- `organograma_node_id`
 *  anulavel, ver o cabecalho. */
const SEM_FILIAL = "";

function nomeDoNo(filiais: Array<{ id: string; name: string }>, nodeId: string | null, t: (k: string) => string): string {
  if (nodeId === null) return t("hr.locais.semFilial");
  return filiais.find((f) => f.id === nodeId)?.name ?? nodeId;
}

type Rascunho = {
  organogramaNodeId: string;
  validoDe: string;
  validoAte: string;
  motivo: string;
};

const RASCUNHO_VAZIO: Rascunho = {
  organogramaNodeId: SEM_FILIAL,
  validoDe: dataDeHojeISO(),
  validoAte: "",
  motivo: "",
};

export function PessoaColocacaoOrganogramaSeccao({
  pessoaId,
  organizationId,
  podeVer,
  podeEditar,
  podeCorrigir,
}: PessoaColocacaoOrganogramaSeccaoProps) {
  const { t } = useTranslation();
  const { colocacoes, loading, saving, criar, corrigir, fechar } = usePessoaColocacaoOrganograma(
    pessoaId,
    organizationId,
  );
  const { filiais, loading: filiaisLoading } = useFiliaisDaArvore();

  const opcoesFiliais = useMemo(
    () => filiais.map((filial) => ({ value: filial.id, label: filial.name })),
    [filiais],
  );

  // -- Dialogo "Nova colocacao" -------------------------------------------
  const [dialogoNovaAberto, setDialogoNovaAberto] = useState(false);
  const [jaTerminou, setJaTerminou] = useState(false);
  const [novaRascunho, setNovaRascunho] = useState<Rascunho>(RASCUNHO_VAZIO);

  const abrirDialogoNova = () => {
    setNovaRascunho(RASCUNHO_VAZIO);
    setJaTerminou(false);
    setDialogoNovaAberto(true);
  };

  const gravarNova = async () => {
    const validoAte = jaTerminou ? novaRascunho.validoAte || null : null;
    if (jaTerminou && !validoAte) {
      toast.error(t("hr.colocacao.erroDatas"));
      return;
    }
    if (validoAte && validoAte < novaRascunho.validoDe) {
      toast.error(t("hr.colocacao.erroDatas"));
      return;
    }
    const bucket = bucketDePermissao(validoAte);
    if (bucket === "editar" && !podeEditar) {
      toast.error(t("hr.semAcesso"));
      return;
    }
    if (bucket === "corrigir" && !podeCorrigir) {
      toast.error(t("hr.semAcesso"));
      return;
    }
    const erro = await criar({
      organogramaNodeId: novaRascunho.organogramaNodeId || null,
      validoDe: novaRascunho.validoDe,
      validoAte,
      motivo: novaRascunho.motivo.trim() || null,
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
    setDialogoNovaAberto(false);
  };

  // -- Dialogo "Alterar" (fecha a linha em vigor, pode abrir outra) -------
  const [linhaAAlterar, setLinhaAAlterar] = useState<PessoaColocacaoOrganograma | null>(null);
  const [terminaEm, setTerminaEm] = useState(dataDeHojeISO());
  const [motivoFecho, setMotivoFecho] = useState("");
  const [mudarFilial, setMudarFilial] = useState(false);
  const [novoNoId, setNovoNoId] = useState("");
  const [novoInicio, setNovoInicio] = useState("");

  const abrirDialogoAlterar = (linha: PessoaColocacaoOrganograma) => {
    setLinhaAAlterar(linha);
    setTerminaEm(dataDeHojeISO());
    setMotivoFecho("");
    setMudarFilial(false);
    setNovoNoId("");
    setNovoInicio(diaSeguinte(dataDeHojeISO()));
  };

  const concluirAlterar = async () => {
    if (!linhaAAlterar) return;
    if (terminaEm < linhaAAlterar.valido_de) {
      toast.error(t("hr.colocacao.erroDatas"));
      return;
    }
    const motivo = motivoFecho.trim() || null;
    const resultado = await fechar(linhaAAlterar.id, terminaEm, motivo);
    if (resultado.tipo === "erro") {
      toast.error(resultado.mensagem);
      return;
    }
    if (mudarFilial) {
      const erroNova = await criar({
        organogramaNodeId: novoNoId || null,
        validoDe: novoInicio || diaSeguinte(terminaEm),
        validoAte: null,
        motivo,
      });
      if (erroNova) {
        toast.error(erroNova);
        return;
      }
    }
    toast.success(t("hr.sucesso.guardado"));
    setLinhaAAlterar(null);
  };

  // -- Dialogo "Corrigir" (reescreve uma linha ja decorrida) ---------------
  const [linhaACorrigir, setLinhaACorrigir] = useState<PessoaColocacaoOrganograma | null>(null);
  const [corrigirRascunho, setCorrigirRascunho] = useState<Rascunho>(RASCUNHO_VAZIO);

  const abrirDialogoCorrigir = (linha: PessoaColocacaoOrganograma) => {
    setLinhaACorrigir(linha);
    setCorrigirRascunho({
      organogramaNodeId: linha.organograma_node_id ?? SEM_FILIAL,
      validoDe: linha.valido_de,
      validoAte: linha.valido_ate ?? "",
      motivo: linha.motivo ?? "",
    });
  };

  const concluirCorrigir = async () => {
    if (!linhaACorrigir) return;
    if (corrigirRascunho.validoAte === "") {
      toast.error(t("hr.colocacao.erroDatas"));
      return;
    }
    if (corrigirRascunho.validoAte < corrigirRascunho.validoDe) {
      toast.error(t("hr.colocacao.erroDatas"));
      return;
    }
    const erro = await corrigir(linhaACorrigir.id, {
      organogramaNodeId: corrigirRascunho.organogramaNodeId || null,
      validoDe: corrigirRascunho.validoDe,
      validoAte: corrigirRascunho.validoAte,
      motivo: corrigirRascunho.motivo.trim() || null,
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
    setLinhaACorrigir(null);
  };

  if (!podeVer) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t("hr.semAcesso")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="h-4 w-4 text-muted-foreground" />
          {t("hr.colocacao.titulo")}
        </CardTitle>
        {(podeEditar || podeCorrigir) && (
          <Button size="sm" variant="outline" onClick={abrirDialogoNova} disabled={filiaisLoading}>
            {t("hr.colocacao.nova")}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-8 text-center text-muted-foreground">{t("common.loading")}</p>
        ) : colocacoes.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">{t("hr.colocacao.semColocacoes")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("hr.colocacao.no")}</TableHead>
                  <TableHead>{t("hr.colocacao.de")}</TableHead>
                  <TableHead>{t("hr.colocacao.ate")}</TableHead>
                  <TableHead className="text-right">{t("hr.colocacao.accoes")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {colocacoes.map((linha) => {
                  const aberta = estaEmAberto(linha);
                  return (
                    <TableRow key={linha.id}>
                      <TableCell>{nomeDoNo(filiais, linha.organograma_node_id, t)}</TableCell>
                      <TableCell className="tabular-nums">{linha.valido_de}</TableCell>
                      <TableCell className="tabular-nums">
                        {aberta ? (
                          <Badge variant="secondary" className="font-normal">
                            {t("hr.colocacao.emAberto")}
                          </Badge>
                        ) : (
                          linha.valido_ate
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {aberta && podeEditar && (
                          <Button size="sm" onClick={() => abrirDialogoAlterar(linha)}>
                            {t("hr.colocacao.alterar")}
                          </Button>
                        )}
                        {!aberta && podeCorrigir && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-500"
                            onClick={() => abrirDialogoCorrigir(linha)}
                          >
                            {t("hr.colocacao.corrigir")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Nova colocacao: em aberto (.edit) OU periodo ja terminado (.corrigir) --
          a permissao exigida segue o mesmo criterio da base, calculado ao gravar. */}
      <Dialog open={dialogoNovaAberto} onOpenChange={setDialogoNovaAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("hr.colocacao.nova")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <CampoSelect
              id="hr-colocacao-nova-no"
              label={t("hr.colocacao.no")}
              valor={novaRascunho.organogramaNodeId}
              placeholder={filiaisLoading ? t("common.loading") : undefined}
              vazioLabel={t("hr.locais.semFilial")}
              opcoes={opcoesFiliais}
              onChange={(v) => setNovaRascunho((a) => ({ ...a, organogramaNodeId: v }))}
            />
            <CampoTexto
              id="hr-colocacao-nova-de"
              label={t("hr.colocacao.de")}
              tipo="date"
              valor={novaRascunho.validoDe}
              onChange={(v) => setNovaRascunho((a) => ({ ...a, validoDe: v }))}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="hr-colocacao-nova-terminou"
                checked={jaTerminou}
                onCheckedChange={(v) => setJaTerminou(v === true)}
              />
              <label htmlFor="hr-colocacao-nova-terminou" className="text-sm">
                {t("hr.colocacao.jaTerminou")}
              </label>
            </div>
            {jaTerminou && (
              <>
                <CampoTexto
                  id="hr-colocacao-nova-ate"
                  label={t("hr.colocacao.ate")}
                  tipo="date"
                  valor={novaRascunho.validoAte}
                  onChange={(v) => setNovaRascunho((a) => ({ ...a, validoAte: v }))}
                />
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  {t("hr.colocacao.avisoCorrigir")}
                </p>
              </>
            )}
            <CampoTexto
              id="hr-colocacao-nova-motivo"
              label={t("hr.contrato.motivoTermo")}
              valor={novaRascunho.motivo}
              onChange={(v) => setNovaRascunho((a) => ({ ...a, motivo: v }))}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogoNovaAberto(false)} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button onClick={gravarNova} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t("employees.form.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alterar: fecha a linha em vigor; opcionalmente abre logo outra
          noutra filial. So aparece sobre linhas EM ABERTO. */}
      <Dialog open={linhaAAlterar !== null} onOpenChange={(aberto) => !aberto && setLinhaAAlterar(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("hr.colocacao.alterar")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <CampoTexto
              id="hr-colocacao-termina-em"
              label={t("hr.colocacao.terminaEm")}
              tipo="date"
              valor={terminaEm}
              onChange={setTerminaEm}
            />
            <CampoTexto
              id="hr-colocacao-motivo-fecho"
              label={t("hr.contrato.motivoTermo")}
              valor={motivoFecho}
              onChange={setMotivoFecho}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="hr-colocacao-mudar-no"
                checked={mudarFilial}
                onCheckedChange={(v) => setMudarFilial(v === true)}
              />
              <label htmlFor="hr-colocacao-mudar-no" className="text-sm">
                {t("hr.colocacao.mudarNo")}
              </label>
            </div>
            {mudarFilial && (
              <>
                <CampoSelect
                  id="hr-colocacao-novo-no"
                  label={t("hr.colocacao.novoNo")}
                  valor={novoNoId}
                  vazioLabel={t("hr.locais.semFilial")}
                  opcoes={opcoesFiliais}
                  onChange={setNovoNoId}
                />
                <CampoTexto
                  id="hr-colocacao-novo-inicio"
                  label={t("hr.colocacao.novoInicio")}
                  tipo="date"
                  valor={novoInicio}
                  onChange={setNovoInicio}
                />
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinhaAAlterar(null)} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button onClick={concluirAlterar} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t("employees.form.update")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Corrigir: reescreve uma linha ja decorrida. Dialogo e cor
          deliberadamente diferentes de "Alterar" -- ver o cabecalho. */}
      <Dialog open={linhaACorrigir !== null} onOpenChange={(aberto) => !aberto && setLinhaACorrigir(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-700 dark:text-amber-500">
              {t("hr.colocacao.corrigir")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-amber-600 dark:text-amber-500">{t("hr.colocacao.avisoCorrigir")}</p>
          <div className="space-y-4">
            <CampoSelect
              id="hr-colocacao-corrigir-no"
              label={t("hr.colocacao.no")}
              valor={corrigirRascunho.organogramaNodeId}
              vazioLabel={t("hr.locais.semFilial")}
              opcoes={opcoesFiliais}
              onChange={(v) => setCorrigirRascunho((a) => ({ ...a, organogramaNodeId: v }))}
            />
            <CampoTexto
              id="hr-colocacao-corrigir-de"
              label={t("hr.colocacao.de")}
              tipo="date"
              valor={corrigirRascunho.validoDe}
              onChange={(v) => setCorrigirRascunho((a) => ({ ...a, validoDe: v }))}
            />
            <CampoTexto
              id="hr-colocacao-corrigir-ate"
              label={t("hr.colocacao.ate")}
              tipo="date"
              valor={corrigirRascunho.validoAte}
              onChange={(v) => setCorrigirRascunho((a) => ({ ...a, validoAte: v }))}
            />
            <CampoTexto
              id="hr-colocacao-corrigir-motivo"
              label={t("hr.contrato.motivoTermo")}
              valor={corrigirRascunho.motivo}
              onChange={(v) => setCorrigirRascunho((a) => ({ ...a, motivo: v }))}
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
