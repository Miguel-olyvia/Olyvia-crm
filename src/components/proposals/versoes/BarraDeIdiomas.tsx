import { useRef, useState, type KeyboardEvent } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IDIOMA_BASE, obterIdioma } from "@/lib/idiomaDocumento";
import { useTranslation } from "@/hooks/useTranslation";
import { AdicionarIdiomaDialog } from "./AdicionarIdiomaDialog";
import { idDaAba, type ResumoDeIdioma } from "./modeloVersoes";

interface BarraDeIdiomasProps {
  /** Um item por idioma não base. Vazio: só aparece o botão de adicionar. */
  resumo: ResumoDeIdioma[];
  idiomaAtivo: string;
  /** Idiomas do registo que o template ainda não tem. */
  livres: string[];
  /** Id do painel que as abas controlam (o painel leva role="tabpanel" e aria-labelledby). */
  idPainel: string;
  onEscolher: (codigo: string) => void;
  onAdicionar: (codigo: string, copiarPortugues: boolean) => void;
}

const ABA = "inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background";

export function BarraDeIdiomas({ resumo, idiomaAtivo, livres, idPainel, onEscolher, onAdicionar }: BarraDeIdiomasProps) {
  const { t } = useTranslation();
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const abas = useRef<Record<string, HTMLButtonElement | null>>({});
  const codigos = [IDIOMA_BASE, ...resumo.map((r) => r.codigo)];

  const mover = (de: string, evento: KeyboardEvent<HTMLButtonElement>) => {
    const indice = codigos.indexOf(de);
    const destino =
      evento.key === "ArrowRight" ? (indice + 1) % codigos.length
      : evento.key === "ArrowLeft" ? (indice - 1 + codigos.length) % codigos.length
      : evento.key === "Home" ? 0
      : evento.key === "End" ? codigos.length - 1
      : null;
    if (destino === null) return;
    evento.preventDefault();
    onEscolher(codigos[destino]);
    abas.current[codigos[destino]]?.focus();
  };

  const aba = (codigo: string, texto: string, item?: ResumoDeIdioma) => {
    const ativa = codigo === idiomaAtivo;
    return (
      <button
        key={codigo}
        ref={(el) => { abas.current[codigo] = el; }}
        type="button"
        role="tab"
        id={idDaAba(codigo)}
        aria-selected={ativa}
        aria-controls={idPainel}
        tabIndex={ativa ? 0 : -1}
        title={obterIdioma(codigo)?.nomeNativo}
        onClick={() => onEscolher(codigo)}
        onKeyDown={(e) => mover(codigo, e)}
        className={cn(
          ABA,
          ativa ? "border-primary bg-secondary text-secondary-foreground" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {texto}
        {item?.desatualizado && (
          <>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            <span className="sr-only"> · {t("proposalTemplateEditor.versions.outdatedFlag")}</span>
          </>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {resumo.length > 0 && (
        <div role="tablist" aria-label={t("proposalTemplateEditor.versions.barLabel")} className="flex flex-wrap items-center gap-1">
          {aba(IDIOMA_BASE, `${IDIOMA_BASE.toUpperCase()} (${t("proposalTemplateEditor.versions.baseSuffix")})`)}
          {resumo.map((r) =>
            aba(
              r.codigo,
              `${r.codigo.toUpperCase()} · ${r.completo ? t("proposalTemplateEditor.versions.complete") : t("proposalTemplateEditor.versions.missingCount", { count: r.faltam })}`,
              r,
            ),
          )}
        </div>
      )}
      {livres.length > 0 && (
        <>
          <Button type="button" variant="ghost" size="sm" className="min-h-11 min-w-11" onClick={() => setDialogoAberto(true)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            {t("proposalTemplateEditor.versions.addLanguage")}
          </Button>
          <AdicionarIdiomaDialog open={dialogoAberto} onOpenChange={setDialogoAberto} livres={livres} onConfirmar={onAdicionar} />
        </>
      )}
    </div>
  );
}
