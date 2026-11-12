// 12/11: sem a permissão da fase, o negócio fica só de leitura na gravação; os controlos também têm de ficar parados (antes pareciam mudar e nada gravava).
// O <fieldset disabled> desativa todos os botões, campos e seletores lá dentro, como na PaginaNegocio (Contacto sem contacto.registar).
import type { ReactNode } from "react";
import type { Passo } from "./CamposFase";

/** Envolve o que estiver dentro num fieldset desativado quando `ativo`; sem `ativo`, devolve-o tal como está. */
export function SoLeitura({ ativo, children }: { ativo?: boolean; children: ReactNode }) {
  if (!ativo) return <>{children}</>;
  return <fieldset disabled className="m-0 min-w-0 border-0 p-0">{children}</fieldset>;
}

/** O corpo de cada passo dentro de um fieldset desativado (a navegação entre passos fica fora do corpo e continua a funcionar). */
export function passosSoLeitura(passos: Passo[]): Passo[] {
  return passos.map((p) => ({ ...p, corpo: <SoLeitura ativo>{p.corpo}</SoLeitura> }));
}
