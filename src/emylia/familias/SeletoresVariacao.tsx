// 26/11: os seletores da vista da família com 3D. Bolinhas de cor (o NOME escrito sempre por baixo, e o da bolinha apontada com o rato ou o foco) e botões de escolha
// simples (textura, tonalidade…). São grupos de rádio: o Tab entra no grupo (na opção escolhida), as setas mudam de opção, Espaço e Enter escolhem. Recebem só as opções que
// existem na família (opcoesDoEixo): nunca se mostra uma que nenhum produto tem. Alvos de 44 px, texto de 15 px e anel de foco sempre visível.
import { useId, useState, type CSSProperties, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { urlDaFotoOpcao } from "../fotoOpcaoUrl";
import { nomeParaMostrar, type OpcaoEixo } from "./escolhaVariacao";

const NOTA = "text-[15px] text-muted-foreground";
const ROTULO = "text-[15px] font-semibold text-foreground";
const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card";
/** No telemóvel o cartão do produto fica preso ao fundo (cerca de 240 px): ao focar um controlo o browser rola com esta margem e o cartão não o tapa (WCAG 2.4.11). */
export const SCROLL_FUNDO = "max-lg:scroll-mb-64";
/** Um grupo de rádio tem uma só paragem no Tab: a opção escolhida; sem nenhuma escolhida (o produto não tem valor neste eixo), a primeira. */
const tabIndexDe = (opcoes: readonly OpcaoEixo[], valor: string, i: number): 0 | -1 => (opcoes.some((o) => o.valor === valor) ? (opcoes[i]!.valor === valor ? 0 : -1) : i === 0 ? 0 : -1);

/** O botão a que as setas levam: o seguinte ou o anterior, com volta ao princípio e ao fim; escolhe-se logo (como um grupo de rádio) e o foco acompanha. */
function aoTeclar(e: KeyboardEvent<HTMLElement>, opcoes: readonly OpcaoEixo[], valor: string, escolher: (v: string) => void) {
  const passo = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
  if (passo === 0 || e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  const i = Math.max(0, opcoes.findIndex((o) => o.valor === valor));
  const alvo = opcoes[(i + passo + opcoes.length) % opcoes.length];
  if (!alvo) return;
  const botoes = e.currentTarget.closest<HTMLElement>("[role='radiogroup']")?.querySelectorAll<HTMLElement>("[role='radio']");
  escolher(alvo.valor);
  // depois de escolher, o foco vai para a opção nova (o rádio só tem uma opção no Tab, a escolhida)
  botoes?.[(i + passo + opcoes.length) % opcoes.length]?.focus();
}

/** O fundo da amostra: a cor (uma só, ou duas lado a lado numa cor dupla). */
function fundoDe(hex: string | null): CSSProperties {
  const cores = (hex ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  if (cores.length < 2) return { backgroundColor: cores[0] ?? "transparent" };
  const a = cores[0]!, b = cores[1]!;
  return { backgroundImage: `linear-gradient(135deg, ${a} 50%, ${b} 50%)` };
}

export interface SeletorProps {
  rotulo: string; opcoes: readonly OpcaoEixo[]; valor: string; aoEscolher: (valor: string) => void;
}

/** Bolinhas de cor. O nome da cor escolhida está escrito por baixo; ao passar o rato ou focar uma bolinha, o dela (com o aviso se outra tem o mesmo tom). */
export function SeletorCor({ rotulo, opcoes, valor, aoEscolher }: SeletorProps) {
  const { t } = useTranslation();
  const idRotulo = useId();
  const [apontada, setApontada] = useState<string | null>(null);
  const mostrada = opcoes.find((o) => o.valor === (apontada ?? valor)) ?? opcoes.find((o) => o.valor === valor);
  const tomIgual = mostrada?.hex ? opcoes.find((o) => o.valor !== mostrada.valor && o.hex === mostrada.hex) : undefined;
  const nome = (o: OpcaoEixo) => nomeParaMostrar(o.nome, true);
  const legenda = mostrada
    ? t("catFamiliaVer.nomeEscolhido", { rotulo, nome: nome(mostrada) }) + (tomIgual ? ` (${t("catFamiliaVer.mesmoTom", { outro: nome(tomIgual) })})` : "")
    : "";
  return (
    <div role="radiogroup" aria-labelledby={idRotulo} className="grid gap-2">
      <p id={idRotulo} className={ROTULO}>{rotulo}</p>
      <div className="flex flex-wrap gap-1">
        {opcoes.map((o, i) => {
          const escolhida = o.valor === valor, foto = o.foto ? urlDaFotoOpcao(o.foto) : null;
          return (
            <button key={o.valor} type="button" role="radio" aria-checked={escolhida} aria-label={nome(o)} tabIndex={tabIndexDe(opcoes, valor, i)}
              onClick={() => aoEscolher(o.valor)} onKeyDown={(e) => aoTeclar(e, opcoes, valor, aoEscolher)}
              onMouseEnter={() => setApontada(o.valor)} onMouseLeave={() => setApontada(null)} onFocus={() => setApontada(o.valor)} onBlur={() => setApontada(null)}
              className={cn("inline-flex min-h-11 min-w-11 items-center justify-center rounded-full", SCROLL_FUNDO, FOCO)}>
              {/* o contorno escuro (3:1 com o cartão, mesmo na cor branca) e o anel de quem está escolhida: não depende só da cor */}
              <span data-amostra aria-hidden="true" style={{ ...fundoDe(o.hex), ...(foto ? { backgroundImage: `url(${foto})`, backgroundSize: "cover" } : {}) }}
                className={cn("block h-8 w-8 rounded-full border-2 border-foreground/60 transition-transform motion-reduce:transition-none", escolhida && "scale-110 ring-2 ring-primary ring-offset-2 ring-offset-card")} />
            </button>
          );
        })}
      </div>
      <p className="min-h-6 text-[15px] font-medium text-foreground">{legenda}</p>
    </div>
  );
}

/** Botões de escolha simples (textura, acabamento, tonalidade, lado…). A `nota` fica por baixo do grupo. */
export function SeletorBotoes({ rotulo, opcoes, valor, aoEscolher, nota }: SeletorProps & { nota?: string }) {
  const idRotulo = useId();
  return (
    <div role="radiogroup" aria-labelledby={idRotulo} className="grid gap-2">
      <p id={idRotulo} className={ROTULO}>{rotulo}</p>
      <div className="flex flex-wrap gap-2">
        {opcoes.map((o, i) => {
          const escolhida = o.valor === valor;
          return (
            <button key={o.valor} type="button" role="radio" aria-checked={escolhida} tabIndex={tabIndexDe(opcoes, valor, i)}
              onClick={() => aoEscolher(o.valor)} onKeyDown={(e) => aoTeclar(e, opcoes, valor, aoEscolher)}
              className={cn("inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-foreground/50 bg-card px-4 text-[15px] font-medium transition-colors hover:bg-muted", SCROLL_FUNDO,
                "aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground aria-checked:hover:bg-primary", FOCO)}>
              {nomeParaMostrar(o.nome, false)}
            </button>
          );
        })}
      </div>
      {nota && <p className={NOTA}>{nota}</p>}
    </div>
  );
}
