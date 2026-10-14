// As peças de `aplicarExtras`: cada satélite da ficha de uma pessoa nova, construído só com o que o formulário pediu.
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import type { ExtrasNovaPessoa } from "@/components/rh-exemplo/dados/fichaNovaPessoa";
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import { equivalenteSemanal } from "@/components/rh-exemplo/lib/horas";
import type {
  PessoaAnexo, PessoaDadosPessoais, PessoaIdentificacao, PessoaRetribuicao,
} from "@/components/rh-exemplo/tipos";

export type Parte<T> = Omit<T, "id" | "pessoa_id" | "organization_id">;
type Base = { pessoa_id: string; organization_id: string };

/** Cria um satélite 1:1 a partir da parte normalizada; sem parte, a ficha fica sem ele. */
export function sateliteOpcional<T extends { id: string }>(
  pessoaId: string, prefixo: string, base: Base, parte: Parte<T> | null,
): T | null {
  return parte === null ? null : ({ id: `${prefixo}-${pessoaId}`, ...base, ...parte } as unknown as T);
}

export function dadosPessoaisDaNova(ficha: FichaRh, x: ExtrasNovaPessoa, base: Base): PessoaDadosPessoais {
  return { id: `dp-${ficha.pessoa.id}`, ...base, ...x.dadosPessoais };
}

export function identificacaoDaNova(ficha: FichaRh, x: ExtrasNovaPessoa, base: Base): PessoaIdentificacao {
  return {
    id: `id-${ficha.pessoa.id}`,
    ...base,
    ...x.identificacao,
    niss_ultimos4: x.niss === null ? null : x.niss.slice(-4),
  };
}

/** O vínculo da ficha com o contrato escrito no formulário (e as versões de horas que dele derivam). */
export function vinculoDaNova(ficha: FichaRh, x: ExtrasNovaPessoa): Pick<FichaRh, "vinculos" | "horasVersoes"> {
  const atual = ficha.vinculos[0];
  const h = x.horas;
  const vinculo = {
    ...atual,
    ...x.vinculo,
    horas_periodo: h?.periodo ?? null,
    horas_frequencia: h?.frequencia ?? "semanal",
    horas_semanais_equivalentes: h ? equivalenteSemanal(h.periodo, h.frequencia) : null,
  };
  const inicio = vinculo.data_inicio;
  const horasVersoes = h
    ? [{
        id: `hv-${ficha.pessoa.id}`, pessoa_id: ficha.pessoa.id, organization_id: ficha.pessoa.organization_id,
        vinculo_id: vinculo.id, horas_periodo: h.periodo, horas_frequencia: h.frequencia,
        horas_semanais_equivalentes: vinculo.horas_semanais_equivalentes, valido_de: inicio, valido_ate: null,
        motivo: null, documento_id: null,
      }]
    : [];
  return { vinculos: [vinculo], horasVersoes };
}

/** O salário base vem do cargo (já na ficha); o subsídio e os duodécimos são da pessoa. */
export function retribuicoesDaNova(ficha: FichaRh, x: ExtrasNovaPessoa): PessoaRetribuicao[] {
  return ficha.retribuicoes.map((r) => ({
    ...r,
    subsidio_alimentacao: x.retribuicao.subsidio,
    subsidio_alimentacao_modo: x.retribuicao.modo,
    duodecimos_pct: x.retribuicao.duodecimos,
    origem: "pessoa" as const,
  }));
}

/** Os anexos escolhidos no painel (só os nomes: nunca se enviou nada). */
export function anexosDaNova(ficha: FichaRh, x: ExtrasNovaPessoa): PessoaAnexo[] {
  const agora = `${diaIso(0)}T09:00:00Z`;
  return x.anexos.map((a, i) => ({
    id: a.tipo === "fotografia" ? `anx-foto-${ficha.pessoa.id}` : `anx-${a.tipo}-${ficha.pessoa.id}-${i}`,
    organization_id: ficha.pessoa.organization_id,
    pessoa_id: ficha.pessoa.id,
    tipo: a.tipo,
    estado: "promovido" as const,
    nome_original: a.nome,
    mime_type: a.mime,
    tamanho_bytes: a.tamanho,
    promovido_em: agora,
    criado_em: agora,
  }));
}

/** Com convite: pendente, para o e-mail pessoal, e o link vale 7 dias. */
export function conviteDaNova(ficha: FichaRh, x: ExtrasNovaPessoa): FichaRh["convite"] {
  if (x.convite === null) return null;
  return {
    conviteId: `cv-${ficha.pessoa.id}`,
    estado: "pendente",
    emailDestino: x.convite.email,
    criadoEm: `${diaIso(0)}T09:00:00Z`,
    validUntil: `${diaIso(7)}T09:00:00Z`,
    usadoEm: null,
    emailEnviado: true,
    emailErro: null,
    ultimaRecusa: null,
  };
}
