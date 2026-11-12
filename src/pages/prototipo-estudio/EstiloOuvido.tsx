// 12/11 (Rúben: «se o cliente disser que quer tudo preto, o Estúdio no passo dos estilos já sugere tudo a preto e combinações boas para
// preto»). Dois cartões do passo «Estilo»:
//  · «Pelo que se disse na conversa»: as frases sobre cores, da chamada e da visita (esta ao vivo: a gravação continua no Estúdio), e o
//    estilo que sai delas. Cada coisa nova que se diz aplica-se sozinha, por cima do que lá está (com «Desfazer»); o que já se aplicou
//    não volta a ser aplicado, por isso o que o comercial muda à mão depois fica.
//  · «Combinações para o preto»: o que um designer proporia com a cor principal, com as cores dos produtos que o catálogo escolheria.
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Ear, Palette, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGravacao } from "@/emylia/gravador";
import { NOME_CATEGORIA, melhorPara, type Categoria, type Cor, type Estilo } from "./catalogoFake";
import { aplicarEstilo, type Projeto } from "./necessidadesEstudio";
import { amostras, chavesDosDitos, combinacoesPara, ditosDaConversa, estiloDosDitos, juntarEstilo, mesmoEstilo, nomeCor, tempo, type EstiloOuvido } from "./estiloDaConversa";
import { chip } from "./pecasEstudio";

type SetP = React.Dispatch<React.SetStateAction<Projeto>>;

/** Mudar o estilo e escolher de novo o que combina (as peças trocadas e novas, as paredes e o chão). */
export const comEstilo = (x: Projeto, estilo: Estilo, manual: boolean): Projeto =>
  ({ ...aplicarEstilo({ ...x, estilo }, (cat) => melhorPara(cat, estilo)?.id), estiloManual: manual || x.estiloManual });

/** O que o cliente disse das cores: o que já estava gravado no negócio e a gravação deste negócio, ao vivo. */
export function useEstiloOuvido(p: Projeto): { ouvido: EstiloOuvido | null; aOuvir: boolean } {
  const g = useGravacao();
  const vivo = p.negocio !== undefined && g.negocio === p.negocio;
  const ditosVivos = useMemo(() => (vivo ? ditosDaConversa(g.falas, g.modo) : []), [vivo, g.falas, g.modo]);
  const ouvido = useMemo(() => {
    // a conversa ao vivo substitui a gravada do mesmo tipo (é a mesma, ou uma mais recente)
    const antes = (p.ditosAntes ?? []).filter((d) => !(vivo && g.falas.length && d.origem === g.modo));
    return estiloDosDitos([...antes, ...ditosVivos]);
  }, [p.ditosAntes, ditosVivos, vivo, g.falas.length, g.modo]);
  return { ouvido, aOuvir: vivo && (g.estado === "a_ouvir" || g.estado === "a_ligar") };
}

const resumoEstilo = (e: Estilo, evitar: Cor[]): string[] => [
  ...(e.cores.length ? [`Cor principal: ${nomeCor(e.cores[0])}${e.cores.length > 1 ? ` (e ${e.cores.slice(1).map((c) => nomeCor(c).toLowerCase()).join(", ")})` : ""}`] : []),
  ...(Object.entries(e.porCategoria) as [Categoria, Cor[]][]).map(([c, cs]) => `${NOME_CATEGORIA[c]}: ${cs.map((x) => nomeCor(x).toLowerCase()).join(" ou ")}`),
  ...(evitar.length ? [`Sem ${evitar.map((c) => nomeCor(c).toLowerCase()).join(" nem ")}`] : []),
];

export function OuvidoDoCliente({ p, setP, ouvido, aOuvir }: { p: Projeto; setP: SetP; ouvido: EstiloOuvido | null; aOuvir: boolean }) {
  const reduzir = useReducedMotion();
  const proposto = ouvido ? juntarEstilo(p.estilo, ouvido) : null;
  const aplicado = !!proposto && mesmoEstilo(proposto, p.estilo);
  const [anuncio, setAnuncio] = useState("");
  const antesDoAuto = useRef<Projeto | null>(null);
  // 12/11 (Rúben: «estou a dizer que quero uma sanita preta mas o Estúdio não se adapta»): cada coisa nova que se diz aplica-se logo,
  // mesmo depois de o comercial ter mexido nas cores (antes, depois de um toque à mão, ficava só como sugestão)
  const chaves = ouvido ? chavesDosDitos(ouvido.ditos) : [];
  const vistos = new Set(p.ditosVistos ?? []);
  const novos = ouvido ? ouvido.ditos.filter((_, i) => !vistos.has(chaves[i])) : [];

  useEffect(() => {
    if (!novos.length) return;
    const o = estiloDosDitos(novos)!;
    setP((x) => {
      antesDoAuto.current = x;
      return { ...comEstilo(x, juntarEstilo(x.estilo, o), false), ditosVistos: [...new Set([...(x.ditosVistos ?? []), ...chaves])] };
    });
    setAnuncio(`Pelo que se disse: ${resumoEstilo(o.estilo, o.evitar).join("; ")}. As peças a trocar, as paredes e o chão já seguem.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- corre quando chega uma coisa nova dita
  }, [chaves.join("|"), p.ditosVistos?.length]);

  if (!ouvido && !aOuvir) return null;
  // as últimas três frases (uma frase com duas cores aparece uma vez)
  const ultimos = (ouvido?.ditos ?? []).filter((d, i, l) => l.findIndex((x) => x.frase === d.frase && x.origem === d.origem) === i).slice(-3).reverse();
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
      {!ouvido ? (
        <p className="text-[15px] text-muted-foreground">Quando o cliente falar de cores («quero tudo preto», «o móvel em madeira»), o estilo muda aqui sozinho.</p>
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
          <ul className="flex flex-wrap gap-2" aria-label="O estilo que sai do que disse">
            {resumoEstilo(ouvido.estilo, ouvido.evitar).map((r) => <li key={r} className="rounded-full border border-border bg-background px-3 py-1 text-sm">{r}</li>)}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            {aplicado ? (
              <span className="inline-flex items-center gap-1.5 text-[15px] text-foreground"><Check className="h-4 w-4 text-success" aria-hidden="true" />Aplicado às cores e às peças a trocar.</span>
            ) : (
              <button type="button" className={cn(chip(true), "min-h-11")} onClick={() => { setP((x) => comEstilo(x, juntarEstilo(x.estilo, ouvido), true)); setAnuncio("O estilo passou a ser o que se disse na conversa."); }}>
                <Check className="h-4 w-4" aria-hidden="true" />Usar o que se disse
              </button>
            )}
            {antesDoAuto.current && (
              <button type="button" className={cn(chip(false), "min-h-11")} onClick={() => {
                const antes = antesDoAuto.current!;
                antesDoAuto.current = null;
                setP((x) => ({ ...antes, ditosVistos: x.ditosVistos }));
                setAnuncio("Voltou ao estilo de antes.");
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
