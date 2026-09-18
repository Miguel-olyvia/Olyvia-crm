/**
 * Clausulas de documento de RH -- lista, cria, edita e activa/desactiva
 * `pessoas_documentos_clausulas` (20261202010000). Mesmo padrao de
 * `ConfiguracaoModelosDocumentos.tsx`, com "categoria" em vez de "tipo" e sem
 * o Select de dominio fechado (categoria e texto livre, so agrupamento).
 *
 * NUNCA SE APAGA -- SO SE (DES)ACTIVA
 * -------------------------------------
 * A RLS bloqueia DELETE por politica RESTRICTIVE; este ecra nem mostra a
 * opcao. Uma clausula pode ja estar colada (por copia) dentro de modelos
 * existentes -- apagar a linha nao apagaria esse texto, so perderia a
 * explicacao de onde veio.
 *
 * EDITAR NAO ACTUALIZA QUEM JA A COLOU
 * ---------------------------------------
 * Corrigir o texto aqui nao muda os modelos onde a clausula ja foi inserida
 * por copia -- o aviso fica escrito no dialogo, nao escondido.
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
import { RichTextEditor } from "@/components/RichTextEditor";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import {
  useClausulasDocumentosRH,
  type ClausulaDocumentoRH,
  type NovaClausulaDocumentoRH,
} from "@/hooks/useClausulasDocumentosRH";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { BookText, Loader2, Plus, Pencil, Ban, RotateCcw } from "lucide-react";

const FORM_VAZIO: NovaClausulaDocumentoRH = {
  nome: "",
  categoria: "",
  corpo_html: "",
};

export default function ConfiguracaoClausulasDocumentos() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  // Mesmas permissoes dos modelos, de proposito -- ver cabecalho do hook.
  const podeVer = hasPermission("hr.pessoas.documentos.modelos.view");
  const podeEditar = hasPermission("hr.pessoas.documentos.modelos.edit");

  const { clausulas, isLoading, isSaving, criar, editar, definirActivo } = useClausulasDocumentosRH();

  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [clausulaAEditar, setClausulaAEditar] = useState<ClausulaDocumentoRH | null>(null);
  const [form, setForm] = useState<NovaClausulaDocumentoRH>(FORM_VAZIO);

  const clausulasVisiveis = useMemo(
    () => (mostrarInactivas ? clausulas : clausulas.filter((c) => c.activo)),
    [clausulas, mostrarInactivas],
  );

  const abrirNova = () => {
    setClausulaAEditar(null);
    setForm(FORM_VAZIO);
    setDialogoAberto(true);
  };

  const abrirEdicao = (clausula: ClausulaDocumentoRH) => {
    setClausulaAEditar(clausula);
    setForm({
      nome: clausula.nome,
      categoria: clausula.categoria ?? "",
      corpo_html: clausula.corpo_html,
    });
    setDialogoAberto(true);
  };

  const fecharDialogo = () => {
    setDialogoAberto(false);
    setClausulaAEditar(null);
    setForm(FORM_VAZIO);
  };

  const submeter = async () => {
    if (!form.nome.trim() || !form.corpo_html.trim()) return;
    try {
      const payload: NovaClausulaDocumentoRH = {
        nome: form.nome,
        categoria: form.categoria?.trim() ? form.categoria.trim() : null,
        corpo_html: form.corpo_html,
      };
      if (clausulaAEditar) {
        await editar({ ...payload, id: clausulaAEditar.id });
        toast.success(t("hr.clausulas.actualizarSucesso"));
      } else {
        await criar(payload);
        toast.success(t("hr.clausulas.criarSucesso"));
      }
      fecharDialogo();
    } catch (erro) {
      toast.error(await getFriendlyErrorMessage(erro));
    }
  };

  const alternarActivo = async (clausula: ClausulaDocumentoRH) => {
    try {
      await definirActivo(clausula.id, !clausula.activo);
      toast.success(clausula.activo ? t("hr.clausulas.desactivarSucesso") : t("hr.clausulas.reactivarSucesso"));
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
          <h1 className="text-2xl font-bold">{t("hr.clausulas.tituloPagina")}</h1>
          <p className="text-muted-foreground">{t("hr.clausulas.subtitulo")}</p>
        </div>
        {podeEditar && (
          <Button onClick={abrirNova}>
            <Plus className="h-4 w-4 mr-2" /> {t("hr.clausulas.novaClausula")}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("hr.clausulas.tituloPagina")}</CardTitle>
          <div className="flex items-center gap-2">
            <Switch
              id="mostrar-inactivas"
              checked={mostrarInactivas}
              onCheckedChange={setMostrarInactivas}
            />
            <Label htmlFor="mostrar-inactivas" className="text-sm font-normal">
              {t("hr.clausulas.mostrarInactivas")}
            </Label>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <OlyviaLoader size={32} />
            </div>
          ) : clausulasVisiveis.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookText className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>{t("hr.clausulas.semClausulas")}</p>
            </div>
          ) : (
            clausulasVisiveis.map((clausula) => (
              <div
                key={clausula.id}
                className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <BookText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{clausula.nome}</span>
                      {clausula.categoria && (
                        <Badge variant="outline" className="text-[10px]">
                          {clausula.categoria}
                        </Badge>
                      )}
                      <Badge variant={clausula.activo ? "default" : "secondary"} className="text-[10px]">
                        {clausula.activo ? t("hr.clausulas.activa") : t("hr.clausulas.inactiva")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("hr.clausulas.ultimaActualizacao")}:{" "}
                      {new Date(clausula.updated_at).toLocaleDateString("pt-PT")}
                    </p>
                  </div>
                </div>
                {podeEditar && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => abrirEdicao(clausula)}
                      title={t("hr.clausulas.editarClausula")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => alternarActivo(clausula)}
                      title={clausula.activo ? t("hr.clausulas.desactivar") : t("hr.clausulas.reactivar")}
                    >
                      {clausula.activo ? (
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
              {clausulaAEditar
                ? `${t("hr.clausulas.editarClausula")} — "${clausulaAEditar.nome}"`
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
            <Button type="button" variant="outline" onClick={fecharDialogo}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={submeter}
              disabled={isSaving || !form.nome.trim() || !form.corpo_html.trim()}
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {clausulaAEditar ? t("common.save") : t("hr.clausulas.novaClausula")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
