// 04/11/2026: «Enviar proposta» e «Enviar o contrato» / «Gerar o contrato» (os passos enviar e enviarContrato do motor) mandam o
// documento ao portal pela create-client-portal-access, que pede a permissão REAL de quem está ligado: proposta → portal.manage OU
// negocios.proposta.enviar; contrato → portal.manage OU client_contracts.send_signature (usePodeEnviarAoPortal, lido uma vez em
// PermPortalNegocios, na página /negocios). Só com a base ligada (modoReal): no protótipo sem base nada vai ao servidor e, sem o
// PermPortalNegocios por cima, não se pede nada. É ALÉM da permissão do «A ver como» (podeNeg/exigePerm), que continua igual: a
// simulação pode restringir, nunca dar. Sem a permissão real, o botão fica desligado com o motivo; com ela, faz o mesmo de sempre.
// Este ficheiro não importa o cliente da base (os ecrãs da Emylia também correm no protótipo e nos testes sem ela).
import { createContext, useContext, type ReactNode } from "react";
import { modoReal } from "./acessosPortal";

export type DocumentoDoPasso = "proposal" | "contract";

/** O documento que o passo `act` manda ao portal (null: o passo não vai ao portal). */
export const documentoDoPasso = (act: string | null | undefined): DocumentoDoPasso | null =>
  act === "enviar" ? "proposal" : act === "enviarContrato" ? "contract" : null;

export interface PermPortal { pode: boolean; aLer: boolean; motivo: string }
export interface PermPortalPasso extends PermPortal {
  /** lida e não tem: desligado, com `motivo` (a ler: desligado, sem motivo) */
  semPermissao: boolean;
}

export const PermPortalContexto = createContext<Readonly<Record<DocumentoDoPasso, PermPortal>> | null>(null);

const LIVRE: PermPortalPasso = { pode: true, aLer: false, semPermissao: false, motivo: "" };

/** A permissão real do passo `act`. Livre num passo que não vai ao portal, com `ativo` false, sem a base ligada ou sem PermPortalNegocios. */
export function usePermPortalDoPasso(act: string | null | undefined, ativo = true): PermPortalPasso {
  const perms = useContext(PermPortalContexto);
  const doc = documentoDoPasso(act);
  if (!ativo || !doc || !perms || !modoReal()) return LIVRE;
  const r = perms[doc];
  return { ...r, semPermissao: !r.pode && !r.aLer };
}

/** O mesmo, para os botões que se desenham dentro de um map (listas do Hoje). */
export function ComPermPortalDoPasso({ act, ativo = true, children }: { act: string | null | undefined; ativo?: boolean; children: (p: PermPortalPasso) => ReactNode }) {
  return <>{children(usePermPortalDoPasso(act, ativo))}</>;
}

/** O «(sem permissão)» dentro do botão (o mesmo do «Acesso ao portal»). */
export const SemPermissaoPortal = ({ p }: { p: PermPortalPasso }) =>
  p.semPermissao ? <span className="ml-1 text-xs text-muted-foreground">(sem permissão)</span> : null;
