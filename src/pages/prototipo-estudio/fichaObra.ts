// 5/11 (Rúben: «a informação que vai passar para a operação já é a obra a fazer… a equipa tem que ter as duas informações»). A ficha da
// obra sai do projeto: o que se retira, o que se instala e onde (a que distância das paredes), o que muda de sítio, os materiais com as
// quantidades e as alturas. Só regras (o ecrã é o passo «Obra» do Estúdio).
import { PECAS, cantos, limites, type PecaPlanta, type Planta, type TipoPeca } from "@/emylia/planta";
import { ACOMPANHA, produto } from "./catalogoFake";
import { alturaFinalCm, entraram, estadoDaPeca, mudaramDeSitio, sairam, type Linha, type Projeto } from "./necessidadesEstudio";

export interface Tarefa { tipo: "retirar" | "instalar" | "mudar" | "fica"; peca: string; produto?: string; onde?: string; acompanha?: string[];
  /** 12/11: para o desenho da peça na ficha (na cor do produto, quando há). */ desenho?: TipoPeca; hex?: string }

/** Onde fica a peça, em palavras: a que distância da parede da esquerda e da de cima (as paredes do retângulo que contém a planta). */
export function ondeFica(pc: PecaPlanta, pl: Planta): string {
  const b = limites({ ...pl, pecas: [] });
  const esq = Math.max(0, Math.round(pc.x - b.x)), cima = Math.max(0, Math.round(pc.y - b.y));
  const dir = Math.max(0, Math.round(b.x + b.w - (pc.x + pc.w))), baixo = Math.max(0, Math.round(b.y + b.h - (pc.y + pc.h)));
  const horiz = esq <= dir ? `a ${esq} cm da parede da esquerda` : `a ${dir} cm da parede da direita`;
  const vert = cima <= baixo ? `a ${cima} cm da parede de cima` : `a ${baixo} cm da parede de baixo`;
  return `${pc.w} × ${pc.h} cm, ${horiz} e ${vert}`;
}

export function tarefas(p: Projeto): Tarefa[] {
  const out: Tarefa[] = [];
  for (const x of sairam(p).filter((y) => !PECAS[y.tipo].abertura)) out.push({ tipo: "retirar", peca: PECAS[x.tipo].n, desenho: x.tipo });
  const mudaram = new Set(mudaramDeSitio(p).map((x) => x.id));
  for (const x of p.depois.pecas.filter((y) => !PECAS[y.tipo].abertura)) {
    const e = estadoDaPeca(p, x), prod = produto(p.escolhas[x.id]);
    const acompanha = (ACOMPANHA[x.tipo] ?? []).map((cat) => produto(p.acompanha[x.id]?.[cat])?.n).filter((n): n is string => !!n);
    if (e === "troca") out.push({ tipo: "retirar", peca: `${PECAS[x.tipo].n} (${["base", "banheira", "sanita"].includes(x.tipo) ? "a antiga" : "o antigo"})`, desenho: x.tipo });
    if (e !== "fica") out.push({ tipo: "instalar", peca: PECAS[x.tipo].n, produto: prod?.n ?? "por escolher", onde: ondeFica(x, p.depois), acompanha, desenho: x.tipo, hex: prod?.hex });
    else if (mudaram.has(x.id)) out.push({ tipo: "mudar", peca: PECAS[x.tipo].n, onde: ondeFica(x, p.depois), desenho: x.tipo });
    else out.push({ tipo: "fica", peca: PECAS[x.tipo].n });
  }
  // as que retiram vêm primeiro (é a ordem da obra)
  const ordem = { retirar: 0, mudar: 1, instalar: 2, fica: 3 } as const;
  return out.sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);
}

/** As alturas, como a equipa as precisa de ler. */
export function alturasEmPalavras(p: Projeto): string[] {
  const m = (cm: number) => `${(cm / 100).toLocaleString("pt-PT")} m`;
  const r = [`Pé-direito hoje: ${m(p.alturas.peDireito)}.`];
  if (p.alturas.tetoFalso) r.push(`Teto falso a ${m(p.alturas.tetoFalso)}.`);
  if (p.revestimento) r.push(`Revestimento até ${p.alturas.tetoFalso ? "ao teto falso" : "ao teto"} (${m(alturaFinalCm(p.alturas))}).`);
  return r;
}

/** Os materiais da obra (das necessidades: os de m², com as quantidades já com as quebras). */
export const materiais = (linhas: readonly Linha[]): Linha[] => linhas.filter((l) => l.grupo === "Materiais" && !l.fora);

/** As medidas das paredes do depois, por ordem (para conferir no local). */
export const paredesEmCm = (pl: Planta): number[] => pl.paredes.map((w) => w.c);
/** Quantas peças entram de novo (para o cabeçalho da ficha). */
export const quantasNovas = (p: Projeto) => entraram(p).filter((x) => !PECAS[x.tipo].abertura).length;
export const temPlanta = (pl: Planta) => cantos(pl.paredes, pl.o).length > 3;
