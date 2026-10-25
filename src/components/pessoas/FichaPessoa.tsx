import { useRef, type MutableRefObject } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FichaInterior, type FichaInteriorProps } from "./FichaInterior";
import { vizinhas } from "./navegacaoFicha";
import type { ResumoPessoa } from "./pessoasTipos";
import { useTeclasFicha } from "./useTeclasFicha";

export interface FichaPessoaProps extends Omit<FichaInteriorProps, "resumo" | "fecharPainel" | "vizinhas" | "aoIr"> {
  /** A pessoa da ficha: ao fechar, fica a última, para o painel não deslizar vazio. `null` antes de abrir a primeira. */
  resumo: ResumoPessoa | null;
  aberto: boolean;
  aoFechar: () => void;
  /** Os ids das pessoas visíveis na lista, pela ordem da lista. */
  idsVisiveis: string[];
  /** Passa à pessoa `id` (troca o ?open= sem acrescentar entradas ao histórico). */
  aoIrPara: (id: string) => void;
  /**
   * O elemento a que o foco volta ao fechar, guardado por quem abriu NO CLIQUE (a ficha real só abre depois de os dados chegarem, e
   * então o foco já pode estar noutro sítio). Sem isto vale o elemento ativo no momento em que o painel abre.
   */
  origemFoco?: MutableRefObject<HTMLElement | null>;
}

/** O foco depois de fechar: o elemento que abriu a ficha; se já não existe (abriu por ?open=, ou a ficha fechou-se a si própria), o separador ativo ou o título da página. */
function focoDeRegresso(origem: HTMLElement | null): HTMLElement | null {
  if (origem && origem.isConnected && origem !== document.body) return origem;
  const titulo = document.querySelector<HTMLElement>("h1");
  titulo?.setAttribute("tabindex", "-1");
  return document.querySelector<HTMLElement>('[role="tab"][data-state="active"]') ?? titulo;
}

/**
 * A ficha da pessoa, num painel lateral (Sheet) que cobre metade do ecrã (no mínimo 640 px; em ecrã estreito, todo): cabeçalho
 * com navegação, ações, percurso e abas. Com o guia (a ficha real) o painel é mais largo (até 1120 px, 94% do ecrã) para caberem as três colunas do
 * passo seguinte (lista da fase, passo e cliente). O Esc fecha primeiro o painel de ação, se houver; o "X" por defeito do Sheet
 * esconde-se por classe, porque a ficha tem o seu botão Fechar.
 */
export function FichaPessoa({ resumo, aberto, aoFechar, idsVisiveis, aoIrPara, origemFoco, ...resto }: FichaPessoaProps) {
  const origem = useRef<HTMLElement | null>(null);
  const fecharPainel = useRef<(() => boolean) | null>(null);
  const viz = vizinhas(idsVisiveis, resumo?.pessoa.id ?? "");
  const ir = useTeclasFicha(aberto && resumo !== null, viz, resumo?.pessoa.id, aoIrPara);
  return (
    <Sheet open={aberto && resumo !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <SheetContent
        className={cn(
          "flex w-full flex-col gap-0 p-0 sm:min-w-[640px] sm:max-w-none motion-reduce:!animate-none [&>button:last-child]:hidden",
          resto.comGuia ? "sm:w-[min(1120px,94vw)]" : "sm:w-1/2",
        )}
        onEscapeKeyDown={(e) => { if (fecharPainel.current?.()) e.preventDefault(); }}
        onOpenAutoFocus={(e) => {
          origem.current = origemFoco?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
          e.preventDefault();
          document.querySelector<HTMLElement>('[role="dialog"] h2')?.focus();
        }}
        onCloseAutoFocus={(e) => {
          const alvo = focoDeRegresso(origem.current);
          if (origemFoco) origemFoco.current = null; // gasta-se: a próxima abertura guarda a sua
          if (!alvo) return;
          e.preventDefault();
          alvo.focus();
        }}
      >
        {resumo && <FichaInterior key={resumo.pessoa.id} {...resto} resumo={resumo} fecharPainel={fecharPainel} vizinhas={viz} aoIr={ir} />}
      </SheetContent>
    </Sheet>
  );
}
