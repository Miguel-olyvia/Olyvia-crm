// 04/11/2026: lê uma vez, para toda a página /negocios, a permissão real de mandar a proposta e o contrato ao portal (a regra de
// create-client-portal-access, usePodeEnviarAoPortal) e dá-a aos botões dos passos (permPortalPasso.tsx).
import type { ReactNode } from "react";
import { usePodeEnviarAoPortal } from "@/hooks/usePodeEnviarPropostaPortal";
import { PermPortalContexto } from "./permPortalPasso";

export function PermPortalNegocios({ children }: { children: ReactNode }) {
  const proposal = usePodeEnviarAoPortal("proposal");
  const contract = usePodeEnviarAoPortal("contract");
  return <PermPortalContexto.Provider value={{ proposal, contract }}>{children}</PermPortalContexto.Provider>;
}
