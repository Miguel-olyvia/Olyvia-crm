/**
 * A devolucao do RH, no portal: a nota, o comentario de cada campo e os documentos a substituir.
 *
 * (Aqui vivia tambem uma lista so de leitura dos dados guardados e dos campos pedidos. Saiu: o
 * formulario do convite que a pessoa ja preenchia — `ConvitePagina1` e `ConvitePagina2` — mostra os
 * mesmos dados, preenchidos, e marca os pedidos com o asterisco. O nome do ficheiro fica.)
 */
import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type { TraduzirFn } from "@/lib/hr/errosAdmissao";
import { rotuloDeCampoAdmissao } from "@/components/hr/rotuloCampoAdmissao";
import { rotuloDoRascunho, type DevolucaoPortal } from "@/lib/hr/portalAdmissao";

const TIPOS_DOCUMENTO: Readonly<Record<string, string>> = {
  cartao_cidadao: "hr.convite.anexos.cartaoCidadao",
  comprovativo_iban: "hr.convite.anexos.comprovativoIban",
  fotografia: "hr.convite.anexos.fotografia",
};

/** O texto de um campo devolvido: o do rascunho se o ha, senao o das pendencias (nunca a chave em bruto). */
function rotuloDoCampo(t: TraduzirFn, chave: string): string {
  return rotuloDoRascunho(t, chave) ?? rotuloDeCampoAdmissao(t, chave);
}

export function PortalDevolvida({ devolucao }: { devolucao: DevolucaoPortal }) {
  const { t } = useTranslation();
  const campos = Object.entries(devolucao.campos);
  return (
    <section aria-labelledby="portal-devolvida-titulo" className="space-y-3 rounded-lg border border-amber-500/70 bg-amber-500/10 p-5">
      <h2 id="portal-devolvida-titulo" className="flex items-center gap-2 text-base font-semibold">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        {t("portal.devolvida.titulo")}
      </h2>
      {devolucao.observacao && (
        <p className="text-sm">
          <span className="font-medium">{t("portal.devolvida.observacao")}: </span>
          {devolucao.observacao}
        </p>
      )}
      {campos.length > 0 && (
        <div>
          <p className="text-sm font-medium">{t("portal.devolvida.campos")}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {campos.map(([chave, comentario]) => (
              <li key={chave}>
                <span className="font-medium">{rotuloDoCampo(t, chave)}</span>
                {comentario ? <span className="block text-muted-foreground">{comentario}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {devolucao.documentos.length > 0 && (
        <div>
          <p className="text-sm font-medium">{t("portal.devolvida.documentos")}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {devolucao.documentos.map((tipo) => (
              <li key={tipo}>{TIPOS_DOCUMENTO[tipo] ? t(TIPOS_DOCUMENTO[tipo]) : t("portal.devolvida.outroDocumento")}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
