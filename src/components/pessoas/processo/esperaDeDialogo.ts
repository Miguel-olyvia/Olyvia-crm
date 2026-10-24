// O que abre DEPOIS de um diálogo desmontar (dois diálogos nunca se sobrepõem): "Editar o orçamento", na verificação, fecha esta e abre o
// editor quando ela acabar de sair. O que fica à espera sabe de que diálogo veio, e só o fecho desse o consome: o fecho de outro
// (um diálogo diferente que desmonte entretanto) não abre nada nem gasta a espera.
export interface EsperaDeDialogo<D, A> {
  /** Deixa `seguinte` à espera de o diálogo `origem` desmontar (substitui o que já lá estava). */
  guardar: (origem: D, seguinte: A) => void;
  /** O diálogo `origem` desmontou: devolve o que esperava por ele (uma só vez), ou `null` se nada esperava por este diálogo. */
  consumir: (origem: D) => A | null;
}

export function criarEspera<D, A>(): EsperaDeDialogo<D, A> {
  let pendente: { origem: D; seguinte: A } | null = null;
  return {
    guardar: (origem, seguinte) => { pendente = { origem, seguinte }; },
    consumir: (origem) => {
      if (pendente === null || pendente.origem !== origem) return null;
      const { seguinte } = pendente;
      pendente = null;
      return seguinte;
    },
  };
}
