/**
 * "Nova pessoa" da apresentação, num painel lateral (Sheet) igual ao "Novo negócio" e à ficha de Pessoas: meio ecrã (todo
 * em ecrã estreito), cabeçalho com migalhas e selo "Novo · por gravar", seis abas sublinhadas e rodapé fixo. Ao abrir, o foco
 * vai para o nome; Esc, Cancelar ou Fechar fecham e devolvem o foco a quem abriu. Com alterações por gravar, um clique fora
 * não fecha (para não perder o que se escreveu). Ao criar, a pessoa entra na memória e abre-se a ficha (que leva o foco).
 * Substitui o diálogo curto de antes; o assistente real de cinco passos continua a não existir aqui.
 */
import { useRef } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { NovaPessoaExemplo } from "@/components/rh-exemplo/hooks/usePessoas";
import { CabecalhoNova } from "@/components/rh-exemplo/novaPessoa/CabecalhoNova";
import { FormularioNovaPessoa } from "@/components/rh-exemplo/novaPessoa/FormularioNovaPessoa";

interface NovaPessoaDialogoProps {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  colegas: Array<{ id: string; nome_completo: string }>;
  onCriar: (dados: NovaPessoaExemplo) => Promise<{ id: string }>;
  onCriada: (id: string) => void;
}

export function NovaPessoaDialogo({ open, onOpenChange, colegas, onCriar, onCriada }: NovaPessoaDialogoProps) {
  const conteudo = useRef<HTMLDivElement>(null);
  const origem = useRef<HTMLElement | null>(null);
  const criou = useRef(false);
  const sujo = useRef(false);

  const criar = (dados: NovaPessoaExemplo) => {
    criou.current = true;
    void onCriar(dados).then(({ id }) => {
      onOpenChange(false);
      onCriada(id);
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={conteudo}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          sujo.current = false;
          criou.current = false;
          origem.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          conteudo.current?.querySelector<HTMLElement>("#hr-novo-primeiro-nome")?.focus();
        }}
        onInteractOutside={(e) => { if (sujo.current) e.preventDefault(); }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (!criou.current && origem.current?.isConnected) origem.current.focus();
        }}
        className="flex w-full flex-col gap-0 p-0 sm:w-1/2 sm:min-w-[640px] sm:max-w-none motion-reduce:!animate-none [&>button:last-child]:hidden"
      >
        <CabecalhoNova />
        <FormularioNovaPessoa
          colegas={colegas} aoCriar={criar} aoCancelar={() => onOpenChange(false)} aoSujar={() => { sujo.current = true; }}
        />
      </SheetContent>
    </Sheet>
  );
}
