// A página de Pessoas na proposta simples (V2): primeiro a lista (leads e clientes, a largura toda); ao clicar numa pessoa abre-se a ficha
// num painel lateral, com setas para a pessoa vizinha. Ninguém vem escolhido por defeito. A pessoa é uma só; lead e cliente são papéis dela.
// Esta página é só a casca: o estado e a ligação entre a lista e o painel.
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { separadorPorDefeito, type Ordem, type SeparadorLista } from "./pessoasDocs";
import { SEM_FILTROS_P, linhasDe, listaP, selecionar, type FiltrosP } from "./filtrosPessoas";
import { aplicarAcao, type AcaoP } from "./dashboardPessoas";
import type { Vista } from "./ListaTopo";
import { PessoaLista } from "./PessoaLista";
import { PessoaPainel } from "./PessoaPainel";
import type { SepFicha } from "./PessoaFicha";
import { esquecerNegocios } from "./SepNegocios";
import { esquecerNegociosV2 } from "./NegociosV2";
import { esquecerMaisGraficos } from "./MaisGraficos";
import { esquecerPerdas } from "./perdaDocs";
import type { Ctx } from "./pecas";

/** O que a página lembra quando se abre um negócio e se volta: vive fora do componente porque a página desmonta. */
interface Memoria { lista: SeparadorLista | null; sel: string | null; sep: SepFicha; f: FiltrosP; ordem: Ordem; vista: Vista }
const MEMORIA_VAZIA: Memoria = { lista: null, sel: null, sep: "resumo", f: SEM_FILTROS_P, ordem: "urgencia", vista: "lista" };
let memoria: Memoria = MEMORIA_VAZIA;
const lembrar = (m: Partial<Memoria>): void => { memoria = { ...memoria, ...m }; };
/** Esquece tudo (por exemplo quando a demonstração é reposta). */
export function esquecerPessoas(): void { memoria = MEMORIA_VAZIA; esquecerNegocios(); esquecerPerdas(); esquecerNegociosV2(); esquecerMaisGraficos(); }

/** Deixa a ficha de uma pessoa escolhida para quando a página Pessoas abrir (a V2 de Negócios usa-o em "Ver a pessoa"): no separador da lista a que ela pertence, sem filtros, no Resumo. */
export function escolherPessoa(nome: string, lista: SeparadorLista): void { lembrar({ lista, sel: nome, sep: "resumo", f: SEM_FILTROS_P }); }

/** `alvoAvisos` recebe o elemento do painel onde os avisos (toasts) devem aparecer enquanto ele está aberto, e `null` quando fecha. */
export function PessoasSimples({ S, A, go, abrirEm, alvoAvisos }: Ctx & { abrirEm?: SeparadorLista; alvoAvisos?: (el: HTMLElement | null) => void }) {
  // Abrir por um separador diferente do que ficou guardado (por exemplo pelo menu) começa limpo; o mesmo separador recupera a escolha.
  const [lista, setListaEstado] = useState<SeparadorLista | null>(() => {
    if (abrirEm && abrirEm !== memoria.lista) lembrar({ lista: abrirEm, sel: null, sep: "resumo" });
    return abrirEm ?? memoria.lista;
  });
  const [sel, setSelEstado] = useState<string | null>(memoria.sel);
  const [f, setFEstado] = useState<FiltrosP>(memoria.f);
  const [vista, setVistaEstado] = useState<Vista>(memoria.vista);
  const [ordem, setOrdemEstado] = useState<Ordem>(memoria.ordem);
  // Depois de um cartão ou uma barra do dashboard o foco passa para o título da Lista e a mudança é anunciada.
  const [pedidoFoco, setPedidoFoco] = useState(0);
  const [aviso, setAviso] = useState("");
  const [sep, setSepEstado] = useState<SepFicha>(memoria.sep);
  const setLista = (v: SeparadorLista) => { setListaEstado(v); lembrar({ lista: v }); };
  const setSel = (v: string | null) => { setSelEstado(v); lembrar(v === null ? { sel: null, sep: "resumo" } : { sel: v }); if (v === null) setSepEstado("resumo"); };
  const setF = (v: Partial<FiltrosP>) => { const n = { ...f, ...v }; setFEstado(n); lembrar({ f: n }); };
  const setVista = (v: Vista) => { setVistaEstado(v); lembrar({ vista: v }); };
  /** Um cartão ou uma barra do dashboard: junta os filtros, eventualmente muda de separador, e passa à Lista. */
  const agir = (acao: AcaoP, rotulo: string) => {
    const r = aplicarAcao(aba, f, acao);
    setListaEstado(r.aba); setFEstado(r.f); setVistaEstado("lista");
    lembrar({ lista: r.aba, f: r.f, vista: "lista" });
    const n = selecionar(linhasDe(S), r.aba, r.f).length;
    setAviso(`Lista filtrada por ${rotulo}: ${n === 1 ? "1 pessoa" : `${n} pessoas`}`); setPedidoFoco((v) => v + 1);
  };
  const setOrdem = (v: Ordem) => { setOrdemEstado(v); lembrar({ ordem: v }); };
  const setSep = (v: SepFicha) => { setSepEstado(v); lembrar({ sep: v }); };

  const aba = lista ?? separadorPorDefeito(S.role);
  const linhas = linhasDe(S);
  const escolhida = sel ? linhas.find((l) => l.p.nome === sel)?.p : undefined;
  const nomes = listaP(S, linhas, aba, f, ordem).map((l) => l.p.nome);

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
    if (sel && !escolhida) { setSelEstado(null); setSepEstado("resumo"); lembrar({ sel: null, sep: "resumo" }); }
  }, [sel, escolhida]);
  // Sempre que a pessoa mostrada muda (clique na lista ou nas setas), cancela-se uma confirmação de "perdida" que tivesse ficado aberta na ficha anterior.
  const nomeEscolhido = escolhida?.nome ?? null;
  const nomeAnterior = useRef(nomeEscolhido);
  useEffect(() => {
    if (nomeAnterior.current === nomeEscolhido) return;
    nomeAnterior.current = nomeEscolhido;
    if (S.confirmPerda !== null) go(() => A.perderNao())();
  }, [nomeEscolhido, S.confirmPerda, go, A]);
  const leitura = !!S.leitura;

  return (
    <div className={cn("mx-auto w-full max-w-[1600px]", leitura && "pessoas-leitura")}>
      <PessoaLista S={S} linhas={linhas} aba={aba} setAba={setLista} vista={vista} setVista={setVista} f={f} setF={setF} ordem={ordem} setOrdem={setOrdem} leitura={leitura} abrir={setSel}
        novaLead={go(() => A.novo())} agir={agir} aviso={aviso} pedidoFoco={pedidoFoco} />
      <PessoaPainel S={S} A={A} go={go} p={escolhida} nomes={nomes} leitura={leitura} sep={sep} aoMudarSep={setSep} abrir={setSel} fechar={() => setSel(null)} alvoAvisos={alvoAvisos} />
    </div>
  );
}
