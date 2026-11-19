// Rótulos do catálogo do fornecedor que seguem o idioma do portal: unidades, cores sugeridas e erros das fotos.
// O que se GRAVA nunca muda com o idioma: a unidade fica «un», a cor fica «Branco». Só o rótulo é traduzido.
// As chaves estão aqui como literais (e não construídas) para o teste de uso das chaves as ver.
import { mensagemDeChave, mensagemDeTexto, resolverMensagem, type MensagemDoPortal } from "@/portal-i18n/mensagem";
import { traduzir } from "@/portal-i18n/traduzir";
import type { PortalIdioma } from "@/portal-i18n/tipos";
import { CORES, corCanonica, UNIDADES } from "@/lib/supplierPortal/listasArtigo";
import { UNIDADES_SERVICO } from "@/lib/supplierPortal/servicoCatalogo";
import {
  CATALOG_IMAGE_MAX_BYTES,
  CATALOG_IMAGE_MAX_COUNT,
  CATALOG_IMAGE_MIME,
  CatalogImageError,
} from "@/lib/supplierPortal/catalogImages";

/** Código da unidade de um artigo → chave do rótulo. */
export const CHAVE_UNIDADE_ARTIGO: Readonly<Record<string, string>> = {
  un: "sp.catalogo.unidade.un",
  cx: "sp.catalogo.unidade.cx",
  emb: "sp.catalogo.unidade.emb",
  pal: "sp.catalogo.unidade.pal",
  par: "sp.catalogo.unidade.par",
  cj: "sp.catalogo.unidade.cj",
  kit: "sp.catalogo.unidade.kit",
  rolo: "sp.catalogo.unidade.rolo",
  saco: "sp.catalogo.unidade.saco",
  lata: "sp.catalogo.unidade.lata",
  balde: "sp.catalogo.unidade.balde",
  m: "sp.catalogo.unidade.m",
  m2: "sp.catalogo.unidade.m2",
  m3: "sp.catalogo.unidade.m3",
  ml: "sp.catalogo.unidade.ml",
  kg: "sp.catalogo.unidade.kg",
  g: "sp.catalogo.unidade.g",
  t: "sp.catalogo.unidade.t",
  l: "sp.catalogo.unidade.l",
  h: "sp.catalogo.unidade.h",
  dia: "sp.catalogo.unidade.dia",
};

/** Código da unidade de um serviço (o que a base grava em unit_label) → chave do rótulo. */
export const CHAVE_UNIDADE_SERVICO: Readonly<Record<string, string>> = {
  h: "sp.catalogo.unidadeServico.h",
  dia: "sp.catalogo.unidadeServico.dia",
  "m²": "sp.catalogo.unidadeServico.m2",
  "m³": "sp.catalogo.unidadeServico.m3",
  ml: "sp.catalogo.unidadeServico.ml",
  m: "sp.catalogo.unidadeServico.m",
  un: "sp.catalogo.unidadeServico.un",
  pt: "sp.catalogo.unidadeServico.pt",
  km: "sp.catalogo.unidadeServico.km",
  vg: "sp.catalogo.unidadeServico.vg",
};

/** Nome da cor sugerida (em português, o que se grava) → chave do rótulo. */
export const CHAVE_COR: Readonly<Record<string, string>> = {
  Branco: "sp.catalogo.cor.branco",
  Preto: "sp.catalogo.cor.preto",
  Cinzento: "sp.catalogo.cor.cinzento",
  Antracite: "sp.catalogo.cor.antracite",
  Bege: "sp.catalogo.cor.bege",
  Creme: "sp.catalogo.cor.creme",
  Castanho: "sp.catalogo.cor.castanho",
  Azul: "sp.catalogo.cor.azul",
  Verde: "sp.catalogo.cor.verde",
  Vermelho: "sp.catalogo.cor.vermelho",
  Amarelo: "sp.catalogo.cor.amarelo",
  Laranja: "sp.catalogo.cor.laranja",
  Rosa: "sp.catalogo.cor.rosa",
  Roxo: "sp.catalogo.cor.roxo",
  Dourado: "sp.catalogo.cor.dourado",
  Prateado: "sp.catalogo.cor.prateado",
  Cromado: "sp.catalogo.cor.cromado",
  Inox: "sp.catalogo.cor.inox",
  Latão: "sp.catalogo.cor.latao",
  Cobre: "sp.catalogo.cor.cobre",
  "Madeira natural": "sp.catalogo.cor.madeiraNatural",
  Carvalho: "sp.catalogo.cor.carvalho",
  Nogueira: "sp.catalogo.cor.nogueira",
  Transparente: "sp.catalogo.cor.transparente",
  Mate: "sp.catalogo.cor.mate",
  Brilho: "sp.catalogo.cor.brilho",
};

/** Código do erro das fotos → chave da mensagem fixa (a que se mostra quando o servidor não manda texto). */
export const CHAVE_ERRO_FOTO: Readonly<Record<string, string>> = {
  unauthorized: "sp.catalogo.foto.erro.unauthorized",
  human_required: "sp.catalogo.foto.erro.human_required",
  not_owner: "sp.catalogo.foto.erro.not_owner",
  no_supplier_access: "sp.catalogo.foto.erro.no_supplier_access",
  not_found: "sp.catalogo.foto.erro.not_found",
  validation: "sp.catalogo.foto.erro.validation",
  empty_file: "sp.catalogo.foto.erro.empty_file",
  limit: "sp.catalogo.foto.erro.limit",
  file_too_large: "sp.catalogo.foto.erro.file_too_large",
  file_type_not_allowed: "sp.catalogo.foto.erro.file_type_not_allowed",
  rate_limited: "sp.catalogo.foto.erro.rate_limited",
  upload_failed: "sp.catalogo.foto.erro.upload_failed",
  rpc_error: "sp.catalogo.foto.erro.rpc_error",
  internal_error: "sp.catalogo.foto.erro.internal_error",
  not_deployed: "sp.catalogo.foto.erro.not_deployed",
};
const CHAVE_ERRO_FOTO_GENERICO = "sp.catalogo.foto.erro.generico";

const PARAMS_FOTO = { max: CATALOG_IMAGE_MAX_COUNT };

/** O rótulo de uma unidade de artigo no idioma; um código fora da lista volta como veio. */
export function rotuloUnidadeArtigo(code: string, idioma: PortalIdioma): string {
  const chave = CHAVE_UNIDADE_ARTIGO[code];
  return chave ? traduzir(idioma, chave) : code;
}

/** O rótulo de uma unidade de serviço no idioma; sem código, «—»; um código fora da lista volta como veio. */
export function rotuloUnidadeServico(code: string | null | undefined, idioma: PortalIdioma): string {
  if (!code) return "—";
  const chave = CHAVE_UNIDADE_SERVICO[code];
  return chave ? traduzir(idioma, chave) : code;
}

/** As unidades para escolher, com os rótulos no idioma (o valor é sempre o código). */
export function opcoesDeUnidade(servico: boolean, idioma: PortalIdioma): { value: string; label: string }[] {
  return servico
    ? UNIDADES_SERVICO.map(([value]) => ({ value, label: rotuloUnidadeServico(value, idioma) }))
    : UNIDADES.map(([value]) => ({ value, label: rotuloUnidadeArtigo(value, idioma) }));
}

/** As cores sugeridas: o valor é o nome em português (o que se grava), o rótulo segue o idioma. */
export function opcoesDeCor(idioma: PortalIdioma): { value: string; label: string }[] {
  return CORES.map((value) => ({ value, label: CHAVE_COR[value] ? traduzir(idioma, CHAVE_COR[value]) : value }));
}

const semAcentos = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * A cor escrita, como `corCanonica`, e ainda: em inglês, o nome inglês de uma cor da lista («white», «Natural wood»)
 * passa ao nome em português («Branco», «Madeira natural»), que é o que se grava e de onde sai o código do SKU.
 */
export function corCanonicaPortal(texto: string, idioma: PortalIdioma): string {
  if (idioma === "en") {
    const procurada = semAcentos(texto);
    const igual = opcoesDeCor("en").find((o) => semAcentos(o.label) === procurada);
    if (igual && procurada) return igual.value;
  }
  return corCanonica(texto);
}

/** Erro das fotos como mensagem do portal: a fixa traduz-se; o texto que vem do servidor fica como vem. */
export function mensagemErroFoto(err: unknown): MensagemDoPortal {
  if (err instanceof CatalogImageError) {
    const chave = CHAVE_ERRO_FOTO[err.code];
    if (chave && (!err.message || err.message === traduzir("pt", chave, PARAMS_FOTO))) {
      return mensagemDeChave(chave, PARAMS_FOTO);
    }
    return err.message ? mensagemDeTexto(err.message) : mensagemDeChave(CHAVE_ERRO_FOTO_GENERICO);
  }
  if (err instanceof Error && err.message) return mensagemDeTexto(err.message);
  return mensagemDeChave(CHAVE_ERRO_FOTO_GENERICO);
}

/** Validação no cliente de uma foto antes de a enviar (as mesmas regras de `validateCatalogImageFile`). null = válida. */
export function validarFotoCatalogo(file: File, currentCount = 0): MensagemDoPortal | null {
  if (currentCount >= CATALOG_IMAGE_MAX_COUNT) return mensagemDeChave(CHAVE_ERRO_FOTO.limit, PARAMS_FOTO);
  if (!(CATALOG_IMAGE_MIME as readonly string[]).includes(file.type)) return mensagemDeChave(CHAVE_ERRO_FOTO.file_type_not_allowed);
  if (file.size <= 0) return mensagemDeChave(CHAVE_ERRO_FOTO.empty_file);
  if (file.size > CATALOG_IMAGE_MAX_BYTES) return mensagemDeChave(CHAVE_ERRO_FOTO.file_too_large);
  return null;
}

/** Junta mensagens com um separador, resolvendo cada uma no idioma de quando se mostra. */
export function juntarMensagens(mensagens: readonly MensagemDoPortal[], separador = " "): MensagemDoPortal {
  return {
    de: (idioma) => mensagens.map((m) => resolverMensagem(m, idioma)).join(separador),
  };
}
