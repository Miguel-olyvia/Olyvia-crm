import type { ReactNode } from "react";
import type { CodigoCampoObrigatorioAdmissao } from "@/lib/hr/admissaoObrigatorios";
import type { TraduzirFn } from "@/lib/hr/errosAdmissao";
import type { RascunhoConvite } from "@/lib/hr/conviteAdmissaoPayload";

/** O que cada pagina do convite publico recebe da pagina que as junta. */
export interface PaginaConviteProps {
  /** Ja na lingua do ecra publico (escolhida pelo navegador). */
  t: TraduzirFn;
  rascunho: RascunhoConvite;
  definir: <K extends keyof RascunhoConvite>(campo: K, valor: RascunhoConvite[K]) => void;
  /** A mensagem de erro do campo, ou `null` quando nao ha (ou ainda nao se mostra). */
  erroDe: (campoId: keyof RascunhoConvite) => string | null;
  /** Este campo e obrigatorio NESTE rascunho, segundo a configuracao da organizacao. */
  obrigatorio: (codigo: CodigoCampoObrigatorioAdmissao) => boolean;
  /**
   * Este campo pode editar-se NESTE estado do processo (no portal, o que a base deixa editar: todos
   * em preenchimento, so os devolvidos em `devolvida`). Omitido, tudo se edita, como sempre.
   */
  editavel?: (campoId: keyof RascunhoConvite) => boolean;
  /**
   * O que vem logo a seguir ao campo do NISS (pagina 1) e do IBAN (pagina 2): no portal, o botao que os
   * guarda no cofre pela accao `sensiveis`. Omitido, nada se acrescenta.
   */
  aposCampo?: { niss?: ReactNode; conta_numero?: ReactNode };
}
