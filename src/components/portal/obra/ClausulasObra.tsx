// As cláusulas do negócio e as adendas assinadas, por baixo da minuta do contrato no portal do cliente (como o CRM mostra o contrato
// montado: ContratoNoPasso.tsx → ContratoDoc). Só apresentação: os dados vêm de dadosObra.ts (contratoDaVista). O corpo gravado
// do contrato (contract_body_html, e o congelado na assinatura) não muda: isto é só o que se lê por baixo dele.
// As cláusulas que o Jurídico reescreveu vêm como texto escrito e não se traduzem.
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { traduzirEm } from "@/portal-i18n/traduzirEm";
import type { PortalIdioma } from "@/portal-i18n/tipos";
import type { ContratoObra } from "./dadosObra";
import { CLAUSULAS, diasUteis, textoDaClausula } from "./textosObra";

export interface ClausulasObraProps {
  dados: ContratoObra;
  idioma?: PortalIdioma;
}

export function ClausulasObra({ dados, idioma = "pt" }: ClausulasObraProps) {
  const { idioma: lingua, t } = traduzirEm(idioma);
  const C = dados.clausulas, A = dados.adendas;
  return (
    <Card aria-labelledby="doc-obra-clausulas" data-testid="clausulas-obra">
      <CardHeader className="pb-3">
        <h2 id="doc-obra-clausulas" className="text-base font-semibold">{t("pc.docObra.ct.titulo")}</h2>
      </CardHeader>
      <CardContent className="space-y-4 text-[15px]">
        {CLAUSULAS.map(({ titulo, chave }, i) => {
          const revista = C.revistas[titulo];
          const corpo = revista ?? textoDaClausula(titulo, C, t, lingua);
          return (
            <section key={titulo}>
              <h3 className="font-semibold">
                {t("pc.docObra.ct.clausula", { n: i + 1, titulo: t(chave) })}
                {revista && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 align-middle text-xs font-medium text-muted-foreground">{t("pc.docObra.ct.revista")}</span>}
              </h3>
              {Array.isArray(corpo)
                ? <ul className="mt-1 list-disc pl-5 text-muted-foreground">{corpo.map((x, k) => <li key={k}>{x}</li>)}</ul>
                : <p className="mt-1 whitespace-pre-line text-muted-foreground">{corpo}</p>}
            </section>
          );
        })}
        {A && (
          <section aria-labelledby="doc-obra-adendas" className="rounded-lg border p-4">
            <h3 id="doc-obra-adendas" className="font-semibold">{t("pc.docObra.ad.titulo")}</h3>
            <p className="text-sm text-muted-foreground">{t("pc.docObra.ad.texto")}</p>
            <ul className="mt-3 divide-y">
              {A.adendas.map((x) => (
                <li key={x.n} className="py-3">
                  <p className="font-medium">{x.n} · {x.trabalhos.join(", ")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("pc.docObra.ad.linha", { total: formatCurrency(x.total), dias: diasUteis(t, x.dias, "+"), motivo: x.motivo.toLowerCase() })}
                  </p>
                  <p className="text-sm text-emerald-700">{x.assinada ? t("pc.docObra.ad.assinadaEm", { data: x.assinada }) : t("pc.docObra.ad.assinada")}</p>
                </li>
              ))}
            </ul>
            <dl className="mt-1 space-y-1 border-t pt-3">
              <div className="flex justify-between text-muted-foreground"><dt>{t("pc.docObra.ad.contrato")}</dt><dd className="tabular-nums">{formatCurrency(A.contrato)}</dd></div>
              <div className="flex justify-between text-muted-foreground">
                <dt>{A.adendas.length === 1 ? t("pc.docObra.ad.uma") : t("pc.docObra.ad.varias", { n: A.adendas.length })}</dt>
                <dd className="tabular-nums">+{formatCurrency(A.somaAdendas)}</dd>
              </div>
              <div className="flex justify-between font-semibold"><dt>{t("pc.docObra.ad.valorTotal")}</dt><dd className="tabular-nums">{formatCurrency(A.total)}</dd></div>
            </dl>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
