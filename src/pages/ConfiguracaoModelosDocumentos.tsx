/**
 * Modelos de documento de RH -- lista, cria, edita e activa/desactiva
 * `pessoas_documentos_modelos` (20261123020000). Segue o padrao de
 * `ConfiguracaoAdmissao.tsx` para o gating e `ContractTemplates.tsx` para o
 * dialogo de editor.
 *
 * VARIAVEIS E CLAUSULAS (20261202020000)
 * -----------------------------------------
 * Desde 20261202020000, `{{token}}` E substituido do lado do servidor, dentro
 * de `rpc_hr_documento_emitir` -- por isso o popover de variaveis do
 * `RichTextEditor` volta a mostrar-se (`variables={CATALOGO_VARIAVEIS_RH...}`),
 * e ha um botao extra para colar uma clausula da biblioteca
 * (`SelectorClausulasRH`, insercao por COPIA, nao por referencia).
 *
 * O campo "variaveis" deixou de ser texto livre: `pessoas_documentos_modelos.variaveis`
 * passa a gravar os tokens DETECTADOS no corpo (`extrairTokensRH`), so leitura
 * no ecra -- ninguem escreve a mao uma lista que o corpo ja contem.
 *
 * A pre-visualizacao usa `DADOS_EXEMPLO_RH` (uma pessoa ficticia) e nunca a
 * pessoa real: o corpo substituido de verdade so existe do lado do servidor,
 * no momento de emitir.
 *
 * NUNCA SE APAGA -- SO SE (DES)ACTIVA
 * -------------------------------------
 * A RLS bloqueia DELETE por politica RESTRICTIVE; este ecra nem mostra a
 * opcao. "Desactivar" e "Reactivar" sao o UPDATE de `activo`.
 */
import { useMemo, useRef, useState } from "react";
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
import { RichTextEditor, type RichTextEditorHandle } from "@/components/RichTextEditor";
import { SelectorClausulasRH } from "@/components/hr/SelectorClausulasRH";
import { sanitizeRichHtml } from "@/utils/sanitize";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import {
  useModelosDocumentosRH,
  type ModeloDocumentoRH,
  type NovoModeloDocumentoRH,
} from "@/hooks/useModelosDocumentosRH";
import { TIPOS_DOCUMENTO_RH, type TipoDocumentoRH } from "@/types/hr";
import {
  CATALOGO_VARIAVEIS_RH,
  DADOS_EXEMPLO_RH,
  extrairTokensRH,
  tokensDesconhecidosRH,
  substituirVariaveisRH,
} from "@/utils/hr/variaveisDocumentoRH";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { FileText, Loader2, Plus, Pencil, Ban, RotateCcw, Eye, AlertTriangle } from "lucide-react";

const FORM_VAZIO: NovoModeloDocumentoRH = {
  nome: "",
  tipo: "contrato",
  corpo_html: "",
  variaveis: [],
};

/** As mesmas variaveis do catalogo, na forma `{key, label, description}` que
 *  o popover do `RichTextEditor` espera (`{{token}}` com chavetas). */
const VARIAVEIS_EDITOR = CATALOGO_VARIAVEIS_RH.map((v) => ({
  key: `{{${v.token}}}`,
  label: v.rotulo,
  description: v.grupo,
}));

export default function ConfiguracaoModelosDocumentos() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const podeVer = hasPermission("hr.pessoas.documentos.modelos.view");
  const podeEditar = hasPermission("hr.pessoas.documentos.modelos.edit");

  const { modelos, isLoading, isSaving, criar, editar, definirActivo } = useModelosDocumentosRH();
  const editorRef = useRef<RichTextEditorHandle>(null);

  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [modeloAEditar, setModeloAEditar] = useState<ModeloDocumentoRH | null>(null);
  const [form, setForm] = useState<NovoModeloDocumentoRH>(FORM_VAZIO);
  const [mostrarPreview, setMostrarPreview] = useState(false);

  const modelosVisiveis = useMemo(
    () => (mostrarInactivos ? modelos : modelos.filter((m) => m.activo)),
    [modelos, mostrarInactivos],
  );

  // So leitura -- derivados do corpo, nunca escritos a mao. Ver cabecalho.
  const tokensDetectados = useMemo(() => extrairTokensRH(form.corpo_html), [form.corpo_html]);
  const tokensFora = useMemo(() => tokensDesconhecidosRH(form.corpo_html), [form.corpo_html]);
  // Sanitizar SEMPRE antes do dangerouslySetInnerHTML -- mesma regra que
  // SelectorClausulasRH.tsx (sanitizeRichHtml) e PessoaDocumentosTab.tsx
  // (DOMPurify.sanitize) ja seguem para corpo_html vindo de outra fonte.
  const preview = useMemo(
    () => sanitizeRichHtml(substituirVariaveisRH(form.corpo_html, DADOS_EXEMPLO_RH, true)),
    [form.corpo_html],
  );

  const abrirNovo = () => {
    setModeloAEditar(null);
    setForm(FORM_VAZIO);
    setMostrarPreview(false);
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
    setMostrarPreview(false);
    setDialogoAberto(true);
  };

  const fecharDialogo = () => {
    setDialogoAberto(false);
    setModeloAEditar(null);
    setForm(FORM_VAZIO);
    setMostrarPreview(false);
  };

  const submeter = async () => {
    if (!form.nome.trim() || !form.corpo_html.trim()) return;
    try {
      // `variaveis` grava os tokens DETECTADOS no corpo agora, no momento de
      // gravar -- nao o que estava no form antes de mexer no corpo.
      const payload: NovoModeloDocumentoRH = { ...form, variaveis: extrairTokensRH(form.corpo_html) };
      if (modeloAEditar) {
        await editar({ ...payload, id: modeloAEditar.id });
        toast.success(t("hr.modelos.actualizarSucesso"));
      } else {
        await criar(payload);
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
              <div className="flex items-center justify-between">
                <Label>{t("hr.modelos.corpo")}</Label>
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
              {mostrarPreview ? (
                <div
                  className="rounded-lg border bg-background p-4 text-sm min-h-[220px] overflow-y-auto"
                  style={{ maxHeight: "300px" }}
                  dangerouslySetInnerHTML={{ __html: preview }}
                />
              ) : (
                <RichTextEditor
                  ref={editorRef}
                  value={form.corpo_html}
                  onChange={(v) => setForm((f) => ({ ...f, corpo_html: v }))}
                  variables={VARIAVEIS_EDITOR}
                  extraToolbarButtons={<SelectorClausulasRH editorRef={editorRef} />}
                  minHeight="300px"
                />
              )}
              {mostrarPreview && (
                <p className="text-xs text-muted-foreground">{t("hr.modelos.previewAjuda")}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>{t("hr.modelos.variaveis")}</Label>
              {tokensDetectados.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("hr.modelos.semVariaveisDetectadas")}</p>
              ) : (
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
