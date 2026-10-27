// A ficha da pessoa de RH, num painel lateral (Sheet) que cobre metade do ecrã (no mínimo 640 px; em ecrã estreito, todo) por
// cima da lista, como a ficha de Pessoas: cabeçalho com navegação "n de N", ações, sete abas sublinhadas fixas e conteúdo
// que rola. [ e ] passam à pessoa anterior e seguinte. O "X" por defeito do Sheet esconde-se por classe: a ficha tem o seu
// próprio Fechar. Ao fechar, o foco volta ao que abriu a ficha (ou, se já não existe, ao título da página).
import { useRef, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ConteudoFichaRh } from "./ConteudoFichaRh";
import { vizinhas } from "./navegacao";
import { useTeclasFicha } from "./useTeclasFicha";

interface FichaPessoaRhProps {
  /** A pessoa da ficha; ao fechar fica a última, para o painel não deslizar vazio. `null` antes de abrir a primeira. */
  id: string | null;
  aberta: boolean;
  aoFechar: () => void;
  /** Os ids das pessoas visíveis na lista, pela ordem da lista. */
  idsVisiveis: string[];
  /** Passa à pessoa `id` sem fechar o painel. */
  aoIrPara: (id: string) => void;
  /** A aba que abre primeiro (por omissão a Visão geral); o módulo «Custos» abre a ficha logo no separador Custo. */
  abaInicial?: string;
  /** A aba aberta, quando quem a usa a guarda no URL (`?aba=`): recarregar ou partilhar a ligação não a perde. */
  aba?: string;
  /** A aba mudou. Presente: a aba é controlada por quem chama (URL); ausente: a ficha guarda-a ela própria. */
  aoMudarAba?: (aba: string) => void;
}

const ABA_INICIAL = "visaoGeral";

/** O foco depois de fechar: o elemento que abriu a ficha; se já não existe, o título da página. */
function focoDeRegresso(origem: HTMLElement | null): HTMLElement | null {
  if (origem && origem.isConnected && origem !== document.body) return origem;
  const titulo = document.querySelector<HTMLElement>("h1");
  titulo?.setAttribute("tabindex", "-1");
  return titulo;
}

export function FichaPessoaRh({ id, aberta, aoFechar, idsVisiveis, aoIrPara, abaInicial = ABA_INICIAL, aba: abaDoExterior, aoMudarAba }: FichaPessoaRhProps) {
  const origem = useRef<HTMLElement | null>(null);
  const [abaLocal, setAbaLocal] = useState(abaInicial);
  // Controlada (URL) quando a página passa `aoMudarAba`; senão a ficha guarda a sua.
  const controlada = aoMudarAba !== undefined;
  const aba = controlada ? (abaDoExterior ?? abaInicial) : abaLocal;
  const setAba = controlada ? aoMudarAba : setAbaLocal;
  const viz = vizinhas(idsVisiveis, id ?? "");
  const { ir, aoPronta } = useTeclasFicha(aberta && id !== null, viz, aoIrPara);
  const mudarAberto = (valor: boolean) => {
    if (valor) return;
    if (!controlada) setAbaLocal(abaInicial);
    aoFechar();
  };
  return (
    <Sheet open={aberta && id !== null} onOpenChange={mudarAberto}>
      <SheetContent
        data-ficha-rh=""
        tabIndex={-1}
        className="flex w-full flex-col gap-0 p-0 outline-none sm:w-1/2 sm:min-w-[640px] sm:max-w-none motion-reduce:!animate-none [&>button:last-child]:hidden"
        onOpenAutoFocus={(e) => {
          origem.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          e.preventDefault();
          const ficha = document.querySelector<HTMLElement>("[data-ficha-rh]");
          // A carregar não há título: o foco fica no painel até a ficha chegar (`aoPronta`).
          (ficha?.querySelector<HTMLElement>("[data-titulo-ficha]") ?? ficha)?.focus();
        }}
        onCloseAutoFocus={(e) => {
          const alvo = focoDeRegresso(origem.current);
          if (!alvo) return;
          e.preventDefault();
          alvo.focus();
        }}
      >
        {id !== null && <ConteudoFichaRh key={id} id={id} vizinhas={viz} aoIr={ir} aba={aba} aoMudarAba={setAba} aoPronta={aoPronta} />}
      </SheetContent>
    </Sheet>
  );
}
