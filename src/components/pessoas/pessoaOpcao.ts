// A pessoa no formato que "Novo negócio" pede (Negócio e metas não importa de Pessoas, por isso quem junta as duas páginas
// converte): o contacto e os dados da ficha, para pré-preencher o formulário.
import type { PessoaOpcao } from "@/components/negocio-metas/novoNegocio";
import { textoMorada } from "./formatoPessoas";
import type { Pessoa } from "./pessoasTipos";

export function paraOpcao(p: Pessoa): PessoaOpcao {
  return {
    id: p.id, nome: p.nome, contacto: p.contacto, email: p.contacto.email ?? undefined,
    morada: p.morada ? textoMorada(p.morada) : undefined,
    distrito: p.distrito, nif: p.nif, empresa: p.empresa?.nome, nifEmpresa: p.empresa?.nif,
  };
}
