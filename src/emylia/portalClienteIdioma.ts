// O idioma da página do negócio no portal real (PortalCliente.tsx): as chaves dos valores fixos que o motor guarda em português
// (motivos, cláusulas, formas de pagar, passos), e o rótulo do dia do plano. Os valores guardados NÃO mudam: só o que o cliente lê.
// O idioma entra por prop no PortalCliente (omissão «pt»); aqui nada lê o armazém do portal, para o CRM e o protótipo ficarem em português.
import { format } from "date-fns";
import { localeDateFns, type PortalIdioma } from "@/portal-i18n";
import { diasDaObra } from "./planoObra";
import { inicioDoPlano, rotuloDia } from "./preparacaoObra";
import type { Plano } from "./motor";

/** O dia `k` do plano: em português o rótulo de sempre («seg, 19 out»); em inglês as mesmas partes, noutras palavras («Mon, 19 Oct»). */
export function rotuloDiaEm(p: Plano, k: number, idioma: PortalIdioma, hoje = new Date()): string {
  if (idioma !== "en") return rotuloDia(p, k, hoje);
  const inicio = inicioDoPlano(p, hoje);
  const dia = inicio ? diasDaObra(inicio, k + 1)[k] : undefined;
  return dia ? format(dia, "EEE, d MMM", { locale: localeDateFns(idioma) }) : rotuloDia(p, k, hoje);
}

/** Os motivos que o cliente escolhe (pedir alterações, recusar a proposta, não aceitar a adenda) → a chave do texto que lê. */
export const CHAVE_MOTIVO: Record<string, string> = {
  "Outros materiais": "pc.negocioPag.motivo.outrosMateriais",
  "Juntar ou tirar trabalhos": "pc.negocioPag.motivo.juntarTirar",
  "Baixar o preço": "pc.negocioPag.motivo.baixarPreco",
  "Outras datas": "pc.negocioPag.motivo.outrasDatas",
  "Outra forma de pagamento": "pc.negocioPag.motivo.outraForma",
  "O preço": "pc.negocioPag.motivo.preco",
  "Escolhi outra empresa": "pc.negocioPag.motivo.outraEmpresa",
  "Já não vou fazer a obra": "pc.negocioPag.motivo.jaNaoFaco",
  "O prazo": "pc.negocioPag.motivo.prazo",
  "Outro motivo": "pc.negocioPag.motivo.outro",
  "Não preciso destes trabalhos": "pc.negocioPag.motivo.naoPreciso",
  "Quero falar primeiro": "pc.negocioPag.motivo.falarPrimeiro",
};

/** Os títulos das cláusulas do contrato (os que o cliente escolhe para pedir alterações) → a chave do texto. */
export const CHAVE_CLAUSULA: Record<string, string> = {
  "Objeto": "pc.negocioPag.clausula.objeto",
  "Preço": "pc.negocioPag.clausula.preco",
  "Pagamento": "pc.negocioPag.clausula.pagamento",
  "Prazo": "pc.negocioPag.clausula.prazo",
  "Garantia": "pc.negocioPag.clausula.garantia",
  "Condições gerais": "pc.negocioPag.clausula.condicoes",
};

/** As formas de pagar uma fatura (o valor guardado é o português) → a chave do nome que o cliente lê. */
export const CHAVE_METODO: Record<string, string> = {
  "Transferência": "pc.negocioPag.pagar.metTransferencia",
  "Referência MB": "pc.negocioPag.pagar.metReferenciaMb",
  "MB Way": "pc.negocioPag.pagar.metMbWay",
  "Débito direto": "pc.negocioPag.pagar.metDebitoDireto",
};

/** As fases curtas da obra (FASES_OBRA[n - 1].curto), já traduzidas no dicionário do documento da obra. */
export const CHAVE_FASE_CURTA: Record<number, string> = {
  1: "pc.docObra.fase.curto1",
  2: "pc.docObra.fase.curto2",
  3: "pc.docObra.fase.curto3",
  4: "pc.docObra.fase.curto4",
};
