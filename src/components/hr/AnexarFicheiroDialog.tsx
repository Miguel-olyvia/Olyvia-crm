/**
 * O dialogo de anexar um ficheiro a um documento em `a_aguardar_assinatura`.
 *
 * REAPROVEITADO POR DOIS PONTOS DE ENTRADA
 * -------------------------------------------
 * (1) A tabela de `PessoaDocumentosTab` -- o botao "Anexar ficheiro" de uma
 * linha, para QUALQUER documento ja existente (emitido por modelo ou por
 * upload) que esteja `a_aguardar_assinatura` (a mesma ordem que
 * `rpc_hr_documento_anexar_ficheiro`, 20261130065000, impoe: so se anexa
 * antes de assinar). (2) `AnexarContratoAssinadoDialog`, no segundo passo do
 * fluxo de "Anexar contrato ja assinado" -- o documento chega aqui recem
 * criado, construido localmente (ver o cabecalho desse ficheiro).
 *
 * Extraido para nao duplicar esta logica (upload, validacao, mensagens de
 * erro) nos dois sitios -- so a ORIGEM do `documento` muda.
 */
import { useRef, useState } from "react";
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
import type { PessoaDocumento } from "@/types/hr";

export interface AnexarFicheiroDialogProps {
  /** `null` fecha o dialogo -- o mesmo padrao dos outros dialogos deste modulo. */
  documento: PessoaDocumento | null;
  onOpenChange: (open: boolean) => void;
  anexarFicheiro: (documentoId: string, ficheiro: File) => Promise<string | null>;
  saving: boolean;
}

export function AnexarFicheiroDialog({
  documento,
  onOpenChange,
  anexarFicheiro,
  saving,
}: AnexarFicheiroDialogProps) {
  const { t } = useTranslation();
  const [ficheiroEscolhido, setFicheiroEscolhido] = useState<File | null>(null);
  const inputFicheiroRef = useRef<HTMLInputElement>(null);

  const fechar = () => {
    onOpenChange(false);
    // NUNCA fica em estado alem do dialogo que o mostrou.
    setFicheiroEscolhido(null);
    if (inputFicheiroRef.current) inputFicheiroRef.current.value = "";
  };

  const confirmar = async () => {
    if (!documento || !ficheiroEscolhido) return;
    const erro = await anexarFicheiro(documento.id, ficheiroEscolhido);
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.documentos.anexadoComSucesso"));
    fechar();
  };

  return (
    <Dialog open={documento !== null} onOpenChange={(aberto) => !aberto && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("hr.documentos.confirmarAnexoTitulo")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("hr.documentos.confirmarAnexoDescricao", {
            titulo: documento?.titulo ?? "",
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
          <Button variant="outline" onClick={fechar}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!ficheiroEscolhido || saving} onClick={confirmar}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("hr.documentos.anexar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
