// 24/11 (fase 1, só ecrã): os painéis que acompanham a pré-visualização 3D de um produto. «Medidas»: que campo da Medida é a largura, a altura e a profundidade (pré-visualização imediata,
// SEM gravar: a gravação por produto, subcategoria e categoria vem na próxima fase). «Zonas»: as partes do objecto (frente, corpo…) com o atributo que pinta cada uma, e o realce da zona
// apontada (rato ou teclado) no 3D. O interruptor «Mostrar medidas» liga as cotas. Sem three: só o ecrã.
import { useId } from "react";
import { cn } from "@/lib/utils";
import { CAMPOS_MEDIDA, EIXOS_PECA, textoDeCm, type CampoMedida, type Eixos, type EixoPeca, type ValoresMedida } from "./planta3d/eixosMedida";
import { rotuloDaZona, type ZonaGlb, type ZonasDoProduto } from "./planta3d/zonasGlb";

const NOTA = "text-[15px] text-muted-foreground";
const BOTAO = "inline-flex min-h-11 items-center justify-center rounded-lg border border-input bg-card px-4 text-[15px] font-medium transition-colors hover:bg-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-card";
const ROTULO_EIXO: Record<EixoPeca, string> = { largura: "Largura", altura: "Altura", profundidade: "Profundidade" };

/** O interruptor «Mostrar medidas» (as cotas no 3D). */
export function InterruptorMedidas({ ligado, aoMudar, className }: { ligado: boolean; aoMudar: (v: boolean) => void; className?: string }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} onClick={() => aoMudar(!ligado)}
      className={cn("inline-flex min-h-11 items-center gap-2 rounded-lg border border-input bg-card/95 px-3 text-[15px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25", className)}>
      <span aria-hidden="true" className={cn("relative inline-block h-5 w-9 rounded-full border border-input transition-colors", ligado ? "bg-primary" : "bg-muted")}>
        <span className={cn("absolute top-0.5 h-3.5 w-3.5 rounded-full bg-background shadow transition-all", ligado ? "left-[18px]" : "left-0.5")} />
      </span>
      Mostrar medidas
    </button>
  );
}

interface PropsMedidas {
  /** A Medida em cm (os valores de cada campo). */
  medida: ValoresMedida;
  /** Os eixos em vigor (os escolhidos, ou a regra do tipo). */
  eixos: Eixos;
  /** Escolhidos à mão (senão, automáticos por tipo). */
  manual: boolean;
  /** As medidas da peça (cm) com estes eixos: a pré-visualização imediata em texto. */
  dimensoes: { larguraCm: number; alturaCm: number; profundidadeCm: number };
  aoEscolher: (eixo: EixoPeca, campo: CampoMedida) => void;
  aoRepor: () => void;
  /** Se a última escolha trocou dois campos, o aviso («A profundidade passou a usar «comprimento»…»): vai na mesma região viva da frase das medidas. */
  nota?: string | null;
}

/** O painel «Medidas»: três seletores («Largura = comprimento (160 cm)»), a regra em vigor e «Repor automático». Escolher um campo já usado troca os dois. Não grava nada. */
export function PainelMedidas({ medida, eixos, manual, dimensoes, aoEscolher, aoRepor, nota }: PropsMedidas) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-t`} className="grid gap-3 rounded-xl border border-border bg-card p-3">
      <h3 id={`${id}-t`} className="text-[15px] font-semibold">Medidas</h3>
      <p className={NOTA}>Escolha que campo da Medida é a largura, a altura e a profundidade da peça: a peça muda logo. É só para ver; a gravação vem na próxima fase.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {EIXOS_PECA.map((eixo) => (
          <div key={eixo} className="grid gap-1">
            <label htmlFor={`${id}-${eixo}`} className="text-[15px] font-medium">{ROTULO_EIXO[eixo]} =</label>
            <select id={`${id}-${eixo}`} value={eixos[eixo]} onChange={(e) => aoEscolher(eixo, e.target.value as CampoMedida)}
              className="min-h-11 rounded-lg border border-input bg-card px-3 text-[15px] text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25">
              {CAMPOS_MEDIDA.map((c) => <option key={c} value={c}>{c} ({medida[c] !== undefined ? `${textoDeCm(medida[c]!)} cm` : "sem valor"})</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[15px]">{manual ? "Regra: escolhida à mão (só para ver)" : "Regra: automática por tipo"}</p>
        {/* aria-disabled (e não disabled): um botão desactivado perde o foco do teclado ao ser carregado; assim o foco fica onde estava e o clique é só ignorado */}
        <button type="button" aria-disabled={!manual} onClick={() => { if (manual) aoRepor(); }} className={cn(BOTAO, !manual && "cursor-not-allowed opacity-50 hover:bg-card")}>Repor automático</button>
      </div>
      {/* região viva: escolher num seletor muda a peça e a frase (e, se dois campos trocaram, a nota); sem isto, quem usa leitor de ecrã não sabe o que mudou */}
      <p aria-live="polite" className={NOTA}>A peça fica com {textoDeCm(dimensoes.larguraCm)} cm de largura, {textoDeCm(dimensoes.alturaCm)} cm de altura e {textoDeCm(dimensoes.profundidadeCm)} cm de profundidade.{nota ? ` ${nota}` : ""}</p>
    </section>
  );
}

interface PropsZonas {
  zonas: { zona: ZonaGlb; partes: number }[];
  /** O que pinta cada zona (do modelo): o nome do atributo. */
  pintadaPor: ZonasDoProduto["zonas"] | undefined;
  /** A zona que está fixa (clique) e a que se aponta agora (rato ou teclado). */
  fixa: ZonaGlb | null;
  aoApontar: (z: ZonaGlb | null) => void;
  aoFixar: (z: ZonaGlb | null) => void;
}

/**
 * O painel «Zonas»: as zonas que o modelo tem, cada uma com o número de partes e o atributo que a pinta («Frente — 3 partes · Pintada por: Cor da frente»). Apontar com o rato ou focar
 * com o teclado realça a zona no 3D; clicar mantém o realce. O realce é por brilho no 3D E por texto aqui (a zona realçada fica com o botão premido), não só por cor.
 */
export function PainelZonas({ zonas, pintadaPor, fixa, aoApontar, aoFixar }: PropsZonas) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-t`} className="grid gap-2 rounded-xl border border-border bg-card p-3">
      <h3 id={`${id}-t`} className="text-[15px] font-semibold">Zonas</h3>
      <p className={NOTA}>Aponte uma zona (rato ou Tab) para a ver realçada no 3D; clique para a manter realçada.</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {zonas.map(({ zona, partes }) => {
          const atributo = pintadaPor?.[zona]?.atributo;
          return (
            <li key={zona}>
              <button type="button" aria-pressed={fixa === zona} onClick={() => aoFixar(fixa === zona ? null : zona)}
                onMouseEnter={() => aoApontar(zona)} onMouseLeave={() => aoApontar(null)} onFocus={() => aoApontar(zona)} onBlur={() => aoApontar(null)}
                className={cn(BOTAO, "w-full flex-col items-start gap-0.5 py-2 text-left aria-pressed:border-primary aria-pressed:bg-muted")}>
                <span className="font-semibold">{rotuloDaZona(zona)} — {partes} {partes === 1 ? "parte" : "partes"}</span>{" "}
                <span className="text-[14px] font-normal text-muted-foreground">{atributo ? `Pintada por: ${atributo}` : "Sem atributo de cor"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
