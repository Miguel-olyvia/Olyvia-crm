// A navegação do Portal do colaborador: duas entradas, «Ficha de admissão» (com o estado em texto) e «Documentos» (com o
// contador de pendentes). Barra lateral em ecrã largo; em ecrã estreito a MESMA lista passa a barra em baixo (um só <nav>).
// A entrada ativa leva aria-current; o estado vai sempre em texto, nunca só em cor.
import { Link } from "react-router-dom";
import { FileText, FolderOpen, type LucideIcon } from "lucide-react";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import type { EtiquetaFicha, SeccaoPortal } from "@/components/rh-exemplo/lib/portalEstado";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface PortalNavegacaoProps {
  seccao: SeccaoPortal;
  etiqueta: EtiquetaFicha;
  pendentes: number;
  /** Falso no portal real: a troca de documentos ainda não existe na base, por isso a entrada não aparece. */
  comDocumentos?: boolean;
}

interface Entrada {
  seccao: SeccaoPortal;
  Icone: LucideIcon;
  rotulo: string;
  estado: string | null;
}

export function PortalNavegacao({ seccao, etiqueta, pendentes, comDocumentos = true }: PortalNavegacaoProps) {
  const { t } = useTranslation();
  const ficha: Entrada = { seccao: "ficha", Icone: FileText, rotulo: t("rhPortal.nav.ficha"), estado: t(`rhPortal.ficha.etiqueta.${etiqueta}`) };
  const documentos: Entrada = {
    seccao: "documentos", Icone: FolderOpen, rotulo: t("rhPortal.nav.documentos"),
    estado: pendentes > 0 ? t("rhPortal.nav.pendentes", { n: pendentes }) : null,
  };
  const entradas: Entrada[] = comDocumentos ? [ficha, documentos] : [ficha];
  return (
    <nav
      aria-label={t("rhPortal.nav.aria")}
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background md:static md:z-auto md:w-64 md:shrink-0 md:self-start md:rounded-lg md:border"
    >
      <ul className="flex md:flex-col md:p-2">
        {entradas.map(({ seccao: s, Icone, rotulo, estado }) => {
          const ativa = s === seccao;
          return (
            <li key={s} className="flex-1">
              <Link
                to={{ search: `?sec=${s}` }}
                aria-current={ativa ? "page" : undefined}
                data-testid={`portal-nav-${s}`}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1 text-sm md:min-h-11 md:flex-row md:justify-start md:gap-3 md:px-3",
                  "hover:bg-muted motion-reduce:transition-none", FOCO,
                  ativa ? "bg-primary/10 font-semibold text-primary dark:text-violet-300 md:border-l-4 md:border-primary" : "text-muted-foreground",
                )}
              >
                <Icone className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="flex flex-col items-center md:items-start">
                  <span>{rotulo}</span>
                  {estado && <span className="text-xs font-normal text-muted-foreground">{estado}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
