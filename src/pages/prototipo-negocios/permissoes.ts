// As permissões dos Negócios por papel (19/10/2026), à maneira do perfil do Inventário (inventario/perfil.ts): a Direção tem tudo ("*"),
// o Financeiro valida pagamentos e trata das faturas, os outros papéis nenhuma destas. A verificação é do motor (acoes, motor.ts): há ecrãs
// que chamam a ação do passo sem olhar para o papel (fazer(A, act), em LeadsSimples, PessoaFicha e PessoasV1).
import type { Papel } from "./motor";

export type PermNeg = "finance.validate_payment" | "finance.invoice" | "contracts.cancel";

export const PERMS_PAPEL: Record<Papel, readonly (PermNeg | "*")[]> = {
  direcao: ["*"], financeiro: ["finance.validate_payment", "finance.invoice"],
  comercial: [], armazem: [], operacoes: [], juridico: [],
};

/** O papel tem a permissão? */
export const podeNeg = (p: Papel, x: PermNeg): boolean => PERMS_PAPEL[p].includes("*") || PERMS_PAPEL[p].includes(x);

/** O aviso de quem não tem a permissão (a mensagem e a explicação). */
export const SEM_PERM: Record<PermNeg, { msg: string; sub: string }> = {
  "finance.validate_payment": { msg: "Sem permissão para validar pagamentos", sub: "Só o Financeiro ou a Direção validam pagamentos (finance.validate_payment). Mude de papel em cima." },
  "finance.invoice": { msg: "Sem permissão para tratar de faturas", sub: "Só o Financeiro ou a Direção emitem ou registam faturas (finance.invoice)." },
  "contracts.cancel": { msg: "Sem permissão para anular contratos", sub: "Só a Direção anula contratos e vendas (contracts.cancel)." },
};
