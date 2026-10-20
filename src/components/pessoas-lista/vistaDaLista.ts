// A vista de uma linha da Lista real: só afirma o que neg_resumo_pessoas devolveu (mais o que as leituras em lote deram).
// O que a função ainda não tem (criado em, MQL/SQL, voltou, atrasada, origem, campanha, localidade, formulário) fica por definir:
// quando o Lote C os trouxer, basta preenchê-los aqui e as colunas e a sublinha já os mostram.
import type { ContactoDaLista, PessoaDaLista } from "@/hooks/pessoas/listaPessoasTipos";
import type { VistaLinhaPessoa } from "@/components/pessoas/vistaLinhaPessoa";

/** O que as leituras em lote trazem por pessoa; cada campo ausente quer dizer «ainda por saber». */
export interface DadosDaLinha {
  /** O nome do comercial resolvido a partir de `responsavelId`; ausente enquanto carrega, em erro ou fora do alcance. */
  comercial?: string;
  contacto?: ContactoDaLista;
}

export function vistaDaLista(pessoa: PessoaDaLista, dados: DadosDaLinha = {}): VistaLinhaPessoa {
  return {
    id: pessoa.id,
    nome: pessoa.nome,
    papel: pessoa.papel,
    empresa: false,
    perdidaMotivo: null,
    encerrada: pessoa.encerrada,
    // O papel de cliente é o selo junto ao nome; «Cliente» não é uma etapa.
    etapa: pessoa.papel === "cliente" ? null : pessoa.etapa,
    faseEtapa: pessoa.faseEtapa,
    // TODO (depois da migration por aplicar): os dias sem contacto e o selo «Sem contacto» dependem de `ultimo_resultado` e de
    // `ultimo_contacto_lead_em`, colunas que só existem numa migration ainda por aplicar. Até lá o comportamento mantém-se como está.
    diasSemContacto: pessoa.diasSemContacto,
    // «Sem contacto» só quando se sabe que nunca houve; com contacto e sem resultado na lista, é desconhecido (sem selo).
    resultado: pessoa.ultimoContactoEm === null ? "semContacto" : undefined,
    passo: pessoa.passo,
    valorEmJogo: pessoa.valorEmJogo,
    exemplo: false,
    comercial: pessoa.responsavelId === null ? null : dados.comercial,
    telefone: dados.contacto?.telefone,
    email: dados.contacto?.email,
  };
}
