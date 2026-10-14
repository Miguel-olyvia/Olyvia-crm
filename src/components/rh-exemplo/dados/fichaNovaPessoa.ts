/** O que o painel "Nova pessoa" recolhe além do essencial, e como se põe isso na ficha de exemplo acabada de criar. */
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import type { Genero } from "@/components/rh-exemplo/tipos";

export interface ExtrasNovaPessoa {
  dataNascimento: string | null;
  genero: Genero | null;
  nif: string | null;
  niss: string | null;
  emailPessoal: string | null;
  telefonePessoal: string | null;
  emailTrabalho: string | null;
  moradaLinha1: string | null;
  moradaCodigoPostal: string | null;
  moradaLocalidade: string | null;
  moradaDistrito: string | null;
  horasSemana: number | null;
  salarioBase: number | null;
  criarAcesso: boolean;
}

/** Os códigos de pendência que o preenchimento de um campo resolve. */
const PENDENCIA_DO_CAMPO = { nif: "nif", niss: "niss" } as const;

function temMorada(x: ExtrasNovaPessoa): boolean {
  return [x.moradaLinha1, x.moradaCodigoPostal, x.moradaLocalidade, x.moradaDistrito].some((v) => v !== null);
}

function semPendenciasResolvidas(ficha: FichaRh, x: ExtrasNovaPessoa): FichaRh["pendencias"] {
  const resolvidas = new Set<string>();
  if (x.nif !== null) resolvidas.add(PENDENCIA_DO_CAMPO.nif);
  if (x.niss !== null) resolvidas.add(PENDENCIA_DO_CAMPO.niss);
  return ficha.pendencias.filter((p) => !resolvidas.has(p.codigo));
}

/**
 * Devolve a ficha com o que a pessoa escreveu no formulário no lugar do que o gerador de exemplo inventa. O que ficou em
 * branco fica em branco (sem NIF, sem morada, sem telefone), para a ficha não mostrar dados que ninguém escreveu.
 */
export function aplicarExtras(ficha: FichaRh, x: ExtrasNovaPessoa): FichaRh {
  const base = { pessoa_id: ficha.pessoa.id, organization_id: ficha.pessoa.organization_id };
  const retribuicoes = x.salarioBase === null
    ? ficha.retribuicoes
    : ficha.retribuicoes.map((r) => ({ ...r, valor_base: x.salarioBase as number, origem: "pessoa" as const }));
  return {
    ...ficha,
    pessoa: {
      ...ficha.pessoa,
      email_pessoal: x.emailPessoal,
      email_trabalho: x.emailTrabalho ?? ficha.pessoa.email_trabalho,
    },
    dadosPessoais: ficha.dadosPessoais && {
      ...ficha.dadosPessoais,
      data_nascimento: x.dataNascimento,
      genero: x.genero,
      telefone_pessoal: x.telefonePessoal,
    },
    identificacao: ficha.identificacao && {
      ...ficha.identificacao,
      nif: x.nif,
      niss_ultimos4: x.niss === null ? null : x.niss.slice(-4),
    },
    morada: temMorada(x)
      ? {
          ...(ficha.morada ?? { id: `mo-${ficha.pessoa.id}`, ...base, tipo: "residencia" as const, is_principal: true }),
          linha1: x.moradaLinha1 ?? "",
          linha2: null,
          codigo_postal: x.moradaCodigoPostal,
          localidade: x.moradaLocalidade,
          distrito: x.moradaDistrito,
          pais: "PT",
        }
      : null,
    retribuicoes,
    segredos: { ...ficha.segredos, niss: x.niss ?? "" },
    pendencias: semPendenciasResolvidas(ficha, x),
  };
}
