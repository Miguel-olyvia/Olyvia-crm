/**
 * Em que modo abre o dialogo de envio a partir do botao de topo da ficha.
 *
 * Com um convite ainda PENDENTE, abrir em "enviar" com o e-mail pessoal da
 * ficha como sugestao deixava o RH confirmar um e-mail diferente do do convite
 * actual: o servidor so herda o rascunho com o MESMO e-mail, por isso a pessoa
 * perdia o que ja tinha escrito, sem aviso. Com convite pendente (e e-mail de
 * destino conhecido) abre-se em "reenviar", que parte do e-mail do convite.
 */
import type { ResumoConvite } from "@/hooks/useConviteAdmissaoResumo";

export function modoDeEnvioDoConvite(
  resumo: Pick<ResumoConvite, "estado" | "emailDestino"> | null | undefined,
): "enviar" | "reenviar" {
  return resumo?.estado === "pendente" && resumo.emailDestino ? "reenviar" : "enviar";
}
