/** Documentos, anexos, convite de admissão e pendências de exemplo de uma pessoa. */
import type { Catalogos } from "@/components/rh-exemplo/dados/catalogos";
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import type { EspecPessoa } from "@/components/rh-exemplo/dados/fichaExemplo";
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import type { Pendencia } from "@/components/rh-exemplo/hooks/useAdmissaoPendencias";
import type { PessoaAnexo, PessoaDocumento } from "@/components/rh-exemplo/tipos";

const HASH_EXEMPLO = "9f2c4b7a1d3e5f60a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1";

function documento(
  e: EspecPessoa,
  org: string,
  chave: string,
  campos: Partial<PessoaDocumento>,
): PessoaDocumento {
  return {
    id: `doc-${e.id}-${chave}`,
    pessoa_id: e.id,
    organization_id: org,
    vinculo_id: `vin-${e.id}`,
    modelo_id: null,
    tipo: "contrato",
    titulo: "Documento",
    estado: "rascunho",
    ficheiro_caminho: null,
    ficheiro_hash_sha256: null,
    ficheiro_anexado_em: null,
    emitido_em: null,
    emitido_por: null,
    assinado_em: null,
    assinatura_origem: null,
    anulado_em: null,
    anulado_motivo: null,
    created_at: `${diaIso(e.inicio)}T09:00:00Z`,
    ...campos,
  };
}

export function documentosDeExemplo(e: EspecPessoa, org: string, cat: Catalogos): PessoaDocumento[] {
  const nome = `${e.nome} ${e.apelido}`;
  const modelo = cat.modelos.find((m) => m.tipo === "contrato");
  if (e.estado === "futuro") return [];
  const assinado = e.id !== "p-beatriz" && e.id !== "p-daniel";
  const contrato = documento(e, org, "contrato", {
    modelo_id: modelo?.id ?? null,
    titulo: `Contrato de trabalho — ${nome}`,
    estado: assinado ? "assinado" : "a_aguardar_assinatura",
    ficheiro_caminho: assinado ? "exemplo/contrato.pdf" : null,
    ficheiro_hash_sha256: assinado ? HASH_EXEMPLO : null,
    ficheiro_anexado_em: assinado ? `${diaIso(e.inicio)}T12:00:00Z` : null,
    emitido_em: `${diaIso(e.inicio - 2)}T09:00:00Z`,
    emitido_por: "u-p-sofia",
    assinado_em: assinado ? `${diaIso(e.inicio)}T11:00:00Z` : null,
    assinatura_origem: assinado ? "interna" : null,
  });
  const docs = [contrato];
  if (e.id === "p-tiago" || e.id === "p-rui") {
    docs.push(
      documento(e, org, "adenda", {
        tipo: "adenda",
        titulo: "Adenda de alteração de horário",
        estado: "assinado",
        ficheiro_caminho: "exemplo/adenda.pdf",
        ficheiro_hash_sha256: HASH_EXEMPLO,
        ficheiro_anexado_em: `${diaIso(-120)}T12:00:00Z`,
        emitido_em: `${diaIso(-125)}T09:00:00Z`,
        assinado_em: `${diaIso(-120)}T11:00:00Z`,
        assinatura_origem: "externa",
        created_at: `${diaIso(-125)}T09:00:00Z`,
      }),
    );
  }
  return docs;
}

export function anexosDeExemplo(e: EspecPessoa, org: string, idx: number, comFoto: boolean): PessoaAnexo[] {
  const base = { organization_id: org, pessoa_id: e.id, estado: "promovido" as const };
  const lista: PessoaAnexo[] = [];
  if (idx < 6) {
    lista.push({
      ...base,
      id: `anx-cc-${e.id}`,
      tipo: "cartao_cidadao",
      nome_original: "cartao-cidadao-exemplo.pdf",
      mime_type: "application/pdf",
      tamanho_bytes: 412_000,
      promovido_em: `${diaIso(e.inicio + 1)}T10:00:00Z`,
      criado_em: `${diaIso(e.inicio)}T10:00:00Z`,
    });
  }
  if (idx < 3) {
    lista.push({
      ...base,
      id: `anx-iban-${e.id}`,
      tipo: "comprovativo_iban",
      nome_original: "comprovativo-iban-exemplo.pdf",
      mime_type: "application/pdf",
      tamanho_bytes: 98_000,
      promovido_em: `${diaIso(e.inicio + 1)}T10:05:00Z`,
      criado_em: `${diaIso(e.inicio)}T10:05:00Z`,
    });
  }
  if (comFoto) {
    lista.push({
      ...base,
      id: `anx-foto-${e.id}`,
      tipo: "fotografia",
      nome_original: "fotografia-exemplo.png",
      mime_type: "image/png",
      tamanho_bytes: 52_000,
      promovido_em: `${diaIso(e.inicio + 1)}T10:10:00Z`,
      criado_em: `${diaIso(e.inicio)}T10:10:00Z`,
    });
  }
  return lista;
}

const POSICAO: Record<string, Pendencia["posicao"]> = { tamanho_cima: "ficha" };

export function convitePendencias(
  e: EspecPessoa,
  emailPessoal: string | null,
): Pick<FichaRh, "convite" | "pendencias"> {
  const pendencias: Pendencia[] = (e.pendencias ?? []).map((codigo) => ({
    codigo,
    origem: "pessoa",
    posicao: POSICAO[codigo] ?? "convite",
  }));
  if (!e.convite) return { convite: null, pendencias };
  return {
    convite: {
      conviteId: `cv-${e.id}`,
      estado: e.convite === "usado" ? "usado" : "pendente",
      emailDestino: emailPessoal,
      criadoEm: `${diaIso(-6)}T09:00:00Z`,
      validUntil: `${diaIso(e.convite === "usado" ? -1 : 8)}T09:00:00Z`,
      usadoEm: e.convite === "usado" ? `${diaIso(-3)}T16:30:00Z` : null,
      emailEnviado: true,
      emailErro: null,
      ultimaRecusa: null,
    },
    pendencias,
  };
}
