// As abas da assiduidade de uma pessoa («O meu ponto» e ficha de RH): quais existem para quem está a ver e qual abre.
// Os valores são também os que vão no endereço (?aba=), por isso são estáveis e sem acentos.
export const ABAS_ASSIDUIDADE = ["picar", "calendario", "horas-extra", "banco-horas", "justificacoes"] as const;
export type AbaAssiduidade = (typeof ABAS_ASSIDUIDADE)[number];

export interface QuemVe {
  /** Quem está a ver é a própria pessoa (só ela pica e justifica). */
  souAPessoa: boolean;
  /** A pessoa pode picar o ponto (`hr.assiduidade.picar`). */
  podePicar: boolean;
  /** O horário em vigor é do tipo banco de horas: só então existe a aba «Banco de horas». */
  temBanco: boolean;
}

/** As abas que existem, pela ordem em que aparecem. «Calendário» e «Horas extra» existem sempre. */
export function abasVisiveis({ souAPessoa, podePicar, temBanco }: QuemVe): AbaAssiduidade[] {
  return ABAS_ASSIDUIDADE.filter((aba) => {
    if (aba === "picar") return souAPessoa && podePicar;
    if (aba === "banco-horas") return temBanco;
    if (aba === "justificacoes") return souAPessoa;
    return true;
  });
}

/** A aba pedida (por exemplo no endereço) se existir; senão a primeira. */
export function abaAberta(pedida: string | null | undefined, visiveis: readonly AbaAssiduidade[]): AbaAssiduidade {
  const ok = visiveis.find((aba) => aba === pedida);
  return ok ?? visiveis[0] ?? "calendario";
}

/** A chave de tradução do rótulo de cada aba. */
export const CHAVE_ROTULO: Record<AbaAssiduidade, string> = {
  picar: "rhAbas.ass.picar",
  calendario: "rhAbas.ass.calendario",
  "horas-extra": "rhAbas.ass.horasExtra",
  "banco-horas": "rhAbas.ass.banco",
  justificacoes: "rhAbas.ass.justificacoes",
};
