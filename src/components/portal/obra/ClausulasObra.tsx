// As cláusulas do negócio e as adendas assinadas, por baixo da minuta do contrato no portal do cliente (como o CRM mostra o contrato
// montado: ContratoNoPasso.tsx → ContratoDoc). Só apresentação: os dados vêm de dadosObra.ts (contratoDaVista). O corpo gravado
// do contrato (contract_body_html, e o congelado na assinatura) não muda: isto é só o que se lê por baixo dele.
// As cláusulas que o Jurídico reescreveu vêm como texto escrito e não se traduzem.
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { ClausulasDados } from "@/emylia/propostaDados";
import { formatarData, formatarDataIso } from "@/portal-i18n/formato";
import { traduzirEm } from "@/portal-i18n/traduzirEm";
import type { PortalIdioma } from "@/portal-i18n/tipos";
import type { ContratoObra } from "./dadosObra";
import { dataCurtaEm, diasUteis, garantiaDe, momentoDaPrestacao } from "./textosObra";

type T = ReturnType<typeof traduzirEm>["t"];

/** Os títulos das cláusulas, pela ordem do contrato (o mesmo título português guarda a revisão do Jurídico: TITULOS_CLAUSULAS). */
const CLAUSULAS: { titulo: string; chave: string }[] = [
  { titulo: "Objeto", chave: "pc.docObra.ct.t.objeto" },
  { titulo: "Preço", chave: "pc.docObra.ct.t.preco" },
  { titulo: "Pagamento", chave: "pc.docObra.ct.t.pagamento" },
  { titulo: "Prazo", chave: "pc.docObra.ct.t.prazo" },
  { titulo: "Garantia", chave: "pc.docObra.ct.t.garantia" },
  { titulo: "Condições gerais", chave: "pc.docObra.ct.t.condicoes" },
];

/** O texto de cada cláusula do modelo, no idioma do portal (o Pagamento é uma lista, uma prestação por linha). */
function textoDaClausula(titulo: string, C: ClausulasDados, t: T, idioma: PortalIdioma): string | string[] {
  const T = C.T;
  switch (titulo) {
    case "Objeto":
      return t("pc.docObra.ct.objeto", {
        servico: C.servico.toLowerCase(), local: [C.morada, C.localidade].filter(Boolean).join(", "), servicos: C.servicos.map((s) => s.toLowerCase()).join(", "),
      });
    case "Preço":
      return t("pc.docObra.ct.preco", {
        base: formatCurrency(T.base), mo: formatCurrency(T.mo), ivaMo: formatCurrency(T.ivaMo), mat: formatCurrency(T.mat), ivaMat: formatCurrency(T.ivaMat), total: formatCurrency(T.total),
      });
    case "Pagamento":
      return C.prestacoes.map((p) => {
        const base = { momento: momentoDaPrestacao(t, p.l), p: Math.round(p.p * 100), valor: formatCurrency(p.v) };
        return p.data ? t("pc.docObra.ct.prestacaoPrevista", { ...base, data: dataCurtaEm(p.data, idioma) }) : t("pc.docObra.ct.prestacao", base);
      });
    case "Prazo": {
      const P = C.prazo;
      const frase = t("pc.docObra.ct.prazo", {
        inicio: P.inicio ? t("pc.docObra.ct.inicioA", { data: formatarDataIso(P.inicio, idioma) }) : t("pc.docObra.ct.inicioPorMarcar"),
        dias: P.dias || "—",
        fim: P.fim ? formatarData(P.fim, idioma, "numerico") : t("pc.docObra.ct.aDefinir"),
      });
      return P.multa ? `${frase} ${t("pc.docObra.ct.multa")}` : frase;
    }
    case "Garantia":
      return t("pc.docObra.ct.garantia", { garantia: garantiaDe(t, C.garantia) });
    default:
      return t("pc.docObra.ct.condicoes");
  }
}

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
