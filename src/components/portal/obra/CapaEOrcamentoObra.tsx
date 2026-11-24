// 23/11: a carta e o resumo da capa (onde o template não escreve o cabeçalho) e o «03 Orçamento detalhado» (antes da proposta real),
// no estilo dos cartões do documento do template. Só apresentação: os dados vêm de capaEOrcamento.ts.
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { formatarData } from "@/portal-i18n/formato";
import type { traduzirEm } from "@/portal-i18n/traduzirEm";
import type { PortalIdioma } from "@/portal-i18n/tipos";
import type { CapaObra, OrcamentoObra } from "./capaEOrcamento";
import { curtoDaFase, dataCurtaEm, diasUteis, garantiaDe, numero } from "./textosObra";

type T = ReturnType<typeof traduzirEm>["t"];

export function CapaDaObra({ capa, t, idioma }: { capa: CapaObra; t: T; idioma: PortalIdioma }) {
  const essencial: [string, string][] = [
    [t("pc.docObra.capa.totalIva"), formatCurrency(capa.total)],
    [t("pc.docObra.capa.prazo"), diasUteis(t, capa.prazo)],
    [t("pc.docObra.capa.inicio"), dataCurtaEm(capa.inicio, idioma)],
    [t("pc.docObra.capa.garantia"), garantiaDe(t, capa.garantia)],
  ];
  return (
    <Card aria-label={t("pc.docObra.capa.aria")} data-testid="capa-obra">
      <CardContent className="space-y-6 pt-6 text-[15px]">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t("pc.docObra.capa.preparadaPara")}</p>
            <p className="mt-1 font-semibold">{capa.preparadaPara}</p>
            <p className="text-sm text-muted-foreground">{capa.contacto}{capa.nif ? ` · ${t("pc.docObra.capa.nif", { nif: capa.nif })}` : ""}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t("pc.docObra.capa.data")}</p>
            <p className="mt-1 font-semibold">{formatarData(capa.emitida, idioma, "longo")}</p>
            <p className="text-sm text-muted-foreground">{t("pc.docObra.capa.validaAte", { data: formatarData(capa.validaAte, idioma, "longo") })}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-4">
          {essencial.map(([k, v]) => (
            <div key={k} className="bg-card p-3">
              <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{k}</dt>
              <dd className="mt-1 font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="max-w-[60ch] space-y-3">
          <p>{t("pc.docObra.capa.ola", { nome: capa.primeiroNome })}</p>
          <p>{capa.visita ? t("pc.docObra.capa.obrigadoVisita", { visita: capa.visita }) : t("pc.docObra.capa.obrigado")}</p>
          <p>{t("pc.docObra.capa.seguinte")}</p>
          <p className="pt-1">{t("pc.docObra.capa.cumprimentos")}<br /><span className="font-semibold">{capa.assina}</span>{capa.assina !== capa.empresa ? `, ${capa.empresa}` : ""}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function OrcamentoDetalhadoObra({ orc, t }: { orc: OrcamentoObra; t: T }) {
  const totais: [string, number, boolean][] = [
    [t("pc.docObra.orc.mo"), orc.mo, false], [t("pc.docObra.orc.mat"), orc.mat, false],
    [t("pc.docObra.orc.ivaMo"), orc.ivaMo, true], [t("pc.docObra.orc.ivaMat"), orc.ivaMat, true],
    // 24/11: a parte a 0% (autoliquidação), só quando a há
    ...((orc.isento ?? 0) > 0.004 ? [[t("pc.docObra.orc.isento"), orc.isento!, false] as [string, number, boolean]] : []),
  ];
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <caption className="sr-only">{t("pc.docObra.titulo.orcamento")}</caption>
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-semibold">{t("pc.docObra.orc.descricao")}</th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">{t("pc.docObra.orc.qtd")}</th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">{t("pc.docObra.orc.precoUn")}</th>
              <th scope="col" className="py-2 text-right font-semibold">{t("pc.docObra.orc.total")}</th>
            </tr>
          </thead>
          {orc.grupos.map((g) => (
            <tbody key={g.chave}>
              <tr>
                <th scope="rowgroup" colSpan={4} className="pb-1 pt-4 text-left text-[13px] font-semibold">
                  {g.cor && <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: g.cor }} aria-hidden="true" />}
                  {g.titulo.tipo === "fase" ? `${t("pc.docObra.fase.rotulo", { n: g.titulo.n })} · ${curtoDaFase(t, g.titulo.n)}` : g.titulo.zona}
                </th>
              </tr>
              {g.linhas.map((x, i) => (
                <tr key={`${x.nome}-${i}`} className="border-b border-border/60">
                  <td className="py-1.5 pr-3">{x.nome}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{numero(x.q)} {x.un}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{formatCurrency(x.pu)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(x.total)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="py-1.5 pr-3 text-right text-muted-foreground">
                  {g.titulo.tipo === "fase" ? t("pc.docObra.orc.subtotalFase", { n: g.titulo.n }) : t("pc.docObra.orc.subtotalZona", { zona: g.titulo.zona })}
                </td>
                <td className="py-1.5 text-right font-medium tabular-nums">{formatCurrency(g.subtotal)}</td>
              </tr>
            </tbody>
          ))}
        </table>
      </div>
      <dl className="ml-auto w-full max-w-sm space-y-1.5 border-t pt-3 text-sm">
        {orc.desconto > 0 && <div className="flex justify-between text-muted-foreground"><dt>{t("pc.docObra.orc.desconto")}</dt><dd className="tabular-nums">{numero(orc.desconto)}%</dd></div>}
        {totais.map(([k, v, suave]) => (
          <div key={k} className={suave ? "flex justify-between text-muted-foreground" : "flex justify-between"}><dt>{k}</dt><dd className="tabular-nums">{formatCurrency(v)}</dd></div>
        ))}
        <div className="flex justify-between border-t pt-2 text-base font-semibold"><dt>{t("pc.docObra.orc.total")}</dt><dd className="tabular-nums">{formatCurrency(orc.total)}</dd></div>
      </dl>
      {(orc.isento ?? 0) > 0.004 && <p className="ml-auto mt-2 w-full max-w-sm text-sm text-muted-foreground">{t("pc.docObra.orc.mencaoAutoliq")}</p>}
    </>
  );
}
