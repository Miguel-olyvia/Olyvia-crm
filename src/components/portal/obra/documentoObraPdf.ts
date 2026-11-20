// O documento da obra para os PDFs (19/11/2026): os mesmos blocos que o ecrã do portal mostra (DocumentoObra.tsx e
// ClausulasObra.tsx), já com as palavras no idioma do documento, num modelo simples (blocos, partes, itens) que dois
// desenhadores consomem sem saber de idiomas: o react-pdf da proposta (src/components/pdf/ObraPDFDocument.tsx) e o HTML
// acrescentado ao contrato (clausulasObraHtml). Os dados vêm de dadosObra.ts; as palavras de textosObra.ts e do dicionário
// pc.docObra.*. Dinheiro e números não mudam com o idioma (formatCurrency: €1.234,50).
import { formatCurrency } from "@/lib/utils";
import { COR_FASE } from "@/emylia/fasesObra";
import { formatarData } from "@/portal-i18n/formato";
import { traduzirEm } from "@/portal-i18n/traduzirEm";
import type { PortalIdioma } from "@/portal-i18n/tipos";
import type { ContratoObra, PropostaObra } from "./dadosObra";
import {
  CLAUSULAS, dataCurtaEm, diasUteis, garantiaDe, momentoDaPrestacao, nomeDaFase, nomeDoGrupo, numero, rotuloDaEscolha, textoDaClausula, textoDoMotor,
} from "./textosObra";

type T = ReturnType<typeof traduzirEm>["t"];

/** Uma linha de uma lista: o texto, as notas por baixo (discretas), os valores à direita (alinhados) e uma cor de marca. */
export interface ItemPdf { texto: string; notas?: string[]; valores?: string[]; cor?: string }

export type PartePdf =
  | { tipo: "texto"; texto: string; discreto?: boolean }
  | { tipo: "lista"; titulo?: string; itens: ItemPdf[]; marcadores?: boolean }
  | { tipo: "fase"; titulo: string; cor: string; grupos: { titulo: string; itens: ItemPdf[] }[] }
  | { tipo: "barra"; segmentos: { cor: string; fracao: number }[] }
  | { tipo: "assinaturas"; itens: { quem: string; nome: string }[] }
  | { tipo: "secao"; titulo: string; etiqueta?: string; corpo: string | string[] };

/** Um bloco do documento: o número (01, 02, ...; null nas cláusulas do contrato), o título e as partes. */
export interface BlocoPdf { n: number | null; titulo: string; partes: PartePdf[] }

export interface DocumentoObraPdf { idioma: PortalIdioma; titulo: string; blocos: BlocoPdf[] }

const COR_OMISSAO = "#6b7280";
const corDaFase = (n: number): string => COR_FASE[n] ?? COR_OMISSAO;

function blocoFazer(d: PropostaObra, t: T): BlocoPdf {
  const intro = `${d.pedido ?? t("pc.docObra.fazer.modelo", { modelo: d.modelo })} ${t("pc.docObra.fazer.fases")}`;
  return {
    n: 1, titulo: t("pc.docObra.titulo.fazer"),
    partes: [
      { tipo: "texto", texto: intro, discreto: true },
      ...d.fases.map((f): PartePdf => ({
        tipo: "fase", titulo: `${t("pc.docObra.fase.rotulo", { n: f.fase })} · ${nomeDaFase(t, f.fase)}`, cor: corDaFase(f.fase),
        grupos: f.grupos.map((g) => ({
          titulo: nomeDoGrupo(t, g.k),
          itens: g.itens.map((x) => ({ texto: textoDoMotor(t, x.nome), notas: x.det ? [textoDoMotor(t, x.det)] : undefined })),
        })),
      })),
    ],
  };
}

function blocoMateriais(d: PropostaObra, t: T): BlocoPdf | null {
  const M = d.materiais;
  if (M.mats.length + M.escolhidos.length + M.nec.length + M.fornecidos.length + M.escolhas.length === 0) return null;
  const escolhidos = M.escolhidos.length ? M.escolhidos : M.nec.map((n) => ({ k: n, nome: n, det: "" }));
  const lista = (titulo: string, itens: { nome: string; det: string }[]): PartePdf =>
    ({ tipo: "lista", titulo, itens: itens.map((x) => ({ texto: x.nome, valores: x.det ? [x.det] : undefined })) });
  const partes: PartePdf[] = [];
  if (M.mats.length) partes.push(lista(t("pc.docObra.mat.incluidos"), M.mats));
  if (escolhidos.length) partes.push(lista(t("pc.docObra.mat.escolhidos"), escolhidos));
  if (M.fornecidos.length) {
    partes.push({
      tipo: "lista", titulo: t("pc.docObra.grupo.cliente"),
      itens: M.fornecidos.map((x) => ({
        texto: x.nome, notas: x.det ? [x.det] : undefined, valores: x.poupa > 0 ? [t("pc.docObra.mat.poupa", { valor: formatCurrency(x.poupa) })] : undefined,
      })),
    });
    const poupa = M.fornecidos.reduce((a, x) => a + x.poupa, 0);
    if (poupa > 0) partes.push({ tipo: "texto", texto: t("pc.docObra.mat.poupaTotal", { valor: formatCurrency(poupa) }), discreto: true });
  }
  if (M.escolhas.length) {
    partes.push({
      tipo: "lista", titulo: t("pc.docObra.mat.escolhas"),
      itens: M.escolhas.map((x) => ({ texto: rotuloDaEscolha(t, x.k, x.l), valores: x.v ? [x.v] : undefined })),
    });
  }
  return { n: 2, titulo: t("pc.docObra.titulo.materiais"), partes };
}

function blocoPlaneamento(d: PropostaObra, t: T, idioma: PortalIdioma): BlocoPdf | null {
  const P = d.planeamento;
  if (!P) return null;
  const dia = (x: Date) => dataCurtaEm(x, idioma);
  return {
    n: 4, titulo: t("pc.docObra.titulo.planeamento"),
    partes: [
      { tipo: "barra", segmentos: P.fases.map((f) => ({ cor: corDaFase(f.n), fracao: P.diasTotal > 0 ? f.dias / P.diasTotal : 0 })) },
      {
        tipo: "lista",
        itens: P.fases.map((f) => ({
          texto: `${f.n}. ${nomeDaFase(t, f.n)}`, cor: corDaFase(f.n),
          notas: [
            `${f.de === f.ate ? dia(f.de) : t("pc.docObra.plan.periodo", { de: dia(f.de), ate: dia(f.ate) })} · ${diasUteis(t, f.dias)}`,
            ...(f.tarefas.length ? [f.tarefas.join(", ")] : []),
          ],
        })),
      },
      { tipo: "texto", texto: t("pc.docObra.plan.resumo", { inicio: dia(P.inicio), fim: dia(P.fim) }), discreto: true },
    ],
  };
}

function blocoPagamento(d: PropostaObra, t: T, idioma: PortalIdioma): BlocoPdf {
  return {
    n: 5, titulo: t("pc.docObra.titulo.pagamento"),
    partes: [
      {
        tipo: "lista",
        itens: d.prestacoes.map((p) => ({
          texto: momentoDaPrestacao(t, p.l),
          notas: p.data ? [t("pc.docObra.pag.previsto", { data: dataCurtaEm(p.data, idioma) })] : undefined,
          valores: [`${numero(Math.round(p.p * 1000) / 10)}%`, formatCurrency(p.v)],
        })),
      },
      { tipo: "texto", texto: t("pc.docObra.pag.texto"), discreto: true },
    ],
  };
}

function blocoCondicoes(d: PropostaObra, t: T, idioma: PortalIdioma): BlocoPdf {
  const C = d.condicoes;
  const linhas = [
    t("pc.docObra.cond.prazo", { prazo: diasUteis(t, C.prazo) }),
    t("pc.docObra.cond.garantia", { garantia: garantiaDe(t, C.garantia) }),
    t("pc.docObra.cond.validade", { data: formatarData(C.validaAte, idioma, "longo") }),
    t("pc.docObra.cond.extra"),
    ...(C.notas ? [C.notas] : []),
  ];
  return { n: 6, titulo: t("pc.docObra.titulo.condicoes"), partes: [{ tipo: "lista", marcadores: true, itens: linhas.map((texto) => ({ texto })) }] };
}

function blocoAceitacao(d: PropostaObra, t: T): BlocoPdf {
  const A = d.aceitacao;
  return {
    n: 7, titulo: t("pc.docObra.titulo.aceitacao"),
    partes: [
      {
        tipo: "assinaturas",
        itens: [
          { quem: t("pc.docObra.aceit.empresa", { empresa: A.empresa }), nome: A.comercial ?? A.empresa },
          { quem: t("pc.docObra.aceit.cliente"), nome: A.cliente },
        ],
      },
      { tipo: "texto", texto: A.aceite ? t("pc.docObra.aceit.aceite", { data: A.aceite }) : t("pc.docObra.aceit.pode"), discreto: true },
    ],
  };
}

/** Os blocos da proposta (01, 02, 04, 05, 06, 07: a 03 é o orçamento, que já vem nas páginas dos orçamentos), pela ordem do ecrã. */
export function propostaObraPdf(dados: PropostaObra, idioma: PortalIdioma = "pt"): DocumentoObraPdf {
  const { idioma: lingua, t } = traduzirEm(idioma);
  const blocos = [
    dados.fases.length > 0 ? blocoFazer(dados, t) : null,
    blocoMateriais(dados, t),
    blocoPlaneamento(dados, t, lingua),
    blocoPagamento(dados, t, lingua),
    blocoCondicoes(dados, t, lingua),
    blocoAceitacao(dados, t),
  ].filter((b): b is BlocoPdf => b !== null);
  return { idioma: lingua, titulo: t("pc.docObra.aria"), blocos };
}

/** As cláusulas do negócio e as adendas assinadas (o que o ecrã do contrato mostra por baixo da minuta). */
export function contratoObraPdf(dados: ContratoObra, idioma: PortalIdioma = "pt"): DocumentoObraPdf {
  const { idioma: lingua, t } = traduzirEm(idioma);
  const C = dados.clausulas, A = dados.adendas;
  const clausulas: BlocoPdf = {
    n: null, titulo: t("pc.docObra.ct.titulo"),
    partes: CLAUSULAS.map(({ titulo, chave }, i): PartePdf => {
      const revista = C.revistas[titulo];
      return {
        tipo: "secao", titulo: t("pc.docObra.ct.clausula", { n: i + 1, titulo: t(chave) }),
        etiqueta: revista ? t("pc.docObra.ct.revista") : undefined,
        corpo: revista ?? textoDaClausula(titulo, C, t, lingua),
      };
    }),
  };
  const blocos: BlocoPdf[] = [clausulas];
  if (A) {
    blocos.push({
      n: null, titulo: t("pc.docObra.ad.titulo"),
      partes: [
        { tipo: "texto", texto: t("pc.docObra.ad.texto"), discreto: true },
        {
          tipo: "lista",
          itens: A.adendas.map((x) => ({
            texto: `${x.n} · ${x.trabalhos.join(", ")}`,
            notas: [
              t("pc.docObra.ad.linha", { total: formatCurrency(x.total), dias: diasUteis(t, x.dias, "+"), motivo: x.motivo.toLowerCase() }),
              x.assinada ? t("pc.docObra.ad.assinadaEm", { data: x.assinada }) : t("pc.docObra.ad.assinada"),
            ],
          })),
        },
        {
          tipo: "lista",
          itens: [
            { texto: t("pc.docObra.ad.contrato"), valores: [formatCurrency(A.contrato)] },
            { texto: A.adendas.length === 1 ? t("pc.docObra.ad.uma") : t("pc.docObra.ad.varias", { n: A.adendas.length }), valores: [`+${formatCurrency(A.somaAdendas)}`] },
            { texto: t("pc.docObra.ad.valorTotal"), valores: [formatCurrency(A.total)] },
          ],
        },
      ],
    });
  }
  return { idioma: lingua, titulo: t("pc.docObra.ct.titulo"), blocos };
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function itemHtml(x: ItemPdf): string {
  const notas = (x.notas ?? []).map((n) => `<br><span style="color:#6b7280">${esc(n)}</span>`).join("");
  const valores = x.valores?.length ? ` <span style="float:right">${x.valores.map(esc).join(" &nbsp; ")}</span>` : "";
  return `<li>${esc(x.texto)}${valores}${notas}</li>`;
}

function parteHtml(p: PartePdf): string {
  switch (p.tipo) {
    case "texto":
      return `<p${p.discreto ? ' style="color:#6b7280"' : ""}>${esc(p.texto)}</p>`;
    case "lista":
      return `${p.titulo ? `<p><strong>${esc(p.titulo)}</strong></p>` : ""}<ul${p.marcadores ? "" : ' style="list-style:none;padding-left:0"'}>${p.itens.map(itemHtml).join("")}</ul>`;
    case "secao": {
      const etiqueta = p.etiqueta ? ` <em style="color:#6b7280">(${esc(p.etiqueta)})</em>` : "";
      const corpo = Array.isArray(p.corpo)
        ? `<ul>${p.corpo.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
        : esc(p.corpo).split("\n").map((l) => `<p>${l}</p>`).join("");
      return `<h3>${esc(p.titulo)}${etiqueta}</h3>${corpo}`;
    }
    case "fase":
      return `<h3>${esc(p.titulo)}</h3>${p.grupos.map((g) => parteHtml({ tipo: "lista", titulo: g.titulo, itens: g.itens })).join("")}`;
    case "assinaturas":
      return p.itens.map((a) => `<p>${esc(a.quem)}: <strong>${esc(a.nome)}</strong></p>`).join("");
    case "barra":
      return "";
  }
}

/** O documento em HTML simples (sem scripts; o PDF do contrato ainda o passa pelo DOMPurify), para acrescentar ao corpo do
 *  contrato SÓ na apresentação do PDF: o corpo gravado (contract_body_html e o congelado na assinatura) não muda. */
export function documentoObraHtml(doc: DocumentoObraPdf): string {
  const blocos = doc.blocos.map((b) => {
    const numeroB = b.n === null ? "" : `${String(b.n).padStart(2, "0")} · `;
    return `<h2>${esc(numeroB + b.titulo)}</h2>${b.partes.map(parteHtml).join("")}`;
  }).join("");
  // Começa numa página nova (o html2pdf do contrato respeita page-break-before em modo "css").
  return `<section data-doc-obra="contrato" lang="${doc.idioma}" style="page-break-before:always">${blocos}</section>`;
}
