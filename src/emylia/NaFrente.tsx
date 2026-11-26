// 9/11 (Rúben, telemóvel): as janelas que cobrem o ecrã (o custo de uma linha, rever o contrato, o portal do cliente, o auto de receção,
// a fotografia da conversa) iam dentro do <main> do Layout, que é "fixed" e por isso faz o seu próprio empilhamento: o cabeçalho da Olyvia
// (z 450) ficava por cima e tapava o título e o botão de fechar. Vão para o body, por cima do cabeçalho, com as cores da página dos negócios.
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/** Põe o conteúdo (uma camada "fixed inset-0") no body, à frente do cabeçalho da app, com os tokens da página (.pn .calma .pg-root). */
export function NaFrente({ children, z = 600 }: { children: ReactNode; z?: 600 | 700 }) {
  if (typeof document === "undefined") return <>{children}</>;
  // 26/11: z 700 para os avisos (toasts), que têm de ficar à frente do Estúdio da obra (z 600)
  return createPortal(<div className={`pn calma pg-root relative ${z === 700 ? "z-[700]" : "z-[600]"}`}>{children}</div>, document.body);
}
