// A coluna da esquerda do guia, como no protótipo: o título da fase que se está a VER, a lista dos seus passos (o escolhido realçado; cada passo é um
// botão) e, depois de uma linha de separação, «Fases feitas» com cada fase já feita, que se escolhe para a ver. Só apresentação e só leitura: tudo chega
// por props e nada se grava aqui. Mais `RegistoDoItem`, o que ficou registado num passo, que o centro mostra.
import { Check } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { FOCO } from "@/components/negocio-metas/estilos";
import { ChecklistDoPasso } from "./GuiaPecas";
import type { FaseFeita, ItemChecklist } from "./processo/passoGuiado";

const P = "pessoasPagina.";

interface ColunaProps {
  /** O nome da fase que se vê (a atual, ou a feita que se escolheu). */
  faseRotuloChave: string;
  itens: readonly ItemChecklist[];
  /** O passo escolhido; `null` quando nenhum está escolhido (na fase atual). */
  escolhido: string | null;
  aoEscolherPasso: (id: string) => void;
  feitas: readonly FaseFeita[];
  /** A fase feita que se vê; `null` quando se vê a atual. */
  faseVista: string | null;
  aoVerFase: (id: string) => void;
  id?: string;
}

export function ColunaDoGuia({ faseRotuloChave, itens, escolhido, aoEscolherPasso, feitas, faseVista, aoVerFase, id }: ColunaProps) {
  const { t } = useTranslation();
  return (
    <div id={id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <nav aria-label={t(`${P}guia.passos`)}>
        <ChecklistDoPasso itens={itens} rotulo={t(faseRotuloChave)} cartao={false} selecionado={escolhido} aoSelecionar={aoEscolherPasso} />
      </nav>
      {feitas.length > 0 && (
        <>
          <hr className="my-3 border-border/60" />
          <nav aria-label={t(`${P}guia.fasesFeitas`)}>
            <p className="mb-2 text-sm text-muted-foreground">{t(`${P}guia.fasesFeitas`)}</p>
            <ul className="list-none space-y-1 p-0">
              {feitas.map((f) => {
                const vista = f.id === faseVista;
                return (
                  <li key={f.id}>
                    <button
                      type="button" aria-current={vista ? "true" : undefined} onClick={() => aoVerFase(f.id)}
                      className={cn("flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-[15px] text-foreground hover:bg-muted motion-reduce:transition-none", FOCO, vista && "bg-primary/10 font-semibold")}
                    >
                      <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span>{t(f.rotuloChave)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </>
      )}
    </div>
  );
}

/** O que ficou registado num passo, em leitura: o nome do passo, o registo (ou «Sem registo») e se está feito. */
export function RegistoDoItem({ item, comTitulo = true }: { item: ItemChecklist | null; comTitulo?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1 rounded-lg border border-border/60 bg-muted/40 p-3">
      {item && comTitulo && <p className="text-sm text-muted-foreground">{t(item.rotuloChave)}</p>}
      <p className={cn("break-words text-base", item?.detalhe ? "font-medium text-foreground" : "text-muted-foreground")}>{item?.detalhe ?? t(`${P}guia.semRegisto`)}</p>
      {item && <p className="text-sm text-muted-foreground">{t(`${P}guia.registo.${item.feito ? "feita" : "porFazer"}`)}</p>}
    </div>
  );
}
