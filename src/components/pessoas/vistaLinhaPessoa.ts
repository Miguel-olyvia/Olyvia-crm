// O que UMA linha da lista de pessoas mostra, separado de onde vem o dado. O protótipo constrói a vista a partir de um
// `ResumoPessoa` completo (`vistaDoResumo`); a Lista real constrói-a só com o que a base devolve (`vistaDaLista`).
// Regra de ouro: `undefined` quer dizer «a fonte não dá este dado» e a linha NUNCA o inventa (nem «exemplo», nem «Sem contacto»
// para um resultado desconhecido, nem «Registada à mão» para um formulário desconhecido). `null` quer dizer «sabe-se que não há».
import type { FaseNegocio } from "@/components/negocio-metas/negocioMetas";
import type { IdPasso } from "./etapaPessoa";
import { proximoPasso } from "./etapaPessoa";
import { resultadoEfetivo } from "./filtrosPessoas";
import type {
  EtapaPessoa, MotivoPerda, PapelPessoa, QualificacaoPessoa, ResultadoEncerramento, ResultadoOuNenhum, ResumoPessoa,
} from "./pessoasTipos";

/** Todas as colunas que uma linha sabe desenhar. As quatro últimas e `place`, `form` e `nextVisit` só existem na Lista real ou esperam dados. */
export type IdColuna =
  | "person" | "place" | "stage" | "form" | "lastContact" | "next" | "nextVisit" | "value" | "deals"
  | "assigned" | "phone" | "email" | "whatsapp" | "created" | "origin" | "campaign";

/** As 8 colunas do protótipo, pela ordem de sempre. */
export const COLUNAS_PROTOTIPO: readonly IdColuna[] = ["person", "place", "stage", "form", "lastContact", "next", "value", "deals"];

export interface VistaLinhaPessoa {
  id: string;
  /** Vazio: a linha mostra «Sem nome». */
  nome: string;
  papel: PapelPessoa;
  empresa: boolean;
  /** MQL ou SQL; sem valor, não se escreve nada. */
  qualificacao?: QualificacaoPessoa | null;
  /** `true` escreve «Atrasada»; `null` e `undefined` (sem dado) não escrevem nada. */
  atrasada?: boolean | null;
  voltou?: boolean | null;
  perdidaMotivo: MotivoPerda | null;
  encerrada: ResultadoEncerramento | null;
  /** `null`: sem etapa (uma cliente: o papel é o selo junto ao nome e a coluna Etapa mostra «—»). */
  etapa: EtapaPessoa | null;
  faseEtapa: FaseNegocio | null;
  /** `null`: nunca houve contacto. */
  diasSemContacto: number | null;
  /** `undefined`: resultado desconhecido, sem selo. «semContacto» só quando se sabe que nunca houve contacto. */
  resultado?: ResultadoOuNenhum;
  /** `null`: a fonte não sabe o passo (a linha mostra «—» e remete para a ficha). «nenhum»: sabe-se que não há. */
  passo: IdPasso | null;
  valorEmJogo: number;
  /** Só o protótipo: escreve «exemplo» por baixo do nome. */
  exemplo: boolean;
  /** Texto, `null` (sem morada) ou `undefined` (sem dado). */
  localidade?: string | null;
  /** Texto, `null` (registada à mão) ou `undefined` (sem dado: nunca «Registada à mão»). */
  formulario?: string | null;
  /** Texto, `null` (sem comercial) ou `undefined` (por saber). */
  comercial?: string | null;
  telefone?: string | null;
  email?: string | null;
  /** Instante ISO (a coluna mostra o dia de Lisboa). */
  criadoEm?: string | null;
  origem?: string | null;
  campanha?: string | null;
}

/** A vista do protótipo: o resumo é completo e os dados são de exemplo. */
export function vistaDoResumo(resumo: ResumoPessoa, voltou: boolean): VistaLinhaPessoa {
  const { pessoa } = resumo;
  return {
    id: pessoa.id,
    nome: pessoa.nome,
    papel: resumo.papel,
    empresa: !!pessoa.empresa,
    qualificacao: pessoa.qualificacao ?? null,
    atrasada: resumo.atrasada,
    voltou,
    perdidaMotivo: pessoa.perdida?.motivo ?? null,
    encerrada: pessoa.encerrada?.resultado ?? null,
    etapa: resumo.etapa,
    faseEtapa: resumo.faseEtapa,
    diasSemContacto: pessoa.ultimoContactoDias,
    resultado: resultadoEfetivo(pessoa),
    passo: proximoPasso(resumo).id,
    valorEmJogo: resumo.emJogo,
    exemplo: true,
    localidade: pessoa.morada?.localidade ?? null,
    formulario: resumo.formulario,
  };
}
