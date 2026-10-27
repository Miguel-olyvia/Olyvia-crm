// Bloqueio de edição da encomenda (aviso de bloqueio + Desbloquear do Olyvia 2.0): cadeado, motivo e o botão que o
// levanta, só com as ações que já existem na app (retirar do portal, reverter receção). As permissões dos botões
// são as dos PermissionGate que já protegem essas ações.
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/PermissionGate";
import type { PoSheetLock } from "./poSheetFlow";

const REVERT_PERMS = ["purchase_orders.revert_receipt", "inventory.edit"];
const WITHDRAW_PERMS = ["purchase_orders.approve"];

/** O botão pequeno com cadeado que levanta o bloqueio (unlockBtn do 2.0). */
export function PoUnlockButton({ lock, onWithdraw, onRevert, revertLabel = "Reverter receção" }: {
  lock: PoSheetLock;
  onWithdraw: () => void;
  onRevert: () => void;
  revertLabel?: string;
}) {
  if (lock.unlock === "withdraw") {
    return (
      <PermissionGate permissions={WITHDRAW_PERMS}>
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={onWithdraw}>
          <Lock className="h-3 w-3" aria-hidden="true" />
          Retirar do portal para editar
        </Button>
      </PermissionGate>
    );
  }
  if (lock.unlock === "revert") {
    return (
      <PermissionGate permissions={REVERT_PERMS} requireAll>
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={onRevert}>
          <Lock className="h-3 w-3" aria-hidden="true" />
          {revertLabel}
        </Button>
      </PermissionGate>
    );
  }
  return null;
}

/** O aviso no topo das Linhas: cadeado, motivo, botão e (opcional) texto extra por baixo. */
export function PoLockNotice({ lock, onWithdraw, onRevert, revertLabel, children }: {
  lock: PoSheetLock;
  onWithdraw: () => void;
  onRevert: () => void;
  revertLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <b>{lock.reason}.</b>
          <PoUnlockButton lock={lock} onWithdraw={onWithdraw} onRevert={onRevert} revertLabel={revertLabel} />
        </div>
        {lock.hint && <p className="text-xs">{lock.hint}</p>}
        {children}
      </div>
    </div>
  );
}

/** Valor só de leitura de um campo bloqueado do cabeçalho, com o cadeado e o motivo (Ed com bloqueio do 2.0). */
export function PoLockedValue({ reason, children }: { reason: string | null | undefined; children: ReactNode }) {
  if (!reason) return <>{children}</>;
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <span title={reason} className="text-muted-foreground">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Bloqueado: {reason}</span>
      </span>
    </span>
  );
}
