// Só leitura sem esconder: os controlos de escrita ficam desligados (`fieldset disabled`) e o conteúdo continua à vista e lido pelo leitor de ecrã (nunca `inert`).
import type { ReactNode } from "react";

export function SoParaLer({ ativo, children }: { ativo: boolean; children: ReactNode }) {
  return <fieldset disabled={ativo} className="m-0 min-w-0 space-y-8 border-0 p-0">{children}</fieldset>;
}
