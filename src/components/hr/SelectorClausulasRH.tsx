/**
 * Botao de toolbar (`extraToolbarButtons` do `RichTextEditor`) para colar uma
 * clausula da biblioteca (`pessoas_documentos_clausulas`) dentro do corpo de
 * um modelo de documento de RH.
 *
 * COPIA, NAO REFERENCIA
 * ------------------------
 * Ao escolher uma clausula, o `corpo_html` dela e inserido no editor via
 * `execCommand('insertHTML', ...)` -- uma COPIA de texto, tal como colar uma
 * variavel. Nao ha ligacao viva entre o modelo e a clausula depois disto:
 * editar a clausula na biblioteca nao muda o que ja foi colado. E dito ao
 * utilizador na mesma linha do ecra de clausulas, nao escondido aqui.
 */
import { useMemo, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { BookText } from "lucide-react";
import { sanitizeRichHtml } from "@/utils/sanitize";
import { useTranslation } from "@/hooks/useTranslation";
import { useClausulasDocumentosRH } from "@/hooks/useClausulasDocumentosRH";
import type { RichTextEditorHandle } from "@/components/RichTextEditor";

interface SelectorClausulasRHProps {
  editorRef: RefObject<RichTextEditorHandle>;
}

const SEM_CATEGORIA = "__sem_categoria__";

export function SelectorClausulasRH({ editorRef }: SelectorClausulasRHProps) {
  const { t } = useTranslation();
  const { clausulas, isLoading } = useClausulasDocumentosRH();
  const [aberto, setAberto] = useState(false);
  const [pesquisa, setPesquisa] = useState("");

  const activas = useMemo(() => clausulas.filter((c) => c.activo), [clausulas]);

  const filtradas = useMemo(() => {
    const termo = pesquisa.trim().toLowerCase();
    if (!termo) return activas;
    return activas.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        (c.categoria ?? "").toLowerCase().includes(termo),
    );
  }, [activas, pesquisa]);

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

  if (!isLoading && activas.length === 0) return null;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          title={t("hr.clausulas.inserirClausula")}
        >
          <BookText className="h-3.5 w-3.5" />
          {t("hr.clausulas.clausulas")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2 z-[650]" align="start">
        <div className="space-y-2">
          <Input
            value={pesquisa}
            onChange={(e) => setPesquisa(e.target.value)}
            placeholder={t("hr.clausulas.pesquisar")}
            className="h-8 text-sm"
          />
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
                    <button
                      key={clausula.id}
                      type="button"
                      onClick={() => inserir(clausula.corpo_html)}
                      className="w-full flex items-start gap-2 p-2 rounded hover:bg-muted text-left transition-colors"
                    >
                      <Badge variant="secondary" className="text-[10px] shrink-0 mt-0.5">
                        <BookText className="h-3 w-3" />
                      </Badge>
                      <span className="text-sm">{clausula.nome}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>
          <p className="text-[10px] text-muted-foreground px-2">{t("hr.clausulas.avisoCopia")}</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
