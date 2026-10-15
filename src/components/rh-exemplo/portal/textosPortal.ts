// Pequenas funções de texto do portal: os títulos dos pedidos, o que resta do acesso, os dias e a descarga simulada.
import { dataEHora } from "@/components/rh-exemplo/admissao/auxiliares";
import type { PrazoLogin } from "@/components/rh-exemplo/lib/admissaoFluxo";
import type { TraduzirFn } from "@/components/rh-exemplo/lib/errosAdmissao";
import type { PedidoPessoa, PedidoRh } from "@/components/rh-exemplo/lib/portalDocumentos";

export const tituloPedidoRh = (t: TraduzirFn, p: PedidoRh): string => (p.tipo === "outro" ? p.titulo : t(`rhPortal.tipoRh.${p.tipo}`));
export const tituloPedidoPessoa = (t: TraduzirFn, p: PedidoPessoa): string => (p.tipo === "outro" ? p.titulo : t(`rhPortal.tipoPessoa.${p.tipo}`));

/** «3 dias», «1 dia» ou «5 h»: o que resta do acesso temporário (vazio se já não conta). */
export function restaDoAcesso(t: TraduzirFn, prazo: PrazoLogin): string {
  if (prazo.tipo === "dias") return t(prazo.n === 1 ? "rhPortal.selo.umDia" : "rhPortal.selo.dias", { n: prazo.n });
  return prazo.tipo === "horas" ? t("rhPortal.selo.horas", { n: prazo.n }) : "";
}

/** «dd/mm» de um instante ISO (hora local do exemplo). */
export const diaMes = (iso: string): string => dataEHora(iso).data;

/** «dd/mm» de um dia AAAA-MM-DD. */
export const diaMesDoDia = (dia: string): string => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/**
 * Descarrega uma cópia de EXEMPLO (um texto simples, nunca o documento verdadeiro: não há ficheiros). Sem `URL.createObjectURL`
 * (ambiente sem navegador) não faz nada e devolve `false`.
 */
export function descarregarSimulado(nome: string, conteudo: string): boolean {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return false;
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nome.replace(/\.[a-z0-9]{2,4}$/i, "")} (exemplo).txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}
