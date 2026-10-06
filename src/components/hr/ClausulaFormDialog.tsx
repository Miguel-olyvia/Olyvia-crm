/**
 * Dialogo de criar/editar uma clausula de documento de RH
 * (`pessoas_documentos_clausulas`). Partilhado: vive dentro do editor do modelo
 * (`SelectorClausulasRH`), onde as clausulas se gerem desde que o ecra proprio
 * foi retirado.
 *
 * EDITAR NAO ACTUALIZA QUEM JA A COLOU
 * ---------------------------------------
 * Corrigir o texto aqui nao muda os modelos onde a clausula ja foi inserida
 * por copia -- o aviso fica escrito no dialogo, nao escondido.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useTranslation } from "@/hooks/useTranslation";
import {
  useClausulasDocumentosRH,
  type ClausulaDocumentoRH,
  type NovaClausulaDocumentoRH,
} from "@/hooks/useClausulasDocumentosRH";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";

interface ClausulaFormDialogProps {
  aberto: boolean;
  /** Clausula a editar; `null` para criar uma nova. */
  clausula: ClausulaDocumentoRH | null;
  /** Corpo inicial ao criar (ex.: texto seleccionado no editor do modelo). */
  corpoInicial?: string;
  onFechar: () => void;
}

function formInicial(clausula: ClausulaDocumentoRH | null, corpoInicial?: string): NovaClausulaDocumentoRH {
  if (clausula) {
    return { nome: clausula.nome, categoria: clausula.categoria ?? "", corpo_html: clausula.corpo_html };
  }
  return { nome: "", categoria: "", corpo_html: corpoInicial ?? "" };
}

export function ClausulaFormDialog({ aberto, clausula, corpoInicial, onFechar }: ClausulaFormDialogProps) {
  const { t } = useTranslation();
  const { isSaving, criar, editar } = useClausulasDocumentosRH();
  const [form, setForm] = useState<NovaClausulaDocumentoRH>(() => formInicial(clausula, corpoInicial));

  useEffect(() => {
    if (aberto) setForm(formInicial(clausula, corpoInicial));
  }, [aberto, clausula, corpoInicial]);

  const submeter = async () => {
    if (!form.nome.trim() || !form.corpo_html.trim()) return;
    try {
      const payload: NovaClausulaDocumentoRH = {
        nome: form.nome,
        categoria: form.categoria?.trim() ? form.categoria.trim() : null,
        corpo_html: form.corpo_html,
      };
      if (clausula) {
        await editar({ ...payload, id: clausula.id });
        toast.success(t("hr.clausulas.actualizarSucesso"));
      } else {
        await criar(payload);
        toast.success(t("hr.clausulas.criarSucesso"));
      }
      onFechar();
    } catch (erro) {
      toast.error(await getFriendlyErrorMessage(erro));
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {clausula
              ? `${t("hr.clausulas.editarClausula")} — "${clausula.nome}"`
              : t("hr.clausulas.novaClausula")}
          </DialogTitle>
          <DialogDescription>{t("hr.clausulas.subtitulo")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="clausula-nome">{t("hr.clausulas.coluna.nome")}</Label>
              <Input
                id="clausula-nome"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clausula-categoria">{t("hr.clausulas.coluna.categoria")}</Label>
              <Input
                id="clausula-categoria"
                value={form.categoria ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                placeholder={t("hr.clausulas.categoriaPlaceholder")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("hr.clausulas.corpo")}</Label>
            <RichTextEditor
              value={form.corpo_html}
              onChange={(v) => setForm((f) => ({ ...f, corpo_html: v }))}
              variables={[]}
              minHeight="220px"
            />
          </div>

          <p className="text-xs text-muted-foreground">{t("hr.clausulas.avisoCopia")}</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onFechar}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={submeter}
            disabled={isSaving || !form.nome.trim() || !form.corpo_html.trim()}
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {clausula ? t("common.save") : t("hr.clausulas.novaClausula")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
