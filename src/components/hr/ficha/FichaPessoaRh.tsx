// A ficha da pessoa de RH, num painel lateral (Sheet) que cobre metade do ecrã (no mínimo 640 px; em ecrã estreito, todo) por
// cima da lista, como a ficha de Pessoas: cabeçalho com navegação "n de N", ações, abas sublinhadas fixas e conteúdo
// que rola. [ e ] passam à pessoa anterior e seguinte (com o foco no cabeçalho: ver `useTeclasFicha`). O "X" por defeito do
// Sheet esconde-se por classe: a ficha tem o seu próprio Fechar. Ao fechar, o foco volta ao que abriu a ficha (ou, se já não
// existe, ao título da página).
//
// A ABA vive no URL (quem decide é a página, `?aba=`): aqui só se mostra a que vem e se avisa quando muda.
//
// FOCO: ao abrir, enquanto a ficha carrega, o foco fica no próprio painel (`tabIndex=-1`); quando a ficha chega, o conteúdo
// avisa (`aoPronta`) e o foco passa para o título (ou, ao navegar com [ ] e as setas, para o mesmo botão).
import { useRef } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ConteudoFichaRh } from "./ConteudoFichaRh";
import { vizinhas } from "./navegacao";
import type { ColegaDaFicha } from "./useContextoFicha";
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
  /** A aba aberta (por omissão a Visão geral). Vem do URL: recarregar a página ou partilhar a ligação não a perde. */
  aba?: string;
  /** A aba mudou: a página escreve-a no URL. */
  aoMudarAba: (aba: string) => void;
  /** Todas as pessoas da organização (a lista que a página já tem): o nome da chefia e o seletor de chefia saem daqui. */
  colegas: readonly ColegaDaFicha[];
}

const ABA_INICIAL = "visaoGeral";

/** O foco depois de fechar: o elemento que abriu a ficha; se já não existe, o título da página. */
function focoDeRegresso(origem: HTMLElement | null): HTMLElement | null {
  if (origem && origem.isConnected && origem !== document.body) return origem;
  const titulo = document.querySelector<HTMLElement>("h1");
  titulo?.setAttribute("tabindex", "-1");
  return titulo;
}

export function FichaPessoaRh({ id, aberta, aoFechar, idsVisiveis, aoIrPara, aba = ABA_INICIAL, aoMudarAba, colegas }: FichaPessoaRhProps) {
  const origem = useRef<HTMLElement | null>(null);
  const conteudo = useRef<HTMLDivElement>(null);
  const viz = vizinhas(idsVisiveis, id ?? "");
  const { ir, aoPronta } = useTeclasFicha(aberta && id !== null, viz, aoIrPara);
  const mudarAberto = (valor: boolean) => {
    if (valor) return;
    aoFechar();
  };
  return (
    <Sheet open={aberta && id !== null} onOpenChange={mudarAberto}>
      <SheetContent
        ref={conteudo}
        data-ficha-rh=""
        tabIndex={-1}
        className="flex w-full flex-col gap-0 p-0 outline-none sm:w-1/2 sm:min-w-[640px] sm:max-w-none motion-reduce:!animate-none [&>button:last-child]:hidden"
        onOpenAutoFocus={(e) => {
          origem.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          e.preventDefault();
          // Com a ficha já à vista, o título; a carregar, o próprio painel (nada mais existe) até ela chegar (`aoPronta`).
          (conteudo.current?.querySelector<HTMLElement>("[data-titulo-ficha]") ?? conteudo.current)?.focus();
        }}
        onCloseAutoFocus={(e) => {
          const alvo = focoDeRegresso(origem.current);
          if (!alvo) return;
          e.preventDefault();
          alvo.focus();
        }}
      >
        {id !== null && (
          <ConteudoFichaRh
            key={id} id={id} vizinhas={viz} aoIr={ir} aba={aba} aoMudarAba={aoMudarAba} colegas={colegas} aoPronta={aoPronta}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
