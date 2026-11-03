// Aviso de contrato por assinar no Portal do Fornecedor. Nunca bloqueia o
// portal: ao entrar, um modal com «Assinar agora» / «Mais tarde» (uma vez por
// sessão e por contrato, só para quem pode assinar); enquanto estiver
// pendente, um banner discreto em todas as páginas com ligação para «Contrato».
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSupplierPortal } from "@/contexts/SupplierPortalContext";
import { contractRef, fmtData } from "@/lib/supplierContracts/tipos";
import { pendingContract } from "@/lib/supplierContracts/portal";
import { useSpContractsList } from "./useSpContracts";

export const SP_CONTRACT_PATH = "/supplier-portal/contract";

const dismissKey = (userId: string, contractId: string) => `sp-contract-prompt:${userId}:${contractId}`;

function wasDismissed(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markDismissed(key: string) {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    /* sessionStorage indisponível: o modal volta a aparecer, sem mais consequências */
  }
}

/** Link para a página do contrato (com ?id= e, opcionalmente, a abrir a assinatura). */
export const contractPageHref = (contractId?: string | null, sign = false): string => {
  const p = new URLSearchParams();
  if (contractId) p.set("id", contractId);
  if (sign) p.set("assinar", "1");
  const q = p.toString();
  return q ? `${SP_CONTRACT_PATH}?${q}` : SP_CONTRACT_PATH;
};

/** Modal de entrada. `enabled` = já passou a password e a confirmação de dados (um passo de cada vez). */
export function SpContractPendingPrompt({ enabled }: { enabled: boolean }) {
  const { user } = useSupplierPortal();
  const navigate = useNavigate();
  const location = useLocation();
  const { data } = useSpContractsList(enabled);
  const pending = pendingContract(data);
  const key = user?.id && pending ? dismissKey(user.id, pending.id) : null;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Na própria página do contrato não faz sentido perguntar.
    const onContractPage = location.pathname.startsWith(SP_CONTRACT_PATH);
    if (enabled && key && pending?.can_sign && !onContractPage && !wasDismissed(key)) setOpen(true);
    if (!pending) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, pending?.can_sign]);

  if (!pending || !key) return null;

  const later = () => {
    markDismissed(key);
    setOpen(false);
  };

  const signNow = () => {
    markDismissed(key);
    setOpen(false);
    navigate(contractPageHref(pending.id, true));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : later())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" aria-hidden="true" />
            <DialogTitle>Tem um contrato por assinar</DialogTitle>
          </div>
          <DialogDescription>
            {pending.organization_name || "A empresa"} enviou-lhe o contrato {contractRef(pending)}
            {pending.sent_at ? ` em ${fmtData(pending.sent_at)}` : ""}. Pode revê-lo e assinar com um código SMS. O portal
            continua a funcionar normalmente se preferir fazê-lo mais tarde.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={later}>
            Mais tarde
          </Button>
          <Button type="button" className="h-11 gap-2" onClick={signNow}>
            Assinar agora
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Banner discreto enquanto houver um contrato enviado por assinar (não aparece na página Contrato). */
export function SpContractPendingBanner({ enabled }: { enabled: boolean }) {
  const location = useLocation();
  const { data } = useSpContractsList(enabled);
  const pending = pendingContract(data);
  if (!enabled || !pending || location.pathname.startsWith(SP_CONTRACT_PATH)) return null;

  const who = pending.organization_name || "A empresa";
  return (
    <div
      role="region"
      aria-label="Contrato por assinar"
      className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100 md:px-6"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <FileSignature className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {pending.can_sign
              ? `${who} enviou-lhe o contrato ${contractRef(pending)} para assinar.`
              : `${who} enviou o contrato ${contractRef(pending)}: aguarda a assinatura do responsável da conta.`}
          </span>
        </p>
        <Link
          to={contractPageHref(pending.id)}
          className="inline-flex min-h-6 items-center gap-1 rounded text-sm font-medium underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {pending.can_sign ? "Ver e assinar" : "Ver contrato"}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
