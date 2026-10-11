// O painel lateral de um negócio de EXEMPLO na V2 de Negócios (shadcn Sheet): os negócios de exemplo não existem no Estado, por isso não têm página própria
// e o cartão não abre o negócio base de outra pessoa. Mostra o detalhe desse negócio (o mesmo do separador Negócios da ficha), só para ler, e um botão
// secundário "Ver a pessoa". Largura min(720px, 100vw) (ecrã inteiro no telemóvel). Esc e Fechar fecham; o foco entra no título e volta ao cartão.
import { useRef, type RefObject } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Estado } from "./motor";
import type { NegocioApp } from "./negociosApp";
import { todosApp } from "./pessoasDocs";
import { NegocioDetalhe } from "./NegocioBloco";
import { classePortal } from "./ListaTopo";
import { BORDA_CTRL } from "./PessoaLinha";

type PapelVer = "lead" | "cliente" | "perdida";

export interface PainelExemploProps {
  S: Estado;
  /** O negócio aberto; `undefined` com o painel fechado. */
  n: NegocioApp | undefined;
  fechar: () => void;
  /** Fecha o painel, guarda a pessoa na memória de Pessoas e navega para Pessoas. */
  verPessoa: (nome: string, papel: PapelVer) => void;
  /** O cartão clicado: recebe o foco quando o painel fecha. */
  retorno: RefObject<HTMLElement | null>;
}

const papelDe = (S: Estado, nome: string): PapelVer => {
  const p = todosApp(S).find((x) => x.nome === nome);
  return !p ? "lead" : p.perdida !== null ? "perdida" : p.papel;
};
const TEXTO_PAPEL: Record<PapelVer, string> = { lead: "Lead", cliente: "Cliente", perdida: "Lead perdida" };

export function NegocioExemploPainel({ S, n, fechar, verPessoa, retorno }: PainelExemploProps) {
  const conteudo = useRef<HTMLDivElement>(null);
  // Durante a animação de saída o conteúdo mantém-se: guarda-se o último negócio mostrado.
  const ultimo = useRef<NegocioApp | undefined>(n);
  if (n) ultimo.current = n;
  const mostrado = n ?? ultimo.current;
  const papel = mostrado ? papelDe(S, mostrado.nome) : "lead";
  const focarTitulo = (e: Event) => {
    const titulo = conteudo.current?.querySelector<HTMLElement>("h2[tabindex='-1']");
    if (!titulo) return;
    e.preventDefault();
    titulo.focus();
  };
  const devolverFoco = (e: Event) => { e.preventDefault(); retorno.current?.focus(); };
  return (
    <Sheet open={!!n} onOpenChange={(aberto) => { if (!aberto) fechar(); }}>
      <SheetContent ref={conteudo} side="right" onOpenAutoFocus={focarTitulo} onCloseAutoFocus={devolverFoco}
        className={cn("flex w-[min(720px,100vw)] flex-col gap-0 p-0 text-foreground sm:max-w-none motion-reduce:!animate-none [&>button.absolute]:hidden", classePortal(!!S.leitura))}>
        {mostrado && (
          <>
            <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border px-4 pb-3 pt-4 sm:px-6">
              <div className="min-w-0 flex-1 basis-60">
                <SheetTitle tabIndex={-1} className="break-words text-xl font-semibold tracking-tight">{mostrado.titulo}</SheetTitle>
                <SheetDescription className="mt-1 break-words text-base text-muted-foreground">
                  {mostrado.nome} · {TEXTO_PAPEL[papel]}<span className="ml-2 text-[15px]">exemplo</span>
                </SheetDescription>
              </div>
              <Button type="button" variant="outline" className={cn("min-h-11 cursor-pointer text-[15px]", BORDA_CTRL)} onClick={fechar}>
                <X className="mr-1.5 h-4 w-4" aria-hidden="true" />Fechar
              </Button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-5 sm:px-6">
              <NegocioDetalhe S={S} n={mostrado} id="painel-negocio-exemplo" painel />
            </div>
            <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 sm:px-6">
              <Button type="button" variant="outline" className={cn("min-h-11 cursor-pointer text-[15px]", BORDA_CTRL)} onClick={() => verPessoa(mostrado.nome, papel)}>Ver a pessoa</Button>
              <p className="text-[15px] text-muted-foreground">Negócio de exemplo: não tem página própria nem ações.</p>
            </footer>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
