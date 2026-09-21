/**
 * "Inserir documento" -- ponto de entrada UNICO para criar um documento novo
 * na ficha da pessoa, com dois modos (20261202060000-ui):
 *
 *  - "A partir de um modelo": o antigo dialogo de `aEmitir` em
 *    `PessoaDocumentosTab` -- escolhe um modelo, `emitir(modeloId)` substitui
 *    as variaveis no servidor. Ganhou aqui uma pre-visualizacao com
 *    `DADOS_EXEMPLO_RH` (dados de amostra, NUNCA a pessoa real -- essa
 *    substituicao so existe dentro de `rpc_hr_documento_emitir`), o mesmo
 *    padrao de `ConfiguracaoModelosDocumentos.tsx`.
 *  - "Anexar ficheiro": o antigo `AnexarContratoAssinadoDialog` (passo 1:
 *    tipo/titulo/vinculo, `criarPorUpload`; passo 2: reaproveita
 *    `AnexarFicheiroDialog`, sem duplicar essa logica). Copiado para aqui e
 *    NAO importado de `AnexarContratoAssinadoDialog` -- esse componente
 *    continua vivo, mas so para o separador Contratos (`PessoaContratoTab`),
 *    um ponto de entrada que este ficheiro nao toca.
 *
 * Cada modo so aparece se a permissao correspondente (`podeEmitir`/
 * `podeCriarPorUpload`) o permitir -- com so uma das duas, nao ha tabs, so o
 * formulario desse modo.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Eye, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import { AnexarFicheiroDialog } from "@/components/hr/AnexarFicheiroDialog";
import { sanitizeRichHtml } from "@/utils/sanitize";
import {
  DADOS_EXEMPLO_RH,
  extrairTokensRH,
  substituirVariaveisRH,
  tokensDesconhecidosRH,
} from "@/utils/hr/variaveisDocumentoRH";
import {
  TIPOS_DOCUMENTO_RH,
  type PessoaDocumento,
  type PessoaDocumentoModelo,
  type TipoDocumentoRH,
} from "@/types/hr";
import type { OpcaoVinculoDocumento } from "@/components/hr/AnexarContratoAssinadoDialog";

type ModoInserirDocumento = "modelo" | "anexar";

export interface InserirDocumentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pessoaId: string;
  organizationId: string;
  vinculosOpcoes?: OpcaoVinculoDocumento[];
  modelos: PessoaDocumentoModelo[];
  podeEmitir: boolean;
  podeCriarPorUpload: boolean;
  /**
   * Pre-seleccionar o tipo no modo "anexar ficheiro" -- usado pelo atalho
   * "Criar aditamento" em `PessoaContratoTab.tsx`, que abre este dialogo com
   * `'adenda'` em vez do "contrato" por omissao. So afecta o modo de anexar:
   * o modo "a partir de um modelo" nao filtra modelos por tipo.
   */
  tipoInicial?: TipoDocumentoRH;
  emitir: (modeloId: string) => Promise<string | null>;
  criarPorUpload: (args: {
    tipo: TipoDocumentoRH;
    titulo: string;
    vinculoId: string | null;
  }) => Promise<{ documentoId: string | null; erro: string | null }>;
  anexarFicheiro: (documentoId: string, ficheiro: File) => Promise<string | null>;
  saving: boolean;
}

const RASCUNHO_UPLOAD_VAZIO = { tipo: "contrato" as TipoDocumentoRH, titulo: "", vinculoId: "" };

export function InserirDocumentoDialog({
  open,
  onOpenChange,
  pessoaId,
  organizationId,
  vinculosOpcoes = [],
  modelos,
  podeEmitir,
  podeCriarPorUpload,
  tipoInicial,
  emitir,
  criarPorUpload,
  anexarFicheiro,
  saving,
}: InserirDocumentoDialogProps) {
  const { t } = useTranslation();

  // So mostra tabs quando as DUAS permissoes estao activas -- com so uma,
  // nao ha nada para escolher.
  const modoInicial: ModoInserirDocumento = podeEmitir ? "modelo" : "anexar";
  const [modo, setModo] = useState<ModoInserirDocumento>(modoInicial);

  // -- Modo "a partir de um modelo" -----------------------------------------
  const [modeloEscolhido, setModeloEscolhido] = useState("");
  const [mostrarPreview, setMostrarPreview] = useState(false);

  const modeloSeleccionado = useMemo(
    () => modelos.find((m) => m.id === modeloEscolhido) ?? null,
    [modelos, modeloEscolhido],
  );
  const tokensDetectados = useMemo(
    () => (modeloSeleccionado ? extrairTokensRH(modeloSeleccionado.corpo_html) : []),
    [modeloSeleccionado],
  );
  const tokensFora = useMemo(
    () => (modeloSeleccionado ? tokensDesconhecidosRH(modeloSeleccionado.corpo_html) : []),
    [modeloSeleccionado],
  );
  const preview = useMemo(
    () =>
      modeloSeleccionado
        ? sanitizeRichHtml(substituirVariaveisRH(modeloSeleccionado.corpo_html, DADOS_EXEMPLO_RH, true))
        : "",
    [modeloSeleccionado],
  );

  // -- Modo "anexar ficheiro" ------------------------------------------------
  const rascunhoUploadVazio = tipoInicial
    ? { ...RASCUNHO_UPLOAD_VAZIO, tipo: tipoInicial }
    : RASCUNHO_UPLOAD_VAZIO;
  const [rascunhoUpload, setRascunhoUpload] = useState<{
    tipo: TipoDocumentoRH;
    titulo: string;
    vinculoId: string;
  }>(rascunhoUploadVazio);
  const [documentoParaAnexar, setDocumentoParaAnexar] = useState<PessoaDocumento | null>(null);

  const fechar = () => {
    onOpenChange(false);
    setModeloEscolhido("");
    setMostrarPreview(false);
    setRascunhoUpload(rascunhoUploadVazio);
    setModo(modoInicial);
  };

  const confirmarEmissao = async () => {
    if (!modeloEscolhido) return;
    const erro = await emitir(modeloEscolhido);
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.documentos.emitidoComSucesso"));
    fechar();
  };

  const confirmarCriarPorUpload = async () => {
    if (!rascunhoUpload.titulo.trim()) return;
    const { documentoId, erro } = await criarPorUpload({
      tipo: rascunhoUpload.tipo,
      titulo: rascunhoUpload.titulo.trim(),
      vinculoId: rascunhoUpload.vinculoId || null,
    });
    if (erro || !documentoId) {
      toast.error(erro ?? t("hr.documentos.erroAnexar"));
      return;
    }
    toast.success(t("hr.documentos.criarUploadComSucesso"));
    // NAO procurar o documento novo numa lista qualquer -- construido
    // localmente a partir do id devolvido pela RPC e do que ja se sabe do
    // rascunho, tal como `AnexarContratoAssinadoDialog` ja fazia.
    const documentoNovo: PessoaDocumento = {
      id: documentoId,
      pessoa_id: pessoaId,
      organization_id: organizationId,
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
    fechar();
    setDocumentoParaAnexar(documentoNovo);
  };

  const conteudoModelo = (
    <div className="space-y-4">
      <CampoSelect
        id="hr-documentos-modelo"
        label={t("hr.documentos.modelo")}
        valor={modeloEscolhido}
        opcoes={modelos.map((modelo) => ({ value: modelo.id, label: modelo.nome }))}
        placeholder={t("hr.documentos.escolherModelo")}
        onChange={(v) => {
          setModeloEscolhido(v);
          setMostrarPreview(false);
        }}
      />
      {modeloSeleccionado && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("hr.modelos.corpo")}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setMostrarPreview((v) => !v)}
            >
              <Eye className="h-3.5 w-3.5" />
              {mostrarPreview ? t("hr.modelos.ocultarPreview") : t("hr.modelos.verPreview")}
            </Button>
          </div>
          {mostrarPreview && (
            <>
              <div
                className="rounded-lg border bg-background p-4 text-sm min-h-[120px] overflow-y-auto"
                style={{ maxHeight: "300px" }}
                dangerouslySetInnerHTML={{ __html: preview }}
              />
              <p className="text-xs text-muted-foreground">{t("hr.modelos.previewAjuda")}</p>
            </>
          )}
          {tokensDetectados.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tokensDetectados.map((token) => (
                <Badge
                  key={token}
                  variant={tokensFora.includes(token) ? "destructive" : "secondary"}
                  className="font-mono text-[10px]"
                  title={tokensFora.includes(token) ? t("hr.modelos.variavelDesconhecidaAjuda") : undefined}
                >
                  {tokensFora.includes(token) && <AlertTriangle className="h-3 w-3 mr-1" />}
                  {`{{${token}}}`}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const conteudoAnexar = (
    <div className="space-y-4">
      <CampoSelect
        id="hr-documentos-upload-tipo"
        label={t("hr.documentos.coluna.tipo")}
        valor={rascunhoUpload.tipo}
        opcoes={TIPOS_DOCUMENTO_RH.map((tipo) => ({
          value: tipo,
          label: t(`hr.tipoDocumentoRH.${tipo}`),
        }))}
        onChange={(v) => setRascunhoUpload((r) => ({ ...r, tipo: v as TipoDocumentoRH }))}
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
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(aberto) => !aberto && fechar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("hr.documentos.inserirDocumento")}</DialogTitle>
          </DialogHeader>

          {podeEmitir && podeCriarPorUpload ? (
            <Tabs value={modo} onValueChange={(v) => setModo(v as ModoInserirDocumento)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="modelo">{t("hr.documentos.modoModelo")}</TabsTrigger>
                <TabsTrigger value="anexar">{t("hr.documentos.modoAnexar")}</TabsTrigger>
              </TabsList>
              <TabsContent value="modelo" className="pt-4">
                {conteudoModelo}
              </TabsContent>
              <TabsContent value="anexar" className="pt-4">
                {conteudoAnexar}
              </TabsContent>
            </Tabs>
          ) : podeEmitir ? (
            conteudoModelo
          ) : (
            conteudoAnexar
          )}

          <DialogFooter>
            <Button variant="outline" onClick={fechar}>
              {t("common.cancel")}
            </Button>
            {modo === "modelo" ? (
              <Button disabled={!modeloEscolhido || saving} onClick={confirmarEmissao}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("hr.documentos.emitir")}
              </Button>
            ) : (
              <Button disabled={!rascunhoUpload.titulo.trim() || saving} onClick={confirmarCriarPorUpload}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("hr.documentos.modoAnexar")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AnexarFicheiroDialog
        documento={documentoParaAnexar}
        onOpenChange={(aberto) => !aberto && setDocumentoParaAnexar(null)}
        anexarFicheiro={anexarFicheiro}
        saving={saving}
      />
    </>
  );
}
