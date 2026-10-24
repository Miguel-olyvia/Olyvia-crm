// A ligação entre um passo da fase (FaseSimples, em NegocioSimples.tsx) e um passo que tem os seus próprios sub-passos
// (a seleção guiada das Necessidades, 14/10/2026). Enquanto o passo guiado está aberto, é ele que tem o botão primário
// ("Seguinte", fixo em baixo): a fase esconde o seu "Continuar" e não salta sozinha para o passo seguinte.
import { createContext, useContext } from "react";

export interface GuiaPasso {
  /** Passa ao passo seguinte da fase. */
  avancar: () => void;
  /** Volta ao passo anterior da fase. */
  recuar: () => void;
  /** O passo guiado diz que está aberto (true) ou fechado (false). */
  setGuiado: (b: boolean) => void;
}

export const GuiaPassoCtx = createContext<GuiaPasso | null>(null);
export const useGuiaPasso = () => useContext(GuiaPassoCtx);
