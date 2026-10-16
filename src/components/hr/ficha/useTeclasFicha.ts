// As teclas [ e ] da ficha de RH: passam à pessoa anterior e à seguinte da lista visível, enquanto a ficha está aberta. A
// decisão de cada tecla é de `teclaNavegacao` (nunca dispara em campos de texto, menus ou listas).
//
// ATALHOS DE UM CARÁCTER (WCAG 2.1.4): [ e ] só funcionam com o foco DENTRO DO CABEÇALHO da ficha (`[data-cabecalho-ficha]`: o
// título e os botões de navegação), que é onde quem os usa está depois de abrir uma ficha ou de navegar. Foi a opção menos
// intrusiva entre as duas que a norma admite (só com o foco no componente, ou exigir uma tecla modificadora): nada muda para
// quem navega com [ e ] de seguida, e quem usa ditado ou teclas soltas não dispara navegação a meio do conteúdo da ficha.
//
// O FOCO ao navegar: ao pedir outra pessoa o foco passa para o painel (o botão que o tinha desaparece com a ficha antiga e
// o foco cairia para o corpo da página, fora do diálogo). Quando a ficha nova CHEGA (`aoPronta`, chamado por quem a mostra) é
// que o título e os botões existem: o foco volta ao mesmo botão (se não puder, ao outro ou ao título). Tentar antes disso
// focava um botão que ainda não existia.
import { useCallback, useEffect, useRef } from "react";
import { teclaNavegacao, type AlvoTecla, type TeclaNavegacao, type Vizinhas } from "./navegacao";

const BLOQUEIOS = '[role="menu"], [role="listbox"], [role="alertdialog"]';
const CABECALHO = "[data-cabecalho-ficha]";
const PAINEL = '[role="dialog"][data-ficha-rh]';

function alvoDe(el: EventTarget | null): AlvoTecla {
  if (!(el instanceof HTMLElement)) return { tag: "BODY" };
  return {
    tag: el.tagName,
    tipo: el instanceof HTMLInputElement ? el.type : undefined,
    editavel: el.isContentEditable,
    papel: el.getAttribute("role"),
    bloqueado: !!el.closest(BLOQUEIOS),
  };
}

/** O evento aconteceu com o foco dentro do cabeçalho da ficha. */
function dentroDoCabecalho(alvo: EventTarget | null): boolean {
  return alvo instanceof Element && alvo.closest(CABECALHO) !== null;
}

function focarSeta(qual: TeclaNavegacao): void {
  const ficha = document.querySelector<HTMLElement>(PAINEL);
  const alvo = ficha?.querySelector<HTMLElement>(`[data-seta="${qual}"]:not(:disabled)`)
    ?? ficha?.querySelector<HTMLElement>("[data-seta]:not(:disabled)")
    ?? ficha?.querySelector<HTMLElement>("[data-titulo-ficha]");
  alvo?.focus();
}

/** Com o foco perdido (no painel ou no corpo), leva-o ao título; se já foi para outro sítio do painel, deixa-o onde está. */
function focarTituloSePerdido(): void {
  const ficha = document.querySelector<HTMLElement>(PAINEL);
  const ativo = document.activeElement;
  if (ativo && ativo !== document.body && ativo !== ficha && ficha?.contains(ativo)) return;
  ficha?.querySelector<HTMLElement>("[data-titulo-ficha]")?.focus();
}

/** Liga as teclas e devolve `ir(id, qual)` e `aoPronta()`, que o painel chama quando a ficha (nova) já está no ecrã. */
export function useTeclasFicha(ativo: boolean, vizinhas: Vizinhas, aoIrPara: (id: string) => void) {
  const qualUsado = useRef<TeclaNavegacao | null>(null);
  const ir = (id: string, qual: TeclaNavegacao) => {
    qualUsado.current = qual;
    // O botão que tinha o foco vai desaparecer com a ficha antiga: o foco fica no painel até a nova chegar.
    document.querySelector<HTMLElement>(PAINEL)?.focus();
    aoIrPara(id);
  };
  const atual = useRef({ vizinhas, ir });
  atual.current = { vizinhas, ir };

  useEffect(() => {
    if (!ativo) return undefined;
    const aoTeclar = (e: KeyboardEvent) => {
      // Atalho de um carácter: só com o foco no cabeçalho da ficha (WCAG 2.1.4).
      if (!dentroDoCabecalho(e.target)) return;
      const qual = teclaNavegacao(
        { key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, repeat: e.repeat, altGraph: e.getModifierState("AltGraph") },
        alvoDe(e.target),
      );
      const id = qual && atual.current.vizinhas[qual];
      if (!qual || !id) return;
      e.preventDefault();
      atual.current.ir(id, qual);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [ativo]);

  const aoPronta = useCallback(() => {
    const qual = qualUsado.current;
    qualUsado.current = null;
    if (qual) focarSeta(qual);
    else focarTituloSePerdido();
  }, []);

  return { ir, aoPronta };
}
