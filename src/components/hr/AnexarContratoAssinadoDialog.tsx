/**
 * "Anexar contrato ja assinado" -- o segundo caminho de criar um documento
 * (20261201070000): sem modelo e sem assinatura dentro da app, para um
 * contrato ja assinado em papel fora do sistema.
 *
 * DOIS PONTOS DE ENTRADA, UM SO COMPONENTE
 * -------------------------------------------
 * Extraido de `PessoaDocumentosTab` para ser reaproveitado TAMBEM pelo
 * separador Contratos (`PessoaContratoTab`) -- e a mesma accao, "criar um
 * documento novo para esta pessoa", so que o utilizador chega a ela por dois
 * sitios da ficha. Quem chama fornece `pessoaId`/`organizationId`/
 * `vinculosOpcoes` e os callbacks de `usePessoaDocumentos`
 * (`criarPorUpload`/`anexarFicheiro`/`saving`) -- nenhuma logica de permissao
 * vive aqui, so o fluxo dos dois passos. O resto do modulo de documentos
 * (assinar, ver conteudo, confirmar assinatura externa, a listagem) continua
 * SO em `PessoaDocumentosTab` -- este componente e so o ATALHO de criacao.
 *
 * DOIS PASSOS
 * -----------
 * Passo 1 (este dialogo): tipo/titulo/vinculo, cria a linha sem modelo via
 * `criarPorUpload`. Passo 2: reaproveita `AnexarFicheiroDialog` -- o MESMO
 * componente que a tabela de Documentos usa para anexar um ficheiro a
 * qualquer documento `a_aguardar_assinatura` -- com o documento recem
 * criado, construido localmente a partir do id devolvido pela RPC e do
 * rascunho preenchido no passo 1: o array de documentos de quem chama ainda
 * NAO o tem nesse instante, porque `load()` (dentro de `criarPorUpload`) so
 * resolve num render futuro.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import { AnexarFicheiroDialog } from "@/components/hr/AnexarFicheiroDialog";
import { TIPOS_DOCUMENTO_RH, type PessoaDocumento, type TipoDocumentoRH } from "@/types/hr";

export interface OpcaoVinculoDocumento {
  value: string;
  label: string;
}

export interface AnexarContratoAssinadoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pessoaId: string;
  organizationId: string;
  /** Vinculos desta pessoa, para o selector opcional do dialogo. */
  vinculosOpcoes?: OpcaoVinculoDocumento[];
  criarPorUpload: (args: {
    tipo: TipoDocumentoRH;
    titulo: string;
    vinculoId: string | null;
  }) => Promise<{ documentoId: string | null; erro: string | null }>;
  anexarFicheiro: (documentoId: string, ficheiro: File) => Promise<string | null>;
  saving: boolean;
}

const RASCUNHO_VAZIO = { tipo: "contrato" as TipoDocumentoRH, titulo: "", vinculoId: "" };

export function AnexarContratoAssinadoDialog({
  open,
  onOpenChange,
  pessoaId,
  organizationId,
  vinculosOpcoes = [],
  criarPorUpload,
  anexarFicheiro,
  saving,
}: AnexarContratoAssinadoDialogProps) {
  const { t } = useTranslation();
  const [rascunho, setRascunho] = useState<{
    tipo: TipoDocumentoRH;
    titulo: string;
    vinculoId: string;
  }>(RASCUNHO_VAZIO);
  const [documentoParaAnexar, setDocumentoParaAnexar] = useState<PessoaDocumento | null>(null);

  const fechar = () => {
    onOpenChange(false);
    setRascunho(RASCUNHO_VAZIO);
  };

  const confirmarCriar = async () => {
    if (!rascunho.titulo.trim()) return;
    const { documentoId, erro } = await criarPorUpload({
      tipo: rascunho.tipo,
      titulo: rascunho.titulo.trim(),
      vinculoId: rascunho.vinculoId || null,
    });
    if (erro || !documentoId) {
      toast.error(erro ?? t("hr.documentos.erroAnexar"));
      return;
    }
    toast.success(t("hr.documentos.criarUploadComSucesso"));
    // NAO procurar o documento novo numa lista qualquer -- ver o cabecalho
    // deste ficheiro. Construir localmente a partir do id devolvido pela RPC
    // e do que ja se sabe do rascunho.
    const documentoNovo: PessoaDocumento = {
      id: documentoId,
      pessoa_id: pessoaId,
      organization_id: organizationId,
      vinculo_id: rascunho.vinculoId || null,
      modelo_id: null,
      tipo: rascunho.tipo,
      titulo: rascunho.titulo.trim(),
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

  return (
    <>
      <Dialog open={open} onOpenChange={(aberto) => !aberto && fechar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("hr.documentos.anexarContratoAssinadoTitulo")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <CampoSelect
              id="hr-documentos-upload-tipo"
              label={t("hr.documentos.coluna.tipo")}
              valor={rascunho.tipo}
              opcoes={TIPOS_DOCUMENTO_RH.map((tipo) => ({
                value: tipo,
                label: t(`hr.tipoDocumentoRH.${tipo}`),
              }))}
              onChange={(v) => setRascunho((r) => ({ ...r, tipo: v as TipoDocumentoRH }))}
            />
            <CampoTexto
              id="hr-documentos-upload-titulo"
              label={t("hr.documentos.coluna.titulo")}
              valor={rascunho.titulo}
              onChange={(v) => setRascunho((r) => ({ ...r, titulo: v }))}
            />
            {vinculosOpcoes.length > 0 && (
              <CampoSelect
                id="hr-documentos-upload-vinculo"
                label={t("hr.form.seccoes.vinculo")}
                valor={rascunho.vinculoId}
                opcoes={vinculosOpcoes}
                vazioLabel={t("common.none")}
                placeholder={t("common.none")}
                onChange={(v) => setRascunho((r) => ({ ...r, vinculoId: v }))}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fechar}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!rascunho.titulo.trim() || saving}
              onClick={confirmarCriar}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("hr.documentos.anexarContratoAssinado")}
            </Button>
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
