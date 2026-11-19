import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IDIOMA_BASE, obterIdioma } from "@/lib/idiomaDocumento";
import { useTranslation } from "@/hooks/useTranslation";
import { AdicionarIdiomaDialog } from "./AdicionarIdiomaDialog";
import { ID_DIALOGO_ADICIONAR_IDIOMA, idDaAba, type ResumoDeIdioma } from "./modeloVersoes";

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
  /**
   * Sobe quando adicionar ou remover uma versão desmonta o controlo que tinha o foco: a barra põe-no na
   * aba ativa (ou no botão de adicionar, se já não houver abas).
   */
  pedidoFoco?: number;
}

const ABA = "inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background";

export function BarraDeIdiomas({ resumo, idiomaAtivo, livres, idPainel, onEscolher, onAdicionar, pedidoFoco = 0 }: BarraDeIdiomasProps) {
  const { t } = useTranslation();
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const abas = useRef<Record<string, HTMLButtonElement | null>>({});
  const botaoAdicionar = useRef<HTMLButtonElement>(null);
  const ativoRef = useRef(idiomaAtivo);
  ativoRef.current = idiomaAtivo;
  const pedidoAnterior = useRef(pedidoFoco);

  // setTimeout 0: corre depois de o Radix devolver o foco ao fechar os diálogos, que também usa um timeout.
  useEffect(() => {
    if (pedidoAnterior.current === pedidoFoco) return;
    pedidoAnterior.current = pedidoFoco;
    const timer = setTimeout(() => (abas.current[ativoRef.current] ?? botaoAdicionar.current)?.focus(), 0);
    return () => clearTimeout(timer);
  }, [pedidoFoco]);
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
    // O nome acessível contém o texto visível e acrescenta o idioma por extenso (e o aviso, que é só visual).
    const nomeAcessivel = [
      `${texto}, ${obterIdioma(codigo)?.nomeNativo ?? codigo}`,
      item?.desatualizado ? t("proposalTemplateEditor.versions.outdatedFlag") : null,
    ].filter(Boolean).join(" · ");
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
        aria-label={nomeAcessivel}
        title={obterIdioma(codigo)?.nomeNativo}
        onClick={() => onEscolher(codigo)}
        onKeyDown={(e) => mover(codigo, e)}
        className={cn(
          ABA,
          ativa ? "border-primary bg-secondary text-secondary-foreground" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {texto}
        {item?.desatualizado && <AlertTriangle className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" aria-hidden="true" />}
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
          <Button
            ref={botaoAdicionar}
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 min-w-11"
            aria-haspopup="dialog"
            aria-expanded={dialogoAberto}
            aria-controls={ID_DIALOGO_ADICIONAR_IDIOMA}
            onClick={() => setDialogoAberto(true)}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            {t("proposalTemplateEditor.versions.addLanguage")}
          </Button>
          <AdicionarIdiomaDialog open={dialogoAberto} onOpenChange={setDialogoAberto} livres={livres} onConfirmar={onAdicionar} onCancelado={() => botaoAdicionar.current?.focus()} />
        </>
      )}
    </div>
  );
}
