/**
 * O separador Documentos da ficha: os documentos da pessoa e, quando ha
 * permissao, a emissao de novos a partir de um modelo.
 *
 * "CADA PESSOA VE E ASSINA OS SEUS DOCUMENTOS" -- NA BASE, NAO AQUI
 * -------------------------------------------------------------------
 * Este ecra nao decide quem ve o que: `souAPessoa` e `permissoes` chegam de
 * fora e refletem o que a RLS de `pessoas_documentos` ja decidiu (ver a
 * migration 20261123030000). O ecra so escolhe quais BOTOES mostrar -- se a
 * base recusasse a linha, ela nem chegava a `documentos`. O separador esconde
 * o bloco quando `recusado`, nunca mostra "sem documentos" no lugar de "sem
 * permissao" (a mesma distincao de `SemAcessoCard`).
 *
 * O CONTEUDO NUNCA FICA EM ESTADO DA LISTA
 * -----------------------------------------
 * `corpo_html` so existe no dialogo que o pediu, chamado a abrir e limpo ao
 * fechar -- o mesmo padrao do NISS em `PessoaNissField`. E sanitizado com
 * DOMPurify antes de ir para o DOM: vem de um modelo que outra pessoa da
 * mesma organizacao escreveu, nao e sitio para confiar cegamente num HTML.
 *
 * ASSINAR NAO E EDITAR
 * ---------------------
 * O botao de assinar so aparece a quem e a propria pessoa do documento e so
 * quando o estado e `a_aguardar_assinatura`. Depois de assinado o documento
 * fica imutavel na base (trigger + `WITH CHECK`) -- este ecra nao tenta
 * oferecer nenhuma edicao a um documento assinado.
 *
 * ANEXAR O FICHEIRO ASSINADO -- ANTES DE ASSINAR, NUNCA DEPOIS
 * ----------------------------------------------------------------
 * O botao "Anexar ficheiro" so aparece com `permissoes.edit` E
 * `estado === 'a_aguardar_assinatura'` -- a MESMA ordem que
 * `rpc_hr_documento_anexar_ficheiro` (20261130065000) impoe na base: so se
 * anexa antes de assinar, nunca depois. Uma vez assinado, o ficheiro fica
 * imutavel com o resto da linha -- corrigi-lo e anular e emitir outro, nao
 * reabrir este dialogo.
 *
 * SEGUNDO CAMINHO DE CRIAR UM DOCUMENTO -- CONTRATO JA ASSINADO EM PAPEL
 * ------------------------------------------------------------------------
 * "Anexar contrato ja assinado" (20261201070000) e o segundo caminho de
 * criar um documento, sem modelo e sem assinatura dentro da app: RH cria a
 * linha (`rpc_hr_documento_upload_assinado_criar`), anexa o ficheiro pelo
 * MESMO dialogo que a emissao por modelo ja usa (reaproveitado, nunca
 * duplicado), e so entao confirma que a assinatura ja aconteceu em papel
 * (`rpc_hr_documento_registar_assinatura_externa`) -- que exige o ficheiro
 * JA anexado, por isso o botao de confirmar so aparece depois disso. A
 * mesma permissao de emitir (`permissoes.emitir`) abre os dois caminhos: sao
 * a mesma classe de accao, "criar um documento novo para esta pessoa".
 * `assinatura_origem` (`interna`/`externa`) distingue os dois so depois de
 * assinado -- mostrado como badge extra na coluna de estado.
 *
 * A coluna "Ficheiro" mostra sempre que ha um RESUMO (hash) guardado quando
 * `ficheiro_caminho` nao e nulo -- e o que torna verificavel a promessa de
 * `rpc_hr_documento_anexar_ficheiro` de nunca sobrescrever em silencio: o
 * hash muda se, e so se, os bytes por tras do caminho mudaram.
 *
 * A LEITURA NUNCA GUARDA O URL EM ESTADO
 * -----------------------------------------
 * "Abrir ficheiro" pede um URL assinado de curta duracao a
 * `hr-documento-ficheiro-url` a cada clique -- nunca se guarda o URL da vez
 * anterior, o mesmo cuidado do NISS e do conteudo HTML: um URL assinado e
 * tao sensivel como o proprio ficheiro enquanto for valido.
 */
import { useRef, useState } from "react";
import DOMPurify from "dompurify";
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
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ExternalLink,
  FileCheck,
  FilePlus2,
  FileSignature,
  FileText,
  Loader2,
  Paperclip,
  PenLine,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { usePessoaDocumentos } from "@/hooks/usePessoaDocumentos";
import { CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import { TIPOS_DOCUMENTO_RH, type EstadoDocumentoRH, type PessoaDocumento, type TipoDocumentoRH } from "@/types/hr";

export interface OpcaoVinculoDocumento {
  value: string;
  label: string;
}

export interface PermissoesDocumentosFicha {
  view: boolean;
  viewOwn: boolean;
  edit: boolean;
  emitir: boolean;
  anular: boolean;
  conteudoView: boolean;
  modelosView: boolean;
}

interface PessoaDocumentosTabProps {
  pessoaId: string;
  souAPessoa: boolean;
  permissoes: PermissoesDocumentosFicha;
  /** Vinculos desta pessoa, para o selector opcional do dialogo de upload. */
  vinculosOpcoes?: OpcaoVinculoDocumento[];
}

const VARIANTE_ESTADO: Record<EstadoDocumentoRH, "secondary" | "outline" | "default"> = {
  rascunho: "outline",
  a_aguardar_assinatura: "secondary",
  assinado: "default",
  anulado: "outline",
};

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export function PessoaDocumentosTab({
  pessoaId,
  souAPessoa,
  permissoes,
  vinculosOpcoes = [],
}: PessoaDocumentosTabProps) {
  const { t } = useTranslation();
  const podeVer = permissoes.view || (souAPessoa && permissoes.viewOwn);
  const podeEmitir = permissoes.emitir && permissoes.modelosView;
  // O caminho de upload usa a MESMA permissao de emitir -- "criar um
  // documento novo para esta pessoa" -- e nunca depende de haver modelos
  // (nao passa por nenhum).
  const podeCriarPorUpload = permissoes.emitir;
  const dados = usePessoaDocumentos(pessoaId, podeEmitir);

  const [aEmitir, setAEmitir] = useState(false);
  const [modeloEscolhido, setModeloEscolhido] = useState("");
  const [documentoAVer, setDocumentoAVer] = useState<PessoaDocumento | null>(null);
  const [conteudo, setConteudo] = useState<string | null>(null);
  const [aCarregarConteudo, setACarregarConteudo] = useState(false);
  const [documentoAAssinar, setDocumentoAAssinar] = useState<PessoaDocumento | null>(null);
  const [documentoAAnexar, setDocumentoAAnexar] = useState<PessoaDocumento | null>(null);
  const [ficheiroEscolhido, setFicheiroEscolhido] = useState<File | null>(null);
  const [documentoAAbrirId, setDocumentoAAbrirId] = useState<string | null>(null);
  const inputFicheiroRef = useRef<HTMLInputElement>(null);

  // -- Segundo caminho de criar um documento: upload de um contrato ja
  // assinado em papel (20261201070000). ---------------------------------
  const [aCriarPorUpload, setACriarPorUpload] = useState(false);
  const [rascunhoUpload, setRascunhoUpload] = useState<{
    tipo: TipoDocumentoRH;
    titulo: string;
    vinculoId: string;
  }>({ tipo: "contrato", titulo: "", vinculoId: "" });
  const [documentoAConfirmarExterna, setDocumentoAConfirmarExterna] =
    useState<PessoaDocumento | null>(null);

  if (!podeVer || dados.recusado) {
    return <SemAcessoCard />;
  }

  if (dados.loading) {
    return <OlyviaLoader />;
  }

  const abrirConteudo = async (documento: PessoaDocumento) => {
    setDocumentoAVer(documento);
    setConteudo(null);
    setACarregarConteudo(true);
    try {
      const html = await dados.verConteudo(documento.id);
      setConteudo(html);
    } catch {
      toast.error(t("hr.documentos.erroVerConteudo"));
      setDocumentoAVer(null);
    } finally {
      setACarregarConteudo(false);
    }
  };

  const fecharConteudo = () => {
    setDocumentoAVer(null);
    // NUNCA fica em estado alem do dialogo que o mostrou -- o mesmo cuidado
    // do NISS revelado.
    setConteudo(null);
  };

  const confirmarEmissao = async () => {
    if (!modeloEscolhido) return;
    const erro = await dados.emitir(modeloEscolhido);
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.documentos.emitidoComSucesso"));
    setAEmitir(false);
    setModeloEscolhido("");
  };

  const confirmarAssinatura = async () => {
    if (!documentoAAssinar) return;
    const erro = await dados.assinar(documentoAAssinar.id);
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.documentos.assinadoComSucesso"));
    setDocumentoAAssinar(null);
  };

  const fecharAnexar = () => {
    setDocumentoAAnexar(null);
    setFicheiroEscolhido(null);
    if (inputFicheiroRef.current) inputFicheiroRef.current.value = "";
  };

  const fecharCriarPorUpload = () => {
    setACriarPorUpload(false);
    setRascunhoUpload({ tipo: "contrato", titulo: "", vinculoId: "" });
  };

  const confirmarCriarPorUpload = async () => {
    if (!rascunhoUpload.titulo.trim()) return;
    const { documentoId, erro } = await dados.criarPorUpload({
      tipo: rascunhoUpload.tipo,
      titulo: rascunhoUpload.titulo.trim(),
      vinculoId: rascunhoUpload.vinculoId || null,
    });
    if (erro || !documentoId) {
      toast.error(erro ?? t("hr.documentos.erroAnexar"));
      return;
    }
    toast.success(t("hr.documentos.criarUploadComSucesso"));
    // Reaproveita o MESMO dialogo de anexar ficheiro que a emissao por
    // modelo ja usa -- o documento recem-criado esta em
    // a_aguardar_assinatura, o mesmo estado que esse dialogo exige.
    //
    // NAO procurar em dados.documentos: esse array e o valor capturado nesta
    // closure no render em que o botao foi clicado. criarPorUpload chama
    // load() por dentro, mas o setDocumentos(...) resultante so aparece num
    // RENDER FUTURO -- nunca muta o array ja capturado aqui. Procurar
    // documentoId nele resolve sempre para null (o documento ainda nao la
    // esta), o dialogo de anexar nao abre, e ninguem percebe porque. Construir
    // o objecto localmente, a partir do que ja se sabe: o id devolvido pela
    // RPC e os campos do rascunho escolhidos no dialogo anterior.
    const documentoNovo: PessoaDocumento = {
      id: documentoId,
      pessoa_id: pessoaId,
      organization_id: dados.documentos[0]?.organization_id ?? "",
      vinculo_id: rascunhoUpload.vinculoId || null,
      modelo_id: null,
      tipo: rascunhoUpload.tipo,
      titulo: rascunhoUpload.titulo.trim(),
      estado: "a_aguardar_assinatura",
      ficheiro_caminho: null,
      ficheiro_hash_sha256: null,
      ficheiro_anexado_em: null,
      emitido_em: null,
      emitido_por: null,
      assinado_em: null,
      assinatura_origem: null,
      anulado_em: null,
      anulado_motivo: null,
    };
    fecharCriarPorUpload();
    setDocumentoAAnexar(documentoNovo);
  };

  const confirmarAssinaturaExterna = async () => {
    if (!documentoAConfirmarExterna) return;
    const erro = await dados.registarAssinaturaExterna(documentoAConfirmarExterna.id);
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.documentos.assinaturaExternaComSucesso"));
    setDocumentoAConfirmarExterna(null);
  };

  const confirmarAnexo = async () => {
    if (!documentoAAnexar || !ficheiroEscolhido) return;
    const erro = await dados.anexarFicheiro(documentoAAnexar.id, ficheiroEscolhido);
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.documentos.anexadoComSucesso"));
    fecharAnexar();
  };

  const abrirFicheiro = async (documento: PessoaDocumento) => {
    setDocumentoAAbrirId(documento.id);
    // window.open TEM de acontecer AQUI, sincronamente dentro do gesto de
    // clique -- se esperar pelo await abaixo (padrao anterior), perde-se o
    // gesto do utilizador e os bloqueadores de popup (Safari e Firefox de
    // forma fiavel, Chrome com frequencia) bloqueiam a janela; window.open
    // devolve null SEM lancar, por isso o catch nunca corria -- o spinner
    // parava e mais nada, sem mensagem nenhuma. A janela abre em branco
    // AGORA e so recebe o URL (TTL de 60s) quando obterUrlFicheiro resolver;
    // fecha-se se a chamada falhar. Sem "noopener"/"noreferrer" no proprio
    // window.open -- com qualquer um dos dois, window.open devolve sempre
    // null (mesmo com sucesso), e este padrao depende de guardar a
    // referencia; a ligacao ao opener corta-se a seguir, explicitamente.
    const janela = window.open("about:blank", "_blank");
    if (!janela) {
      toast.error(t("hr.documentos.bloqueadorPopup"));
      setDocumentoAAbrirId(null);
      return;
    }
    janela.opener = null;
    try {
      const { url } = await dados.obterUrlFicheiro(documento.id);
      janela.location.href = url;
    } catch {
      janela.close();
      toast.error(t("hr.documentos.erroAbrirFicheiro"));
    } finally {
      setDocumentoAAbrirId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {t("hr.documentos.titulo")}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {podeEmitir && (
              <Button size="sm" onClick={() => setAEmitir(true)}>
                <FilePlus2 className="mr-2 h-4 w-4" />
                {t("hr.documentos.emitirNovo")}
              </Button>
            )}
            {podeCriarPorUpload && (
              <Button size="sm" variant="outline" onClick={() => setACriarPorUpload(true)}>
                <FileSignature className="mr-2 h-4 w-4" />
                {t("hr.documentos.anexarContratoAssinado")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {dados.documentos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("hr.documentos.semDocumentos")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("hr.documentos.coluna.titulo")}</TableHead>
                    <TableHead>{t("hr.documentos.coluna.tipo")}</TableHead>
                    <TableHead>{t("hr.documentos.coluna.estado")}</TableHead>
                    <TableHead>{t("hr.documentos.coluna.ficheiro")}</TableHead>
                    <TableHead>{t("hr.documentos.coluna.emitidoEm")}</TableHead>
                    <TableHead>{t("hr.documentos.coluna.assinadoEm")}</TableHead>
                    <TableHead className="text-right">
                      {t("hr.documentos.coluna.accoes")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.documentos.map((documento) => {
                    const podeVerConteudoDeste =
                      permissoes.conteudoView || (souAPessoa && documento.pessoa_id === pessoaId);
                    const podeAssinarEste =
                      souAPessoa && documento.estado === "a_aguardar_assinatura";
                    // Mesma ordem que a base impoe (rpc_hr_documento_anexar_ficheiro,
                    // 20261130065000): so se anexa antes de assinar, nunca depois.
                    const podeAnexarEste =
                      permissoes.edit && documento.estado === "a_aguardar_assinatura";
                    // Confirmar assinatura externa: a MESMA permissao que
                    // cria o documento por upload, e so depois de o
                    // ficheiro JA estar anexado -- a mesma ordem que
                    // rpc_hr_documento_registar_assinatura_externa impoe.
                    const podeConfirmarExternaEste =
                      podeCriarPorUpload &&
                      documento.estado === "a_aguardar_assinatura" &&
                      documento.ficheiro_caminho !== null;
                    const aAbrirEste = documentoAAbrirId === documento.id;
                    return (
                      <TableRow key={documento.id}>
                        <TableCell className="font-medium">{documento.titulo}</TableCell>
                        <TableCell>{t(`hr.tipoDocumentoRH.${documento.tipo}`)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant={VARIANTE_ESTADO[documento.estado]}
                              className="font-normal"
                            >
                              {t(`hr.estadoDocumentoRH.${documento.estado}`)}
                            </Badge>
                            {/* So faz sentido distinguir a origem depois de
                                assinado -- antes disso nao ha assinatura
                                nenhuma para atribuir a um caminho ou ao
                                outro. */}
                            {documento.estado === "assinado" && documento.assinatura_origem && (
                              <Badge variant="outline" className="font-normal text-muted-foreground">
                                {t(
                                  documento.assinatura_origem === "interna"
                                    ? "hr.documentos.origemInterna"
                                    : "hr.documentos.origemExterna",
                                )}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {documento.ficheiro_caminho ? (
                            <span
                              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                              title={
                                documento.ficheiro_hash_sha256
                                  ? t("hr.documentos.resumoGuardado")
                                  : undefined
                              }
                            >
                              <FileCheck className="h-3.5 w-3.5 text-emerald-600" />
                              {documento.ficheiro_hash_sha256
                                ? t("hr.documentos.resumoGuardado")
                                : t("hr.documentos.ficheiroAnexado")}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {t("hr.documentos.semFicheiro")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{formatarData(documento.emitido_em)}</TableCell>
                        <TableCell>{formatarData(documento.assinado_em)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            {podeVerConteudoDeste && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => abrirConteudo(documento)}
                              >
                                {t("hr.documentos.verConteudo")}
                              </Button>
                            )}
                            {podeVerConteudoDeste && documento.ficheiro_caminho && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={aAbrirEste}
                                onClick={() => abrirFicheiro(documento)}
                              >
                                {aAbrirEste ? (
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                {t("hr.documentos.abrirFicheiro")}
                              </Button>
                            )}
                            {podeAnexarEste && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDocumentoAAnexar(documento)}
                              >
                                <Paperclip className="mr-1.5 h-3.5 w-3.5" />
                                {t("hr.documentos.anexarFicheiro")}
                              </Button>
                            )}
                            {podeConfirmarExternaEste && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setDocumentoAConfirmarExterna(documento)}
                              >
                                <FileSignature className="mr-1.5 h-3.5 w-3.5" />
                                {t("hr.documentos.confirmarAssinaturaExterna")}
                              </Button>
                            )}
                            {podeAssinarEste && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setDocumentoAAssinar(documento)}
                              >
                                <PenLine className="mr-1.5 h-3.5 w-3.5" />
                                {t("hr.documentos.assinar")}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={aEmitir} onOpenChange={(aberto) => !aberto && setAEmitir(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("hr.documentos.emitirNovo")}</DialogTitle>
          </DialogHeader>
          <CampoSelect
            id="hr-documentos-modelo"
            label={t("hr.documentos.modelo")}
            valor={modeloEscolhido}
            opcoes={dados.modelos.map((modelo) => ({ value: modelo.id, label: modelo.nome }))}
            placeholder={t("hr.documentos.escolherModelo")}
            onChange={setModeloEscolhido}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAEmitir(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={!modeloEscolhido || dados.saving} onClick={confirmarEmissao}>
              {dados.saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("hr.documentos.emitir")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={documentoAVer !== null} onOpenChange={(aberto) => !aberto && fecharConteudo()}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{documentoAVer?.titulo}</DialogTitle>
          </DialogHeader>
          {aCarregarConteudo ? (
            <OlyviaLoader />
          ) : (
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              // O corpo vem do modelo de outra pessoa da mesma organizacao --
              // sanitizado antes de ir para o DOM, nunca confiado em bruto.
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(conteudo ?? ""),
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={documentoAAssinar !== null}
        onOpenChange={(aberto) => !aberto && setDocumentoAAssinar(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("hr.documentos.confirmarAssinaturaTitulo")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("hr.documentos.confirmarAssinaturaDescricao", {
              titulo: documentoAAssinar?.titulo ?? "",
            })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocumentoAAssinar(null)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={dados.saving} onClick={confirmarAssinatura}>
              {dados.saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("hr.documentos.confirmarAssinatura")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={documentoAAnexar !== null} onOpenChange={(aberto) => !aberto && fecharAnexar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("hr.documentos.confirmarAnexoTitulo")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("hr.documentos.confirmarAnexoDescricao", {
              titulo: documentoAAnexar?.titulo ?? "",
            })}
          </p>
          <input
            ref={inputFicheiroRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
            onChange={(evento) => setFicheiroEscolhido(evento.target.files?.[0] ?? null)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={fecharAnexar}>
              {t("common.cancel")}
            </Button>
            <Button disabled={!ficheiroEscolhido || dados.saving} onClick={confirmarAnexo}>
              {dados.saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("hr.documentos.anexar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Criar por upload: sem modelo, sem assinatura na app -- o primeiro
          passo do caminho de anexar um contrato ja assinado em papel. */}
      <Dialog
        open={aCriarPorUpload}
        onOpenChange={(aberto) => !aberto && fecharCriarPorUpload()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("hr.documentos.anexarContratoAssinadoTitulo")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <CampoSelect
              id="hr-documentos-upload-tipo"
              label={t("hr.documentos.coluna.tipo")}
              valor={rascunhoUpload.tipo}
              opcoes={TIPOS_DOCUMENTO_RH.map((tipo) => ({
                value: tipo,
                label: t(`hr.tipoDocumentoRH.${tipo}`),
              }))}
              onChange={(v) =>
                setRascunhoUpload((r) => ({ ...r, tipo: v as TipoDocumentoRH }))
              }
            />
            <CampoTexto
              id="hr-documentos-upload-titulo"
              label={t("hr.documentos.coluna.titulo")}
              valor={rascunhoUpload.titulo}
              onChange={(v) => setRascunhoUpload((r) => ({ ...r, titulo: v }))}
            />
            {vinculosOpcoes.length > 0 && (
              <CampoSelect
                id="hr-documentos-upload-vinculo"
                label={t("hr.form.seccoes.vinculo")}
                valor={rascunhoUpload.vinculoId}
                opcoes={vinculosOpcoes}
                vazioLabel={t("common.none")}
                placeholder={t("common.none")}
                onChange={(v) => setRascunhoUpload((r) => ({ ...r, vinculoId: v }))}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharCriarPorUpload}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!rascunhoUpload.titulo.trim() || dados.saving}
              onClick={confirmarCriarPorUpload}
            >
              {dados.saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("hr.documentos.anexarContratoAssinado")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar assinatura externa: fecha o ciclo, so depois de o
          ficheiro JA estar anexado -- a mesma ordem que a base impoe. */}
      <Dialog
        open={documentoAConfirmarExterna !== null}
        onOpenChange={(aberto) => !aberto && setDocumentoAConfirmarExterna(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("hr.documentos.confirmarAssinaturaExternaTitulo")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("hr.documentos.confirmarAssinaturaExternaDescricao", {
              titulo: documentoAConfirmarExterna?.titulo ?? "",
            })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocumentoAConfirmarExterna(null)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={dados.saving} onClick={confirmarAssinaturaExterna}>
              {dados.saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("hr.documentos.confirmarAssinaturaExterna")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
