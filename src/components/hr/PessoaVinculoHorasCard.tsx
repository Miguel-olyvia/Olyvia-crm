/**
 * Horas contratadas versionadas (`pessoas_vinculos_horas`, 20261130120000),
 * na ficha da pessoa -- mesmo molde de `PessoaAfectacoesSeccao`.
 *
 * ALTERAR != CORRIGIR, E TEM DE SE VER A DIFERENCA
 * --------------------------------------------------
 * "Alterar" fecha a versao em vigor (se existir) e abre outra com data de
 * efeito -- o gesto normal ("a partir de 1 de Abril passa a fazer 25h"),
 * `hr.pessoas.vinculos.edit` (a mesma permissao que ja edita o contrato,
 * reaproveitada). "Corrigir" reescreve uma versao ja decorrida -- "o que
 * registamos para Marco estava errado" -- `hr.pessoas.vinculos.horas.corrigir`,
 * permissao a parte, mais perigosa. Por isso os dois botoes tem rotulo, cor e
 * dialogo diferentes -- nunca o mesmo botao com o texto trocado.
 *
 * `PessoaContratoTab` DEIXOU DE ESCREVER AQUI DIRECTAMENTE
 * -----------------------------------------------------------
 * `pessoas_vinculos.horas_periodo`/`horas_frequencia` sao agora DERIVADOS por
 * trigger a partir da versao em aberto desta tabela -- escreve-los a mao no
 * vinculo e recusado pela base (`pessoas_vinculos_horas_e_derivado`). Este
 * cartao e o UNICO caminho de escrita; o separador Contratos continua so a
 * MOSTRAR o valor em vigor (desactivado).
 *
 * O DOCUMENTO DE SUPORTE
 * ------------------------
 * O aviso continua a so aparecer quando a versao em vigor nao tem nenhum
 * documento ligado -- nao se impede a alteracao por isso. Os dialogos de
 * Alterar e Corrigir ganham um selector "Documento de suporte", com os
 * documentos JA EXISTENTES desta pessoa (via `usePessoaDocumentos`, o mesmo
 * hook do separador Documentos) -- sem filtrar por vinculo nem por
 * estado=assinado nesta ronda: e informacao de apoio, nao um portao. Ligar
 * um documento aqui nao o cria nem o altera -- so grava `documento_id` na
 * versao de horas. Ao lado do selector ha tambem "Anexar ficheiro novo":
 * cria um documento tipo 'outro' por upload (`criarPorUpload` +
 * `anexarFicheiro`, o MESMO caminho de dois passos que
 * `AnexarContratoAssinadoDialog` ja usa) e liga-o de imediato -- para quem
 * nao tem o ficheiro ja carregado no separador Documentos.
 *
 * O MOTIVO PASSA A SER OBRIGATORIO
 * -----------------------------------
 * Justificar uma mudanca de horario deixa de ser opcional -- toda a
 * alteracao ou correccao grava uma razao, a mesma exigencia que ja existe
 * para as datas. O campo tambem deixou de usar a etiqueta de tradução do
 * motivo de TERMO DE CONTRATO (`hr.contrato.motivoTermo`) por engano -- tinha
 * a etiqueta errada, agora tem a sua propria.
 */
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { Clock, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import { dataDeHojeISO } from "@/lib/hr/afectacoes";
import { equivalenteParaMostrar, maximoDaFrequencia } from "@/lib/hr/horas";
import { usePessoaVinculoHoras } from "@/hooks/usePessoaVinculoHoras";
import { usePessoaDocumentos } from "@/hooks/usePessoaDocumentos";
import { HORAS_FREQUENCIAS, type HorasFrequencia, type PessoaVinculoHoras } from "@/types/hr";

interface PessoaVinculoHorasCardProps {
  pessoaId: string;
  organizationId: string;
  /** Vinculo activo (ou suspenso) da pessoa, para ligar a versao nova --
   *  o mesmo criterio de `usePessoa.savePlaneado` e `PessoaAfectacoesSeccao`. */
  vinculoActivoId: string | null;
  podeAlterar: boolean;
  podeCorrigir: boolean;
}

type Rascunho = {
  horasPeriodo: string;
  horasFrequencia: HorasFrequencia;
  validoDe: string;
  validoAte: string;
  motivo: string;
  /** "" = sem documento de suporte escolhido. */
  documentoId: string;
};

function rascunhoVazio(validoDe: string): Rascunho {
  return {
    horasPeriodo: "",
    horasFrequencia: "semanal",
    validoDe,
    validoAte: "",
    motivo: "",
    documentoId: "",
  };
}

export function PessoaVinculoHorasCard({
  pessoaId,
  organizationId,
  vinculoActivoId,
  podeAlterar,
  podeCorrigir,
}: PessoaVinculoHorasCardProps) {
  const { t } = useTranslation();
  const { versoes, aberta, loading, saving, alterar, corrigir } = usePessoaVinculoHoras(
    pessoaId,
    organizationId,
  );
  // So para listar os documentos JA EXISTENTES desta pessoa no selector de
  // apoio, e para criar+anexar um ficheiro novo inline -- `false` porque
  // este cartao nunca precisa da lista de modelos.
  const {
    documentos: documentosDaPessoa,
    criarPorUpload,
    anexarFicheiro: anexarFicheiroAoDocumento,
    saving: aAnexarNovo,
  } = usePessoaDocumentos(pessoaId, false);
  const opcoesDocumento = documentosDaPessoa.map((documento) => ({
    value: documento.id,
    label: `${documento.titulo} — ${t(`hr.tipoDocumentoRH.${documento.tipo}`)} · ${t(`hr.estadoDocumentoRH.${documento.estado}`)}`,
  }));

  const inputFicheiroAlterarRef = useRef<HTMLInputElement>(null);
  const inputFicheiroCorrigirRef = useRef<HTMLInputElement>(null);

  const historico = versoes.filter((v) => v.id !== aberta?.id);

  // -- Dialogo "Alterar" (fecha a versao em vigor, abre outra) --------------
  const [alterarAberto, setAlterarAberto] = useState(false);
  const [rascunhoAlterar, setRascunhoAlterar] = useState<Rascunho>(() =>
    rascunhoVazio(dataDeHojeISO()),
  );

  const abrirAlterar = () => {
    setRascunhoAlterar({
      horasPeriodo: aberta ? String(aberta.horas_periodo) : "",
      horasFrequencia: aberta?.horas_frequencia ?? "semanal",
      validoDe: dataDeHojeISO(),
      validoAte: "",
      motivo: "",
      documentoId: "",
    });
    setAlterarAberto(true);
  };

  const numeroAlterar = Number(rascunhoAlterar.horasPeriodo.replace(",", "."));
  const horasLegiveisAlterar =
    rascunhoAlterar.horasPeriodo.trim() !== "" && Number.isFinite(numeroAlterar);
  const maximoAlterar = maximoDaFrequencia(rascunhoAlterar.horasFrequencia);
  const equivalenteAlterar = horasLegiveisAlterar
    ? equivalenteParaMostrar(numeroAlterar, rascunhoAlterar.horasFrequencia)
    : null;

  const concluirAlterar = async () => {
    if (rascunhoAlterar.validoDe.trim() === "") {
      toast.error(t("hr.horasContratadas.erroSemData"));
      return;
    }
    if (rascunhoAlterar.motivo.trim() === "") {
      toast.error(t("hr.horasContratadas.erroSemMotivo"));
      return;
    }
    if (!horasLegiveisAlterar || numeroAlterar < 0 || numeroAlterar > maximoAlterar) {
      toast.error(t("hr.horasContratadas.erroHorasInvalidas", { maximo: String(maximoAlterar) }));
      return;
    }
    if (aberta && rascunhoAlterar.validoDe <= aberta.valido_de) {
      toast.error(t("hr.horasContratadas.erroDatas"));
      return;
    }
    const erro = await alterar({
      vinculoId: vinculoActivoId,
      horasPeriodo: numeroAlterar,
      horasFrequencia: rascunhoAlterar.horasFrequencia,
      dataEfeito: rascunhoAlterar.validoDe,
      motivo: rascunhoAlterar.motivo.trim() || null,
      documentoId: rascunhoAlterar.documentoId || null,
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
    setAlterarAberto(false);
  };

  // -- Dialogo "Corrigir" (reescreve uma versao ja decorrida) ---------------
  const [linhaACorrigir, setLinhaACorrigir] = useState<PessoaVinculoHoras | null>(null);
  const [rascunhoCorrigir, setRascunhoCorrigir] = useState<Rascunho>(() => rascunhoVazio(""));

  const abrirCorrigir = (linha: PessoaVinculoHoras) => {
    setLinhaACorrigir(linha);
    setRascunhoCorrigir({
      horasPeriodo: String(linha.horas_periodo),
      horasFrequencia: linha.horas_frequencia,
      validoDe: linha.valido_de,
      validoAte: linha.valido_ate ?? "",
      motivo: linha.motivo ?? "",
      documentoId: linha.documento_id ?? "",
    });
  };

  const numeroCorrigir = Number(rascunhoCorrigir.horasPeriodo.replace(",", "."));
  const horasLegiveisCorrigir =
    rascunhoCorrigir.horasPeriodo.trim() !== "" && Number.isFinite(numeroCorrigir);
  const maximoCorrigir = maximoDaFrequencia(rascunhoCorrigir.horasFrequencia);

  const concluirCorrigir = async () => {
    if (!linhaACorrigir) return;
    if (rascunhoCorrigir.validoDe.trim() === "" || rascunhoCorrigir.validoAte.trim() === "") {
      toast.error(t("hr.horasContratadas.erroSemData"));
      return;
    }
    if (rascunhoCorrigir.motivo.trim() === "") {
      toast.error(t("hr.horasContratadas.erroSemMotivo"));
      return;
    }
    if (!horasLegiveisCorrigir || numeroCorrigir < 0 || numeroCorrigir > maximoCorrigir) {
      toast.error(t("hr.horasContratadas.erroHorasInvalidas", { maximo: String(maximoCorrigir) }));
      return;
    }
    if (rascunhoCorrigir.validoAte < rascunhoCorrigir.validoDe) {
      toast.error(t("hr.horasContratadas.erroDatas"));
      return;
    }
    const erro = await corrigir(linhaACorrigir.id, {
      horasPeriodo: numeroCorrigir,
      horasFrequencia: rascunhoCorrigir.horasFrequencia,
      validoDe: rascunhoCorrigir.validoDe,
      validoAte: rascunhoCorrigir.validoAte,
      motivo: rascunhoCorrigir.motivo.trim() || null,
      documentoId: rascunhoCorrigir.documentoId || null,
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
    setLinhaACorrigir(null);
  };

  // -- Anexar ficheiro novo inline (cria documento tipo 'outro' + anexa) ----
  // `anexarFicheiroAoDocumento` (usePessoaDocumentos.anexarFicheiro) procura
  // o documento na lista `documentosDaPessoa` do MESMO hook -- logo a seguir
  // a criarPorUpload() essa lista ainda nao tem a linha nova nesta mesma
  // closure (so fica fresca no proximo render, ja com o id la). Por isso o
  // anexo real corre num efeito que so dispara quando `documentosDaPessoa`
  // ja inclui o id pendente -- nunca na mesma continuacao sincrona do
  // criarPorUpload, o mesmo cuidado que AnexarContratoAssinadoDialog ja tem
  // ("NAO procurar o documento novo numa lista qualquer").
  const [pendente, setPendente] = useState<{
    alvo: "alterar" | "corrigir";
    documentoId: string;
    ficheiro: File;
  } | null>(null);

  useEffect(() => {
    if (!pendente) return;
    if (!documentosDaPessoa.some((d) => d.id === pendente.documentoId)) return;
    let cancelado = false;
    void (async () => {
      const erro = await anexarFicheiroAoDocumento(pendente.documentoId, pendente.ficheiro);
      if (cancelado) return;
      if (erro) {
        toast.error(erro);
      } else if (pendente.alvo === "alterar") {
        setRascunhoAlterar((a) => ({ ...a, documentoId: pendente.documentoId }));
      } else {
        setRascunhoCorrigir((a) => ({ ...a, documentoId: pendente.documentoId }));
      }
      setPendente(null);
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendente, documentosDaPessoa]);

  const anexarFicheiroNovo = async (alvo: "alterar" | "corrigir", ficheiro: File) => {
    const { documentoId, erro: erroCriar } = await criarPorUpload({
      tipo: "outro",
      titulo: t("hr.horasContratadas.anexoNovoTitulo", { data: dataDeHojeISO() }),
      vinculoId: vinculoActivoId,
    });
    if (erroCriar || !documentoId) {
      toast.error(erroCriar ?? t("hr.documentos.erroAnexar"));
      return;
    }
    setPendente({ alvo, documentoId, ficheiro });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-muted-foreground" />
          {t("hr.horasContratadas.titulo")}
        </CardTitle>
        {podeAlterar && (
          <Button size="sm" variant="outline" onClick={abrirAlterar} disabled={saving}>
            {t("hr.horasContratadas.alterar")}
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
                  {aberta.horas_periodo} {t(`hr.horasFrequencia.${aberta.horas_frequencia}`)}
                </span>
                {aberta.horas_semanais_equivalentes !== null && (
                  <span className="text-muted-foreground">
                    {t("hr.contrato.ajudaEquivalenteSemanal", {
                      horas: String(aberta.horas_semanais_equivalentes),
                    })}
                  </span>
                )}
                <span className="text-muted-foreground">
                  {t("hr.contrato.validoDe")}: {aberta.valido_de}
                </span>
                {aberta.documento_id === null && (
                  <Badge
                    variant="outline"
                    className="border-amber-500 font-normal text-amber-700 dark:text-amber-500"
                  >
                    {t("hr.horasContratadas.semDocumento")}
                  </Badge>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">{t("hr.horasContratadas.semVersoes")}</p>
            )}

            {historico.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("hr.afectacoes.de")}</TableHead>
                      <TableHead>{t("hr.afectacoes.ate")}</TableHead>
                      <TableHead>{t("hr.contrato.horasTrabalho")}</TableHead>
                      <TableHead className="text-right">{t("hr.afectacoes.accoes")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historico.map((linha) => (
                      <TableRow key={linha.id}>
                        <TableCell className="tabular-nums">{linha.valido_de}</TableCell>
                        <TableCell className="tabular-nums">{linha.valido_ate ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">
                          {linha.horas_periodo} {t(`hr.horasFrequencia.${linha.horas_frequencia}`)}
                        </TableCell>
                        <TableCell className="text-right">
                          {podeCorrigir && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-500"
                              onClick={() => abrirCorrigir(linha)}
                            >
                              {t("hr.horasContratadas.corrigir")}
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
            <DialogTitle>{t("hr.horasContratadas.tituloAlterar")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <CampoTexto
              id="hr-horas-alterar-quantidade"
              label={t("hr.contrato.horasTrabalho")}
              ajuda={
                equivalenteAlterar
                  ? t("hr.contrato.ajudaEquivalenteSemanal", { horas: equivalenteAlterar })
                  : undefined
              }
              tipo="number"
              min={0}
              max={maximoAlterar}
              step="0.5"
              valor={rascunhoAlterar.horasPeriodo}
              onChange={(v) => setRascunhoAlterar((a) => ({ ...a, horasPeriodo: v }))}
            />
            <CampoSelect
              id="hr-horas-alterar-frequencia"
              label={t("hr.contrato.horasFrequencia")}
              valor={rascunhoAlterar.horasFrequencia}
              opcoes={HORAS_FREQUENCIAS.map((f) => ({ value: f, label: t(`hr.horasFrequencia.${f}`) }))}
              onChange={(v) => setRascunhoAlterar((a) => ({ ...a, horasFrequencia: v as HorasFrequencia }))}
            />
            <CampoTexto
              id="hr-horas-alterar-data-efeito"
              label={t("hr.horasContratadas.dataEfeito")}
              tipo="date"
              valor={rascunhoAlterar.validoDe}
              onChange={(v) => setRascunhoAlterar((a) => ({ ...a, validoDe: v }))}
            />
            <CampoTexto
              id="hr-horas-alterar-motivo"
              label={t("hr.horasContratadas.motivo")}
              valor={rascunhoAlterar.motivo}
              onChange={(v) => setRascunhoAlterar((a) => ({ ...a, motivo: v }))}
            />
            <CampoSelect
              id="hr-horas-alterar-documento"
              label={t("hr.horasContratadas.documentoSuporte")}
              valor={rascunhoAlterar.documentoId}
              opcoes={opcoesDocumento}
              vazioLabel={t("common.none")}
              placeholder={t("common.none")}
              onChange={(v) => setRascunhoAlterar((a) => ({ ...a, documentoId: v }))}
            />
            <div className="space-y-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={aAnexarNovo || pendente !== null}
                onClick={() => inputFicheiroAlterarRef.current?.click()}
              >
                {(aAnexarNovo || pendente !== null) && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                {t("hr.horasContratadas.anexarNovo")}
              </Button>
              <input
                ref={inputFicheiroAlterarRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={(evento) => {
                  const ficheiro = evento.target.files?.[0];
                  evento.target.value = "";
                  if (ficheiro) void anexarFicheiroNovo("alterar", ficheiro);
                }}
              />
            </div>
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
              {t("hr.horasContratadas.tituloCorrigir")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-amber-600 dark:text-amber-500">
            {t("hr.horasContratadas.avisoCorrigir")}
          </p>
          <div className="space-y-4">
            <CampoTexto
              id="hr-horas-corrigir-quantidade"
              label={t("hr.contrato.horasTrabalho")}
              tipo="number"
              min={0}
              max={maximoCorrigir}
              step="0.5"
              valor={rascunhoCorrigir.horasPeriodo}
              onChange={(v) => setRascunhoCorrigir((a) => ({ ...a, horasPeriodo: v }))}
            />
            <CampoSelect
              id="hr-horas-corrigir-frequencia"
              label={t("hr.contrato.horasFrequencia")}
              valor={rascunhoCorrigir.horasFrequencia}
              opcoes={HORAS_FREQUENCIAS.map((f) => ({ value: f, label: t(`hr.horasFrequencia.${f}`) }))}
              onChange={(v) =>
                setRascunhoCorrigir((a) => ({ ...a, horasFrequencia: v as HorasFrequencia }))
              }
            />
            <CampoTexto
              id="hr-horas-corrigir-de"
              label={t("hr.afectacoes.de")}
              tipo="date"
              valor={rascunhoCorrigir.validoDe}
              onChange={(v) => setRascunhoCorrigir((a) => ({ ...a, validoDe: v }))}
            />
            <CampoTexto
              id="hr-horas-corrigir-ate"
              label={t("hr.afectacoes.ate")}
              tipo="date"
              valor={rascunhoCorrigir.validoAte}
              onChange={(v) => setRascunhoCorrigir((a) => ({ ...a, validoAte: v }))}
            />
            <CampoTexto
              id="hr-horas-corrigir-motivo"
              label={t("hr.horasContratadas.motivo")}
              valor={rascunhoCorrigir.motivo}
              onChange={(v) => setRascunhoCorrigir((a) => ({ ...a, motivo: v }))}
            />
            <CampoSelect
              id="hr-horas-corrigir-documento"
              label={t("hr.horasContratadas.documentoSuporte")}
              valor={rascunhoCorrigir.documentoId}
              opcoes={opcoesDocumento}
              vazioLabel={t("common.none")}
              placeholder={t("common.none")}
              onChange={(v) => setRascunhoCorrigir((a) => ({ ...a, documentoId: v }))}
            />
            <div className="space-y-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={aAnexarNovo || pendente !== null}
                onClick={() => inputFicheiroCorrigirRef.current?.click()}
              >
                {(aAnexarNovo || pendente !== null) && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                {t("hr.horasContratadas.anexarNovo")}
              </Button>
              <input
                ref={inputFicheiroCorrigirRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={(evento) => {
                  const ficheiro = evento.target.files?.[0];
                  evento.target.value = "";
                  if (ficheiro) void anexarFicheiroNovo("corrigir", ficheiro);
                }}
              />
            </div>
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
