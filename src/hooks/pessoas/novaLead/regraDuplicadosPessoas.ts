// A regra de duplicados da «Nova lead» de Pessoas (pura). Email, telefone ou NIF iguais aos de uma pessoa DESTA organização bloqueiam:
// não se cria nada. Só o nome igual não bloqueia (a procura por nome de Leads não se copia). Uma pessoa que só existe noutra empresa do
// grupo não bloqueia: é um aviso informativo e cria-se uma pessoa própria (sem «Partilhar»). Não há «Criar mesmo assim».
// Não importa duplicateBlockingRule.ts (deixa passar telefone e NIF isolados e é fail-open).
import { mesmoEmail, mesmoTelefone } from "./telefoneNovaLead";
import type {
  DecisaoDuplicados, Escrito, LeadConhecida, LinhaLadoALado, PessoaBloqueio, PessoaEncontrada, PlanoAtualizar, ResultadoDuplicados,
} from "./tiposNovaLead";

/** Estados de uma lead que já não está em curso para se reabrir com «Atualizar dados». */
const REABRIVEIS = new Set(["lost", "rejected"]);

const semAcentos = (texto: string): string => texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
const texto = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

/** A lead que «Atualizar dados» usa: a mais recente que não está convertida (a convertida já é um cliente). */
function leadDeReferencia(leads: readonly LeadConhecida[]): LeadConhecida | null {
  const candidatas = leads.filter((l) => l.estado !== "converted");
  if (candidatas.length === 0) return null;
  return [...candidatas].sort((a, b) => Date.parse(b.criadaEm ?? "") - Date.parse(a.criadaEm ?? "") || 0)[0];
}

function planoAtualizar(p: PessoaEncontrada, escrito: Escrito): PlanoAtualizar | null {
  if (p.clienteAtivo) return null;
  const alvo = leadDeReferencia(p.leads);
  if (!alvo) return null;
  const email = texto(escrito.email);
  const telefone = texto(escrito.telefone);
  const emailJaDela = email !== null && p.emails.some((e) => mesmoEmail(e, email));
  const telefoneJaDela = telefone !== null && p.telefones.some((t) => mesmoTelefone(t, telefone));
  return {
    leadId: alvo.id,
    reabrirLead: REABRIVEIS.has(alvo.estado),
    reabrirAbordagem: alvo.encerrada && !REABRIVEIS.has(alvo.estado),
    email: email !== null && !emailJaDela ? { antigo: p.emailPrincipal, novo: email } : null,
    telefone: telefone !== null && !telefoneJaDela ? { antigo: p.telefonePrincipal, novo: telefone } : null,
  };
}

function ladoALado(p: PessoaEncontrada, escrito: Escrito): LinhaLadoALado[] {
  const nome = texto(escrito.nome);
  const email = texto(escrito.email);
  const telefone = texto(escrito.telefone);
  const nif = texto(escrito.nif);
  return [
    {
      campo: "nome", escrito: nome, existente: p.nome,
      estado: nome === null ? "naoIndicado" : p.nome !== null && semAcentos(p.nome) === semAcentos(nome) ? "igual" : "diferente",
    },
    {
      campo: "email", escrito: email, existente: p.emailPrincipal,
      estado: email === null ? "naoIndicado" : p.emails.some((e) => mesmoEmail(e, email)) ? "igual" : "diferente",
    },
    {
      campo: "telefone", escrito: telefone, existente: p.telefonePrincipal,
      estado: telefone === null ? "naoIndicado" : p.telefones.some((t) => mesmoTelefone(t, telefone)) ? "igual" : "diferente",
    },
    // O NIF está cifrado: o valor da ficha existente não se lê, só se sabe se coincide.
    { campo: "nif", escrito: nif, existente: null, estado: p.campos.includes("nif") ? "coincide" : "naoIndicado" },
  ];
}

function papelDe(p: PessoaEncontrada): "lead" | "cliente" | null {
  if (p.temCliente) return "cliente";
  return p.leads.length > 0 ? "lead" : null;
}

function bloqueioDe(p: PessoaEncontrada, escrito: Escrito, unica: boolean): PessoaBloqueio {
  const referencia = leadDeReferencia(p.leads) ?? p.leads[0] ?? null;
  const papel = papelDe(p);
  return {
    entityId: p.entityId as string,
    nome: p.nome ?? "",
    papel,
    jaECliente: p.clienteAtivo,
    estado: referencia?.estado ?? null,
    encerrada: referencia?.encerrada ?? false,
    motivoEncerramento: referencia?.motivoEncerramento ?? null,
    atribuidoA: referencia?.atribuidoA ?? null,
    criadaEm: p.criadaEm,
    campos: p.campos,
    ladoALado: ladoALado(p, escrito),
    // A ficha de Pessoas só abre quem tem lead ou cliente: uma ficha de empresa daria NG003.
    podeAbrir: papel !== null,
    atualizar: unica ? planoAtualizar(p, escrito) : null,
  };
}

/** Decide, com o que se escreveu e o que se encontrou, se se cria ou se bloqueia e o que o diálogo mostra. */
export function decidirDuplicados(escrito: Escrito, resultado: ResultadoDuplicados): DecisaoDuplicados {
  if (resultado.pessoas.length === 0) return { tipo: "criar", grupo: resultado.grupo };
  const semAcesso = resultado.pessoas.some((p) => !p.visivel || p.entityId === null);
  const visiveis = resultado.pessoas.filter((p) => p.visivel && p.entityId !== null);
  // «Atualizar dados» só com uma pessoa e nenhuma escondida: com duas, os dados são de pessoas diferentes.
  const unica = visiveis.length === 1 && !semAcesso;
  return {
    tipo: "bloquear",
    pessoas: visiveis.map((p) => bloqueioDe(p, escrito, unica)),
    semAcesso,
    grupo: resultado.grupo,
  };
}
