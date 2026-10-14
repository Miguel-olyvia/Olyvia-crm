import type { CodigoCampoObrigatorioAdmissao } from "@/components/rh-exemplo/lib/admissaoObrigatorios";
import type { TraduzirFn } from "@/components/rh-exemplo/lib/errosAdmissao";
import type { RascunhoConvite } from "@/components/rh-exemplo/lib/conviteAdmissaoPayload";

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
}
