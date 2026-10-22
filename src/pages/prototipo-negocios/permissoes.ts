// As permissões dos Negócios por papel (19/10/2026), à maneira do perfil do Inventário (inventario/perfil.ts): a Direção tem tudo ("*"),
// o Financeiro valida pagamentos e trata das faturas, os outros papéis nenhuma destas. A verificação é do motor (acoes, motor.ts): há ecrãs
// que chamam a ação do passo sem olhar para o papel (fazer(A, act), em LeadsSimples, PessoaFicha e PessoasV1).
// 22/10: "equipa.edit": a ficha dos técnicos de obra (custo/hora, ofício, férias), no RH › Técnicos: a Direção e as Operações.
import type { Papel } from "./motor";

export type PermNeg = "finance.validate_payment" | "finance.invoice" | "contracts.cancel" | "equipa.edit";

export const PERMS_PAPEL: Record<Papel, readonly (PermNeg | "*")[]> = {
  direcao: ["*"], financeiro: ["finance.validate_payment", "finance.invoice"],
  comercial: [], armazem: [], operacoes: ["equipa.edit"], juridico: [], tecnico: [],
};

/** O papel tem a permissão? */
export const podeNeg = (p: Papel, x: PermNeg): boolean => PERMS_PAPEL[p].includes("*") || PERMS_PAPEL[p].includes(x);

/** O aviso de quem não tem a permissão (a mensagem e a explicação). */
export const SEM_PERM: Record<PermNeg, { msg: string; sub: string }> = {
  "finance.validate_payment": { msg: "Sem permissão para validar pagamentos", sub: "Só o Financeiro ou a Direção validam pagamentos (finance.validate_payment). Mude de papel em cima." },
  "finance.invoice": { msg: "Sem permissão para tratar de faturas", sub: "Só o Financeiro ou a Direção emitem ou registam faturas (finance.invoice)." },
  "contracts.cancel": { msg: "Sem permissão para anular contratos", sub: "Só a Direção anula contratos e vendas (contracts.cancel)." },
  "equipa.edit": { msg: "Sem permissão para mudar a ficha do técnico", sub: "Só a Direção ou as Operações mudam o custo/hora, o ofício e as férias (equipa.edit). Mude de papel em cima." },
};
