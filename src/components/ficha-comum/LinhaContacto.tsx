// Uma linha de contacto de uma ficha: rótulo e valor, com um botão de ícone "Copiar" ao lado (irmão do valor, nunca
// dentro de um botão). Copia para a área de transferência e, se não puder, seleciona o texto. Os textos (rótulo,
// aria-label e mensagens) chegam já traduzidos por props: este ficheiro não importa de pessoas nem de negocio-metas.
import { useRef } from "react";
import { Copy } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAnunciar } from "./anuncioFicha";
import { FOCO } from "./estilosAbas";

export interface CopiaContacto {
  /** O nome do botão ("Copiar telefone"), para o leitor de ecrã. */
  rotulo: string;
  mensagemCopiado: string;
  mensagemSelecionado: string;
}

export interface LinhaContactoProps {
  rotulo: string;
  valor: string;
  /** Torna o valor uma ligação (tel:, mailto:). */
  href?: string;
  /** Opt-in: uma segunda ligação, ao lado do valor, para o WhatsApp (wa.me); abre noutro separador. */
  whatsapp?: { href: string; rotulo: string; avisoNovoSeparador: string };
  /** Sem cópia (por exemplo, o nome da empresa só se lê): não se passa. */
  copia?: CopiaContacto;
}

function selecionarTexto(el: HTMLElement | null): void {
  const selecao = window.getSelection();
  if (!el || !selecao) return;
  const intervalo = document.createRange();
  intervalo.selectNodeContents(el);
  selecao.removeAllRanges();
  selecao.addRange(intervalo);
}

/** Copia (ou, se não puder, seleciona o texto) e diz o resultado num toast e na região de anúncios da ficha. */
async function copiar(valor: string, el: HTMLElement | null, copia: CopiaContacto, anunciar: (m: string) => void): Promise<void> {
  try {
    await navigator.clipboard.writeText(valor);
    toast.success(copia.mensagemCopiado);
    anunciar(copia.mensagemCopiado);
  } catch {
    selecionarTexto(el);
    toast.info(copia.mensagemSelecionado);
    anunciar(copia.mensagemSelecionado);
  }
}

const LIGACAO = "inline-flex min-h-11 items-center rounded-sm text-primary underline underline-offset-2 dark:text-violet-300";

export function LinhaContacto({ rotulo, valor, href, whatsapp, copia }: LinhaContactoProps) {
  const texto = useRef<HTMLSpanElement>(null);
  const anunciar = useAnunciar();
  return (
    <div className="grid grid-cols-1 items-center gap-x-2 sm:grid-cols-[8rem_1fr] border-b border-border py-1 last:border-b-0">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="flex min-w-0 items-center justify-between gap-1">
        <span className="flex min-w-0 flex-wrap items-center gap-x-3">
          <span ref={texto} className="min-w-0 break-words text-sm text-foreground">
            {href ? <a href={href} className={cn(LIGACAO, FOCO)}>{valor}</a> : valor}
          </span>
          {whatsapp && (
            <a href={whatsapp.href} target="_blank" rel="noopener noreferrer" className={cn(LIGACAO, "text-sm", FOCO)}>
              {whatsapp.rotulo}
              <span className="sr-only">{whatsapp.avisoNovoSeparador}</span>
            </a>
          )}
        </span>
        {copia && (
          <Button
            type="button" variant="ghost" className={cn("h-11 w-11 shrink-0 p-0", FOCO)}
            aria-label={copia.rotulo} onClick={() => void copiar(valor, texto.current, copia, anunciar)}
          >
            <Copy aria-hidden="true" />
          </Button>
        )}
      </dd>
    </div>
  );
}
