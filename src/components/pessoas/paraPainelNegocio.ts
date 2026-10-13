// Converte a ficha de uma pessoa nos dados que o painel de um negócio mostra (ver `ficha-comum/dadosPessoaPainel.ts`).
import type { DadosPessoaPainel } from "@/components/ficha-comum/dadosPessoaPainel";
import type { ResumoPessoa } from "./pessoasTipos";

export function paraPainelNegocio({ pessoa, papel, etapa }: ResumoPessoa): DadosPessoaPainel {
  const m = pessoa.morada;
  return {
    id: pessoa.id,
    nome: pessoa.nome,
    papel,
    etapa,
    origem: pessoa.origem,
    empresa: pessoa.empresa?.nome ?? null,
    ultimoContactoDias: pessoa.ultimoContactoDias,
    comercial: pessoa.comercial,
    desde: pessoa.desde ?? null,
    telefone: pessoa.contacto.telefone,
    email: pessoa.contacto.email,
    morada: m ? `${m.linha}, ${m.cp} ${m.localidade}` : null,
    distrito: pessoa.distrito ?? null,
  };
}
