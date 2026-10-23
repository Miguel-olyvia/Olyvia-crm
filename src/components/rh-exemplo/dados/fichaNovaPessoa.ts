/**
 * O que o painel "Nova pessoa" recolhe, já normalizado (vazio é `null`), e como se põe na ficha de exemplo acabada de
 * criar. O gerador de exemplo inventa dados para as fichas de demonstração; numa pessoa nova isso não serve: tudo o que
 * o formulário pede é substituído pelo que se escreveu, e o que ficou em branco fica em branco.
 */
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import {
  anexosDaNova, conviteDaNova, dadosPessoaisDaNova, identificacaoDaNova, retribuicoesDaNova, sateliteOpcional,
  vinculoDaNova, type Parte,
} from "@/components/rh-exemplo/dados/fichaNovaPessoaPartes";
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import type { Pendencia } from "@/components/rh-exemplo/hooks/useAdmissaoPendencias";
import type { TipoAnexoConvite } from "@/components/rh-exemplo/lib/conviteAnexos";
import type {
  HorasFrequencia, Pessoa, PessoaContactoEmergencia, PessoaDadosBancarios, PessoaDadosPessoais, PessoaDadosSaude,
  PessoaFardamento, PessoaIdentificacao, PessoaMorada, PessoaSindicalizacao, PessoaVinculo, SubsidioAlimentacaoModo,
} from "@/components/rh-exemplo/tipos";

export interface AnexoDaNova {
  tipo: TipoAnexoConvite;
  nome: string;
  tamanho: number;
  mime: string;
}

export interface ExtrasNovaPessoa {
  pessoa: Pick<Pessoa, "numero_interno" | "email_trabalho" | "email_pessoal" | "telefone_trabalho" | "data_admissao" | "data_antiguidade">;
  nomeTratamento: string | null;
  /** Sem centro de trabalho: a ficha não tem local nem afetação. */
  semLocal: boolean;
  dadosPessoais: Parte<PessoaDadosPessoais>;
  identificacao: Parte<PessoaIdentificacao>;
  /** O NISS completo (só os 4 últimos ficam na ficha; o resto vai para o "revelar" de exemplo). */
  niss: string | null;
  morada: Parte<PessoaMorada> | null;
  emergencia: Parte<PessoaContactoEmergencia> | null;
  bancarios: Parte<PessoaDadosBancarios> | null;
  /** O número da conta, sem espaços (só para o "revelar" de exemplo). */
  contaNumero: string | null;
  fardamento: Parte<PessoaFardamento> | null;
  saude: Parte<PessoaDadosSaude> | null;
  sindicalizacao: Parte<PessoaSindicalizacao> | null;
  /** Os campos do contrato que o formulário pede; o que ficou em branco vai a `null`. */
  vinculo: Partial<PessoaVinculo>;
  horas: { periodo: number; frequencia: HorasFrequencia } | null;
  retribuicao: { subsidio: number | null; modo: SubsidioAlimentacaoModo | null; duodecimos: 0 | 50 | 100 };
  criarAcesso: boolean;
  anexos: AnexoDaNova[];
  /** Com convite: o e-mail de destino (o pessoal), o role previsto de acesso (escolhido pelo RH) e o login temporário vale 7 dias. */
  convite: { email: string | null; roleId: string | null } | null;
  pendencias: Pendencia[];
}

/** O link do convite de exemplo vale este número de dias. */
export const DIAS_DO_CONVITE = 7;

/** Sem centro de trabalho não há afetação nem colocação, e os horários não apontam para um local que não existe. */
function semLocalDaFicha(ficha: FichaRh): Pick<FichaRh, "afectacoes" | "colocacoes" | "horarioPlaneado" | "horarioRealizado"> {
  return {
    afectacoes: [],
    colocacoes: [],
    horarioPlaneado: ficha.horarioPlaneado.map((h) => ({ ...h, local_id: null })),
    horarioRealizado: ficha.horarioRealizado.map((h) => ({ ...h, local_id: null })),
  };
}

function pessoaDaNova(ficha: FichaRh, x: ExtrasNovaPessoa): Pessoa {
  const foto = x.anexos.find((a) => a.tipo === "fotografia");
  return {
    ...ficha.pessoa,
    ...x.pessoa,
    notas: null,
    fotografia_anexo_id: foto ? `anx-foto-${ficha.pessoa.id}` : null,
    ...(x.semLocal ? { local_id: null, local_trabalho: null } : {}),
  };
}

/**
 * Devolve a ficha com o que a pessoa escreveu no formulário no lugar do que o gerador de exemplo inventa. O que ficou em
 * branco fica em branco (sem NIF, sem morada, sem telefone, sem tamanhos), para a ficha não mostrar dados que ninguém escreveu.
 */
export function aplicarExtras(ficha: FichaRh, x: ExtrasNovaPessoa): FichaRh {
  const base = { pessoa_id: ficha.pessoa.id, organization_id: ficha.pessoa.organization_id };
  const contrato = vinculoDaNova(ficha, x);
  return {
    ...ficha,
    ...(x.semLocal ? semLocalDaFicha(ficha) : {}),
    pessoa: pessoaDaNova(ficha, x),
    nomeTratamento: x.nomeTratamento,
    dadosPessoais: dadosPessoaisDaNova(ficha, x, base),
    identificacao: identificacaoDaNova(ficha, x, base),
    morada: sateliteOpcional(ficha.pessoa.id, "mo", base, x.morada),
    emergencia: sateliteOpcional(ficha.pessoa.id, "em", base, x.emergencia),
    bancarios: sateliteOpcional(ficha.pessoa.id, "ba", base, x.bancarios),
    saude: sateliteOpcional(ficha.pessoa.id, "sa", base, x.saude),
    fardamento: sateliteOpcional(ficha.pessoa.id, "fa", base, x.fardamento),
    sindicalizacao: sateliteOpcional(ficha.pessoa.id, "si", base, x.sindicalizacao),
    vinculos: contrato.vinculos,
    horasVersoes: contrato.horasVersoes,
    retribuicoes: retribuicoesDaNova(ficha, x),
    anexos: anexosDaNova(ficha, x),
    convite: conviteDaNova(ficha, x),
    pendencias: x.pendencias,
    segredos: { niss: x.niss ?? "", conta: x.contaNumero ?? "" },
  };
}

/** O dia em que expira o link do convite criado hoje. */
export function validadeDoConvite(): string {
  return diaIso(DIAS_DO_CONVITE);
}
