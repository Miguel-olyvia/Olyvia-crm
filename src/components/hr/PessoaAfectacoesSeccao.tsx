/**
 * Afectacoes a centros, na ficha da pessoa (`pessoas_afectacoes`).
 *
 * PORQUE O LOCAL DEIXOU DE SE EDITAR AQUI AO LADO
 * -------------------------------------------------
 * Ate 20261130060000 `pessoas.local_id` era um campo simples, escrito
 * directamente. A migracao tornou-o DERIVADO da afectacao em aberto mais
 * recente -- quem tentar escreve-lo a mao leva `pessoas_local_id_e_derivado`.
 * Esta seccao e o unico caminho: cria, fecha ou corrige uma linha em
 * `pessoas_afectacoes`, e o trigger da base actualiza `pessoas.local_id`
 * sozinho.
 *
 * ALTERAR != CORRIGIR, E TEM DE SE VER A DIFERENCA
 * --------------------------------------------------
 * "Alterar" fecha a afectacao em vigor e abre outra -- e o gesto normal, do
 * dia-a-dia (`hr.pessoas.afectacoes.edit`). "Corrigir" reescreve um periodo
 * que ja decorreu -- "o que registamos para Marco estava errado"
 * (`hr.pessoas.afectacoes.corrigir`, permissao a parte, mais perigosa). Por
 * isso os dois botoes tem rotulo, cor e dialogo diferentes: um primario, o
 * outro em aviso -- nunca o mesmo botao com o texto trocado.
 *
 * TRES ORIGENS, MOSTRADAS COM SIGNIFICADOS DIFERENTES
 * -----------------------------------------------------
 * `declarada` (RH escreveu-a), `do_horario` (lida de um bloco de horario real)
 * e `inferida` (calculada da data do contrato -- um palpite, nao um facto).
 * Confirmar uma linha `do_horario`/`inferida` marca `confirmada_por`/
 * `confirmada_em` SEM apagar a origem: uma inferida confirmada continua
 * inferida, so com o registo de quem a validou.
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import {
  bucketDePermissao,
  dataDeHojeISO,
  diaSeguinte,
  estaEmAberto,
} from "@/lib/hr/afectacoes";
import { usePessoaAfectacoes } from "@/hooks/usePessoaAfectacoes";
import type { LocalTrabalho, PessoaAfectacao } from "@/types/hr";

interface PessoaAfectacoesSeccaoProps {
  pessoaId: string;
  organizationId: string;
  /** Vinculo activo (ou suspenso) da pessoa, para ligar a afectacao nova --
   *  o mesmo criterio de `usePessoa.savePlaneado`. */
  vinculoActivoId: string | null;
  locais: LocalTrabalho[];
  locaisALoad: boolean;
  podeVer: boolean;
  podeEditar: boolean;
  podeCorrigir: boolean;
}

function nomeDoLocal(locais: LocalTrabalho[], localId: string): string {
  return locais.find((l) => l.id === localId)?.nome ?? localId;
}

type Rascunho = {
  localId: string;
  validoDe: string;
  validoAte: string;
  motivo: string;
};

const RASCUNHO_VAZIO: Rascunho = {
  localId: "",
  validoDe: dataDeHojeISO(),
  validoAte: "",
  motivo: "",
};

export function PessoaAfectacoesSeccao({
  pessoaId,
  organizationId,
  vinculoActivoId,
  locais,
  locaisALoad,
  podeVer,
  podeEditar,
  podeCorrigir,
}: PessoaAfectacoesSeccaoProps) {
  const { t } = useTranslation();
  const { afectacoes, loading, saving, recarregar, criar, corrigir, fechar, apararEFechar, confirmar } =
    usePessoaAfectacoes(pessoaId, organizationId);

  // Escolher uma afectacao NOVA (criar, ou o "mudar de centro" ao fechar)
  // so pode apontar para um centro activo -- nunca faz sentido comecar hoje
  // uma afectacao a um centro ja desactivado.
  const opcoesLocaisActivos = useMemo(
    () => locais.filter((local) => local.activo).map((local) => ({ value: local.id, label: local.nome })),
    [locais],
  );

  // -- Dialogo "Nova afectacao" ------------------------------------------
  const [dialogoNovaAberto, setDialogoNovaAberto] = useState(false);
  const [jaTerminou, setJaTerminou] = useState(false);
  const [novaRascunho, setNovaRascunho] = useState<Rascunho>(RASCUNHO_VAZIO);

  const abrirDialogoNova = () => {
    setNovaRascunho(RASCUNHO_VAZIO);
    setJaTerminou(false);
    setDialogoNovaAberto(true);
  };

  const gravarNova = async () => {
    if (novaRascunho.localId === "") {
      toast.error(t("hr.afectacoes.erroSemCentro"));
      return;
    }
    const validoAte = jaTerminou ? novaRascunho.validoAte || null : null;
    if (jaTerminou && !validoAte) {
      toast.error(t("hr.afectacoes.erroSemCentro"));
      return;
    }
    if (validoAte && validoAte < novaRascunho.validoDe) {
      toast.error(t("hr.afectacoes.erroDatas"));
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
      localId: novaRascunho.localId,
      vinculoId: vinculoActivoId,
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
  const [linhaAAlterar, setLinhaAAlterar] = useState<PessoaAfectacao | null>(null);
  const [terminaEm, setTerminaEm] = useState(dataDeHojeISO());
  const [motivoFecho, setMotivoFecho] = useState("");
  const [mudarCentro, setMudarCentro] = useState(false);
  const [novoCentroId, setNovoCentroId] = useState("");
  const [novoInicio, setNovoInicio] = useState("");
  const [propostaApara, setPropostaApara] = useState<
    { afectacaoId: string; localId: string; corte: string } | null
  >(null);

  const abrirDialogoAlterar = (linha: PessoaAfectacao) => {
    setLinhaAAlterar(linha);
    setTerminaEm(dataDeHojeISO());
    setMotivoFecho("");
    setMudarCentro(false);
    setNovoCentroId("");
    setNovoInicio(diaSeguinte(dataDeHojeISO()));
  };

  const concluirAlterar = async () => {
    if (!linhaAAlterar) return;
    if (terminaEm < linhaAAlterar.valido_de) {
      toast.error(t("hr.afectacoes.erroDatas"));
      return;
    }
    if (mudarCentro && novoCentroId === "") {
      toast.error(t("hr.afectacoes.erroSemCentro"));
      return;
    }
    const motivo = motivoFecho.trim() || null;
    const resultado = await fechar(linhaAAlterar.id, terminaEm, motivo);
    if (resultado.tipo === "precisaAparar") {
      setPropostaApara({ afectacaoId: linhaAAlterar.id, localId: resultado.localId, corte: resultado.corte });
      return;
    }
    if (resultado.tipo === "erro") {
      toast.error(resultado.mensagem);
      return;
    }
    if (mudarCentro) {
      const erroNova = await criar({
        localId: novoCentroId,
        vinculoId: vinculoActivoId,
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

  const confirmarApara = async () => {
    if (!propostaApara) return;
    const resultado = await apararEFechar(
      propostaApara.afectacaoId,
      propostaApara.localId,
      propostaApara.corte,
      motivoFecho.trim() || null,
    );
    setPropostaApara(null);
    if (resultado.tipo === "erro") {
      toast.error(resultado.mensagem);
      return;
    }
    if (resultado.tipo === "precisaAparar") {
      // Nao deveria acontecer duas vezes seguidas, mas nao se finge sucesso.
      toast.error(t("hr.afectacoes.erroHorarioAFrente"));
      return;
    }
    if (mudarCentro && novoCentroId !== "") {
      const erroNova = await criar({
        localId: novoCentroId,
        vinculoId: vinculoActivoId,
        validoDe: novoInicio || diaSeguinte(propostaApara.corte),
        validoAte: null,
        motivo: motivoFecho.trim() || null,
      });
      if (erroNova) toast.error(erroNova);
    }
    toast.success(t("hr.sucesso.guardado"));
    setLinhaAAlterar(null);
  };

  // -- Dialogo "Corrigir" (reescreve uma linha ja decorrida) ---------------
  const [linhaACorrigir, setLinhaACorrigir] = useState<PessoaAfectacao | null>(null);
  const [corrigirRascunho, setCorrigirRascunho] = useState<Rascunho>(RASCUNHO_VAZIO);

  // Diferente de `opcoesLocaisActivos`: esta correcao pre-enche o centro da
  // linha ja existente, que pode entretanto ter sido desactivado -- o
  // selector tem de continuar a mostrar esse nome, nao ficar vazio, mesmo
  // que nao ofereca esse centro para uma escolha nova.
  const opcoesLocaisParaCorrigir = useMemo(
    () =>
      locais
        .filter((local) => local.activo || local.id === corrigirRascunho.localId)
        .map((local) => ({ value: local.id, label: local.nome })),
    [locais, corrigirRascunho.localId],
  );

  const abrirDialogoCorrigir = (linha: PessoaAfectacao) => {
    setLinhaACorrigir(linha);
    setCorrigirRascunho({
      localId: linha.local_id,
      validoDe: linha.valido_de,
      validoAte: linha.valido_ate ?? "",
      motivo: linha.motivo ?? "",
    });
  };

  const concluirCorrigir = async () => {
    if (!linhaACorrigir) return;
    if (corrigirRascunho.localId === "" || corrigirRascunho.validoAte === "") {
      toast.error(t("hr.afectacoes.erroSemCentro"));
      return;
    }
    if (corrigirRascunho.validoAte < corrigirRascunho.validoDe) {
      toast.error(t("hr.afectacoes.erroDatas"));
      return;
    }
    const erro = await corrigir(linhaACorrigir.id, {
      localId: corrigirRascunho.localId,
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

  const confirmarLinha = async (linha: PessoaAfectacao) => {
    const erro = await confirmar(linha.id);
    if (erro) toast.error(erro);
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
          <Building2 className="h-4 w-4 text-muted-foreground" />
          {t("hr.afectacoes.titulo")}
        </CardTitle>
        {(podeEditar || podeCorrigir) && (
          <Button size="sm" variant="outline" onClick={abrirDialogoNova} disabled={locaisALoad}>
            {t("hr.afectacoes.nova")}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-8 text-center text-muted-foreground">{t("common.loading")}</p>
        ) : afectacoes.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">{t("hr.afectacoes.semAfectacoes")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("hr.afectacoes.centro")}</TableHead>
                  <TableHead>{t("hr.afectacoes.de")}</TableHead>
                  <TableHead>{t("hr.afectacoes.ate")}</TableHead>
                  <TableHead>{t("hr.afectacoes.origem.rotulo")}</TableHead>
                  <TableHead className="text-right">{t("hr.afectacoes.accoes")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {afectacoes.map((linha) => {
                  const aberta = estaEmAberto(linha);
                  const precisaConfirmar =
                    linha.origem !== "declarada" && linha.confirmada_em === null;
                  const bucket = bucketDePermissao(linha.valido_ate);
                  const podeAgirNestaLinha =
                    bucket === "editar" ? podeEditar : podeCorrigir;
                  return (
                    <TableRow key={linha.id}>
                      <TableCell>{nomeDoLocal(locais, linha.local_id)}</TableCell>
                      <TableCell className="tabular-nums">{linha.valido_de}</TableCell>
                      <TableCell className="tabular-nums">
                        {aberta ? (
                          <Badge variant="secondary" className="font-normal">
                            {t("hr.afectacoes.emAberto")}
                          </Badge>
                        ) : (
                          linha.valido_ate
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant={linha.origem === "declarada" ? "outline" : "secondary"}
                            className="w-fit font-normal"
                          >
                            {t(`hr.afectacoes.origem.${linha.origem}`)}
                          </Badge>
                          {linha.origem !== "declarada" && (
                            <span className="text-xs text-muted-foreground">
                              {t("hr.afectacoes.origemAutomaticaAjuda")}
                            </span>
                          )}
                          {linha.confirmada_em && (
                            <span className="text-xs text-muted-foreground">
                              {t("hr.afectacoes.confirmadaEm", { data: linha.confirmada_em.slice(0, 10) })}
                            </span>
                          )}
                          {precisaConfirmar && podeAgirNestaLinha && (
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="h-auto w-fit p-0 text-xs"
                              onClick={() => void confirmarLinha(linha)}
                              disabled={saving}
                            >
                              {t("hr.afectacoes.confirmar")}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {aberta && podeEditar && (
                          <Button size="sm" onClick={() => abrirDialogoAlterar(linha)}>
                            {t("hr.afectacoes.alterar")}
                          </Button>
                        )}
                        {!aberta && podeCorrigir && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-500"
                            onClick={() => abrirDialogoCorrigir(linha)}
                          >
                            {t("hr.afectacoes.corrigir")}
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

      {/* Nova afectacao: em aberto (.edit) OU periodo ja terminado (.corrigir) -- a
          permissao exigida segue o mesmo criterio da base, calculado ao gravar. */}
      <Dialog open={dialogoNovaAberto} onOpenChange={setDialogoNovaAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("hr.afectacoes.nova")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <CampoSelect
              id="hr-afectacao-nova-local"
              label={t("hr.afectacoes.centro")}
              valor={novaRascunho.localId}
              placeholder={locaisALoad ? t("common.loading") : undefined}
              opcoes={opcoesLocaisActivos}
              onChange={(v) => setNovaRascunho((a) => ({ ...a, localId: v }))}
            />
            <CampoTexto
              id="hr-afectacao-nova-de"
              label={t("hr.afectacoes.de")}
              tipo="date"
              valor={novaRascunho.validoDe}
              onChange={(v) => setNovaRascunho((a) => ({ ...a, validoDe: v }))}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="hr-afectacao-nova-terminou"
                checked={jaTerminou}
                onCheckedChange={(v) => setJaTerminou(v === true)}
              />
              <label htmlFor="hr-afectacao-nova-terminou" className="text-sm">
                {t("hr.afectacoes.jaTerminou")}
              </label>
            </div>
            {jaTerminou && (
              <>
                <CampoTexto
                  id="hr-afectacao-nova-ate"
                  label={t("hr.afectacoes.ate")}
                  tipo="date"
                  valor={novaRascunho.validoAte}
                  onChange={(v) => setNovaRascunho((a) => ({ ...a, validoAte: v }))}
                />
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  {t("hr.afectacoes.avisoCorrigir")}
                </p>
              </>
            )}
            <CampoTexto
              id="hr-afectacao-nova-motivo"
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
          noutro centro. So aparece sobre linhas EM ABERTO. */}
      <Dialog open={linhaAAlterar !== null} onOpenChange={(aberto) => !aberto && setLinhaAAlterar(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("hr.afectacoes.alterar")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <CampoTexto
              id="hr-afectacao-termina-em"
              label={t("hr.afectacoes.terminaEm")}
              tipo="date"
              valor={terminaEm}
              onChange={setTerminaEm}
            />
            <CampoTexto
              id="hr-afectacao-motivo-fecho"
              label={t("hr.contrato.motivoTermo")}
              valor={motivoFecho}
              onChange={setMotivoFecho}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="hr-afectacao-mudar-centro"
                checked={mudarCentro}
                onCheckedChange={(v) => setMudarCentro(v === true)}
              />
              <label htmlFor="hr-afectacao-mudar-centro" className="text-sm">
                {t("hr.afectacoes.mudarCentro")}
              </label>
            </div>
            {mudarCentro && (
              <>
                <CampoSelect
                  id="hr-afectacao-novo-centro"
                  label={t("hr.afectacoes.novoCentro")}
                  valor={novoCentroId}
                  opcoes={opcoesLocaisActivos}
                  onChange={setNovoCentroId}
                />
                <CampoTexto
                  id="hr-afectacao-novo-inicio"
                  label={t("hr.afectacoes.novoInicio")}
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
              {t("hr.afectacoes.corrigir")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-amber-600 dark:text-amber-500">{t("hr.afectacoes.avisoCorrigir")}</p>
          <div className="space-y-4">
            <CampoSelect
              id="hr-afectacao-corrigir-local"
              label={t("hr.afectacoes.centro")}
              valor={corrigirRascunho.localId}
              opcoes={opcoesLocaisParaCorrigir}
              onChange={(v) => setCorrigirRascunho((a) => ({ ...a, localId: v }))}
            />
            <CampoTexto
              id="hr-afectacao-corrigir-de"
              label={t("hr.afectacoes.de")}
              tipo="date"
              valor={corrigirRascunho.validoDe}
              onChange={(v) => setCorrigirRascunho((a) => ({ ...a, validoDe: v }))}
            />
            <CampoTexto
              id="hr-afectacao-corrigir-ate"
              label={t("hr.afectacoes.ate")}
              tipo="date"
              valor={corrigirRascunho.validoAte}
              onChange={(v) => setCorrigirRascunho((a) => ({ ...a, validoAte: v }))}
            />
            <CampoTexto
              id="hr-afectacao-corrigir-motivo"
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

      {/* A proposta de aparar: erro nomeado `afectacao_tem_horario_a_frente`
          traduzido numa accao, nao numa recusa muda. */}
      <AlertDialog open={propostaApara !== null} onOpenChange={(aberto) => !aberto && setPropostaApara(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hr.afectacoes.aparar.titulo")}</AlertDialogTitle>
            <AlertDialogDescription>
              {propostaApara &&
                t("hr.afectacoes.aparar.descricao", { data: propostaApara.corte })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmarApara()} disabled={saving}>
              {t("hr.afectacoes.aparar.confirmar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
