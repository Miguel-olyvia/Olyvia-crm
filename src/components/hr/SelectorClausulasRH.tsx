/**
 * Botao de toolbar (`extraToolbarButtons` do `RichTextEditor`) para colar uma
 * clausula da biblioteca (`pessoas_documentos_clausulas`) dentro do corpo de
 * um modelo de documento de RH, e -- para quem tem `.edit` -- para a gerir sem
 * sair do editor: criar a partir do texto seleccionado, editar e desactivar.
 * O ecra proprio de clausulas deixou de existir.
 *
 * COPIA, NAO REFERENCIA
 * ------------------------
 * Ao escolher uma clausula, o `corpo_html` dela e inserido no editor via
 * `execCommand('insertHTML', ...)` -- uma COPIA de texto, tal como colar uma
 * variavel. Nao ha ligacao viva entre o modelo e a clausula depois disto:
 * editar a clausula na biblioteca nao muda o que ja foi colado. E dito ao
 * utilizador no popover e no dialogo, nao escondido aqui.
 */
import { useMemo, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BookText, Pencil, Ban, RotateCcw, Plus } from "lucide-react";
import { sanitizeRichHtml } from "@/utils/sanitize";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { useTranslation } from "@/hooks/useTranslation";
import { usePermissions } from "@/hooks/usePermissions";
import { useClausulasDocumentosRH, type ClausulaDocumentoRH } from "@/hooks/useClausulasDocumentosRH";
import { ClausulaFormDialog } from "@/components/hr/ClausulaFormDialog";
import type { RichTextEditorHandle } from "@/components/RichTextEditor";

interface SelectorClausulasRHProps {
  editorRef: RefObject<RichTextEditorHandle>;
}

const SEM_CATEGORIA = "__sem_categoria__";

/** HTML da selecao actual, so se estiver dentro de um editor (contenteditable). */
function capturarSelecaoDoEditor(): string {
  const selecao = typeof window !== "undefined" ? window.getSelection() : null;
  if (!selecao || selecao.rangeCount === 0 || selecao.isCollapsed) return "";
  const range = selecao.getRangeAt(0);
  const no = range.commonAncestorContainer;
  const elemento = no.nodeType === 1 ? (no as Element) : no.parentElement;
  if (!elemento?.closest('[contenteditable="true"]')) return "";
  const contentor = document.createElement("div");
  contentor.appendChild(range.cloneContents());
  return sanitizeRichHtml(contentor.innerHTML);
}

export function SelectorClausulasRH({ editorRef }: SelectorClausulasRHProps) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const podeEditar = hasPermission("hr.pessoas.documentos.modelos.edit");
  const { clausulas, isLoading, definirActivo } = useClausulasDocumentosRH();
  const [aberto, setAberto] = useState(false);
  const [pesquisa, setPesquisa] = useState("");
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [clausulaAEditar, setClausulaAEditar] = useState<ClausulaDocumentoRH | null>(null);
  const [corpoInicial, setCorpoInicial] = useState("");
  const [selecaoCapturada, setSelecaoCapturada] = useState("");

  const activas = useMemo(() => clausulas.filter((c) => c.activo), [clausulas]);
  const base = mostrarInactivas && podeEditar ? clausulas : activas;

  const filtradas = useMemo(() => {
    const termo = pesquisa.trim().toLowerCase();
    if (!termo) return base;
    return base.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        (c.categoria ?? "").toLowerCase().includes(termo),
    );
  }, [base, pesquisa]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, typeof filtradas>();
    for (const clausula of filtradas) {
      const chave = clausula.categoria?.trim() || SEM_CATEGORIA;
      const lista = mapa.get(chave) ?? [];
      lista.push(clausula);
      mapa.set(chave, lista);
    }
    return Array.from(mapa.entries()).sort(([a], [b]) => {
      if (a === SEM_CATEGORIA) return 1;
      if (b === SEM_CATEGORIA) return -1;
      return a.localeCompare(b);
    });
  }, [filtradas]);

  const inserir = (corpoHtml: string) => {
    editorRef.current?.execCommand("insertHTML", sanitizeRichHtml(corpoHtml));
    setAberto(false);
  };

  const abrirNova = () => {
    setClausulaAEditar(null);
    setCorpoInicial(selecaoCapturada);
    setAberto(false);
    setDialogoAberto(true);
  };

  const abrirEdicao = (clausula: ClausulaDocumentoRH) => {
    setClausulaAEditar(clausula);
    setCorpoInicial("");
    setAberto(false);
    setDialogoAberto(true);
  };

  const alternarActivo = async (clausula: ClausulaDocumentoRH) => {
    try {
      await definirActivo(clausula.id, !clausula.activo);
      toast.success(clausula.activo ? t("hr.clausulas.desactivarSucesso") : t("hr.clausulas.reactivarSucesso"));
    } catch (erro) {
      toast.error(await getFriendlyErrorMessage(erro));
    }
  };

  if (!isLoading && activas.length === 0 && !podeEditar) return null;

  return (
    <>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            title={t("hr.clausulas.inserirClausula")}
            // Guardar a selecao antes de o popover tirar o foco ao editor.
            onMouseDown={() => setSelecaoCapturada(capturarSelecaoDoEditor())}
          >
            <BookText className="h-3.5 w-3.5" />
            {t("hr.clausulas.clausulas")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2 z-[650]" align="start">
          <div className="space-y-2">
            {podeEditar && (
              <Button type="button" variant="outline" size="sm" className="w-full h-8 text-xs" onClick={abrirNova}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t("hr.clausulas.novaDaSeleccao")}
              </Button>
            )}
            <Input
              value={pesquisa}
              onChange={(e) => setPesquisa(e.target.value)}
              placeholder={t("hr.clausulas.pesquisar")}
              className="h-8 text-sm"
            />
            {podeEditar && (
              <div className="flex items-center gap-2 px-1">
                <Switch
                  id="selector-mostrar-inactivas"
                  checked={mostrarInactivas}
                  onCheckedChange={setMostrarInactivas}
                />
                <Label htmlFor="selector-mostrar-inactivas" className="text-xs font-normal">
                  {t("hr.clausulas.mostrarInactivas")}
                </Label>
              </div>
            )}
            <ScrollArea className="h-[280px]">
              <div className="space-y-3">
                {grupos.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-4 text-center">
                    {t("hr.clausulas.semResultados")}
                  </p>
                )}
                {grupos.map(([categoria, lista]) => (
                  <div key={categoria} className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground px-2">
                      {categoria === SEM_CATEGORIA ? t("hr.clausulas.semCategoria") : categoria}
                    </p>
                    {lista.map((clausula) => (
                      <div key={clausula.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => inserir(clausula.corpo_html)}
                          disabled={!clausula.activo}
                          className="flex-1 min-w-0 flex items-start gap-2 p-2 rounded hover:bg-muted text-left transition-colors disabled:opacity-50"
                        >
                          <Badge variant="secondary" className="text-[10px] shrink-0 mt-0.5">
                            <BookText className="h-3 w-3" />
                          </Badge>
                          <span className="text-sm">{clausula.nome}</span>
                        </button>
                        {podeEditar && (
                          <div className="flex items-center shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => abrirEdicao(clausula)}
                              title={t("hr.clausulas.editarClausula")}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => alternarActivo(clausula)}
                              title={clausula.activo ? t("hr.clausulas.desactivar") : t("hr.clausulas.reactivar")}
                            >
                              {clausula.activo ? (
                                <Ban className="h-3.5 w-3.5 text-destructive" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <p className="text-[10px] text-muted-foreground px-2">{t("hr.clausulas.avisoCopia")}</p>
          </div>
        </PopoverContent>
      </Popover>
      {podeEditar && (
        <ClausulaFormDialog
          aberto={dialogoAberto}
          clausula={clausulaAEditar}
          corpoInicial={corpoInicial}
          onFechar={() => setDialogoAberto(false)}
        />
      )}
    </>
  );
}
