// 24/11 (fase 1, só ecrã): os painéis que acompanham a pré-visualização 3D de um produto. «Medidas»: que campo da Medida é a largura, a altura e a profundidade (pré-visualização imediata,
// SEM gravar; desde 25/11, com `gravacao` (a configuração 3D da base), «Guardar neste produto» e «Voltar a herdar»: a subcategoria e a categoria vêm depois). «Zonas»: as partes do objecto (frente, corpo…) com o atributo que pinta cada uma, e o realce da zona
// apontada (rato ou teclado) no 3D. O interruptor «Mostrar medidas» liga as cotas. Sem three: só o ecrã.
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import type { OrigemConfig } from "./config3dDados";
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
  /**
   * 25/11: a gravação dos eixos (por produto; só existe quando a base devolveu a configuração 3D). Sem ela o painel é só para ver, como na fase 1.
   * `origemGuardada`: de onde vêm os eixos guardados (null: nenhum, vale a regra do tipo); `proprio`: são deste produto (só então se pode voltar a herdar).
   * `aoGuardar` e `aoHerdar` devolvem o erro em texto, ou null se correu bem.
   */
  gravacao?: { podeEditar: boolean; origemGuardada: OrigemConfig | null; proprio: boolean; aoGuardar: () => Promise<string | null>; aoHerdar: () => Promise<string | null> };
}

/** De onde vêm os eixos guardados, em texto («guardada neste produto»). */
const ORIGEM_EIXOS: Record<OrigemConfig, string> = { produto: "guardada neste produto", subcategoria: "herdada da subcategoria", categoria: "herdada da categoria", automatico: "automática por tipo" };

/**
 * O painel «Medidas»: três seletores («Largura = comprimento (160 cm)»), a regra em vigor e «Repor automático». Escolher um campo já usado troca os dois.
 * Sem `gravacao` não grava nada (só para ver); com ela, «Guardar neste produto» e «Voltar a herdar» (por produto), e «Repor» volta aos guardados.
 */
export function PainelMedidas({ medida, eixos, manual, dimensoes, aoEscolher, aoRepor, nota, gravacao }: PropsMedidas) {
  const id = useId();
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  const correr = async (fazer: () => Promise<string | null>, ok: string) => {
    if (ocupado) return;
    setOcupado(true); setMsg(null);
    try { const erro = await fazer(); setMsg(erro ? { erro: true, texto: erro } : { erro: false, texto: ok }); } finally { setOcupado(false); }
  };
  const guardados = gravacao?.origemGuardada && gravacao.origemGuardada !== "automatico" ? gravacao.origemGuardada : null;
  const regra = manual ? (gravacao ? "Regra: escolhida à mão, por guardar" : "Regra: escolhida à mão (só para ver)") : guardados ? `Regra: ${ORIGEM_EIXOS[guardados]}` : "Regra: automática por tipo";
  const podeGuardar = manual && !ocupado, podeHerdar = !!gravacao?.proprio && !ocupado;
  return (
    <section aria-labelledby={`${id}-t`} className="grid gap-3 rounded-xl border border-border bg-card p-3">
      <h3 id={`${id}-t`} className="text-[15px] font-semibold">Medidas</h3>
      <p className={NOTA}>
        {!gravacao ? "Escolha que campo da Medida é a largura, a altura e a profundidade da peça: a peça muda logo. É só para ver; a gravação vem na próxima fase."
          : gravacao.podeEditar ? "Escolha que campo da Medida é a largura, a altura e a profundidade da peça: a peça muda logo. Para a escolha ficar, guarde-a neste produto."
            : "Escolha que campo da Medida é a largura, a altura e a profundidade da peça: a peça muda logo, só para ver. Guardar a escolha precisa da permissão de editar produtos."}
      </p>
      {/* as colunas dependem da largura do painel (e não do ecrã): numa coluna estreita as caixas continuam legíveis, uma por linha */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
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
        <p className="text-[15px]">{regra}</p>
        {/* aria-disabled (e não disabled): um botão desactivado perde o foco do teclado ao ser carregado; assim o foco fica onde estava e o clique é só ignorado */}
        <button type="button" aria-disabled={!manual} onClick={() => { if (manual) aoRepor(); }} className={cn(BOTAO, !manual && "cursor-not-allowed opacity-50 hover:bg-card")}>{guardados ? "Repor os guardados" : "Repor automático"}</button>
        {gravacao?.podeEditar && (
          <>
            <button type="button" aria-disabled={!podeGuardar} onClick={() => { if (podeGuardar) void correr(gravacao.aoGuardar, "Eixos guardados neste produto."); }} className={cn(BOTAO, !podeGuardar && "cursor-not-allowed opacity-50 hover:bg-card")}>Guardar neste produto</button>
            <button type="button" aria-disabled={!podeHerdar} onClick={() => { if (podeHerdar) void correr(gravacao.aoHerdar, "Os eixos voltaram a ser herdados."); }} className={cn(BOTAO, !podeHerdar && "cursor-not-allowed opacity-50 hover:bg-card")}>Voltar a herdar os eixos</button>
          </>
        )}
      </div>
      {gravacao && <p aria-live="polite" className={NOTA}>{msg && !msg.erro ? msg.texto : ""}</p>}
      {msg?.erro && <p role="alert" className="text-[15px] text-red-700 dark:text-red-400">{msg.texto}</p>}
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
      {/* 26/11: no telemóvel as zonas são uma faixa com scroll horizontal PRÓPRIO (a página não ganha scroll horizontal); a partir de `sm`, a grelha de sempre */}
      <ul className="flex snap-x gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] sm:overflow-visible sm:pb-0">
        {zonas.map(({ zona, partes }) => {
          const atributo = pintadaPor?.[zona]?.atributo, acabamento = pintadaPor?.[zona]?.acabamento;
          return (
            <li key={zona} className="min-w-[13rem] shrink-0 snap-start sm:min-w-0 sm:shrink">
              <button type="button" data-zona-botao={zona} aria-pressed={fixa === zona} onClick={() => aoFixar(fixa === zona ? null : zona)}
                onMouseEnter={() => aoApontar(zona)} onMouseLeave={() => aoApontar(null)} onFocus={() => aoApontar(zona)} onBlur={() => aoApontar(null)}
                className={cn(BOTAO, "w-full flex-col items-start gap-0.5 py-2 text-left aria-pressed:border-primary aria-pressed:bg-muted")}>
                <span className="font-semibold">{rotuloDaZona(zona)} — {partes} {partes === 1 ? "parte" : "partes"}</span>{" "}
                <span className="text-[14px] font-normal text-muted-foreground">{atributo ? `Pintada por: ${atributo}` : "Sem atributo de cor"}{acabamento ? ` · Superfície: ${acabamento}` : ""}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
