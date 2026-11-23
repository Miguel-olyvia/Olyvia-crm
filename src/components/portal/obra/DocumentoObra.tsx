// Os blocos da obra no documento do template (a proposta no portal do cliente): 01 O que vamos fazer, 02 Materiais e escolhas,
// 04 Planeamento, 05 Pagamento, 06 Condições e 07 Aceitação. A 03 é o orçamento do próprio template (as linhas dos orçamentos).
// Só apresentação: os dados vêm de dadosObra.ts (propostaDaVista). O estilo é o dos cartões do documento do template.
import type { ReactNode } from "react";
import { Check, Package, Palette, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { COR_FASE } from "@/emylia/fasesObra";
import { formatarData } from "@/portal-i18n/formato";
import { traduzirEm } from "@/portal-i18n/traduzirEm";
import type { PortalIdioma } from "@/portal-i18n/tipos";
import type { PropostaObra } from "./dadosObra";
import type { CapaObra, OrcamentoObra } from "./capaEOrcamento";
import { CapaDaObra, OrcamentoDetalhadoObra } from "./CapaEOrcamentoObra";
import { dataCurtaEm, diasUteis, garantiaDe, momentoDaPrestacao, nomeDaFase, nomeDoGrupo, numero, rotuloDaEscolha, textoDoMotor } from "./textosObra";

type T = ReturnType<typeof traduzirEm>["t"];

export interface DocumentoObraProps {
  dados: PropostaObra;
  idioma?: PortalIdioma;
  /** A cor principal do template (os números das secções). */
  cor?: string;
  /** 23/11: o «03 Orçamento detalhado» da Emylia, só quando não há o orçamento do template (o passo «Proposta» antes da proposta real). */
  orcamento?: OrcamentoObra | null;
}

/** Um bloco numerado do documento ("01 · O que vamos fazer"). */
export function BlocoObra({ n, titulo, cor, children }: { n: number; titulo: string; cor?: string; children: ReactNode }) {
  const id = `doc-obra-${n}`;
  return (
    <Card aria-labelledby={id}>
      <CardHeader className="pb-3">
        <h2 id={id} className="flex items-baseline gap-3 text-lg font-semibold tracking-tight">
          <span className="text-sm font-semibold tabular-nums" style={{ color: cor }}>{String(n).padStart(2, "0")}</span>{titulo}
        </h2>
      </CardHeader>
      <CardContent className="space-y-4 text-[15px]">{children}</CardContent>
    </Card>
  );
}

const Rotulo = ({ children, icone }: { children: ReactNode; icone?: ReactNode }) => (
  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{icone}{children}</p>
);

function OQueVamosFazer({ dados, t }: { dados: PropostaObra; t: T }) {
  return (
    <>
      <p className="text-muted-foreground">
        {dados.pedido ?? t("pc.docObra.fazer.modelo", { modelo: dados.modelo })} {t("pc.docObra.fazer.fases")}
      </p>
      <ol className="space-y-5">
        {dados.fases.map((f) => (
          <li key={f.fase} className="break-inside-avoid">
            <p className="flex items-center gap-2 font-semibold">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_FASE[f.fase] }} aria-hidden="true" />
              <span className="text-muted-foreground">{t("pc.docObra.fase.rotulo", { n: f.fase })} ·</span> {nomeDaFase(t, f.fase)}
            </p>
            <div className="ml-[5px] mt-2 space-y-3 border-l pl-5">
              {f.grupos.map((g) => (
                <div key={g.k}>
                  <Rotulo>{nomeDoGrupo(t, g.k)}</Rotulo>
                  <ul className="mt-1 space-y-0.5">
                    {g.itens.map((x) => (
                      <li key={x.nome}>{textoDoMotor(t, x.nome)}{x.det && <span className="text-muted-foreground"> · {textoDoMotor(t, x.det)}</span>}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

const ListaMateriais = ({ titulo, itens }: { titulo: string; itens: { k: string; nome: string; det: string }[] }) => (
  <div>
    <Rotulo icone={<Package className="h-3.5 w-3.5" aria-hidden="true" />}>{titulo}</Rotulo>
    <ul className="mt-1 grid gap-x-8 sm:grid-cols-2">
      {itens.map((x) => (
        <li key={x.k} className="flex items-baseline justify-between gap-3 border-b py-2">
          <span className="min-w-0">{x.nome}</span>
          {x.det && <span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-muted-foreground">{x.det}</span>}
        </li>
      ))}
    </ul>
  </div>
);

function MateriaisEscolhas({ dados, t }: { dados: PropostaObra; t: T }) {
  const M = dados.materiais;
  const poupa = M.fornecidos.reduce((a, x) => a + x.poupa, 0);
  const escolhidos = M.escolhidos.length ? M.escolhidos : M.nec.map((n) => ({ k: n, nome: n, det: "" }));
  return (
    <>
      {M.mats.length > 0 && <ListaMateriais titulo={t("pc.docObra.mat.incluidos")} itens={M.mats} />}
      {escolhidos.length > 0 && <ListaMateriais titulo={t("pc.docObra.mat.escolhidos")} itens={escolhidos} />}
      {M.fornecidos.length > 0 && (
        <div>
          <Rotulo icone={<UserRound className="h-3.5 w-3.5" aria-hidden="true" />}>{t("pc.docObra.grupo.cliente")}</Rotulo>
          <ul className="mt-1 divide-y">
            {M.fornecidos.map((x) => (
              <li key={x.nome} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0">{x.nome}{x.det && <span className="block text-sm text-muted-foreground">{x.det}</span>}</span>
                {x.poupa > 0 && <span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-emerald-700">{t("pc.docObra.mat.poupa", { valor: formatCurrency(x.poupa) })}</span>}
              </li>
            ))}
          </ul>
          {poupa > 0 && <p className="mt-1 text-right text-sm text-muted-foreground">{t("pc.docObra.mat.poupaTotal", { valor: formatCurrency(poupa) })}</p>}
        </div>
      )}
      {M.escolhas.length > 0 && (
        <div>
          <Rotulo icone={<Palette className="h-3.5 w-3.5" aria-hidden="true" />}>{t("pc.docObra.mat.escolhas")}</Rotulo>
          <dl className="mt-1 divide-y">
            {M.escolhas.map((x) => (
              <div key={x.k} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="flex items-center gap-1.5">{!x.v && <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" />}{rotuloDaEscolha(t, x.k, x.l)}</dt>
                {x.v && <dd className="text-right font-medium">{x.v}</dd>}
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  );
}

function Planeamento({ dados, t, idioma }: { dados: PropostaObra; t: T; idioma: PortalIdioma }) {
  const P = dados.planeamento!;
  const dia = (d: Date) => dataCurtaEm(d, idioma);
  return (
    <>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {P.fases.map((f) => <span key={f.n} className="h-full border-r-2 border-background last:border-r-0" style={{ width: `${(f.dias / P.diasTotal) * 100}%`, background: COR_FASE[f.n] }} />)}
      </div>
      <ol className="grid gap-2 sm:grid-cols-2">
        {P.fases.map((f) => (
          <li key={f.n} className="flex gap-3 rounded-lg border p-3">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_FASE[f.n] }} aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-medium">{f.n}. {nomeDaFase(t, f.n)}</span>
              <span className="block text-sm text-muted-foreground">
                {f.de === f.ate ? dia(f.de) : t("pc.docObra.plan.periodo", { de: dia(f.de), ate: dia(f.ate) })} · {diasUteis(t, f.dias)}
              </span>
              <span className="block text-sm text-muted-foreground">{f.tarefas.join(", ")}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground">{t("pc.docObra.plan.resumo", { inicio: dia(P.inicio), fim: dia(P.fim) })}</p>
    </>
  );
}

function Pagamento({ dados, t, idioma }: { dados: PropostaObra; t: T; idioma: PortalIdioma }) {
  return (
    <>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{t("pc.docObra.titulo.pagamento")}</caption>
        <thead className="sr-only">
          <tr><th scope="col">{t("pc.docObra.pag.momento")}</th><th scope="col">{t("pc.docObra.pag.percentagem")}</th><th scope="col">{t("pc.docObra.pag.valor")}</th></tr>
        </thead>
        <tbody>
          {dados.prestacoes.map((p, i) => (
            <tr key={`${p.l}-${i}`} className="border-b last:border-b-0">
              <td className="py-2 pr-3">
                {momentoDaPrestacao(t, p.l)}
                {p.data && <span className="text-muted-foreground"> · {t("pc.docObra.pag.previsto", { data: dataCurtaEm(p.data, idioma) })}</span>}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{numero(Math.round(p.p * 1000) / 10)}%</td>
              <td className="py-2 text-right font-medium tabular-nums">{formatCurrency(p.v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-muted-foreground">{t("pc.docObra.pag.texto")}</p>
    </>
  );
}

function Condicoes({ dados, t, idioma }: { dados: PropostaObra; t: T; idioma: PortalIdioma }) {
  const C = dados.condicoes;
  return (
    <ul className="list-disc space-y-1 pl-5">
      <li>{t("pc.docObra.cond.prazo", { prazo: diasUteis(t, C.prazo) })}</li>
      <li>{t("pc.docObra.cond.garantia", { garantia: garantiaDe(t, C.garantia) })}</li>
      <li>{t("pc.docObra.cond.validade", { data: formatarData(C.validaAte, idioma, "longo") })}</li>
      <li>{t("pc.docObra.cond.extra")}</li>
      {C.notas && <li>{C.notas}</li>}
    </ul>
  );
}

function Aceitacao({ dados, t }: { dados: PropostaObra; t: T }) {
  const A = dados.aceitacao;
  const linhas: [string, string][] = [
    [t("pc.docObra.aceit.empresa", { empresa: A.empresa }), A.comercial ?? A.empresa],
    [t("pc.docObra.aceit.cliente"), A.cliente],
  ];
  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        {linhas.map(([q, nome]) => (
          <div key={q} className="pt-6">
            <div className="border-t pt-2">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{q}</p>
              <p className="font-medium">{nome}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{A.aceite ? t("pc.docObra.aceit.aceite", { data: A.aceite }) : t("pc.docObra.aceit.pode")}</p>
    </>
  );
}

/** Os blocos da obra, pela ordem do documento da Emylia (a 03 é o orçamento do template, que vem antes). */
/** 23/11: a carta e o resumo da capa (onde o template não escreve o cabeçalho), para o documento do template pôr no topo (prop capaObra). */
export function CapaDoDocumento({ capa, idioma = "pt" }: { capa: CapaObra; idioma?: PortalIdioma }) {
  const { idioma: lingua, t } = traduzirEm(idioma);
  return <CapaDaObra capa={capa} t={t} idioma={lingua} />;
}

export function DocumentoObra({ dados, idioma = "pt", cor, orcamento }: DocumentoObraProps) {
  const { idioma: lingua, t } = traduzirEm(idioma);
  const M = dados.materiais;
  const temMateriais = M.mats.length + M.escolhidos.length + M.nec.length + M.fornecidos.length + M.escolhas.length > 0;
  return (
    <section aria-label={t("pc.docObra.aria")} className="space-y-5" data-testid="documento-obra">
      {dados.fases.length > 0 && <BlocoObra n={1} titulo={t("pc.docObra.titulo.fazer")} cor={cor}><OQueVamosFazer dados={dados} t={t} /></BlocoObra>}
      {temMateriais && <BlocoObra n={2} titulo={t("pc.docObra.titulo.materiais")} cor={cor}><MateriaisEscolhas dados={dados} t={t} /></BlocoObra>}
      {orcamento && orcamento.grupos.length > 0 && <BlocoObra n={3} titulo={t("pc.docObra.titulo.orcamento")} cor={cor}><OrcamentoDetalhadoObra orc={orcamento} t={t} /></BlocoObra>}
      {dados.planeamento && <BlocoObra n={4} titulo={t("pc.docObra.titulo.planeamento")} cor={cor}><Planeamento dados={dados} t={t} idioma={lingua} /></BlocoObra>}
      <BlocoObra n={5} titulo={t("pc.docObra.titulo.pagamento")} cor={cor}><Pagamento dados={dados} t={t} idioma={lingua} /></BlocoObra>
      <BlocoObra n={6} titulo={t("pc.docObra.titulo.condicoes")} cor={cor}><Condicoes dados={dados} t={t} idioma={lingua} /></BlocoObra>
      <BlocoObra n={7} titulo={t("pc.docObra.titulo.aceitacao")} cor={cor}><Aceitacao dados={dados} t={t} /></BlocoObra>
    </section>
  );
}
