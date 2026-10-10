// O separador Negócios da ficha, em mestre-detalhe pequeno: à esquerda a lista simples dos negócios da pessoa (UM item por negócio: ícone, título, estado, "2 orçamentos" e valor total);
// ao clicar num, a informação dele aparece ao lado (a partir de 640 px de largura, por container query) ou por baixo da lista (um de cada vez).
// Com um só negócio, vem escolhido por defeito. As linhas são botões: aria-pressed com o detalhe ao lado, aria-expanded (e aria-controls) com o detalhe por baixo.
// O negócio escolhido fica lembrado por pessoa, para sobreviver a mudar de pessoa e a abrir um negócio e voltar.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Estado } from "./motor";
import type { PessoaApp } from "./pessoasDocs";
import { textoOrcamentos, type NegocioApp } from "./negociosApp";
import { estadoDe } from "./perfilDocs";
import { negocioPorDefeito } from "./listaDocs";
import { COR_NEGOCIO, ICONE_NEGOCIO } from "./iconeNegocio";
import { Chip } from "./pecas";
import { Exemplo, Vazio } from "./FichaListas";
import { COR_PERDIDO, NegocioDetalhe, valorTexto } from "./NegocioBloco";

type Abrir = (id: number) => () => void;

/** O negócio escolhido de cada pessoa (pelo nome): vive fora do componente porque o separador desmonta ao mudar de pessoa ou ao abrir um negócio. */
const escolhas = new Map<string, string>();
/** Esquece os negócios escolhidos (quando a demonstração é reposta). */
export function esquecerNegocios(): void { escolhas.clear(); }

interface LinhaProps { n: NegocioApp; ativo: boolean; controla: string; porBaixo: boolean; escolher: () => void }

/** Uma linha da lista: UM botão com o ícone do negócio, o título, o estado em palavras (com "2 orçamentos") e o valor total. Perdido: a cinzento, com o motivo. */
function LinhaNegocio({ n, ativo, controla, porBaixo, escolher }: LinhaProps) {
  const perdido = n.perdido !== null, orcamentos = textoOrcamentos(n);
  return (
    <li>
      <button type="button" {...(porBaixo ? { "aria-expanded": ativo, "aria-controls": controla } : { "aria-pressed": ativo })} onClick={escolher}
        className={cn("flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", ativo ? "border-primary bg-muted" : "border-border")}>
        <Chip icone={ICONE_NEGOCIO} cor={perdido ? COR_PERDIDO : COR_NEGOCIO} />
        <span className="min-w-0 flex-1 text-[15px]">
          <span className={cn("block break-words text-base font-semibold", perdido ? "text-muted-foreground" : "text-foreground")}>{n.titulo}{n.demo && <Exemplo />}</span>
          <span className="block text-muted-foreground">{estadoDe(n)}{perdido ? ` · ${n.perdido}` : ""}{orcamentos ? ` · ${orcamentos}` : ""}</span>
          <span className={cn("block tabular-nums", perdido ? "text-muted-foreground" : "text-foreground")}>{valorTexto(n)}</span>
        </span>
      </button>
    </li>
  );
}

export function SepNegocios({ S, p, abrir }: { S: Estado; p: PessoaApp; abrir: Abrir }) {
  const negocios = p.todos;
  const [escolhido, setEscolhidoEstado] = useState<string | null>(escolhas.get(p.nome) ?? null);
  const [porBaixo, setPorBaixo] = useState(false);
  const idDetalhe = useId(), lista = useRef<HTMLUListElement>(null), detalhe = useRef<HTMLDivElement>(null);
  // O detalhe está por baixo quando começa depois do fim da lista (sem layout, como num teste, conta como ao lado).
  const medir = useCallback((): boolean => {
    const l = lista.current, d = detalhe.current;
    return !!l && !!d && l.getBoundingClientRect().height > 0 && d.getBoundingClientRect().top >= l.getBoundingClientRect().bottom - 1;
  }, []);
  // Volta a medir quando muda o que se vê (negócio escolhido, número de negócios) e quando a janela muda de tamanho.
  useLayoutEffect(() => { setPorBaixo(medir()); }, [medir, escolhido, negocios.length]);
  useEffect(() => {
    const aoRedimensionar = () => setPorBaixo(medir());
    window.addEventListener("resize", aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
  }, [medir]);
  if (!negocios.length) return <Vazio texto="Esta pessoa ainda não tem negócios." />;
  const ativo = negocioPorDefeito(negocios.map((x) => x.id), escolhido);
  const n = negocios.find((x) => x.id === ativo);
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
          {negocios.map((x) => <LinhaNegocio key={x.id} n={x} ativo={x.id === ativo} controla={idDetalhe} porBaixo={porBaixo} escolher={() => escolher(x.id)} />)}
        </ul>
        {n
          ? <NegocioDetalhe ref={detalhe} id={idDetalhe} S={S} n={n} abrir={abrir} />
          : <p id={idDetalhe} className="negocios-vazio border-l border-border pl-6 text-[15px] text-muted-foreground">Escolhe um negócio</p>}
      </div>
    </div>
  );
}
