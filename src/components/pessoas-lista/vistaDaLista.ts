// A vista de uma linha da Lista real: só afirma o que neg_resumo_pessoas devolveu (mais o que as leituras em lote deram).
// `undefined` quer dizer «a fonte não sabe» e a linha nunca o inventa; `null`, «sabe-se que não há».
// A localidade saiu da Lista (decisão do utilizador, 20/10): fica só na ficha.
import type { ContactoDaLista, PessoaDaLista } from "@/hooks/pessoas/listaPessoasTipos";
import type { VistaLinhaPessoa } from "@/components/pessoas/vistaLinhaPessoa";

/** O que as leituras em lote trazem por pessoa; cada campo ausente quer dizer «ainda por saber». */
export interface DadosDaLinha {
  /** O nome do comercial resolvido a partir de `responsavelId`; ausente enquanto carrega, em erro ou fora do alcance. */
  comercial?: string;
  contacto?: ContactoDaLista;
}

/**
 * Os dados da lead (origem, campanha, formulário) são os da lead que a linha mostra. Uma pessoa sem lead (só cliente) não tem nenhum:
 * por saber, e nunca «Registada à mão». Uma lead sem campanha é «Registada à mão» (formulário `null`); com a campanha escondida pela RLS
 * (há id, falta o nome) fica por saber.
 */
function formularioDe(pessoa: PessoaDaLista): string | null | undefined {
  if (pessoa.leadId === null) return undefined;
  if (pessoa.campanhaId === null) return null;
  return pessoa.formulario ?? undefined;
}

function campanhaDe(pessoa: PessoaDaLista): string | null | undefined {
  if (pessoa.leadId === null) return undefined;
  if (pessoa.campanhaId === null) return null;
  return pessoa.campanha ?? undefined;
}

export function vistaDaLista(pessoa: PessoaDaLista, dados: DadosDaLinha = {}): VistaLinhaPessoa {
  return {
    id: pessoa.id,
    nome: pessoa.nome,
    papel: pessoa.papel,
    empresa: false,
    qualificacao: pessoa.qualificacao,
    atrasada: pessoa.atrasada,
    voltou: pessoa.voltou,
    perdidaMotivo: null,
    encerrada: pessoa.encerrada,
    // O papel de cliente é o selo junto ao nome; «Cliente» não é uma etapa.
    etapa: pessoa.papel === "cliente" ? null : pessoa.etapa,
    faseEtapa: pessoa.faseEtapa,
    // Os dias sem contacto contam do MAIOR entre as duas fontes (já resolvido no adaptador).
    diasSemContacto: pessoa.diasSemContacto,
    // «Sem contacto» só quando nenhuma das duas fontes tem contacto. Com contacto e sem resultado guardado, é desconhecido (sem selo).
    resultado: pessoa.ultimoContactoEm === null ? "semContacto" : (pessoa.ultimoResultado ?? undefined),
    passo: pessoa.passo,
    valorEmJogo: pessoa.valorEmJogo,
    exemplo: false,
    comercial: pessoa.responsavelId === null ? null : dados.comercial,
    telefone: dados.contacto?.telefone,
    email: dados.contacto?.email,
    criadoEm: pessoa.criadoEm,
    origem: pessoa.leadId === null ? undefined : pessoa.origem,
    campanha: campanhaDe(pessoa),
    formulario: formularioDe(pessoa),
  };
}
