// A página de Pessoas na proposta simples (V2): leads e clientes numa só lista, com a ficha ao lado.
// No computador (lg e acima) são duas colunas: a lista e a ficha (a primeira da lista, se ninguém foi escolhido); abaixo disso só uma de cada vez, e a ficha ocupa o ecrã.
// A pessoa é uma só; lead e cliente são papéis dela. Esta página é só a casca: o estado e a escolha entre lista e ficha.
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SEM_FILTROS, pessoasDoSeparador, primeiraDaLista, separadorPorDefeito, todosApp, type FiltrosPessoa, type Ordem, type SeparadorLista } from "./pessoasDocs";
import { PessoaLista } from "./PessoaLista";
import { PessoaFicha, type SepFicha } from "./PessoaFicha";
import { PainelVazio } from "./PessoaResumo";
import { useDesktop } from "./useDesktop";
import type { Ctx } from "./pecas";

/** O que a página lembra quando se abre um negócio e se volta: vive fora do componente porque a página desmonta. */
interface Memoria { lista: SeparadorLista | null; sel: string | null; sep: SepFicha; f: FiltrosPessoa; ordem: Ordem }
const MEMORIA_VAZIA: Memoria = { lista: null, sel: null, sep: "resumo", f: SEM_FILTROS, ordem: "urgencia" };
let memoria: Memoria = MEMORIA_VAZIA;
const lembrar = (m: Partial<Memoria>): void => { memoria = { ...memoria, ...m }; };
/** Esquece tudo (por exemplo quando a demonstração é reposta). */
export function esquecerPessoas(): void { memoria = MEMORIA_VAZIA; }

export function PessoasSimples({ S, A, go, abrirEm }: Ctx & { abrirEm?: SeparadorLista }) {
  // Abrir por um separador diferente do que ficou guardado (por exemplo pelo menu) começa limpo; o mesmo separador recupera a escolha.
  const [lista, setListaEstado] = useState<SeparadorLista | null>(() => {
    if (abrirEm && abrirEm !== memoria.lista) lembrar({ lista: abrirEm, sel: null, sep: "resumo" });
    return abrirEm ?? memoria.lista;
  });
  const [sel, setSelEstado] = useState<string | null>(memoria.sel);
  const [f, setFEstado] = useState<FiltrosPessoa>(memoria.f);
  const [ordem, setOrdemEstado] = useState<Ordem>(memoria.ordem);
  const [sep, setSepEstado] = useState<SepFicha>(memoria.sep);
  const [focar, setFocar] = useState<string | null>(null);
  const setLista = (v: SeparadorLista) => { setListaEstado(v); lembrar({ lista: v }); };
  const setSel = (v: string | null) => { setSelEstado(v); lembrar(v === null ? { sel: null, sep: "resumo" } : { sel: v }); if (v === null) setSepEstado("resumo"); };
  const setF = (v: Partial<FiltrosPessoa>) => { const n = { ...f, ...v }; setFEstado(n); lembrar({ f: n }); };
  const setOrdem = (v: Ordem) => { setOrdemEstado(v); lembrar({ ordem: v }); };
  const setSep = (v: SepFicha) => { setSepEstado(v); lembrar({ sep: v }); };

  const aba = lista ?? separadorPorDefeito(S.role);
  const daUtilizador = sel ? todosApp(S).find((p) => p.nome === sel) : undefined;
  // No computador o painel nunca fica vazio: sem escolha do utilizador mostra-se a primeira da lista (a mais urgente). Esta escolha automática não se grava na memória.
  const desktop = useDesktop();
  const escolhida = daUtilizador ?? (desktop ? primeiraDaLista(S, aba, f, ordem) : undefined);

  // Ir de Leads para Clientes (ou ao contrário) pelo menu não remonta a página: o separador pedido aplica-se só quando abrirEm MUDA,
  // e não no mount, para não apagar a escolha guardada ao voltar de um negócio.
  const abrirAnterior = useRef(abrirEm);
  useEffect(() => {
    if (!abrirEm || abrirEm === abrirAnterior.current) return;
    abrirAnterior.current = abrirEm;
    lembrar({ lista: abrirEm, sel: null, sep: "resumo" });
    setListaEstado(abrirEm); setSelEstado(null); setSepEstado("resumo");
  }, [abrirEm]);
  // Se a pessoa escolhida deixou de existir (por exemplo depois de repor a demonstração), esquece-se a escolha.
  useEffect(() => {
    if (sel && !daUtilizador) { setSelEstado(null); setSepEstado("resumo"); lembrar({ sel: null, sep: "resumo" }); }
  }, [sel, daUtilizador]);
  // Ao voltar da ficha (no telemóvel a lista só reaparece então) o foco regressa à linha que se tinha escolhido.
  useEffect(() => {
    if (!focar || sel) return;
    document.querySelector<HTMLElement>(`[data-pessoa="${CSS.escape(focar)}"]`)?.focus();
    setFocar(null);
  }, [focar, sel]);

  // Mudar de pessoa na lista cancela uma confirmação de "perdida" que tivesse ficado aberta na ficha anterior.
  const abrir = (nome: string) => {
    if (S.confirmPerda !== null && nome !== escolhida?.nome) go(() => A.perderNao())();
    setSel(nome);
  };
  const leitura = !!S.leitura;

  return (
    <div className={cn("pessoas-pagina mx-auto w-full max-w-[1600px] lg:grid lg:h-dvh lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]", leitura && "pessoas-leitura")}>
      {escolhida && <h1 className="sr-only lg:hidden">Pessoas</h1>}
      <section aria-label="Lista de pessoas" className={cn("min-w-0 flex-col lg:flex lg:min-h-0 lg:border-r lg:border-border", escolhida ? "hidden" : "flex")}>
        <PessoaLista S={S} aba={aba} setAba={setLista} f={f} setF={setF} ordem={ordem} setOrdem={setOrdem} sel={escolhida?.nome ?? null} leitura={leitura}
          abrir={abrir} novaLead={go(() => A.novo())} />
      </section>
      <section aria-label={escolhida ? `Ficha de ${escolhida.nome}` : "Resumo"} className={cn("min-w-0 lg:block lg:min-h-0 lg:overflow-y-auto", escolhida ? "block" : "hidden")}>
        {escolhida
          ? <PessoaFicha key={escolhida.nome} S={S} A={A} go={go} p={escolhida} sep={sep} aoMudarSep={setSep} voltar={() => { setFocar(escolhida.nome); setSel(null); }} />
          : <PainelVazio haPessoas={pessoasDoSeparador(S, aba).length > 0} limpar={() => setF({ ...SEM_FILTROS })} novaLead={go(() => A.novo())} />}
      </section>
    </div>
  );
}
