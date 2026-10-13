import { useRef } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FichaInterior, type FichaInteriorProps } from "./FichaInterior";
import type { ResumoPessoa } from "./pessoasTipos";

export interface FichaPessoaProps extends Omit<FichaInteriorProps, "resumo" | "fecharPainel"> {
  /** A pessoa da ficha: ao fechar, fica a última, para o painel não deslizar vazio. `null` antes de abrir a primeira. */
  resumo: ResumoPessoa | null;
  aberto: boolean;
  aoFechar: () => void;
}

/** O foco depois de fechar: o elemento que abriu a ficha; se já não existe (abriu por ?open=, ou a ficha fechou-se a si própria), o separador ativo ou o título da página. */
function focoDeRegresso(origem: HTMLElement | null): HTMLElement | null {
  if (origem && origem.isConnected && origem !== document.body) return origem;
  const titulo = document.querySelector<HTMLElement>("h1");
  titulo?.setAttribute("tabindex", "-1");
  return document.querySelector<HTMLElement>('[role="tab"][data-state="active"]') ?? titulo;
}

/** A ficha da pessoa, num painel lateral (Sheet): cabeçalho, ações e abas. O Esc fecha primeiro o painel de ação, se houver. */
export function FichaPessoa({ resumo, aberto, aoFechar, ...resto }: FichaPessoaProps) {
  const origem = useRef<HTMLElement | null>(null);
  const fecharPainel = useRef<(() => boolean) | null>(null);
  return (
    <Sheet open={aberto && resumo !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl motion-reduce:!animate-none"
        onEscapeKeyDown={(e) => { if (fecharPainel.current?.()) e.preventDefault(); }}
        onOpenAutoFocus={() => { origem.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
        onCloseAutoFocus={(e) => {
          const alvo = focoDeRegresso(origem.current);
          if (!alvo) return;
          e.preventDefault();
          alvo.focus();
        }}
      >
        {resumo && <FichaInterior key={resumo.pessoa.id} {...resto} resumo={resumo} fecharPainel={fecharPainel} />}
      </SheetContent>
    </Sheet>
  );
}
