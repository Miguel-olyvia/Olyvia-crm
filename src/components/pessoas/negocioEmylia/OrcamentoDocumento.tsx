// O documento do orçamento completo (cabeçalho do template, cliente, tabela de linhas, subtotais, IVA e total), a partir do orçamento do
// estado do negócio (d.orc, versão atual). As contas vêm do motor da Emylia (linhaCalc, ivaDaLinha, totaisIva): o que se vê é o que o passo mostra.
import type { CSSProperties } from "react";
import { eur, ivaDaLinha, linhaCalc, totaisIva, type LinhaOrc, type Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";
import { linhaDeMaterial, quantidade } from "@/emylia/propostaConteudo";
import type { TemplateDeAspeto } from "@/hooks/pessoas/useTemplatesDeDocumento";

const COR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{3,20})$/i;
const FONTE = /^[\w\s,'"-]{1,120}$/;
const cor = (v: string | null | undefined): string | undefined => (v && COR.test(v.trim()) ? v.trim() : undefined);
const fonte = (v: string | null | undefined): string | undefined => (v && FONTE.test(v.trim()) ? v.trim() : undefined);
const https = (v: string | null | undefined): string | null => (v && /^https:\/\//i.test(v.trim()) ? v.trim() : null);
const euros = (x: number): string => `${eur(x)} €`;

interface Linha { descricao: string; qtd: string; preco: number; unit: number | null; iva: number; total: number }

function linhaDoDocumento(l: LinhaOrc, d: Negocio, S: Ctx["S"], k: number): Linha {
  const total = linhaCalc(l, S).preco;
  const iva = ivaDaLinha(l, S);
  if (l.t === "svc") {
    const s = S.svc[l.sid];
    return { descricao: s?.n ?? "Serviço", qtd: quantidade(l.q, s?.un ?? "") || String(l.q), preco: total * k, unit: l.pu * k, iva, total: total * k };
  }
  if (l.livre) return { descricao: l.d, qtd: quantidade(l.livre.q, l.livre.un) || String(l.livre.q), preco: total * k, unit: l.livre.pu * k, iva, total: total * k };
  if (l.prod) return { descricao: linhaDeMaterial(l.d).item.nome, qtd: String(l.prod.q), preco: total * k, unit: l.prod.precoUn * k, iva, total: total * k };
  void d;
  const m = linhaDeMaterial(l.d).item;
  return { descricao: m.det ? `${m.nome} (${m.det})` : m.nome, qtd: "", preco: total * k, unit: null, iva, total: total * k };
}

export function OrcamentoDocumento({ d, S, tpl, nome, logoOrg }: { d: Negocio; S: Ctx["S"]; tpl: TemplateDeAspeto | null; nome: string; logoOrg: string | null }) {
  const orc = d.orc;
  const logo = https(tpl?.logo_url) ?? logoOrg;
  const estilo: CSSProperties = tpl
    ? { fontFamily: fonte(tpl.font_family), color: cor(tpl.text_color), backgroundColor: cor(tpl.background_color) }
    : {};
  const primaria = cor(tpl?.primary_color) ?? "#24204a";
  const titulos = fonte(tpl?.heading_font_family);
  const linhas = orc?.linhas ?? [];
  const classe = "overflow-hidden rounded-xl border border-border text-[15px]" + (tpl?.background_color ? "" : " bg-card text-card-foreground");

  const k = 1 - (orc?.desconto || 0) / 100;
  const cab = (
    <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white" style={{ backgroundColor: primaria, fontFamily: titulos }}>
      <div className="min-w-0">
        {tpl?.show_company_info !== false && <p className="break-words font-semibold tracking-wide">{nome}</p>}
        <p className="text-sm opacity-90">Orçamento</p>
      </div>
      {logo && <img src={logo} alt={`Logótipo de ${nome}`} width={96} height={32} className="h-8 w-auto max-w-[8rem] object-contain" />}
    </header>
  );

  if (!orc || linhas.length === 0) {
    return (
      <article aria-label="Documento do orçamento" className={classe} style={estilo}>
        {cab}
        <p role="status" className="px-4 py-4">Ainda sem linhas: escolhe os serviços em Necessidades do cliente e fecha o levantamento.</p>
      </article>
    );
  }

  const T = totaisIva(d, S);
  const rows = linhas.map((l) => linhaDoDocumento(l, d, S, k));
  const bruto = linhas.reduce((a, l) => a + linhaCalc(l, S).preco, 0);
  const cliente = d.f.nome_fiscal || d.nome;
  const nif = d.f.nif_fat || d.f.nif || "";
  const morada = d.f.morada || d.local || "";
  const num = "whitespace-nowrap text-right tabular-nums";

  return (
    <article aria-label="Documento do orçamento" className={classe} style={estilo}>
      {cab}
      <div className="space-y-4 px-4 py-4">
        {tpl?.header_text && <p className="whitespace-pre-line">{tpl.header_text}</p>}
        {tpl?.show_client_info !== false && (
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt className="opacity-70">Cliente</dt><dd className="break-words font-medium">{cliente}</dd></div>
            {nif && <div><dt className="opacity-70">NIF</dt><dd>{nif}</dd></div>}
            {morada && <div><dt className="opacity-70">Morada</dt><dd className="break-words">{morada}</dd></div>}
          </dl>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Linhas do orçamento, com quantidade, preço, IVA e total de cada uma</caption>
            <thead>
              <tr className="border-b-2 text-left" style={{ borderColor: primaria }}>
                <th scope="col" className="py-2 pr-3 font-semibold">Descrição</th>
                <th scope="col" className={`px-2 py-2 font-semibold ${num}`}>Qtd.</th>
                <th scope="col" className={`px-2 py-2 font-semibold ${num}`}>Preço</th>
                <th scope="col" className={`px-2 py-2 font-semibold ${num}`}>IVA</th>
                <th scope="col" className={`py-2 pl-2 font-semibold ${num}`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/60 align-top">
                  <th scope="row" className="break-words py-2 pr-3 text-left font-normal">{r.descricao}</th>
                  <td className={`px-2 py-2 ${num}`}>{r.qtd}</td>
                  <td className={`px-2 py-2 ${num}`}>{r.unit === null ? "" : euros(r.unit)}</td>
                  <td className={`px-2 py-2 ${num}`}>{r.iva}%</td>
                  <td className={`py-2 pl-2 font-medium ${num}`}>{euros(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm tabular-nums">
          {orc.desconto > 0 && (<><dt>Subtotal antes do desconto</dt><dd className="text-right">{euros(bruto)}</dd><dt>Desconto ({String(orc.desconto).replace(".", ",")}%)</dt><dd className="text-right">−{euros(bruto - T.base)}</dd></>)}
          <dt>Total sem IVA</dt><dd className="text-right">{euros(T.base)}</dd>
          {T.mo > 0 && (<><dt>IVA a 6% (sobre {euros(T.mo)})</dt><dd className="text-right">{euros(T.ivaMo)}</dd></>)}
          {T.mat > 0 && (<><dt>IVA a 23% (sobre {euros(T.mat)})</dt><dd className="text-right">{euros(T.ivaMat)}</dd></>)}
          <dt className="border-t pt-1 text-base font-semibold" style={{ borderColor: primaria }}>Total com IVA</dt>
          <dd className="break-words border-t pt-1 text-right text-base font-semibold" style={{ borderColor: primaria, fontFamily: titulos }}>{euros(T.total)}</dd>
        </dl>
        {tpl?.show_terms !== false && tpl?.terms_conditions && <p className="whitespace-pre-line text-sm"><b>Termos e condições. </b>{tpl.terms_conditions}</p>}
        {tpl?.thank_you_message && <p className="whitespace-pre-line">{tpl.thank_you_message}</p>}
      </div>
      {tpl?.footer_text && <p className="whitespace-pre-line border-t px-4 py-2 text-sm opacity-80" style={{ borderColor: cor(tpl.secondary_color) }}>{tpl.footer_text}</p>}
    </article>
  );
}
