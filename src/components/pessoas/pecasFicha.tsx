// As três peças da ficha que, no painel lateral (Sheet), são do diálogo: o título (o nome, com o foco inicial), a descrição e o botão de fechar. Com a ficha
// NA PÁGINA (sem diálogo por cima) não há contexto de diálogo, por isso a ficha pede-as a este contexto. Por omissão valem as do Sheet, e o painel lateral e o
// exemplo ficam iguais; `ProvedorFichaNaPagina` dá as da página: um h2, um parágrafo e um fecho que chama `aoFechar`.
import { createContext, useContext, type ComponentPropsWithoutRef, type ElementType, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SheetClose, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { FOCO } from "@/components/negocio-metas/estilos";

export interface PecasFicha {
  Titulo: ElementType<ComponentPropsWithoutRef<"h2">>;
  Descricao: ElementType<ComponentPropsWithoutRef<"p">>;
  /** Envolve UM botão (`asChild`) e faz dele o fecho da ficha. */
  Fechar: ElementType<{ asChild?: boolean; children?: ReactNode }>;
}

const PECAS_NO_SHEET: PecasFicha = { Titulo: SheetTitle, Descricao: SheetDescription, Fechar: SheetClose };

const AoFecharContext = createContext<() => void>(() => undefined);

function TituloNaPagina(props: ComponentPropsWithoutRef<"h2">) {
  return <h2 {...props} />;
}

function DescricaoNaPagina(props: ComponentPropsWithoutRef<"p">) {
  return <p {...props} />;
}

/** O fecho da página: o botão filho (como o `SheetClose asChild`) passa a chamar `aoFechar`. */
function FecharNaPagina({ children }: { asChild?: boolean; children?: ReactNode }) {
  const aoFechar = useContext(AoFecharContext);
  return <Slot onClick={aoFechar}>{children}</Slot>;
}

/** As peças da página: componentes estáveis (nunca recriados, para não remontar a ficha); o `aoFechar` vai por contexto. */
export const PECAS_NA_PAGINA: PecasFicha = { Titulo: TituloNaPagina, Descricao: DescricaoNaPagina, Fechar: FecharNaPagina };

const PecasFichaContext = createContext<PecasFicha>(PECAS_NO_SHEET);

export function usePecasFicha(): PecasFicha {
  return useContext(PecasFichaContext);
}

/** Dá à ficha as peças da página: sem Sheet nem diálogo à volta. */
export function ProvedorFichaNaPagina({ aoFechar, children }: { aoFechar: () => void; children: ReactNode }) {
  return (
    <PecasFichaContext.Provider value={PECAS_NA_PAGINA}>
      <AoFecharContext.Provider value={aoFechar}>{children}</AoFecharContext.Provider>
    </PecasFichaContext.Provider>
  );
}

/** A ligação «← Pipeline» / «← Pessoas» no topo da ficha na página: volta ao quadro (ou à lista). Alvo de 44 px. */
export function LigacaoVoltarFicha({ voltaPara }: { voltaPara: "pipeline" | "pessoas" }) {
  const { t } = useTranslation();
  const { Fechar } = usePecasFicha();
  return (
    <div className="px-4 pt-4 sm:px-6">
      <Fechar asChild>
        <Button
          type="button" variant="ghost" aria-label={t(`pessoasPagina.ficha.voltar.${voltaPara}.aria`)}
          className={cn("-ml-3 min-h-11 gap-2 px-3 text-sm text-muted-foreground hover:text-foreground", FOCO)}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t(`pessoasPagina.ficha.voltar.${voltaPara}`)}
        </Button>
      </Fechar>
    </div>
  );
}
