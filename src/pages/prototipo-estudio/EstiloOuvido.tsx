// 12/11 (Rúben: «se o cliente disser que quer tudo preto, o Estúdio no passo dos estilos já sugere tudo a preto e combinações boas para
// preto»; «ao dizer que quero tirar o bidé, deve também tirar o bidé»; «e os serviços a mesma coisa!»). Dois cartões do passo «Estilo»:
//  · «Pelo que se disse na conversa»: o que se disse das cores, das peças e dos serviços, na chamada e na visita (esta ao vivo: a gravação
//    continua no Estúdio). Cada coisa nova que se diz aplica-se sozinha, por cima do que lá está (com «Desfazer»); o que já se aplicou
//    não volta a ser aplicado, por isso o que o comercial muda à mão depois fica.
//  · «Combinações para o preto»: o que um designer proporia com a cor principal, com as cores dos produtos que o catálogo escolheria.
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Ear, Palette, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGravacao } from "@/emylia/gravador";
import { PECAS, type TipoPeca } from "@/emylia/planta";
import { ACOMPANHA, NOME_CATEGORIA, melhorPara, type Categoria, type Cor, type Estilo } from "./catalogoFake";
import { aplicarEstilo, decidir, juntarPorColocar, juntarServico, tirarServico, type Decisao, type Projeto } from "./necessidadesEstudio";
import { recusarSugestao } from "./sugestoesServicos";
import { amostras, chavesDosDitos, combinacoesPara, ditosDaConversa, estiloDosDitos, juntarEstilo, mesmoEstilo, nomeCor, tempo, type DitoEstilo, type EstiloOuvido } from "./estiloDaConversa";
import { chavesDosPedidos, pedidosDaConversa, resumoPedidos, type DitoPeca, type Pedidos } from "./pedidosDaConversa";
import { chip } from "./pecasEstudio";

type SetP = React.Dispatch<React.SetStateAction<Projeto>>;

/** Mudar o estilo e escolher de novo o que combina (as peças trocadas e novas, as paredes e o chão). */
export const comEstilo = (x: Projeto, estilo: Estilo, manual: boolean): Projeto =>
  ({ ...aplicarEstilo({ ...x, estilo }, (cat) => melhorPara(cat, estilo)?.id), estiloManual: manual || x.estiloManual });

const acompanhaRecomendado = (tipo: TipoPeca, p: Projeto): Partial<Record<Categoria, string>> =>
  Object.fromEntries((ACOMPANHA[tipo] ?? []).map((cat) => [cat, melhorPara(cat, p.estilo)?.id]).filter(([, id]) => !!id));

/** Uma decisão dita sobre uma peça: a que há hoje fica, troca-se ou sai; uma que não há junta-se por colocar (com o recomendado). */
export function aplicarPeca(x: Projeto, tipo: TipoPeca, acao: DitoPeca["acao"]): Projeto {
  const hoje = x.antes.pecas.filter((pc) => pc.tipo === tipo && !PECAS[pc.tipo].abertura);
  if (hoje.length) {
    const d: Decisao = acao === "junta" ? "troca" : acao;
    return hoje.reduce((acc, pc) => {
      const r = decidir(acc, pc.id, d, melhorPara(pc.tipo, acc.estilo)?.id);
      return d === "troca" ? { ...r, acompanha: { ...r.acompanha, [pc.id]: { ...acompanhaRecomendado(pc.tipo, r), ...(r.acompanha[pc.id] ?? {}) } } } : r;
    }, x);
  }
  if (acao === "tira") return { ...x, porColocar: (x.porColocar ?? []).filter((c) => c.tipo !== tipo) };
  if (acao === "fica" || (x.porColocar ?? []).some((c) => c.tipo === tipo) || x.depois.pecas.some((pc) => pc.tipo === tipo)) return x;
  return juntarPorColocar(x, { tipo, produto: melhorPara(tipo, x.estilo)?.id, acompanha: acompanhaRecomendado(tipo, x) });
}

/** O que se disse: o que já estava gravado no negócio e a gravação deste negócio, ao vivo. */
export function useEstiloOuvido(p: Projeto): { ouvido: EstiloOuvido | null; pedidos: Pedidos; aOuvir: boolean } {
  const g = useGravacao();
  const vivo = p.negocio !== undefined && g.negocio === p.negocio;
  const substitui = vivo && g.falas.length > 0;
  const ditosVivos = useMemo(() => (vivo ? ditosDaConversa(g.falas, g.modo) : []), [vivo, g.falas, g.modo]);
  const pedidosVivos = useMemo(() => (vivo ? pedidosDaConversa(g.falas, g.modo) : { pecas: [], servicos: [] }), [vivo, g.falas, g.modo]);
  const ouvido = useMemo(() => {
    // a conversa ao vivo substitui a gravada do mesmo tipo (é a mesma, ou uma mais recente)
    const antes = (p.ditosAntes ?? []).filter((d) => !(substitui && d.origem === g.modo));
    return estiloDosDitos([...antes, ...ditosVivos]);
  }, [p.ditosAntes, ditosVivos, substitui, g.modo]);
  const pedidos = useMemo((): Pedidos => {
    const a = p.pedidosAntes ?? { pecas: [], servicos: [] };
    const fora = (d: { origem: string }) => !(substitui && d.origem === g.modo);
    return { pecas: [...a.pecas.filter(fora), ...pedidosVivos.pecas], servicos: [...a.servicos.filter(fora), ...pedidosVivos.servicos] };
  }, [p.pedidosAntes, pedidosVivos, substitui, g.modo]);
  return { ouvido, pedidos, aOuvir: vivo && (g.estado === "a_ouvir" || g.estado === "a_ligar") };
}

const resumoEstilo = (e: Estilo, evitar: Cor[]): string[] => [
  ...(e.cores.length ? [`Cor principal: ${nomeCor(e.cores[0])}${e.cores.length > 1 ? ` (e ${e.cores.slice(1).map((c) => nomeCor(c).toLowerCase()).join(", ")})` : ""}`] : []),
  ...(Object.entries(e.porCategoria) as [Categoria, Cor[]][]).map(([c, cs]) => `${NOME_CATEGORIA[c]}: ${cs.map((x) => nomeCor(x).toLowerCase()).join(" ou ")}`),
  ...(evitar.length ? [`Sem ${evitar.map((c) => nomeCor(c).toLowerCase()).join(" nem ")}`] : []),
];

export function OuvidoDoCliente({ p, setP, ouvido, pedidos = { pecas: [], servicos: [] }, aOuvir }: { p: Projeto; setP: SetP; ouvido: EstiloOuvido | null; pedidos?: Pedidos; aOuvir: boolean }) {
  const reduzir = useReducedMotion();
  const proposto = ouvido ? juntarEstilo(p.estilo, ouvido) : null;
  const aplicado = !proposto || mesmoEstilo(proposto, p.estilo);
  const [anuncio, setAnuncio] = useState("");
  const antesDoAuto = useRef<Projeto | null>(null);
  // 12/11 (Rúben: «estou a dizer que quero uma sanita preta mas o Estúdio não se adapta»): cada coisa nova que se diz aplica-se logo,
  // mesmo depois de o comercial ter mexido nas cores (antes, depois de um toque à mão, ficava só como sugestão)
  const chaves = ouvido ? chavesDosDitos(ouvido.ditos) : [];
  const chavesP = chavesDosPedidos(pedidos);
  const todas = [...chaves, ...chavesP.pecas, ...chavesP.servicos];
  const vistos = new Set(p.ditosVistos ?? []);
  const novos = ouvido ? ouvido.ditos.filter((_, i) => !vistos.has(chaves[i])) : [];
  const pecasNovas = pedidos.pecas.filter((_, i) => !vistos.has(chavesP.pecas[i]));
  const servicosNovos = pedidos.servicos.filter((_, i) => !vistos.has(chavesP.servicos[i]));

  useEffect(() => {
    if (!novos.length && !pecasNovas.length && !servicosNovos.length) return;
    const o = novos.length ? estiloDosDitos(novos) : null;
    setP((x) => {
      antesDoAuto.current = x;
      let r = o ? comEstilo(x, juntarEstilo(x.estilo, o), false) : x;
      // «quero uma sanita preta»: a sanita que há troca-se (pela preta)
      if (o) for (const d of novos) if (!d.evitar) for (const c of d.cats) if (c in PECAS && r.antes.pecas.some((pc) => pc.tipo === c)) r = aplicarPeca(r, c as TipoPeca, "troca");
      for (const d of pecasNovas) r = aplicarPeca(r, d.tipo, d.acao);
      for (const d of servicosNovos) r = d.quer ? juntarServico(r, d.id) : recusarSugestao(tirarServico(r, d.id), d.id);
      return { ...r, ditosVistos: [...new Set([...(x.ditosVistos ?? []), ...todas])] };
    });
    const partes = [...(o ? resumoEstilo(o.estilo, o.evitar) : []), ...resumoPedidos({ pecas: pecasNovas, servicos: servicosNovos })];
    setAnuncio(`Pelo que se disse: ${partes.join("; ")}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- corre quando chega uma coisa nova dita
  }, [todas.join("|"), p.ditosVistos?.length]);

  const algo = !!ouvido || pedidos.pecas.length > 0 || pedidos.servicos.length > 0;
  if (!algo && !aOuvir) return null;
  // as últimas três frases (uma frase com duas coisas aparece uma vez)
  const frases: { frase: string; inicio: number; origem: DitoEstilo["origem"] }[] = [...(ouvido?.ditos ?? []), ...pedidos.pecas, ...pedidos.servicos]
    .sort((a, b) => (a.origem === b.origem ? a.inicio - b.inicio : a.origem === "chamada" ? -1 : 1));
  const ultimos = frases.filter((d, i, l) => l.findIndex((x) => x.frase === d.frase && x.origem === d.origem) === i).slice(-3).reverse();
  const resumo = [...(ouvido ? resumoEstilo(ouvido.estilo, ouvido.evitar) : []), ...resumoPedidos(pedidos)];
  return (
    <section aria-labelledby="t-ouvido" className="space-y-4 rounded-2xl border border-primary/30 bg-primary/[0.04] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="t-ouvido" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          <Ear className="h-5 w-5 text-primary" aria-hidden="true" />Pelo que se disse na conversa
        </h3>
        {aOuvir && (
          <span className="inline-flex items-center gap-2 rounded-full bg-background px-3 py-1 text-sm text-muted-foreground">
            <span aria-hidden="true" className={cn("h-2 w-2 rounded-full bg-destructive", !reduzir && "animate-pulse")} />A ouvir a conversa
          </span>
        )}
      </div>
      {!algo ? (
        <p className="text-[15px] text-muted-foreground">Diga em voz alta o que se quer («tudo preto», «tirar o bidé», «um nicho no duche») e o Estúdio muda sozinho.</p>
      ) : (
        <>
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {ultimos.map((d) => (
                <motion.li key={`${d.origem}-${d.inicio}-${d.frase}`} initial={reduzir ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                  className="flex flex-wrap items-baseline gap-x-2 rounded-xl bg-background px-3 py-2 text-[15px]">
                  <q className="font-medium">{d.frase}</q>
                  <span className="text-sm text-muted-foreground">na {d.origem}, {tempo(d.inicio)}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <ul className="flex flex-wrap gap-2" aria-label="O que sai do que se disse">
            {resumo.map((r) => <li key={r} className="rounded-full border border-border bg-background px-3 py-1 text-sm">{r}</li>)}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            {aplicado ? (
              <span className="inline-flex items-center gap-1.5 text-[15px] text-foreground"><Check className="h-4 w-4 text-success" aria-hidden="true" />Aplicado às cores, às peças e aos serviços.</span>
            ) : (
              <button type="button" className={cn(chip(true), "min-h-11")} onClick={() => { setP((x) => comEstilo(x, juntarEstilo(x.estilo, ouvido!), true)); setAnuncio("O estilo passou a ser o que se disse na conversa."); }}>
                <Check className="h-4 w-4" aria-hidden="true" />Usar o que se disse
              </button>
            )}
            {antesDoAuto.current && (
              <button type="button" className={cn(chip(false), "min-h-11")} onClick={() => {
                const antes = antesDoAuto.current!;
                antesDoAuto.current = null;
                setP((x) => ({ ...antes, ditosVistos: x.ditosVistos }));
                setAnuncio("Voltou ao que estava antes.");
              }}><Undo2 className="h-4 w-4" aria-hidden="true" />Desfazer</button>
            )}
          </div>
        </>
      )}
      <p role="status" className="sr-only">{anuncio}</p>
    </section>
  );
}

const PECAS_AMOSTRA: Record<"Casa de banho" | "Cozinha", Categoria[]> = {
  "Casa de banho": ["base", "torneira", "movel", "sanita", "revestimento", "pavimento"],
  Cozinha: ["armario", "bancada", "torneira", "placa", "revestimento", "pavimento"],
};
const NOME_CURTO: Partial<Record<Categoria, string>> = {
  base: "Base", torneira: "Torneira", movel: "Móvel", sanita: "Sanita", revestimento: "Paredes", pavimento: "Chão", armario: "Armários", bancada: "Bancada", placa: "Placa",
};

/** As combinações para a cor principal (a que o cliente disse, ou a primeira escolhida), com um toque cada. */
export function Combinacoes({ p, setP, cor, evitar }: { p: Projeto; setP: SetP; cor: Cor | undefined; evitar: Cor[] }) {
  const reduzir = useReducedMotion();
  const lista = combinacoesPara(cor, evitar);
  const cats = PECAS_AMOSTRA[p.divisao ?? "Casa de banho"];
  const [anuncio, setAnuncio] = useState("");
  if (!cor || !lista.length) return null;
  return (
    <section aria-labelledby="t-combinacoes" className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
      <div>
        <h3 id="t-combinacoes" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight"><Palette className="h-5 w-5 text-primary" aria-hidden="true" />Combinações para o {nomeCor(cor).toLowerCase()}</h3>
        <p className="text-sm text-muted-foreground">As cores são as dos produtos que o catálogo escolhe. Um toque aplica às peças a trocar, às paredes e ao chão.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {lista.map((c, i) => {
          const on = mesmoEstilo(p.estilo, c.estilo);
          const am = amostras(c.estilo, cats);
          return (
            <motion.li key={c.id} initial={reduzir ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduzir ? 0 : i * 0.05, duration: 0.2 }}>
              <button type="button" aria-pressed={on} onClick={() => { setP((x) => comEstilo(x, c.estilo, true)); setAnuncio(`${c.n}: aplicada às peças a trocar, às paredes e ao chão.`); }}
                className={cn("flex h-full w-full flex-col gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  on ? "border-primary bg-primary/[0.06] ring-1 ring-primary" : "border-border bg-background hover:bg-accent")}>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold">{c.n}</span>
                  {on && <span className="inline-flex items-center gap-1 text-sm text-primary"><Check className="h-4 w-4" aria-hidden="true" />Em uso</span>}
                </span>
                <span className="flex flex-wrap gap-x-3 gap-y-1.5">
                  {am.map((a) => (
                    <span key={a.cat} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-md border border-black/15" style={{ background: a.hex }} />
                      {NOME_CURTO[a.cat] ?? NOME_CATEGORIA[a.cat]}
                    </span>
                  ))}
                </span>
                <span className="text-sm text-muted-foreground">{c.porque}</span>
              </button>
            </motion.li>
          );
        })}
      </ul>
      <p role="status" className="sr-only">{anuncio}</p>
    </section>
  );
}
