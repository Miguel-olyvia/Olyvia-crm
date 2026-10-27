// As permissões dos Negócios por papel (19/10/2026), à maneira do perfil do Inventário (inventario/perfil.ts): a Direção tem tudo ("*"),
// o Financeiro valida pagamentos e trata das faturas, os outros papéis nenhuma destas. A verificação é do motor (acoes, motor.ts): há ecrãs
// que chamam a ação do passo sem olhar para o papel (fazer(A, act), em LeadsSimples, PessoaFicha e PessoasV1).
// 22/10: "equipa.edit": a ficha dos técnicos de obra (custo/hora, ofício, férias), no bloco "Obra" da ficha da pessoa (RH › Pessoas): a Direção e as Operações.
// 23/10 (2.0, segurança): com uma conta real, quem decide são as permissões do utilizador na base (tem_permissao, papel_permissoes),
// lidas por permissoesReais.ts e postas aqui (definirPermissoesReais). O quadro por papel só serve:
//   · sem conta (o protótipo local e os testes);
//   · para o "A ver como" da Direção/admin: vê o que o papel simulado faria, mas nunca mais do que ela própria pode na base.
// Uma conta real sem as permissões lidas (a carregar, ou a leitura falhou) não pode nenhuma destas ações.
import type { Papel } from "./motor";

export type PermNeg = "finance.validate_payment" | "finance.invoice" | "contracts.cancel" | "equipa.edit" | "margin.approve";

export const PERMS_PAPEL: Record<Papel, readonly (PermNeg | "*")[]> = {
  direcao: ["*"], financeiro: ["finance.validate_payment", "finance.invoice"],
  comercial: [], armazem: [], operacoes: ["equipa.edit"], juridico: [], tecnico: [],
};

/** O código da permissão na base (o catálogo `permissoes`, migração 0001) de cada ação. */
export const CODIGO_BASE: Record<PermNeg, string> = {
  "finance.validate_payment": "financeiro.validar_pagamento",
  "finance.invoice": "financeiro.faturar",
  "contracts.cancel": "negocios.anular",
  "equipa.edit": "obras.gerir",
  "margin.approve": "orcamentos.aprovar_margem",
};

/** As permissões da conta real: `codigos` as concedidas na organização ativa (null: ainda não se sabem); `simular`: a Direção/admin
 *  pode usar o "A ver como". Sem conta real, null. */
interface Reais { codigos: ReadonlySet<string> | null; simular: boolean }
let reais: Reais | null = null;

/** 23/10: as permissões reais de quem entrou (PrototipoNegocios.tsx). null: sem conta (o quadro por papel). */
export function definirPermissoesReais(r: Reais | null): void { reais = r; }

const doPapel = (p: Papel, x: PermNeg): boolean => PERMS_PAPEL[p].includes("*") || PERMS_PAPEL[p].includes(x);

/** O papel (e quem entrou) tem a permissão? */
export const podeNeg = (p: Papel, x: PermNeg): boolean => {
  if (!reais) return doPapel(p, x);
  const naBase = !!reais.codigos?.has(CODIGO_BASE[x]);
  // a Direção a ver como outro papel: o que esse papel faria, sem nunca passar do que ela pode
  return reais.simular ? naBase && doPapel(p, x) : naBase;
};

/** O aviso de quem não tem a permissão (a mensagem e a explicação). */
export const SEM_PERM: Record<PermNeg, { msg: string; sub: string }> = {
  "finance.validate_payment": { msg: "Sem permissão para validar pagamentos", sub: "Só o Financeiro ou a Direção validam pagamentos (finance.validate_payment). Mude de papel em cima." },
  "finance.invoice": { msg: "Sem permissão para tratar de faturas", sub: "Só o Financeiro ou a Direção emitem ou registam faturas (finance.invoice)." },
  "contracts.cancel": { msg: "Sem permissão para anular contratos", sub: "Só a Direção anula contratos e vendas (contracts.cancel)." },
  "equipa.edit": { msg: "Sem permissão para mudar a ficha do técnico", sub: "Só a Direção ou as Operações mudam o custo/hora, o ofício e as férias (equipa.edit). Mude de papel em cima." },
  "margin.approve": { msg: "Sem permissão para aprovar a margem", sub: "Só a Direção aprova uma proposta abaixo da margem mínima (orcamentos.aprovar_margem)." },
};
