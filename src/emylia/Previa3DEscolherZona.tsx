// 25/11: o painel «Zona: Frente» da pré-visualização 3D: a zona escolhida (clicando numa parte da peça, ou pelo botão da zona no painel «Zonas», que é a via de teclado e de leitor de ecrã).
// 26/11: passa a `ZonaEscolhida`, o andar «Zona» do painel «Aspeto 3D». Cada zona mostra DUAS camadas: «Cor desta zona» (Automático, um atributo de cor, Sem cor) e «Superfície desta zona»
// (Automático, Tonalidade, Brilho, Sem superfície), cada uma com uma linha «Porquê» que diz de onde vem o que se vê (a regra para todas as zonas, uma excepção, uma ligação directa, o
// automático, ou um conflito com o botão que o resolve ali mesmo). Escolher actualiza o RASCUNHO das regras (o 3D acompanha logo); quem grava é o painel «Aspeto 3D». Sem three: só o ecrã.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { AmostraOpcao } from "./AmostraOpcao";
import type { Ligacao } from "./config3dDados";
import {
  aplicarEscolhaNaZona, aplicarSuperficieNaZona, escolhaAtualDaZona, escolhaDeSuperficieDaZona, type ContextoEscolha, type EscolhaDaZona,
} from "./escolherZona";
import type { LeituraDoProduto } from "./planta3d/acabamentoCor3d";
import { rotuloDaZona, type ZonaGlb, type ZonaVisual } from "./planta3d/zonasGlb";
import type { OrigemCamada, Participante, PorqueCamada, PorqueDaZona } from "./porqueDaZona";

const NOTA = "text-[15px] text-muted-foreground";
const BOTAO = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-4 text-[15px] font-medium transition-colors duration-200 hover:bg-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const OPCAO = "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input bg-card px-3 py-2 text-[15px] transition-colors duration-200 hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";
const SELECT = "min-h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Como se diz o que pinta a zona hoje: o atributo e de onde vem («por omissão» pelo nome, «por ligação» escolhida), ou que nenhum a pinta. */
function textoDoQuePinta(zona: ZonaVisual | undefined, escolha: EscolhaDaZona | null, nomeDoAtributo: (id: string) => string | undefined): string {
  if (escolha?.tipo === "nenhum") return "nenhum atributo (a zona fica na cor do modelo)";
  const nome = zona?.atributo || (escolha?.tipo === "atributo" ? nomeDoAtributo(escolha.id) : undefined);
  if (!nome) return "nenhum atributo de cor (a zona fica na cor do modelo)";
  return `${nome} (${escolha?.tipo === "atributo" ? "por ligação" : "por omissão"})`;
}

/** As regras que o painel da zona edita: as em vigor (o rascunho) e como as mudar. Ausente: não há configuração 3D e a zona só se vê. */
export interface LigacoesEditaveis {
  valor: readonly Ligacao[];
  podeEditar: boolean;
  aoMudar: (l: Ligacao[]) => void;
}

const VIA: Record<Participante["via"], string> = { zona: "só esta zona", tudo: "todas as zonas", automatico: "automático" };

/** A frase do «Porquê» de uma camada, em linguagem simples (as origens estão em porqueDaZona.ts). */
function frasePorque(o: OrigemCamada, camada: "cor" | "superficie"): string {
  switch (o.tipo) {
    case "nenhuma": return camada === "cor" ? "nenhum atributo pinta esta zona: fica na cor do modelo." : "nenhum atributo dá superfície a esta zona: fica a do modelo.";
    case "automatico": return camada === "cor" ? `automático: o atributo «${o.atributo}» pinta pelo nome.` : `automático: «${o.atributo}» dá a superfície a todas as zonas.`;
    case "regra-tudo": return `vem da regra «${o.atributo} → Todas as zonas».`;
    case "explicita": return `ligação directa: «${o.atributo}» está ligado a esta zona.`;
    case "da-cor": return `vem da opção escolhida em «${o.atributo}».`;
    case "conflito": return `duas regras pintam esta zona: «${o.vencedor.nome}» (${VIA[o.vencedor.via]}) e «${o.perdedor.nome}» (${VIA[o.perdedor.via]}). Hoje ganha «${o.vencedor.nome}» porque vem primeiro na lista de atributos.`;
  }
}

interface OpcaoDeCamada { chave: string; escolha: EscolhaDaZona | null; rotulo: ReactNode; texto: string; anuncio: string }

/**
 * Uma escolha única (cor ou superfície): rádios com alvos de 44 px (as setas mudam a escolha); no telemóvel, um seletor (menos altura). `escolha` null: a opção só se mostra marcada
 * (a regra gravada a um atributo que o produto já não tem) e não se pode escolher.
 */
function EscolhaDeCamada({ legenda, ajuda, opcoes, marcada, aoEscolher, movel }: {
  legenda: string; ajuda?: string; opcoes: readonly OpcaoDeCamada[]; marcada: string | null; aoEscolher: (e: EscolhaDaZona, anuncio: string) => void; movel: boolean;
}) {
  const id = useId();
  if (movel) {
    return (
      <div className="grid gap-1">
        <label htmlFor={`${id}-s`} className="text-[15px] font-medium">{legenda}</label>
        {ajuda && <p className={NOTA}>{ajuda}</p>}
        <select id={`${id}-s`} value={marcada ?? ""} className={SELECT}
          onChange={(e) => { const o = opcoes.find((x) => x.chave === e.target.value); if (o?.escolha) aoEscolher(o.escolha, o.anuncio); }}>
          {opcoes.map((o) => <option key={o.chave} value={o.chave} disabled={!o.escolha}>{o.texto}</option>)}
        </select>
      </div>
    );
  }
  return (
    <fieldset className="grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-1 text-[15px] font-medium">{legenda}</legend>
      {ajuda && <p className={NOTA}>{ajuda}</p>}
      {opcoes.map((o) => (
        <label key={o.chave} className={OPCAO}>
          <input type="radio" name={`${id}-r`} checked={marcada === o.chave} readOnly={!o.escolha}
            onChange={() => { if (o.escolha) aoEscolher(o.escolha, o.anuncio); }} className="h-5 w-5 shrink-0 accent-primary" />
          {o.rotulo}
        </label>
      ))}
    </fieldset>
  );
}

/** O «Porquê» de uma camada: a origem em texto, as excepções, e o botão que resolve o caso ali mesmo (só quem pode editar). */
function Porque({ camada, tipo, editavel, aoExcecao, aoPrioridade }: {
  camada: PorqueCamada; tipo: "cor" | "superficie"; editavel: boolean; aoExcecao: (atributoId: string) => void; aoPrioridade: (perdedor: Participante) => void;
}) {
  const id = useId();
  const o = camada.origem;
  return (
    <div aria-live="polite" className="grid gap-2">
      {o.tipo === "conflito" ? (
        <div className="grid gap-2 rounded-lg border border-amber-500/50 bg-amber-50 p-2 text-[15px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <p id={id} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>Porquê: {frasePorque(o, tipo)}</span></p>
          {editavel && <button type="button" aria-describedby={id} onClick={() => aoPrioridade(o.perdedor)} className={cn(BOTAO, "justify-self-start")}>Dar prioridade a {o.perdedor.nome} nesta zona</button>}
        </div>
      ) : (
        <>
          <p id={id} className="text-[15px]">Porquê: {frasePorque(o, tipo)}</p>
          {editavel && o.tipo === "regra-tudo" && <button type="button" aria-describedby={id} onClick={() => aoExcecao(o.atributoId)} className={cn(BOTAO, "justify-self-start")}>Só esta zona é diferente</button>}
        </>
      )}
      {camada.excecoes.map((e) => (
        <p key={e.id} className={NOTA}>Excepção: nesta zona «{e.nome}» não pinta{e.daRegraTudo ? " (a regra «Todas as zonas» manda nas outras)" : ""}.</p>
      ))}
    </div>
  );
}

export interface PropsZonaEscolhida {
  zona: ZonaGlb;
  /** O que pinta a zona hoje (a aparência da pré-visualização); ausente: nenhum atributo. */
  pintadaPor: ZonaVisual | undefined;
  /** Os atributos do produto que dão cor ou foto (os da camada «Cor»). */
  atributosCor: readonly LeituraDoProduto[];
  /** Os atributos do produto que dão a superfície (Tonalidade, Brilho: a camada «Superfície»). Vazia: o bloco não aparece. */
  atributosSuperficie: readonly LeituraDoProduto[];
  /** As regras em vigor; ausente quando não há configuração 3D (então só se vê). */
  ligacoes?: LigacoesEditaveis;
  /** As zonas que um atributo pinta hoje: para ligá-lo a outra zona sem tirar o que ele já pinta. */
  pintaHoje: (atributo: string) => readonly ZonaGlb[];
  /** Os atributos que pintam uma zona só pelo nome (ver escolherZona.ts): a ligação escolhida manda sobre eles. */
  pelaNome?: ContextoEscolha["pelaNome"];
  /** De onde vem o que a zona leva (porqueDaZona); ausente: não se mostra o «Porquê». */
  porque?: PorqueDaZona;
  /** A zona foi escolhida clicando no 3D: o foco passa ao título do painel (quem a escolhe pelo botão do painel «Zonas» fica onde estava). */
  focarAoAbrir?: boolean;
  /** Fecha (botão X ou Escape): quem abriu devolve o foco ao sítio de onde veio. */
  aoFechar: () => void;
}

// O estado do painel (anúncio) é DESTA zona: quem o usa leva `key={zona}` para ele não passar à zona seguinte.
export function ZonaEscolhida({ zona, pintadaPor, atributosCor, atributosSuperficie, ligacoes, pintaHoje, pelaNome, porque, focarAoAbrir = false, aoFechar }: PropsZonaEscolhida) {
  const id = useId();
  const movel = useIsMobile();
  const titulo = useRef<HTMLHeadingElement>(null);
  const seccao = useRef<HTMLElement>(null);
  // com o painel ao lado do 3D (≥ 1024 px) ele já está à vista; por baixo do 3D (telemóvel, tablet) fica depois de «Zonas» e «Medidas», e escolher a zona leva-o à vista (suave, salvo «reduzir movimento»)
  const aoLado = () => typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches;
  // o foco passa ao título (clique no 3D); por baixo do 3D sem o salto brusco do próprio foco, que o salto suave de baixo substitui
  useEffect(() => { if (focarAoAbrir) titulo.current?.focus({ preventScroll: !aoLado() }); }, [focarAoAbrir]);
  useEffect(() => {
    if (aoLado()) return;
    const reduzir = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    seccao.current?.scrollIntoView?.({ behavior: reduzir ? "auto" : "smooth", block: "start" });
  }, []);
  const [anuncio, setAnuncio] = useState("");
  const idsCor = atributosCor.map((a) => a.id), idsSuperficie = atributosSuperficie.map((a) => a.id);
  const nomeDeCor = (a: string) => atributosCor.find((x) => x.id === a)?.nome;
  const nomeDeSuperficie = (a: string) => atributosSuperficie.find((x) => x.id === a)?.nome;
  const rotulo = rotuloDaZona(zona);
  const editavel = !!ligacoes?.podeEditar;
  const valor = ligacoes?.valor ?? [];
  const atualCor = ligacoes ? escolhaAtualDaZona(valor, zona, idsCor, pintadaPor?.atributo, nomeDeCor, idsSuperficie) : null;
  const atualSuperficie = ligacoes && idsSuperficie.length ? escolhaDeSuperficieDaZona(valor, zona, idsSuperficie, pintadaPor?.acabamento, nomeDeSuperficie) : null;

  const mudar = (nova: Ligacao[], depois: string) => {
    if (!ligacoes) return;
    if (JSON.stringify(nova) === JSON.stringify(ligacoes.valor)) return; // nada mudou (ex.: «Sem cor» sem atributos de cor): não se anuncia
    ligacoes.aoMudar(nova);
    setAnuncio(`${rotulo}: ${depois}`);
  };
  const ctxCor: ContextoEscolha = { atributosDaCor: idsCor, pintaHoje, ...(pelaNome ? { pelaNome } : {}), atributosDeSuperficie: idsSuperficie };
  const escolherCor = (e: EscolhaDaZona, depois: string) => mudar(aplicarEscolhaNaZona(valor, zona, e, ctxCor), depois);
  const escolherSuperficie = (e: EscolhaDaZona, depois: string) => mudar(aplicarSuperficieNaZona(valor, zona, e, { atributosDeSuperficie: idsSuperficie }), depois);
  // «Só esta zona é diferente»: o atributo da regra «Todas as zonas» deixa de pintar só esta zona (a zona explícita vence «Todas as zonas»)
  const abrirExcecao = (atributoId: string, nome: string) => mudar([...valor.filter((l) => !(l.atributo === atributoId && l.zona === zona)), { atributo: atributoId, zona, aplicar: false }], `${nome} não pinta esta zona`);
  // o botão que resolveu o caso desaparece: o foco vai ao título da zona em vez de cair no corpo da página
  const focarTitulo = () => titulo.current?.focus();
  const aoKeyDown = (e: KeyboardEvent<HTMLElement>) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); aoFechar(); } };

  const chaveDe = (e: EscolhaDaZona | null): string | null => (!e ? null : e.tipo === "atributo" ? `atributo:${e.id}` : e.tipo);
  // a regra gravada é a um atributo que o produto já não tem: o rádio dele não existe, e sem este nenhum ficava marcado
  const foraDoProduto = (atual: EscolhaDaZona | null, ids: readonly string[]) => atual?.tipo === "atributo" && !ids.includes(atual.id);
  const amostra = (a: LeituraDoProduto) => (
    <>
      <AmostraOpcao foto={a.opcao.foto} hex={a.opcao.hex} nome={a.opcao.nome} />
      <span><strong className="font-medium">{a.nome}</strong>{" "}<span className="text-muted-foreground">{a.opcao.nome}</span></span>
    </>
  );
  const opcoesCor: OpcaoDeCamada[] = [
    { chave: "nome", escolha: { tipo: "nome" }, rotulo: <span>Automático (pelo nome do atributo)</span>, texto: "Automático", anuncio: "automático" }, // no seletor do telemóvel cabe só «Automático»: o «Porquê» diz que é pelo nome
    ...(foraDoProduto(atualCor, idsCor) ? [{ chave: `atributo:${(atualCor as { id: string }).id}`, escolha: null, rotulo: <span>Regra a um atributo que o produto já não tem</span>, texto: "Regra a um atributo que o produto já não tem", anuncio: "" }] : []),
    ...atributosCor.map((a) => ({ chave: `atributo:${a.id}`, escolha: { tipo: "atributo", id: a.id } as EscolhaDaZona, rotulo: amostra(a), texto: `${a.nome} · ${a.opcao.nome}`, anuncio: a.nome })),
    { chave: "nenhum", escolha: { tipo: "nenhum" }, rotulo: <span>Sem cor</span>, texto: "Sem cor", anuncio: "sem cor" },
  ];
  // «Automático» só quando quer dizer alguma coisa: há atributos de superfície sem regras (actuam em todas as zonas) ou a zona está assim agora
  const haAutomatico = atualSuperficie?.tipo === "nome" || idsSuperficie.some((s) => !valor.some((l) => l.atributo === s));
  const opcoesSuperficie: OpcaoDeCamada[] = [
    ...(haAutomatico ? [{ chave: "nome", escolha: { tipo: "nome" } as EscolhaDaZona, rotulo: <span>Automático</span>, texto: "Automático", anuncio: "superfície automática" }] : []),
    ...atributosSuperficie.map((a) => ({ chave: `atributo:${a.id}`, escolha: { tipo: "atributo", id: a.id } as EscolhaDaZona, rotulo: amostra(a), texto: `${a.nome} · ${a.opcao.nome}`, anuncio: `superfície ${a.nome}` })),
    { chave: "nenhum", escolha: { tipo: "nenhum" }, rotulo: <span>Sem superfície (usa a da cor)</span>, texto: "Sem superfície (usa a da cor)", anuncio: "sem superfície" },
  ];

  return (
    <section ref={seccao} aria-labelledby={`${id}-t`} onKeyDown={aoKeyDown} className="grid scroll-mt-20 gap-3 rounded-xl border border-primary/50 bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <h4 id={`${id}-t`} ref={titulo} tabIndex={-1} className="text-[15px] font-semibold focus:outline-none">Zona: {rotulo}</h4>
        <button type="button" onClick={aoFechar} aria-label={`Deixar de escolher a zona ${rotulo}`} title="Fechar" className={cn(BOTAO, "min-w-11 px-0")}><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      <p className="text-[15px]">
        Pinta-a hoje: {textoDoQuePinta(pintadaPor, atualCor, nomeDeCor)}{pintadaPor?.acabamento ? ` · Superfície: ${pintadaPor.acabamento}` : ""}
      </p>

      {!ligacoes && <p className={NOTA}>Só para ver: a escolha do atributo faz-se na ficha de um produto da base.</p>}
      {ligacoes && !editavel && <p className={NOTA}>Para escolher o que pinta esta zona precisa da permissão de editar produtos.</p>}
      {editavel && atributosCor.length === 0 && <p className={NOTA}>Este produto não tem nenhum atributo de cor ou foto para escolher.</p>}

      {editavel && <EscolhaDeCamada legenda="Cor desta zona" opcoes={opcoesCor} marcada={chaveDe(atualCor)} aoEscolher={escolherCor} movel={movel} />}
      {porque && (
        <Porque camada={porque.cor} tipo="cor" editavel={editavel} aoExcecao={(a) => { abrirExcecao(a, nomeDeCor(a) ?? "O atributo"); focarTitulo(); }}
          aoPrioridade={(p) => { escolherCor({ tipo: "atributo", id: p.id }, p.nome); focarTitulo(); }} />
      )}

      {atributosSuperficie.length > 0 && (
        <>
          {editavel && (
            <EscolhaDeCamada legenda="Superfície desta zona" ajuda="A superfície muda o brilho e o tom por cima da cor. Não muda a cor nem o metal."
              opcoes={opcoesSuperficie} marcada={chaveDe(atualSuperficie)} aoEscolher={escolherSuperficie} movel={movel} />
          )}
          {porque && (
            <Porque camada={porque.superficie} tipo="superficie" editavel={editavel} aoExcecao={(a) => { abrirExcecao(a, nomeDeSuperficie(a) ?? "O atributo"); focarTitulo(); }}
              aoPrioridade={(p) => { escolherSuperficie({ tipo: "atributo", id: p.id }, `superfície ${p.nome}`); focarTitulo(); }} />
          )}
        </>
      )}
      <p aria-live="polite" className="sr-only">{anuncio}</p>
    </section>
  );
}
