// 25/11: os campos do aspeto de uma opção (atributo com «Tem aspeto»): «É metal» e a «Superfície por omissão» (nenhuma, polida, acetinada, mate). Só o ecrã: quem o usa (OpcaoForm de
// GestaoAtributos) guarda com aspetoOpcaoDados.definirAspetoOpcao. A superfície por omissão é a que a opção dá à zona que pinta; o atributo «Brilho» (ou «Tonalidade») escolhido num produto manda sobre ela.
import { useId } from "react";
import { Chips, NOTA } from "./pecasForm";
import { rotuloDaSuperficie } from "./aspetoOpcaoDados";
import { SUPERFICIES as VALORES, type Superficie } from "./v2/catalogoModelo";

const SUPERFICIES: readonly (readonly [Superficie | null, string])[] = [[null, "Nenhuma"], ...VALORES.map((s) => [s, rotuloDaSuperficie(s)] as const)];

interface Props { metal: boolean; superficie: Superficie | null; onMetal: (v: boolean) => void; onSuperficie: (v: Superficie | null) => void; desativado?: boolean }

export function AspetoOpcaoCampos({ metal, superficie, onMetal, onSuperficie, desativado = false }: Props) {
  const dica = useId();
  return (
    <fieldset disabled={desativado} className="grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-1 text-[15px] font-medium">Aspeto da opção</legend>
      <label className="flex min-h-11 items-center gap-2 text-[15px]">
        <input type="checkbox" checked={metal} onChange={(e) => onMetal(e.target.checked)} className="h-5 w-5 accent-primary" />
        É metal
      </label>
      <div className="grid gap-1.5">
        <span className="text-[15px]" aria-hidden="true">Superfície por omissão</span>
        <Chips<Superficie | null> rot="Superfície por omissão" opcoes={SUPERFICIES} v={superficie} set={onSuperficie} descrito={dica} />
        <span id={dica} className={NOTA}>É a superfície que esta opção dá à parte do produto que pinta. Se o produto tiver «Brilho» ou «Tonalidade» escolhido, esse vale mais.</span>
      </div>
    </fieldset>
  );
}
