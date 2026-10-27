// A página única de uma campanha da V2, sem separadores: Resumo (números e funil) · Formulário (editor na linha e pré-visualização) ·
// Onde anuncia (anúncios com investimento) · Leads (só leitura) · Partilhar (link, iframe ou pixel). As submissões por rever aparecem
// num aviso no topo, com Aceitar e Rejeitar na linha. Tudo em memória (campanhasStore.ts).
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Inbox, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Estado, Negocio } from "../motor";
import {
  MODOS_PARTILHA, ONDE_ANUNCIAR, PASSOS_FUNIL, TIPOS_CAMPO, camposPorJuntar, codigoPartilha, leadsDaCampanha, metricas, moverCampo,
  type Campanha, type CampoForm, type ModoPartilha, type PrimeiroToque, type TipoCampo,
} from "./campanhas";
import { aceitarSubmissao, mudarCampanha, rejeitarSubmissao } from "./campanhasStore";
import { Chips, FOCO, ICONE_CANAL, euros } from "./pecasMarketing";
import { Chip, numero } from "../pecas";

const CAIXA = "rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]";
const BTN_ICONE = cn("grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-muted disabled:opacity-40", FOCO);

function Seccao({ id, titulo, texto, children }: { id: string; titulo: string; texto?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="text-xl font-semibold tracking-tight">{titulo}</h2>
      {texto && <p className="mt-1 text-[15px] text-muted-foreground">{texto}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/* ---------------------------------------------------------------- Resumo */

function Resumo({ c, S, negocios }: { c: Campanha; S: Estado; negocios: Parametros["negocios"] }) {
  const m = metricas(c, negocios, S);
  const max = Math.max(1, m.funil[0]);
  const numeros: [string, string][] = [
    ["Leads", String(m.leads)], ["Ganhos", String(m.ganhos)], ["Receita", euros(m.receita)],
    ["Investimento", m.investimento ? euros(m.investimento) : "—"], ["Custo por lead", m.custoLead === null ? "—" : euros(m.custoLead)],
    ["Custo por ganho", m.custoGanho === null ? "—" : euros(m.custoGanho)],
  ];
  return (
    <div className={cn(CAIXA, "p-4 sm:p-5")}>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {numeros.map(([r, v]) => (
          <div key={r}><dt className="text-[15px] text-muted-foreground">{r}</dt><dd className="text-xl font-semibold tabular-nums">{v}</dd></div>
        ))}
      </dl>
      <h3 className="mt-6 text-base font-medium" id={`funil-${c.id}`}>Funil</h3>
      <ol className="mt-2 grid gap-2" aria-labelledby={`funil-${c.id}`}>
        {PASSOS_FUNIL.map((p, i) => (
          <li key={p} className="grid grid-cols-[6rem_1fr_3rem] items-center gap-3 text-[15px]">
            <span>{p}</span>
            <span className="h-3 rounded-full bg-muted" aria-hidden="true">
              <span className="block h-full rounded-full bg-muted-foreground/50" style={{ width: `${(m.funil[i] / max) * 100}%` }} />
            </span>
            <span className="text-right tabular-nums">{m.funil[i]}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[15px] text-muted-foreground">A receita soma os orçamentos dos negócios ganhos desta campanha; não se escreve à mão.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- Formulário */

function Formulario({ c }: { c: Campanha }) {
  const mudar = (campos: CampoForm[]) => mudarCampanha(c.id, (x) => ({ ...x, campos }));
  const set = (i: number, p: Partial<CampoForm>) => mudar(c.campos.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const porJuntar = camposPorJuntar(c.campos);
  const [juntar, setJuntar] = useState("");
  return (
    <>
      <ol className={cn(CAIXA, "divide-y divide-border px-3 sm:px-4")} aria-label="Campos do formulário">
        {c.campos.map((f, i) => (
          <li key={f.id} className="flex flex-wrap items-center gap-2 py-3">
            <span className="min-w-[8rem] flex-1 text-[15px] font-medium">{f.rotulo}</span>
            <label className="sr-only" htmlFor={`${f.id}-tipo`}>Tipo de "{f.rotulo}"</label>
            <select id={`${f.id}-tipo`} value={f.tipo} onChange={(e) => set(i, { tipo: e.target.value as TipoCampo })}
              className={cn("h-11 rounded-lg border border-input bg-background px-2 text-[15px]", FOCO)}>
              {TIPOS_CAMPO.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <label className="flex min-h-11 items-center gap-2 px-1 text-[15px]">
              <input type="checkbox" className="h-5 w-5" checked={f.obrigatorio} onChange={(e) => set(i, { obrigatorio: e.target.checked })} />
              Obrigatório
            </label>
            <span className="flex">
              <button type="button" className={BTN_ICONE} disabled={i === 0} aria-label={`Subir "${f.rotulo}"`} onClick={() => mudar(moverCampo(c.campos, i, -1))}><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" className={BTN_ICONE} disabled={i === c.campos.length - 1} aria-label={`Descer "${f.rotulo}"`} onClick={() => mudar(moverCampo(c.campos, i, 1))}><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" className={BTN_ICONE} aria-label={`Tirar "${f.rotulo}"`} onClick={() => mudar(c.campos.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
            </span>
          </li>
        ))}
        {c.campos.length === 0 && <li className="py-4 text-[15px] text-muted-foreground">O formulário não tem campos.</li>}
      </ol>
      {porJuntar.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor={`${c.id}-juntar`} className="text-[15px] font-medium">Juntar campo</label>
          <select id={`${c.id}-juntar`} value={juntar} onChange={(e) => setJuntar(e.target.value)} className={cn("h-11 rounded-lg border border-input bg-background px-2 text-[15px]", FOCO)}>
            <option value="">Escolher…</option>
            {porJuntar.map((d) => <option key={d.rotulo} value={d.rotulo}>{d.rotulo}</option>)}
          </select>
          <Button type="button" variant="outline" className="h-11 text-[15px]" disabled={!juntar} onClick={() => {
            const d = porJuntar.find((x) => x.rotulo === juntar);
            if (!d) return;
            mudar([...c.campos, { ...d, opcoes: d.opcoes ? [...d.opcoes] : undefined, id: `${c.id}-f${Date.now().toString(36)}${c.campos.length}` }]);
            setJuntar("");
          }}><Plus aria-hidden="true" />Juntar</Button>
        </div>
      )}
      <h3 className="mt-6 text-base font-medium" id={`${c.id}-previa`}>Pré-visualização</h3>
      <div className={cn(CAIXA, "mt-2 p-4 sm:p-5")} role="group" aria-labelledby={`${c.id}-previa`}>
        <p className="text-base font-semibold">{c.nome}</p>
        <div className="mt-3 grid gap-3">
          {c.campos.map((f) => (
            <div key={f.id} className="grid gap-1">
              <span className="text-[15px]">{f.rotulo}{f.obrigatorio && " *"}</span>
              {f.tipo === "escolha" ? (
                <span className="flex h-11 items-center rounded-lg border border-input px-3 text-[15px] text-muted-foreground">{(f.opcoes ?? ["Escolher…"]).join(" · ")}</span>
              ) : (
                <span className={cn("rounded-lg border border-input", f.tipo === "texto_longo" ? "h-20" : "h-11")} />
              )}
            </div>
          ))}
          <span className="mt-1 inline-flex h-11 w-fit items-center rounded-lg border border-input px-4 text-[15px]">Enviar pedido</span>
        </div>
        <p className="mt-3 text-[15px] text-muted-foreground">* obrigatório. É assim que o cliente vê o formulário.</p>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Onde anuncia */

function OndeAnuncia({ c }: { c: Campanha }) {
  const mudar = (anuncios: Campanha["anuncios"]) => mudarCampanha(c.id, (x) => ({ ...x, anuncios }));
  return (
    <>
      {c.anuncios.length > 0 ? (
        <ul className={cn(CAIXA, "divide-y divide-border px-3 sm:px-4")}>
          {c.anuncios.map((a, i) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="min-w-[10rem] flex-1">
                <span className="block text-[15px] font-medium">{a.onde}</span>
                <span className="block text-[15px] text-muted-foreground">{a.nome}</span>
              </span>
              <label className="flex items-center gap-2 text-[15px]">
                <span>Investimento</span>
                <input key={`${a.id}:${a.investimento}`} type="number" inputMode="decimal" min="0" step="any" defaultValue={a.investimento}
                  className={cn("h-11 w-28 rounded-lg border border-input bg-background px-3 text-right text-[15px]", FOCO)}
                  onBlur={(e) => { const n = numero(e.target.value); if (!isNaN(n) && n >= 0 && n !== a.investimento) mudar(c.anuncios.map((x, j) => (j === i ? { ...x, investimento: n } : x))); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                <span>€</span>
              </label>
              <button type="button" className={BTN_ICONE} aria-label={`Tirar o anúncio "${a.nome}"`} onClick={() => mudar(c.anuncios.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn(CAIXA, "p-4 text-[15px] text-muted-foreground")}>Ainda não anuncia em lado nenhum: as leads chegam pelo formulário ou à mão, sem investimento.</p>
      )}
      <div className="mt-3">
        <p className="text-[15px] font-medium" id={`${c.id}-novo-an`}>Juntar anúncio em</p>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby={`${c.id}-novo-an`}>
          {ONDE_ANUNCIAR.map((o) => (
            <button key={o} type="button" className={cn("min-h-11 rounded-full border border-input bg-card px-4 text-[15px] hover:bg-muted", FOCO)}
              onClick={() => mudar([...c.anuncios, { id: `${c.id}-an${Date.now().toString(36)}${c.anuncios.length}`, onde: o, nome: `Anúncio ${c.anuncios.filter((x) => x.onde === o).length + 1}`, investimento: 0 }])}>
              {o}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Leads */

function Leads({ c, S, negocios }: { c: Campanha; S: Estado; negocios: Parametros["negocios"] }) {
  const leads = leadsDaCampanha(c, negocios, S);
  if (!leads.length) return <p className={cn(CAIXA, "p-4 text-[15px] text-muted-foreground")}>Ainda não há leads desta campanha.</p>;
  return (
    <ul className={cn(CAIXA, "divide-y divide-border px-3 sm:px-4")} aria-label={`Leads de ${c.nome}`}>
      {leads.map((l) => (
        <li key={l.id} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 py-2 text-[15px]">
          <span className="min-w-[10rem] flex-1 font-medium">{l.nome}</span>
          <span className="text-muted-foreground">{l.fase}</span>
          <span className="w-24 text-right tabular-nums">{l.valor === null ? "—" : euros(l.valor)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- Partilhar */

function Partilhar({ c }: { c: Campanha }) {
  const [modo, setModo] = useState<ModoPartilha>("link");
  const [msg, setMsg] = useState("");
  const codigo = codigoPartilha(c, modo);
  const area = useRef<HTMLTextAreaElement>(null);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      setMsg("Copiado.");
    } catch {
      area.current?.select();
      setMsg("Não deu para copiar sozinho: o texto ficou selecionado, use Ctrl+C.");
    }
  };
  const atual = MODOS_PARTILHA.find((m) => m.id === modo)!;
  return (
    <div className={cn(CAIXA, "grid gap-4 p-4 sm:p-5")}>
      <Chips rotulo="Como partilhar" opcoes={MODOS_PARTILHA} valor={modo} escolher={(m) => { setModo(m); setMsg(""); }} />
      <p className="text-[15px] text-muted-foreground">{atual.texto}</p>
      <label className="grid gap-1.5">
        <span className="sr-only">Código a copiar ({atual.nome})</span>
        <textarea ref={area} readOnly value={codigo} rows={modo === "link" ? 1 : 3}
          className={cn("w-full resize-none rounded-lg border border-input bg-background p-3 font-mono text-[15px]", FOCO)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" className="h-11 text-[15px]" onClick={copiar}><Copy aria-hidden="true" />Copiar</Button>
        <span role="status" className="text-[15px]">{msg}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Por rever */

function PorRever({ c }: { c: Campanha }) {
  if (!c.pendentes.length) return null;
  const n = c.pendentes.length;
  return (
    <section aria-labelledby={`${c.id}-rever`} className={cn(CAIXA, "mt-6 p-4 sm:p-5")}>
      <h2 id={`${c.id}-rever`} className="flex items-center gap-3 text-base font-semibold">
        <Chip icone={Inbox} cor="bg-amber-100 text-amber-800" />
        {n} {n === 1 ? "submissão por rever" : "submissões por rever"}
      </h2>
      <p className="mt-1 text-[15px] text-muted-foreground">Chegaram pelo formulário e ainda não são leads. Aceite as verdadeiras; rejeite o lixo e os testes.</p>
      <ul className="mt-2 divide-y divide-border">
        {c.pendentes.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="min-w-[12rem] flex-1 text-[15px]">
              <span className="block font-medium">{s.nome} · {s.tel}</span>
              <span className="block text-muted-foreground">{s.resumo} · {s.quando}</span>
            </span>
            <Button type="button" variant="outline" className="h-11 text-[15px]" aria-label={`Aceitar ${s.nome}`} onClick={() => aceitarSubmissao(c.id, s.id)}>Aceitar</Button>
            <Button type="button" variant="ghost" className="h-11 text-[15px]" aria-label={`Rejeitar ${s.nome}`} onClick={() => rejeitarSubmissao(c.id, s.id)}>Rejeitar</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- a página */

interface Parametros {
  S: Estado;
  c: Campanha;
  negocios: readonly { deal: Negocio; toque: PrimeiroToque | undefined }[];
  voltar: () => void;
}

export function CampanhaV2({ S, c, negocios, voltar }: Parametros) {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titulo.current?.focus(); }, [c.id]);
  const ic = ICONE_CANAL[c.canal];
  const anuncia = c.anuncios.length ? [...new Set(c.anuncios.map((a) => a.onde))].join(", ") : "sem anúncios";
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <button type="button" onClick={voltar} className={cn("-ml-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-[15px] hover:bg-muted", FOCO)}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Campanhas
      </button>
      <header className="mt-3 flex items-center gap-4">
        <Chip icone={ic.i} cor={ic.cor} className="h-11 w-11" />
        <div>
          <h1 ref={titulo} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">{c.nome}</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">Canal: {c.canal} · {anuncia}{c.nova && " · criada agora"}</p>
        </div>
      </header>
      <nav aria-label="Secções da campanha" className="mt-4 flex flex-wrap gap-x-1 text-[15px]">
        {[["resumo", "Resumo"], ["formulario", "Formulário"], ["onde", "Onde anuncia"], ["leads", "Leads"], ["partilhar", "Partilhar"]].map(([id, n]) => (
          <a key={id} href={`#${c.id}-${id}`} className={cn("inline-flex min-h-11 items-center rounded-lg px-3 underline-offset-4 hover:bg-muted hover:underline", FOCO)}>{n}</a>
        ))}
      </nav>
      <PorRever c={c} />
      <Seccao id={`${c.id}-resumo`} titulo="Resumo"><Resumo c={c} S={S} negocios={negocios} /></Seccao>
      <Seccao id={`${c.id}-formulario`} titulo="Formulário" texto="O que o cliente preenche. Mudar aqui muda o formulário público desta campanha.">
        <Formulario c={c} />
      </Seccao>
      <Seccao id={`${c.id}-onde`} titulo="Onde anuncia" texto="Cada anúncio é uma colocação paga desta campanha, com o seu investimento. O custo por lead e por ganho vem daqui.">
        <OndeAnuncia c={c} />
      </Seccao>
      <Seccao id={`${c.id}-leads`} titulo="Leads" texto="As pessoas que entraram por esta campanha (pelo primeiro contacto). Só leitura: esta lista é o filtro da campanha.">
        <Leads c={c} S={S} negocios={negocios} />
      </Seccao>
      <Seccao id={`${c.id}-partilhar`} titulo="Partilhar"><Partilhar c={c} /></Seccao>
    </div>
  );
}
