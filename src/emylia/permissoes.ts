// As permissões dos Negócios por papel (19/10/2026), à maneira do perfil do Inventário (inventario/perfil.ts): a Direção tem tudo ("*"),
// o Financeiro valida pagamentos e trata das faturas, os outros papéis nenhuma destas. A verificação é do motor (acoes, motor.ts): há ecrãs
// que chamam a ação do passo sem olhar para o papel (fazer(A, act), em LeadsSimples, PessoaFicha e PessoasV1).
// 22/10: "equipa.edit": a ficha dos técnicos de obra (custo/hora, ofício, férias), no bloco "Obra" da ficha da pessoa (RH › Pessoas): a Direção e as Operações.
// 23/10 (2.0, segurança): com uma conta real, quem decide são as permissões do utilizador na base, postas aqui (definirPermissoesReais).
// 5/11: leem-se por fn_cat_pode(org, código), a MESMA função com que o servidor decide (o perfil, os Papéis no Negócio de TODOS os papéis
// da pessoa e o admin do sistema), em usePermissoesReaisNegocio (real/usePermissoesReais.ts), com `simular: false`, na ficha da pessoa
// (permissoesPosContrato.ts) e em /negocios (NegociosEmylia.tsx). Aí o "A ver como" só escolhe a vista e de quem é cada passo
// (p.who === S.role): o que se pode fazer é o que a base diz, seja qual for o papel escolhido. O quadro por papel (PERMS_PAPEL) só serve
// sem conta (o protótipo local e os testes); o ramo `simular: true` (o papel simulado, sem passar do que a base dá) já ninguém o põe.
// Uma conta real sem as permissões lidas (a carregar, ou a leitura falhou) não pode nenhuma destas ações.
import type { Papel } from "./motor";

// 3/11 (20270105200000): seis permissões por fase, exigidas no servidor: registar o contacto, gerir as visitas, registar a decisão do cliente
// (pedido de alterações, adendas), os imprevistos da obra, encerrar a obra e perder o negócio. O quadro por papel bate com neg_papeis_permissoes
// da migração: comercial, armazém, financeiro e jurídico as quatro do negócio; operações e direção as seis; o técnico nenhuma.
// 4/11 (Lote C): as cinco que o servidor também exige e o ecrã não perguntava (neg_guardar_negocio: o orçamento, o envio da proposta e
// o contrato; obra_guardar_negocio: planear e executar a obra; obra_encomendar_materiais: os materiais novos). "equipa.edit" (a ficha do
// técnico) passa a ser a do RH (hr.pessoas.laborais.edit, rh_guardar_oficios_pessoa); planear a obra tem a sua ("obra.planear").
// 4/11 (tarde): "obra.materiais" (negocios.obra.materiais) passa a ser só VER os materiais da obra (o bloco no separador "Equipa e meios"),
// e todos os papéis que abrem a obra a têm. Pedir materiais novos ao fornecedor (obra_encomendar_materiais) é "obra.encomendar", ou seja,
// purchase_orders.create; na obra já não há botão de encomendar (20270106500000). 4/11 (20270106650000): quem planeia a obra
// (negocios.obra.planear) também pede: é o pedido automático dos materiais da tarefa nova (novaTarefaPlano → ajustar).
export type PermNeg = "finance.validate_payment" | "finance.invoice" | "contracts.cancel" | "equipa.edit" | "margin.approve"
  | "contacto.registar" | "visita.gerir" | "visita.preencher" | "proposta.decidir" | "obra.imprevistos" | "obra.fechar" | "negocio.perder"
  | "orcamento.editar" | "proposta.enviar" | "contrato.editar" | "obra.planear" | "obra.executar" | "obra.materiais" | "obra.encomendar";

/** As quatro que a migração deu a quem grava o negócio (pessoas.edit): contacto, visita, decisão do cliente e perder. */
// 11/11 (20270114320000): a visita tem duas: gerir (marcar, remarcar, cancelar) e preencher (o levantamento); quem tinha uma ficou com as duas
const DO_NEGOCIO: readonly PermNeg[] = ["contacto.registar", "visita.gerir", "visita.preencher", "proposta.decidir", "negocio.perder"];
/** As duas da obra (negocios.obra.planear). */
const DA_OBRA: readonly PermNeg[] = ["obra.imprevistos", "obra.fechar"];
/** 4/11: as do orçamento, da proposta e do contrato (neg_papeis_permissoes: o comercial e a Direção; o Jurídico só o contrato). */
const DA_PROPOSTA: readonly PermNeg[] = ["orcamento.editar", "proposta.enviar", "contrato.editar"];

export const PERMS_PAPEL: Record<Papel, readonly (PermNeg | "*")[]> = {
  direcao: ["*"], financeiro: ["finance.validate_payment", "finance.invoice", ...DO_NEGOCIO, "obra.materiais"],
  comercial: [...DO_NEGOCIO, ...DA_PROPOSTA, "obra.materiais"], armazem: [...DO_NEGOCIO, "obra.materiais"],
  operacoes: ["equipa.edit", ...DO_NEGOCIO, ...DA_OBRA, "obra.planear", "obra.executar", "obra.materiais", "obra.encomendar"],
  juridico: [...DO_NEGOCIO, "contrato.editar", "obra.materiais"], tecnico: ["obra.executar", "obra.materiais"],
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
  "visita.preencher": "negocios.visita.preencher",
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
  "obra.encomendar": "purchase_orders.create",
};

/** 4/11: outros códigos que o servidor aceita em vez do de CODIGO_BASE. Também se leem (CODIGOS_NEGOCIOS). 4/11 (tarde): o de
 *  obra_encomendar_materiais (purchase_orders.create) passou a ser o próprio código de "obra.encomendar"; 20270106650000: a RPC
 *  também aceita negocios.obra.planear (quem planeia a obra pede os materiais da tarefa nova). */
export const ALTERNATIVAS: Readonly<Partial<Record<PermNeg, readonly string[]>>> = { "obra.encomendar": ["negocios.obra.planear"] };

/** As permissões da conta real: `codigos` as concedidas na organização ativa (null: ainda não se sabem); `simular`: a Direção/admin
 *  pode usar o "A ver como". Sem conta real, null. */
interface Reais { codigos: ReadonlySet<string> | null; simular: boolean }
let reais: Reais | null = null;

/** 23/10: as permissões reais de quem entrou (5/11: postas por usePermissoesReaisNegocio, na ficha e em /negocios, e tiradas com null
 *  ao sair). null: sem conta (o quadro por papel). */
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

/** 4/11: as permissões que o servidor pede ao passo de cada botão (neg_guardar_negocio, neg_validar_pagamento, neg_registar_fatura): sem
 *  uma delas, o botão fica desligado e diz qual falta, em vez de o clique ser recusado depois. */
const PERM_DO_PASSO: Readonly<Record<string, readonly PermNeg[]>> = {
  contactar: ["contacto.registar"], marcarVisita: ["visita.gerir"], fecharVisita: ["visita.preencher", "orcamento.editar"],
  pedidoCliente: ["orcamento.editar"], refazerComMudancas: ["orcamento.editar"], enviar: ["proposta.enviar"], enviarAdenda: ["proposta.enviar"],
  enviarContrato: ["contrato.editar"], enviarContratoAdenda: ["contrato.editar"], abrirRevisao: ["contrato.editar"], abrirRevisaoAdenda: ["contrato.editar"],
  aprovarAdenda: ["margin.approve"], validar: ["finance.validate_payment"], registarFaturaErp: ["finance.invoice"],
  // 6/11: os passos da obra (as Operações) pedem negocios.obra.planear, como o motor (A.aprovarPlano, A.arrancar)
  gerarPlano: ["obra.planear"], aprovarPlano: ["obra.planear"], arrancar: ["obra.planear"], abrirRetificacao: ["obra.planear"],
  // 11/11 (F3): aceitar as medidas (A.retificarMedidas e as respostas retif_*) pede o mesmo que o passo (neg_guardar_negocio, 20270113110000)
  retificarMedidas: ["obra.planear"],
  // 11/11 (fim de contacto): a assistente comercial passa o negócio ao comercial (A.passarAoComercial, a resposta contacto_concluido)
  passarAoComercial: ["contacto.registar"],
};
/** 9/11 (revisão do Lote 2): os passos que pedem UMA de várias permissões. «Verificar no ERP» (A.verificarErp) só lê o Eticadata: basta
 *  negocios.registar_fatura OU negocios.validar_pagamento; sem nenhuma, o botão fica desligado antes de qualquer leitura. A primeira da
 *  lista é a que se diz em falta. */
const PERM_ALGUMA_DO_PASSO: Readonly<Record<string, readonly PermNeg[]>> = {
  verificarErp: ["finance.validate_payment", "finance.invoice"],
};
/** A primeira permissão que falta a quem está no ecrã para o passo `act` (null: tem todas, ou o passo não pede nenhuma). */
export const permEmFaltaDoPasso = (S: { role: Papel }, act: string | undefined): PermNeg | null => {
  const alguma = act ? PERM_ALGUMA_DO_PASSO[act] : undefined;
  if (alguma) return alguma.some((x) => podeNeg(S.role, x)) ? null : alguma[0];
  return (act ? PERM_DO_PASSO[act] ?? [] : []).find((x) => !podeNeg(S.role, x)) ?? null;
};

// 9/11 (Lote 1 de permissões): o papel no Negócio (o do RH, `S.role`, o «A ver como») continua a desbloquear o que desbloqueava; a isso
// junta-se o caminho da permissão: com uma conta real, quem tem as permissões que o servidor exige para uma ação vê-a e faz-a, seja qual
// for o papel escolhido. Sem conta real (o protótipo local e os testes de sempre) só conta o papel, como até aqui: no quadro por papel
// a Direção tem "*" e passaria a fazer os passos de todos.
/** Há permissões de uma conta real postas (a ficha e /negocios)? */
export const comPermissoesReais = (): boolean => reais !== null;
/** O caminho da permissão: só com conta real, e só se `ps` não é vazia e quem entrou as tem todas (podeNeg, fn_cat_pode). */
export const pelaPermissao = (role: Papel, ps: readonly PermNeg[]): boolean =>
  !!reais && ps.length > 0 && ps.every((x) => podeNeg(role, x));
/** O mesmo caminho, com UMA das permissões (os passos de PERM_ALGUMA_DO_PASSO). */
export const pelaPermissaoAlguma = (role: Papel, ps: readonly PermNeg[]): boolean =>
  !!reais && ps.length > 0 && ps.some((x) => podeNeg(role, x));
/** «Verificar no ERP»: negocios.registar_fatura OU negocios.validar_pagamento (podeNeg: o papel ou, com conta real, a permissão). */
export const podeVerificarErp = (role: Papel): boolean => PERM_ALGUMA_DO_PASSO.verificarErp.some((x) => podeNeg(role, x));
/** Um código da base fora de PermNeg (ex. purchase_orders.approve, pessoas.edit), lido por fn_cat_pode como os outros
 *  (CODIGOS_NEGOCIOS). `null`: sem conta real (quem decide é o papel, como até aqui). */
export const temCodigoReal = (codigo: string): boolean | null => (reais ? !!reais.codigos && reais.codigos.has(codigo) : null);
/** Aprovar e enviar a encomenda a fornecedor (rpc_po_send_to_supplier → fn_po_crm_load). */
export const CODIGO_APROVAR_PO = "purchase_orders.approve";
/** Gravar o negócio (pessoas.edit): neg_guardar_negocio; obra_guardar_negocio deixa criar com ela a obra só planeada (o plano gerado). */
export const CODIGO_GRAVAR_NEGOCIO = "pessoas.edit";
/** Escrever na conversa da obra com o cliente (neg_mensagem_enviar → fn_cat_exigir(org, 'pessoas.edit')). */
export const CODIGO_ESCREVER_CONVERSA = CODIGO_GRAVAR_NEGOCIO;
/** 9/11 (Lote 1, D): aprovar a encomenda a fornecedor no passo dos materiais. Com conta real, quem tem purchase_orders.approve
 *  (fn_cat_pode: o perfil, o Papel no Negócio «Compras e armazém» do RH ou o admin do sistema; a regra de fn_po_crm_load para as
 *  encomendas de um negócio), seja qual for o papel escolhido; sem ela o servidor recusa sempre, por isso o «A ver como» armazém sozinho
 *  já não basta. Sem conta real, o papel, como até aqui. O modo de teste (o super admin) continua a poder. */
export const podeAprovarPo = (role: Papel, teste: boolean): boolean => (temCodigoReal(CODIGO_APROVAR_PO) ?? role === "armazem") || teste;
/** 9/11 (Lote 1, I): o porquê de a caixa de envio da conversa da obra estar desligada (com conta real e sem pessoas.edit), ou undefined. */
export const semEnvioNaConversa = (): string | undefined =>
  temCodigoReal(CODIGO_ESCREVER_CONVERSA) === false ? "Escrever ao cliente pede a permissão pessoas.edit (editar negócios)." : undefined;

/** As permissões com que um passo de OUTRO papel se faz pela permissão: as do PERM_DO_PASSO e, para os passos que o servidor não
 *  verifica por si (verificar, abrir o plano), a da ação que vem a seguir. Um passo fora desta lista fica só do papel. */
const PERM_PELA_PERMISSAO: Readonly<Record<string, readonly PermNeg[]>> = {
  ...PERM_DO_PASSO, verificar: ["proposta.enviar"], abrirPlano: ["obra.planear"],
};
const PAPEIS_NEG: readonly string[] = Object.keys(PERMS_PAPEL);
/** O passo (de quem `who`, ação `act`) é de quem está no ecrã? O papel dele (como sempre) OU, com conta real, as permissões que o passo
 *  pede (PERM_PELA_PERMISSAO). O cliente e os passos sem ação nunca. */
export function passoDe(role: Papel, who: string | null | undefined, act: string | undefined): boolean {
  if (!who || !PAPEIS_NEG.includes(who)) return false;
  if (who === role) return true;
  if (act && PERM_ALGUMA_DO_PASSO[act]) return pelaPermissaoAlguma(role, PERM_ALGUMA_DO_PASSO[act]);
  return !!act && pelaPermissao(role, PERM_PELA_PERMISSAO[act] ?? []);
}

/** 5/11: o código com que o servidor decide se devolve os custos do orçamento (fn_neg_ler_orcamento, neg_ler_negocios, fn_neg_ler_adendas:
 *  fn_cat_pode(org, 'quotes.view_costs'), que também conta com o Papel no Negócio). Sem ele a base manda os custos a null. */
export const CODIGO_VER_CUSTOS = "quotes.view_costs";
/** 9/11 (Lote 1, G): o outro código com que o servidor mostra os custos (fn_quote_custos_pode: quotes.view_costs OU quotes.manage). */
export const CODIGO_GERIR_ORCAMENTOS = "quotes.manage";
/** O nome que o editor de papéis mostra para quotes.view_costs (grelhaPermissoes.ts). */
export const SEM_VER_CUSTOS = "O custo e a margem só se veem com a permissão «Ver custos do orçamento».";

/** A resposta de fn_cat_pode(org, 'quotes.view_costs') posta por /negocios (usePodeVerCustos em NegociosEmylia.tsx). `undefined`: esta
 *  página não a pôs; `null`: ainda a ler. 5/11: com as `reais` postas (a ficha e /negocios, usePermissoesReaisNegocio, que também lê
 *  quotes.view_costs) é ignorada: podeVerCustos responde pelas `reais.codigos`. */
let verCustosNegocios: boolean | null | undefined;
export function definirVerCustos(v: boolean | null | undefined): void { verCustosNegocios = v; }

/** Quem entrou vê os custos e as margens do orçamento? A MESMA pergunta das RPCs (fn_cat_pode, quotes.view_costs): na ficha pelas
 *  permissões lidas (`reais`), em /negocios pela resposta de usePodeVerCustos. Enquanto se lê, ou se a leitura falhou, não. Sem conta
 *  real (o protótipo local e os testes) vê, como até aqui. */
export function podeVerCustos(): boolean {
  // 9/11 (Lote 1, G): como fn_quote_custos_pode, também quotes.manage
  if (reais) return !!reais.codigos && (reais.codigos.has(CODIGO_VER_CUSTOS) || reais.codigos.has(CODIGO_GERIR_ORCAMENTOS));
  if (verCustosNegocios !== undefined) return verCustosNegocios === true;
  return true;
}

/** 11/11 (fim de contacto, 20270113120000): as permissões do Negócio que vão além do contacto. A assistente comercial é quem tem
 *  negocios.contacto.registar e nenhuma destas (não há código próprio): trabalha até ao Contacto e passa o negócio ao comercial. Num
 *  negócio em Visita ou mais à frente, ou em Contacto já «passado ao comercial», o servidor só grava a quem tiver uma destas (a MESMA lista
 *  de neg_guardar_negocio). Leem-se com as outras (CODIGOS_NEGOCIOS). */
export const CODIGOS_DEPOIS_DO_CONTACTO: readonly string[] = [
  "negocios.visita.gerir", "negocios.visita.preencher", "negocios.orcamento.editar", "negocios.margem.aprovar", "negocios.proposta.enviar", "negocios.proposta.decidir",
  "negocios.contrato.editar", "negocios.registar_fatura", "negocios.validar_pagamento", "negocios.obra.planear", "negocios.obra.executar",
  "negocios.obra.materiais", "negocios.obra.imprevistos", "negocios.obra.fechar", "negocios.obra.tecnico",
];
/** A resposta que marca o contacto concluído pela assistente (o negócio fica em Contacto, pronto para o comercial marcar a visita). */
export const CHAVE_CONTACTO_CONCLUIDO = "contacto_concluido";
/** Quem entrou só trabalha até ao Contacto (a assistente comercial)? Só com conta real e as permissões lidas. */
export function soAteAoContacto(): boolean {
  const c = reais?.codigos;
  return !!c && c.has("negocios.contacto.registar") && !CODIGOS_DEPOIS_DO_CONTACTO.some((x) => c.has(x));
}
/** O negócio já está com o comercial: em Visita ou mais à frente, ou em Contacto com o contacto concluído pela assistente. */
export const contactoConcluido = (d: { fase: number; f: Record<string, string | undefined> }): boolean => d.fase <= 1 && !!d.f[CHAVE_CONTACTO_CONCLUIDO];
export const comOComercial = (d: { fase: number; f: Record<string, string | undefined> }): boolean => d.fase >= 2 || contactoConcluido(d);
/** O distintivo do negócio que a assistente passou ao comercial (o quadro, a lista e o Hoje de quem marca a visita). */
export const PRONTO_PARA_VISITA = "Pronto para marcar a visita";
/** O aviso do negócio só de leitura para a assistente. */
export const AVISO_COM_O_COMERCIAL = "O negócio já está com o comercial. Pode vê-lo, mas já não o muda: o que mudar neste ecrã não se grava.";

/** 11/11 (20270113130000): cada fase do negócio pede a sua permissão (perfil ou Papel no Negócio). O MESMO mapa de neg_guardar_negocio:
 *  Contacto → contacto.registar; Contacto passado ao comercial e Visita → visita.gerir; Negócio → orçamento, margem, proposta, contrato ou
 *  obra.planear (as medidas e o plano antes do contrato); Financeiro → sem permissão de fase (pessoas.edit, como antes); Obra → as obra.* e
 *  as do Negócio (as adendas). `null`: a fase não pede nenhuma. */
const DO_NEGOCIO_FASE: readonly string[] = ["negocios.orcamento.editar", "negocios.margem.aprovar", "negocios.proposta.enviar",
  "negocios.proposta.decidir", "negocios.contrato.editar", "negocios.obra.planear"];
const DA_OBRA_FASE: readonly string[] = ["negocios.obra.planear", "negocios.obra.executar", "negocios.obra.materiais", "negocios.obra.imprevistos",
  "negocios.obra.fechar", "negocios.obra.tecnico", ...DO_NEGOCIO_FASE.filter((c) => c !== "negocios.obra.planear")];
export function codigosDaFase(d: { fase: number; f: Record<string, string | undefined> }): readonly string[] | null {
  // em Contacto, quem só gere visitas (o comercial sem contacto.registar) também abre o negócio para marcar a visita: os passos do
  // Contacto ficam só de leitura para ele (passosDaFase) e o servidor recusa-lhe mudar os dados do Contacto
  if (d.fase <= 1 && !contactoConcluido(d)) return ["negocios.contacto.registar", "negocios.visita.gerir"];
  if (d.fase <= 2) return ["negocios.visita.gerir"];
  if (d.fase === 3) return DO_NEGOCIO_FASE;
  if (d.fase === 4) return null;
  return DA_OBRA_FASE;
}
/** A permissão da fase que falta a quem entrou (a primeira da lista), ou null (tem uma, a fase não pede, ou sem as permissões lidas). */
export function faltaDaFase(codigos: readonly string[] | null | undefined): string | null {
  const c = reais?.codigos;
  if (!c || !codigos || codigos.some((x) => c.has(x))) return null;
  return codigos[0];
}
/** O aviso do negócio só de leitura por falta da permissão da fase. */
export const avisoDaFase = (codigo: string): string => (codigo === "negocios.visita.gerir" && soAteAoContacto()
  ? AVISO_COM_O_COMERCIAL
  : `Sem permissão para mudar este negócio na fase em que está (${codigo}). Pode vê-lo; o que mudar neste ecrã não se grava.`);

/** O aviso de quem não tem a permissão (a mensagem e a explicação). */
export const SEM_PERM: Record<PermNeg, { msg: string; sub: string }> = {
  "finance.validate_payment": { msg: "Sem permissão para validar pagamentos", sub: "Só o Financeiro ou a Direção validam pagamentos (finance.validate_payment). Mude de papel em cima." },
  "finance.invoice": { msg: "Sem permissão para tratar de faturas", sub: "Só o Financeiro ou a Direção emitem ou registam faturas (finance.invoice)." },
  "contracts.cancel": { msg: "Sem permissão para anular contratos", sub: "Só a Direção anula contratos e vendas (contracts.cancel)." },
  "equipa.edit": { msg: "Sem permissão para mudar a ficha do técnico", sub: "Mudar o ofício e as férias do técnico pede a permissão hr.pessoas.laborais.edit (dados laborais do RH)." },
  "margin.approve": { msg: "Sem permissão para aprovar a margem", sub: "Só a Direção aprova uma proposta abaixo da margem mínima (negocios.margem.aprovar)." },
  "contacto.registar": { msg: "Sem permissão para registar o contacto", sub: "Registar a chamada, as tentativas, o voltar a ligar e passar o negócio ao comercial pede a permissão negocios.contacto.registar." },
  "visita.gerir": { msg: "Sem permissão para gerir as visitas", sub: "Marcar, remarcar e cancelar as visitas (quem vai, o dia e a hora, o tipo e a morada) pede a permissão negocios.visita.gerir." },
  "visita.preencher": { msg: "Sem permissão para preencher a visita", sub: "Preencher a visita (exterior, interior, Estúdio, medidas, fotografias, diagnóstico), dar-lhe resultado e fechar o levantamento pede a permissão negocios.visita.preencher. Pode vê-la." },
  "proposta.decidir": { msg: "Sem permissão para registar a decisão do cliente", sub: "Registar o pedido de alterações ou a resposta a uma adenda pede a permissão negocios.proposta.decidir." },
  "obra.imprevistos": { msg: "Sem permissão para decidir os imprevistos", sub: "Propor ao cliente o trabalho extra e decidir o imprevisto pede a permissão negocios.obra.imprevistos." },
  "obra.fechar": { msg: "Sem permissão para encerrar a obra", sub: "Dar a obra por concluída e enviar o auto de receção pede a permissão negocios.obra.fechar." },
  "negocio.perder": { msg: "Sem permissão para dar o negócio como perdido", sub: "Marcar o negócio como perdido, ou anular a perda, pede a permissão negocios.perder." },
  "orcamento.editar": { msg: "Sem permissão para mudar o orçamento", sub: "Mudar as linhas, os preços, o desconto, as versões ou as adendas pede a permissão negocios.orcamento.editar." },
  "proposta.enviar": { msg: "Sem permissão para enviar a proposta", sub: "Enviar a proposta ou a adenda ao cliente pede a permissão negocios.proposta.enviar." },
  "contrato.editar": { msg: "Sem permissão para mudar o contrato", sub: "Gerar, enviar ou rever o contrato (cláusulas e pedidos do cliente) pede a permissão negocios.contrato.editar." },
  "obra.planear": { msg: "Sem permissão para planear a obra", sub: "Mudar o plano, os técnicos, aprovar, arrancar e validar as tarefas pede a permissão negocios.obra.planear." },
  "obra.executar": { msg: "Sem permissão para registar a execução", sub: "Começar, registar e marcar como feitas as tarefas atribuídas a si pede a permissão negocios.obra.executar." },
  "obra.materiais": { msg: "Sem permissão para ver os materiais da obra", sub: "Ver os materiais da obra (as linhas da encomenda de cliente, as reservas e as encomendas a fornecedor) pede a permissão negocios.obra.materiais." },
  "obra.encomendar": { msg: "Sem permissão para encomendar materiais", sub: "Pedir materiais novos ao fornecedor pede a permissão negocios.obra.planear (planear a obra) ou purchase_orders.create (criar encomendas de compra)." },
};
