/**
 * Modelos de documento de RH -- lista, cria, edita e activa/desactiva
 * `pessoas_documentos_modelos` (20261123020000). Segue o padrao de
 * `ConfiguracaoAdmissao.tsx` para o gating e `ContractTemplates.tsx` para o
 * dialogo de editor, simplificado: sem preview, sem variaveis clicaveis (nao
 * ha substituicao de variaveis do lado do servidor para RH -- ver a nota no
 * cabecalho de `useModelosDocumentosRH.ts`).
 *
 * O CORPO USA `RichTextEditor` SEM VARIAVEIS
 * -------------------------------------------
 * `RichTextEditor` da formatacao (negrito, listas, alinhamento) util num
 * contrato ou declaracao -- mais do que um textarea simples ofereceria. O
 * popover de "inserir variavel" fica FORA (passa-se `variables={[]}`): como
 * `{{...}}` nao e substituido em lado nenhum para RH, mostrar esse botao
 * sugeria uma funcionalidade que nao existe.
 *
 * NUNCA SE APAGA -- SO SE (DES)ACTIVA
 * -------------------------------------
 * A RLS bloqueia DELETE por politica RESTRICTIVE; este ecra nem mostra a
 * opcao. "Desactivar" e "Reactivar" sao o UPDATE de `activo`.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import {
  useModelosDocumentosRH,
  type ModeloDocumentoRH,
  type NovoModeloDocumentoRH,
} from "@/hooks/useModelosDocumentosRH";
import { TIPOS_DOCUMENTO_RH, type TipoDocumentoRH } from "@/types/hr";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { FileText, Loader2, Plus, Pencil, Ban, RotateCcw } from "lucide-react";

const FORM_VAZIO: NovoModeloDocumentoRH = {
  nome: "",
  tipo: "contrato",
  corpo_html: "",
  variaveis: [],
};

/** `variaveis` mostra-se como texto separado por virgulas -- e so uma nota
 *  documental, sem validacao de formato nenhuma. */
function variaveisParaTexto(variaveis: string[]): string {
  return variaveis.join(", ");
}
function textoParaVariaveis(texto: string): string[] {
  return texto
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function ConfiguracaoModelosDocumentos() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const podeVer = hasPermission("hr.pessoas.documentos.modelos.view");
  const podeEditar = hasPermission("hr.pessoas.documentos.modelos.edit");

  const { modelos, isLoading, isSaving, criar, editar, definirActivo } = useModelosDocumentosRH();

  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [modeloAEditar, setModeloAEditar] = useState<ModeloDocumentoRH | null>(null);
  const [form, setForm] = useState<NovoModeloDocumentoRH>(FORM_VAZIO);

  const modelosVisiveis = useMemo(
    () => (mostrarInactivos ? modelos : modelos.filter((m) => m.activo)),
    [modelos, mostrarInactivos],
  );

  const abrirNovo = () => {
    setModeloAEditar(null);
    setForm(FORM_VAZIO);
    setDialogoAberto(true);
  };

  const abrirEdicao = (modelo: ModeloDocumentoRH) => {
    setModeloAEditar(modelo);
    setForm({
      nome: modelo.nome,
      tipo: modelo.tipo,
      corpo_html: modelo.corpo_html,
      variaveis: modelo.variaveis,
    });
    setDialogoAberto(true);
  };

  const fecharDialogo = () => {
    setDialogoAberto(false);
    setModeloAEditar(null);
    setForm(FORM_VAZIO);
  };

  const submeter = async () => {
    if (!form.nome.trim() || !form.corpo_html.trim()) return;
    try {
      if (modeloAEditar) {
        await editar({ ...form, id: modeloAEditar.id });
        toast.success(t("hr.modelos.actualizarSucesso"));
      } else {
        await criar(form);
        toast.success(t("hr.modelos.criarSucesso"));
      }
      fecharDialogo();
    } catch (erro) {
      toast.error(await getFriendlyErrorMessage(erro));
    }
  };

  const alternarActivo = async (modelo: ModeloDocumentoRH) => {
    try {
      await definirActivo(modelo.id, !modelo.activo);
      toast.success(modelo.activo ? t("hr.modelos.desactivarSucesso") : t("hr.modelos.reactivarSucesso"));
    } catch (erro) {
      toast.error(await getFriendlyErrorMessage(erro));
    }
  };

  if (companyLoading || permissionsLoading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;
  if (!podeVer) return <SemAcessoCard className="m-6" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("hr.modelos.tituloPagina")}</h1>
          <p className="text-muted-foreground">{t("hr.modelos.subtitulo")}</p>
        </div>
        {podeEditar && (
          <Button onClick={abrirNovo}>
            <Plus className="h-4 w-4 mr-2" /> {t("hr.modelos.novoModelo")}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("hr.modelos.tituloPagina")}</CardTitle>
          <div className="flex items-center gap-2">
            <Switch
              id="mostrar-inactivos"
              checked={mostrarInactivos}
              onCheckedChange={setMostrarInactivos}
            />
            <Label htmlFor="mostrar-inactivos" className="text-sm font-normal">
              {t("hr.modelos.mostrarInactivos")}
            </Label>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <OlyviaLoader size={32} />
            </div>
          ) : modelosVisiveis.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>{t("hr.modelos.semModelos")}</p>
            </div>
          ) : (
            modelosVisiveis.map((modelo) => (
              <div
                key={modelo.id}
                className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{modelo.nome}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {t(`hr.tipoDocumentoRH.${modelo.tipo}`)}
                      </Badge>
                      <Badge variant={modelo.activo ? "default" : "secondary"} className="text-[10px]">
                        {modelo.activo ? t("hr.modelos.activo") : t("hr.modelos.inactivo")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("hr.modelos.ultimaActualizacao")}:{" "}
                      {new Date(modelo.updated_at).toLocaleDateString("pt-PT")}
                    </p>
                  </div>
                </div>
                {podeEditar && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => abrirEdicao(modelo)}
                      title={t("hr.modelos.editarModelo")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => alternarActivo(modelo)}
                      title={modelo.activo ? t("hr.modelos.desactivar") : t("hr.modelos.reactivar")}
                    >
                      {modelo.activo ? (
                        <Ban className="h-4 w-4 text-destructive" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogoAberto} onOpenChange={(open) => !open && fecharDialogo()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {modeloAEditar
                ? `${t("hr.modelos.editarModelo")} — "${modeloAEditar.nome}"`
                : t("hr.modelos.novoModelo")}
            </DialogTitle>
            <DialogDescription>{t("hr.modelos.subtitulo")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="modelo-nome">{t("hr.documentos.coluna.titulo")}</Label>
                <Input
                  id="modelo-nome"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="modelo-tipo">{t("hr.documentos.coluna.tipo")}</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as TipoDocumentoRH }))}
                >
                  <SelectTrigger id="modelo-tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_DOCUMENTO_RH.map((tipo) => (
                      <SelectItem key={tipo} value={tipo}>
                        {t(`hr.tipoDocumentoRH.${tipo}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("hr.modelos.corpo")}</Label>
              <RichTextEditor
                value={form.corpo_html}
                onChange={(v) => setForm((f) => ({ ...f, corpo_html: v }))}
                variables={[]}
                minHeight="300px"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="modelo-variaveis">{t("hr.modelos.variaveis")}</Label>
              <Input
                id="modelo-variaveis"
                value={variaveisParaTexto(form.variaveis)}
                onChange={(e) => setForm((f) => ({ ...f, variaveis: textoParaVariaveis(e.target.value) }))}
                placeholder="nome_completo, retribuicao_valor"
              />
              <p className="text-xs text-muted-foreground">{t("hr.modelos.variaveisAjuda")}</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={fecharDialogo}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={submeter}
              disabled={isSaving || !form.nome.trim() || !form.corpo_html.trim()}
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {modeloAEditar ? t("common.save") : t("hr.modelos.novoModelo")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
