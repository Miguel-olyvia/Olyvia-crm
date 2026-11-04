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

// 3/11 (20270105200000): seis permissões por fase, exigidas no servidor: registar o contacto, gerir as visitas, registar a decisão do cliente
// (pedido de alterações, adendas), os imprevistos da obra, encerrar a obra e perder o negócio. O quadro por papel bate com neg_papeis_permissoes
// da migração: comercial, armazém, financeiro e jurídico as quatro do negócio; operações e direção as seis; o técnico nenhuma.
// 4/11 (Lote C): as cinco que o servidor também exige e o ecrã não perguntava (neg_guardar_negocio: o orçamento, o envio da proposta e
// o contrato; obra_guardar_negocio: planear e executar a obra; obra_encomendar_materiais: os materiais novos). "equipa.edit" (a ficha do
// técnico) passa a ser a do RH (hr.pessoas.laborais.edit, rh_guardar_oficios_pessoa); planear a obra tem a sua ("obra.planear").
export type PermNeg = "finance.validate_payment" | "finance.invoice" | "contracts.cancel" | "equipa.edit" | "margin.approve"
  | "contacto.registar" | "visita.gerir" | "proposta.decidir" | "obra.imprevistos" | "obra.fechar" | "negocio.perder"
  | "orcamento.editar" | "proposta.enviar" | "contrato.editar" | "obra.planear" | "obra.executar" | "obra.materiais";

/** As quatro que a migração deu a quem grava o negócio (pessoas.edit): contacto, visita, decisão do cliente e perder. */
const DO_NEGOCIO: readonly PermNeg[] = ["contacto.registar", "visita.gerir", "proposta.decidir", "negocio.perder"];
/** As duas da obra (negocios.obra.planear). */
const DA_OBRA: readonly PermNeg[] = ["obra.imprevistos", "obra.fechar"];
/** 4/11: as do orçamento, da proposta e do contrato (neg_papeis_permissoes: o comercial e a Direção; o Jurídico só o contrato). */
const DA_PROPOSTA: readonly PermNeg[] = ["orcamento.editar", "proposta.enviar", "contrato.editar"];

export const PERMS_PAPEL: Record<Papel, readonly (PermNeg | "*")[]> = {
  direcao: ["*"], financeiro: ["finance.validate_payment", "finance.invoice", ...DO_NEGOCIO],
  comercial: [...DO_NEGOCIO, ...DA_PROPOSTA], armazem: [...DO_NEGOCIO],
  operacoes: ["equipa.edit", ...DO_NEGOCIO, ...DA_OBRA, "obra.planear", "obra.executar", "obra.materiais"],
  juridico: [...DO_NEGOCIO, "contrato.editar"], tecnico: ["obra.executar"],
};

/** 3/11: as seis da migração 20270105200000 (a Direção da Olyvia tem-nas todas: papeisReal.aplicarPermissoesReais). */
export const PERMS_FASES: readonly PermNeg[] = [...DO_NEGOCIO, ...DA_OBRA];
/** 4/11: as que a Direção da Olyvia também tem em neg_papeis_permissoes (sem negocios.obra.executar: essa é do técnico e das Operações). */
export const PERMS_DIRECAO_EXTRA: readonly PermNeg[] = [...DA_PROPOSTA, "obra.planear", "obra.materiais"];

/** O código da permissão na base (anew_permissions) de cada ação. 2/11 (20270102200000): os códigos reais; os de antes
 *  (financeiro.validar_pagamento, financeiro.faturar, negocios.anular, obras.gerir, orcamentos.aprovar_margem) não existiam na base. */
export const CODIGO_BASE: Record<PermNeg, string> = {
  "finance.validate_payment": "negocios.validar_pagamento",
  "finance.invoice": "negocios.registar_fatura",
  "contracts.cancel": "client_contracts.cancel",
  "equipa.edit": "hr.pessoas.laborais.edit",
  "margin.approve": "negocios.margem.aprovar",
  "contacto.registar": "negocios.contacto.registar",
  "visita.gerir": "negocios.visita.gerir",
  "proposta.decidir": "negocios.proposta.decidir",
  "obra.imprevistos": "negocios.obra.imprevistos",
  "obra.fechar": "negocios.obra.fechar",
  "negocio.perder": "negocios.perder",
  "orcamento.editar": "negocios.orcamento.editar",
  "proposta.enviar": "negocios.proposta.enviar",
  "contrato.editar": "negocios.contrato.editar",
  "obra.planear": "negocios.obra.planear",
  "obra.executar": "negocios.obra.executar",
  "obra.materiais": "negocios.obra.materiais",
};

/** 4/11: outros códigos que o servidor aceita em vez do de CODIGO_BASE (obra_encomendar_materiais: negocios.obra.materiais OU
 *  purchase_orders.create). Também se leem (CODIGOS_NEGOCIOS). */
export const ALTERNATIVAS: Readonly<Partial<Record<PermNeg, readonly string[]>>> = {
  "obra.materiais": ["purchase_orders.create"],
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
  const c = reais.codigos;
  const naBase = !!c && (c.has(CODIGO_BASE[x]) || (ALTERNATIVAS[x] ?? []).some((a) => c.has(a)));
  // a Direção a ver como outro papel: o que esse papel faria, sem nunca passar do que ela pode
  return reais.simular ? naBase && doPapel(p, x) : naBase;
};

/** O aviso de quem não tem a permissão (a mensagem e a explicação). */
export const SEM_PERM: Record<PermNeg, { msg: string; sub: string }> = {
  "finance.validate_payment": { msg: "Sem permissão para validar pagamentos", sub: "Só o Financeiro ou a Direção validam pagamentos (finance.validate_payment). Mude de papel em cima." },
  "finance.invoice": { msg: "Sem permissão para tratar de faturas", sub: "Só o Financeiro ou a Direção emitem ou registam faturas (finance.invoice)." },
  "contracts.cancel": { msg: "Sem permissão para anular contratos", sub: "Só a Direção anula contratos e vendas (contracts.cancel)." },
  "equipa.edit": { msg: "Sem permissão para mudar a ficha do técnico", sub: "Mudar o ofício e as férias do técnico pede a permissão hr.pessoas.laborais.edit (dados laborais do RH)." },
  "margin.approve": { msg: "Sem permissão para aprovar a margem", sub: "Só a Direção aprova uma proposta abaixo da margem mínima (negocios.margem.aprovar)." },
  "contacto.registar": { msg: "Sem permissão para registar o contacto", sub: "Registar a chamada, as tentativas e o voltar a ligar pede a permissão negocios.contacto.registar." },
  "visita.gerir": { msg: "Sem permissão para gerir as visitas", sub: "Marcar, alterar, cancelar e fechar as visitas e o diagnóstico no local pede a permissão negocios.visita.gerir." },
  "proposta.decidir": { msg: "Sem permissão para registar a decisão do cliente", sub: "Registar o pedido de alterações ou a resposta a uma adenda pede a permissão negocios.proposta.decidir." },
  "obra.imprevistos": { msg: "Sem permissão para decidir os imprevistos", sub: "Propor ao cliente o trabalho extra e decidir o imprevisto pede a permissão negocios.obra.imprevistos." },
  "obra.fechar": { msg: "Sem permissão para encerrar a obra", sub: "Dar a obra por concluída e enviar o auto de receção pede a permissão negocios.obra.fechar." },
  "negocio.perder": { msg: "Sem permissão para dar o negócio como perdido", sub: "Marcar o negócio como perdido, ou anular a perda, pede a permissão negocios.perder." },
  "orcamento.editar": { msg: "Sem permissão para mudar o orçamento", sub: "Mudar as linhas, os preços, o desconto, as versões ou as adendas pede a permissão negocios.orcamento.editar." },
  "proposta.enviar": { msg: "Sem permissão para enviar a proposta", sub: "Enviar a proposta ou a adenda ao cliente pede a permissão negocios.proposta.enviar." },
  "contrato.editar": { msg: "Sem permissão para mudar o contrato", sub: "Gerar, enviar ou rever o contrato (cláusulas e pedidos do cliente) pede a permissão negocios.contrato.editar." },
  "obra.planear": { msg: "Sem permissão para planear a obra", sub: "Mudar o plano, os técnicos, aprovar, arrancar e validar as tarefas pede a permissão negocios.obra.planear." },
  "obra.executar": { msg: "Sem permissão para registar a execução", sub: "Começar, registar e marcar como feitas as tarefas atribuídas a si pede a permissão negocios.obra.executar." },
  "obra.materiais": { msg: "Sem permissão para encomendar materiais", sub: "Pedir materiais novos ao fornecedor pede a permissão negocios.obra.materiais (ou purchase_orders.create)." },
};
