// O separador Negócios da ficha, em mestre-detalhe pequeno: à esquerda a lista simples dos negócios da pessoa (ícone, serviço, estado e valor);
// ao clicar num, a informação dele aparece ao lado (a partir de 640 px de largura, por container query) ou por baixo da lista (um de cada vez).
// Com um só negócio, vem escolhido por defeito. As linhas são botões: aria-pressed com o detalhe ao lado, aria-expanded (e aria-controls) com o detalhe por baixo.
// O negócio escolhido fica lembrado por pessoa, para sobreviver a mudar de pessoa e a abrir um negócio e voltar.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Estado } from "./motor";
import { itensPessoa, negociosAgrupados, type GrupoNegocio, type PessoaApp } from "./pessoasDocs";
import { estadoCurto } from "./perfilDocs";
import { negocioPorDefeito } from "./listaDocs";
import { COR_NEGOCIO, ICONE_NEGOCIO } from "./iconeNegocio";
import { Chip } from "./pecas";
import { Vazio } from "./FichaListas";
import { NegocioDetalhe, valorTexto } from "./NegocioBloco";

type Abrir = (id: number) => () => void;

/** O negócio escolhido de cada pessoa (pelo nome): vive fora do componente porque o separador desmonta ao mudar de pessoa ou ao abrir um negócio. */
const escolhas = new Map<string, string>();
/** Esquece os negócios escolhidos (quando a demonstração é reposta). */
export function esquecerNegocios(): void { escolhas.clear(); }

interface LinhaProps { g: GrupoNegocio; ativo: boolean; controla: string; porBaixo: boolean; escolher: () => void }

/** Uma linha da lista: UM botão com o ícone do negócio, o serviço como título, o estado em palavras e o valor. */
function LinhaNegocio({ g, ativo, controla, porBaixo, escolher }: LinhaProps) {
  const d = g.negocio!;
  return (
    <li>
      <button type="button" {...(porBaixo ? { "aria-expanded": ativo, "aria-controls": controla } : { "aria-pressed": ativo })} onClick={escolher}
        className={cn("flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", ativo ? "border-primary bg-muted" : "border-border")}>
        <Chip icone={ICONE_NEGOCIO} cor={COR_NEGOCIO} />
        <span className="min-w-0 flex-1 text-[15px]">
          <span className="block break-words text-base font-semibold text-foreground">{d.servico}</span>
          <span className="block text-muted-foreground">{estadoCurto(d)}</span>
          <span className="block tabular-nums text-foreground">{valorTexto(g.principal)}</span>
        </span>
      </button>
    </li>
  );
}

export function SepNegocios({ S, p, abrir }: { S: Estado; p: PessoaApp; abrir: Abrir }) {
  const itens = itensPessoa(S, p), grupos = negociosAgrupados(p, itens);
  const [escolhido, setEscolhidoEstado] = useState<string | null>(escolhas.get(p.nome) ?? null);
  const [porBaixo, setPorBaixo] = useState(false);
  const idDetalhe = useId(), lista = useRef<HTMLUListElement>(null), detalhe = useRef<HTMLDivElement>(null);
  // O detalhe está por baixo quando começa depois do fim da lista (sem layout, como num teste, conta como ao lado).
  const medir = useCallback((): boolean => {
    const l = lista.current, d = detalhe.current;
    return !!l && !!d && l.getBoundingClientRect().height > 0 && d.getBoundingClientRect().top >= l.getBoundingClientRect().bottom - 1;
  }, []);
  // Volta a medir quando muda o que se vê (negócio escolhido, número de negócios) e quando a janela muda de tamanho.
  useLayoutEffect(() => { setPorBaixo(medir()); }, [medir, escolhido, itens.length]);
  useEffect(() => {
    const aoRedimensionar = () => setPorBaixo(medir());
    window.addEventListener("resize", aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
  }, [medir]);
  if (!itens.length) return <Vazio texto="Esta pessoa ainda não tem negócios." />;
  const ativo = negocioPorDefeito(grupos.filter((x) => x.negocio).map((x) => x.chave), escolhido);
  const g = grupos.find((x) => x.chave === ativo);
  // Lado a lado o foco fica no botão; quando o detalhe aparece por baixo da lista, passa para ele (senão quem usa teclado ou leitor não o encontra).
  const escolher = (chave: string) => {
    escolhas.set(p.nome, chave);
    setEscolhidoEstado(chave);
    requestAnimationFrame(() => { if (medir()) detalhe.current?.focus(); });
  };
  return (
    <div className="negocios-cx">
      <div className="negocios-md">
        <ul ref={lista} className="grid min-w-0 content-start gap-2" aria-label="Negócios desta pessoa">
          {grupos.map((x) => x.negocio
            ? <LinhaNegocio key={x.chave} g={x} ativo={x.chave === ativo} controla={idDetalhe} porBaixo={porBaixo} escolher={() => escolher(x.chave)} />
            : <li key={x.chave} role="alert" className="text-[15px] text-muted-foreground">Negócio não encontrado nos dados de exemplo ({x.principal.servico}).</li>)}
        </ul>
        {g?.negocio
          ? <NegocioDetalhe ref={detalhe} id={idDetalhe} S={S} g={g} d={g.negocio} abrir={abrir} />
          : <p id={idDetalhe} className="negocios-vazio border-l border-border pl-6 text-[15px] text-muted-foreground">Escolhe um negócio</p>}
      </div>
    </div>
  );
}
