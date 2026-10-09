// Protótipo de Negócios (08/10/2026): as 12 screens a funcionar com dados de
// exemplo. Rota pública, fora do CRM: não usa a sessão nem a base de dados.
import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import "./prototipo.css";
import {
  ESTR, FASES, LINHAS, PAPEIS, SLOTS, TECS, DIAS, VERSAO,
  aberto, acoes, alertas, bloqueado, conflitos, custoUn, eur, fatorReal, linhaCalc, minhas, nfmt, partes, pct, proximo, r2, seed, tot,
  type Aviso, type Estado, type LinhaId, type MedKey, type Negocio, type Papel, type SvcId, type Vista,
} from "./motor";
import {
  AREA, CONTACTO, ESCOLHAS, EXTERIOR, FINANCEIRO, INTERIOR, LEAD, OBRA, PAPEL_ROT, PROPOSTA,
  contagem, visivel, type Def, type Grupo,
} from "./campos";

const CHAVE = "olyvia-prototipo-negocios";

function ler(): Estado {
  try {
    const j = JSON.parse(localStorage.getItem(CHAVE) || "null");
    if (j && j.v === VERSAO) return j as Estado;
  } catch {
    /* sem storage: começa do zero */
  }
  return seed();
}

interface Toast extends Aviso { id: number }

export default function PrototipoNegocios() {
  const ref = useRef<Estado>(ler());
  const S = ref.current;
  const [, redesenhar] = useReducer((x: number) => x + 1, 0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [q, setQ] = useState("");
  const mainRef = useRef<HTMLElement>(null);
  const tid = useRef(0);

  const guardar = useCallback(() => {
    try { localStorage.setItem(CHAVE, JSON.stringify(ref.current)); } catch { /* ignora */ }
  }, []);

  // corre uma mudança, grava e desenha; volta ao topo quando muda de ecrã
  const run = useCallback((fn: () => void) => {
    const antes = ref.current.view + ":" + ref.current.deal + ":" + ref.current.op;
    fn();
    guardar();
    redesenhar();
    const depois = ref.current.view + ":" + ref.current.deal + ":" + ref.current.op;
    if (antes !== depois && mainRef.current) mainRef.current.scrollTop = 0;
  }, [guardar]);

  const avisar = useCallback((a: Aviso) => {
    const mostra = () => {
      const id = ++tid.current;
      setToasts((t) => [...t, { ...a, id }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), a.act ? 8000 : 5200);
    };
    if (a.atraso) setTimeout(mostra, a.atraso); else mostra();
  }, []);

  const A = useMemo(() => acoes(S, avisar, run), [S, avisar, run]);
  const go = (fn: () => void) => () => run(fn);

  // o "pulse" faz scroll até à secção e acende-a uma vez
  useEffect(() => {
    const alvo = ref.current.pulse;
    if (!alvo) return;
    ref.current.pulse = null;
    document.getElementById(alvo)?.scrollIntoView({ behavior: "smooth", block: alvo === "verif" ? "center" : "start" });
  });
  useEffect(() => { S.deals.forEach((d) => (d.fresh = false)); });

  useEffect(() => {
    const prev = document.title;
    document.title = "Olyvia · Protótipo de Negócios";
    return () => { document.title = prev; };
  }, []);

  const repor = () => run(() => {
    try { localStorage.removeItem(CHAVE); } catch { /* ignora */ }
    ref.current = seed();
    avisar({ msg: "Demonstração reposta", sub: "Todos os negócios voltaram ao início", kind: "ok" });
  });

  const ctx: Ctx = { S, A, run, go, q, repor };
  let corpo: ReactNode;
  switch (S.view) {
    case "hoje": corpo = <Hoje {...ctx} />; break;
    case "negocio": corpo = S.deal && S.deals.some((d) => d.id === S.deal) ? <PaginaNegocio {...ctx} /> : <Negocios {...ctx} />; break;
    case "operacoes": corpo = <Operacoes {...ctx} />; break;
    case "inventario": corpo = <Inventario {...ctx} />; break;
    case "catalogo": corpo = <Catalogo {...ctx} />; break;
    case "clientes": corpo = <Clientes {...ctx} />; break;
    case "marketing": corpo = <Marketing />; break;
    case "definicoes": corpo = <Definicoes {...ctx} />; break;
    default: corpo = <Negocios {...ctx} />;
  }

  const n = minhas(S, S.role).length;
  const itens: [Vista, string, number?][] = [["hoje", "Hoje", n], ["negocios", "Negócios"], ["clientes", "Clientes"], ["operacoes", "Operações"], ["inventario", "Inventário"], ["catalogo", "Catálogo e custos"], ["marketing", "Marketing"]];
  const cur = S.view === "negocio" ? "negocios" : S.view;

  return (
    <div className="pn">
      <div className="shell">
        <nav className="side" aria-label="Menu">
          <div className="logo">oly<em>v</em>ia</div>
          {itens.map(([v, l, c]) => (
            <button key={v} className={cur === v ? "on" : ""} onClick={go(() => A.nav(v))}>
              {l}{c ? <small>{c}</small> : null}
            </button>
          ))}
          <span className="sp" />
          <button className={cur === "definicoes" ? "on" : ""} onClick={go(() => A.nav("definicoes"))}>Definições</button>
          <a className="maq" href="/prototipo/maquetas.html" target="_blank" rel="noreferrer">Maquetas das 12 screens ↗</a>
          <p className="proto">Protótipo com dados de exemplo. Nada é gravado na Olyvia.</p>
        </nav>
        <div className="right">
          <div className="top">
            <input
              className="search" type="search" placeholder="Procurar negócio, cliente ou telefone" aria-label="Procurar"
              value={q}
              onChange={(e) => { setQ(e.target.value); if (S.view !== "negocios") run(() => { S.view = "negocios"; S.deal = null; }); }}
            />
            <div className="who">
              <label htmlFor="pn-role">A ver como</label>
              <select id="pn-role" value={S.role} onChange={(e) => run(() => A.role(e.target.value as Papel))}>
                {(Object.keys(PAPEIS) as Papel[]).map((k) => <option key={k} value={k}>{PAPEIS[k].n}</option>)}
              </select>
              <span className="av">{PAPEIS[S.role].av}</span>
            </div>
          </div>
          <main ref={mainRef}>{corpo}</main>
        </div>
      </div>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={"toast " + (t.kind || "")} role="status">
            <i>{t.kind === "ok" ? "✓" : t.kind === "auto" ? "⚡" : t.kind === "bad" ? "!" : "i"}</i>
            <div>{t.msg}{t.sub ? <small>{t.sub}</small> : null}</div>
            {t.act ? <button onClick={() => { t.act!.fn(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>{t.act.label}</button> : <span />}
          </div>
        ))}
      </div>
    </div>
  );
}

interface Ctx {
  S: Estado;
  A: ReturnType<typeof acoes>;
  run: (fn: () => void) => void;
  go: (fn: () => void) => () => void;
  q: string;
  repor: () => void;
}

/* ------------------------------------------------------------------ peças */
function Btn({ children, onClick, cls = "", disabled }: { children: ReactNode; onClick?: () => void; cls?: string; disabled?: boolean }) {
  return <button className={"btn " + cls} onClick={onClick} disabled={disabled}>{children}</button>;
}

// Campo que grava ao sair (ou com Enter), como o "change" do protótipo.
function Campo({ id, value, onCommit, readOnly, placeholder, className, type, ariaLabel, min, step }: {
  id: string; value: string | number; onCommit: (v: string) => void; readOnly?: boolean; placeholder?: string; className?: string; type?: string; ariaLabel?: string; min?: string; step?: string;
}) {
  return (
    <input
      key={id + ":" + value}
      id={id} defaultValue={value} readOnly={readOnly} placeholder={placeholder} className={className} type={type} aria-label={ariaLabel} min={min} step={step}
      onBlur={(e) => { if (!readOnly && e.target.value !== String(value)) onCommit(e.target.value); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}
const numero = (v: string) => parseFloat(String(v).replace(",", "."));

function Banner({ A, go, texto }: { A: Ctx["A"]; go: Ctx["go"]; texto: string }) {
  return (
    <div className="banner">
      <b>Como experimentar:</b> abra a <button className="link" onClick={go(() => A.abrir(1043))}>Ana Martins</button> {texto}
    </div>
  );
}

/* ------------------------------------------------------------------ Hoje */
function Hoje({ S, A, go }: Ctx) {
  const r = S.role, L = minhas(S, r);
  const ab = aberto(S);
  const emProp = ab.filter((d) => d.fase === 3 && d.orc);
  const val = emProp.reduce((a, d) => a + tot(d, S).pf, 0);
  const mm = emProp.length ? emProp.reduce((a, d) => a + tot(d, S).m, 0) / emProp.length : 0;
  return (
    <>
      <div className="row">
        <div><h1 className="h1">Bom dia, {PAPEIS[r].nome}</h1><div className="sub">{PAPEIS[r].n} · quinta, 08/10</div></div>
        {L.length ? <span className="pill warn">{L.length} por tratar</span> : <span className="pill ok">Tudo em dia</span>}
      </div>
      {r === "direcao" && (
        <div className="kpis">
          <div className="kpi"><span>Negócios abertos</span><b>{ab.length}</b></div>
          <div className="kpi"><span>Em fase Negócio</span><b>{eur(val)} €</b></div>
          <div className="kpi"><span>Margem média prevista</span><b>{pct(mm)}</b></div>
          <div className="kpi"><span>Obras em curso</span><b>{ab.filter((d) => d.fase === 5 && d.obra.plano && d.obra.plano.estado === "em curso").length}</b></div>
        </div>
      )}
      <Banner A={A} go={go} texto={'e siga o botão do próximo passo. Alguns passos são de outros papéis: mude em "A ver como", no canto de cima.'} />
      <div className="card">
        <h3>O que tenho para fazer <span>{L.length}</span></h3>
        {L.length ? L.map(({ d, p, dir }) => (
          <div className="item" key={d.id}>
            <div className="t" onClick={go(() => A.abrir(d.id))}>
              <b>{d.nome} · {d.servico}</b><small>{p.t}{p.sub ? " · " + p.sub : ""}</small>
            </div>
            {dir ? (
              <div className="row"><Btn cls="sec sm" onClick={go(() => A.recusarAprov(d.id))}>Recusar</Btn><Btn cls="sm" onClick={go(() => A.aprovar(d.id))}>Aprovar</Btn></div>
            ) : p.btn ? <Btn cls="sm" onClick={go(() => fazer(A, p.act!, d.id))}>{p.btn}</Btn> : null}
          </div>
        )) : <p className="empty">Nada por tratar. Mude de papel em cima para ver o trabalho dos outros.</p>}
      </div>
    </>
  );
}

// Os botões de "próximo passo" chamam a ação pelo nome.
function fazer(A: Ctx["A"], act: string, id: number) {
  const f = (A as unknown as Record<string, (id: number) => void>)[act];
  if (f) f(id);
}

/* ------------------------------------------------------------------ Negócios */
function Negocios({ S, A, go, run, q }: Ctx) {
  const f = S.filtro;
  const ql = q.toLowerCase();
  let ds = aberto(S).filter((d) => !ql || (d.nome + " " + d.tel + " " + d.servico + " " + d.local).toLowerCase().includes(ql));
  if (f === "meus") ds = ds.filter((d) => d.dono === "comercial");
  if (f === "wc") ds = ds.filter((d) => d.linha === "wc");
  if (f === "coz") ds = ds.filter((d) => d.linha === "coz");
  if (f === "atraso") ds = ds.filter((d) => d.atraso);
  const totalProp = aberto(S).filter((d) => d.fase === 3 && d.orc).reduce((a, d) => a + tot(d, S).pf, 0);
  const chip = (k: string, l: string) => <button key={k} className={"chip " + (f === k ? "on" : "")} onClick={go(() => A.filtro(k))}>{l}</button>;
  return (
    <>
      <div className="row">
        <div><h1 className="h1">Negócios</h1><div className="sub">{aberto(S).length} abertos · {eur(totalProp)} € em fase Negócio</div></div>
        <Btn onClick={go(() => A.novo())}>+ Novo negócio</Btn>
      </div>
      <div className="chips">{chip("meus", "Os meus")}{chip("todos", "Todos")}{chip("wc", "Casa de banho")}{chip("coz", "Cozinha")}{chip("atraso", "Com atraso")}</div>
      <Banner A={A} go={go} texto={'e siga o botão do próximo passo, da lead à obra. Alguns passos são de outros papéis: mude em "A ver como", no canto de cima.'} />
      <div className="kb">
        {FASES.map((fn, i) => {
          const cards = ds.filter((d) => d.fase === i);
          const nv = i === 0 && S.novo ? <NovoCartao key="novo" S={S} A={A} run={run} /> : null;
          return (
            <div className="col" key={fn}>
              <h4>{fn} <span>{cards.length}</span></h4>
              {nv}
              {cards.map((d) => {
                const p = proximo(d, S);
                const val = d.orc ? ` · ${eur(tot(d, S).pf)} €` : "";
                const vd = d.orc && d.orc.vendaDireta ? " · venda direta" : "";
                const cls = d.atraso && d.fase === 0 ? "late" : p.wait ? "wait" : "";
                return (
                  <button key={d.id} className={"kc " + (d.fresh ? "flash" : "")} onClick={go(() => A.abrir(d.id))}>
                    <b>{d.nome}</b>
                    <small>{d.servico}{d.local ? " · " + d.local.split(",").pop()!.trim() : ""}{val}{vd}</small>
                    <span className={"nx " + cls}>{p.t}{d.atraso && d.fase === 0 ? " · há 2 dias" : ""}</span>
                  </button>
                );
              })}
              {!cards.length && !nv && <span className="empty">Sem negócios</span>}
            </div>
          );
        })}
      </div>
      <p className="sub">Os cartões não se arrastam: a fase muda quando acontece o facto (chamada registada, visita marcada, contrato assinado, pagamento validado).</p>
    </>
  );
}

function NovoCartao({ S, A, run }: Pick<Ctx, "S" | "A" | "run">) {
  const [nome, setNome] = useState(S.novo!.nome);
  const [tel, setTel] = useState(S.novo!.tel);
  const [linha, setLinha] = useState<LinhaId>(S.novo!.linha);
  const criar = () => run(() => A.novoCriar(nome, tel, linha));
  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") criar();
    if (e.key === "Escape") run(() => A.novoCancel());
  };
  return (
    <div className="newc">
      <div className="f"><label htmlFor="nv-nome">Nome</label><input id="nv-nome" autoFocus autoComplete="off" value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={teclas} /></div>
      <div className="f"><label htmlFor="nv-tel">Telefone ou email</label><input id="nv-tel" autoComplete="off" value={tel} onChange={(e) => setTel(e.target.value)} onKeyDown={teclas} /></div>
      <div className="f">
        <label htmlFor="nv-linha">Linha de serviço</label>
        <select id="nv-linha" value={linha} onChange={(e) => setLinha(e.target.value as LinhaId)}><option value="wc">Casa de banho</option><option value="coz">Cozinha</option></select>
      </div>
      {S.novo!.err && <span className="err">{S.novo!.err}</span>}
      <div className="row"><Btn cls="sec sm" onClick={() => run(() => A.novoCancel())}>Cancelar</Btn><Btn cls="sm" onClick={criar}>Criar</Btn></div>
    </div>
  );
}

/* ------------------------------------------------------------------ página do negócio */
function Secao({ S, d, i, titulo, dir, children }: { S: Estado; d: Negocio; i: number; titulo: string; dir?: string; children?: ReactNode }) {
  const st = d.fase > i ? "dn" : d.fase === i ? "cur" : "off";
  const pulse = S.pulse === "sec-" + i ? " pulse" : "";
  return (
    <section className={"sec " + (st === "cur" ? "cur" : st === "off" ? "off" : "") + pulse} id={"sec-" + i}>
      <header>{st === "dn" && <span className="ck">✓</span>}{titulo}<span className="r">{dir || ""}</span></header>
      {st !== "off" && <div className="in">{children}</div>}
    </section>
  );
}

/* ------------------------------------------------------------------ campos das fases */
// Fase atual: campos abertos. Fases feitas: fechados num "ver os campos".
function Fecha({ aberta, n, children }: { aberta?: boolean; n: string; children: ReactNode }) {
  if (aberta) return <>{children}</>;
  return <details className="fxd"><summary>Ver os campos · {n}</summary><div className="fxin">{children}</div></details>;
}

function mostra(c: Def, v: string): string {
  if (!v) return "—";
  if (c.t === "data") { const [y, m, dd] = v.split("-"); return dd ? `${dd}/${m}/${y}` : v; }
  if (c.t === "numero") return v.replace(".", ",") + (c.un ? " " + c.un : "");
  return v;
}

type FxProps = { d: Negocio; A: Ctx["A"]; run: Ctx["run"]; ro: boolean };

function Ficha({ grupos, ...p }: FxProps & { grupos: Grupo[] }) {
  return (
    <>
      {grupos.map((g, gi) => {
        const c = contagem([g], p.d.f);
        return (
          <div className="fx" key={g.titulo || gi}>
            {g.titulo && <h4>{g.titulo}<span>{c.f} de {c.n}</span></h4>}
            {g.nota && <p className="sub">{g.nota}</p>}
            <div className="form3">{g.campos.filter((x) => visivel(x, p.d.f)).map((x) => <CampoFicha key={x.k} c={x} {...p} />)}</div>
          </div>
        );
      })}
    </>
  );
}

function CampoFicha({ c, d, A, run, ro }: FxProps & { c: Def }) {
  const val = d.f[c.k] || "";
  const id = `fx-${c.k}-${d.id}`;
  const set = (x: string) => run(() => A.campo(d.id, c.k, x));
  const tag = c.papel ? <i className={"tg " + c.papel} title={PAPEL_ROT[c.papel]} aria-label={PAPEL_ROT[c.papel]} /> : null;
  const cls = "f" + (c.t === "texto_longo" ? " full" : "");
  if (ro) return <div className={cls}><span>{c.l}{tag}</span><b className="vv">{mostra(c, val)}</b></div>;
  if (c.t === "sim_nao" || c.t === "escolha") {
    const op = c.t === "sim_nao" ? ["Sim", "Não"] : c.op!;
    if (op.length <= 3 && op.join("").length <= 28) return (
      <div className={cls}>
        <span>{c.l}{tag}</span>
        <div className="seg" role="group" aria-label={c.l}>
          {op.map((x) => <button key={x} className={val === x ? "on" : ""} aria-pressed={val === x} onClick={() => set(val === x ? "" : x)}>{x}</button>)}
        </div>
        {c.ajuda && <small className="aj">{c.ajuda}</small>}
      </div>
    );
    return (
      <div className={cls}>
        <label htmlFor={id}>{c.l}{tag}</label>
        <select id={id} value={val} onChange={(e) => set(e.target.value)}><option value="">—</option>{op.map((x) => <option key={x}>{x}</option>)}</select>
        {c.ajuda && <small className="aj">{c.ajuda}</small>}
      </div>
    );
  }
  let ctl: ReactNode;
  if (c.t === "numero") ctl = <span className="un"><Campo id={id} type="number" min="0" step="any" value={val} onCommit={set} />{c.un && <em>{c.un}</em>}</span>;
  else if (c.t === "data") ctl = <input id={id} type="date" value={val} onChange={(e) => set(e.target.value)} />;
  else if (c.t === "texto_longo") ctl = <textarea key={id + val} id={id} rows={2} defaultValue={val} placeholder={c.ph} onBlur={(e) => { if (e.target.value !== val) set(e.target.value); }} />;
  else ctl = <Campo id={id} value={val} placeholder={c.ph} onCommit={set} />;
  return <div className={cls}><label htmlFor={id}>{c.l}{tag}</label>{ctl}{c.ajuda && <small className="aj">{c.ajuda}</small>}</div>;
}

function Legenda() {
  return <div className="legend">{(Object.keys(PAPEL_ROT) as (keyof typeof PAPEL_ROT)[]).map((k) => <span key={k}><i className={"tg " + k} />{PAPEL_ROT[k]}</span>)}</div>;
}

// Os serviços que vão para o orçamento, tirados da visita.
function orcLinhas(d: Negocio, S: Estado): SvcId[] {
  const L = LINHAS[d.linha], v = d.visita;
  return [
    ...L.map.filter(([sid, k]) => v.med[k] > 0 && !v.off.includes(sid)).map(([sid]) => sid),
    ...L.extras.filter((sid) => (v.extra[sid] || 0) > 0 && !!S.svc[sid]),
  ];
}

// Necessidades: os serviços do Catálogo que a obra leva, com a quantidade.
function Necessidades({ S, A, go, run, d }: Ctx & { d: Negocio }) {
  const L = LINHAS[d.linha], v = d.visita, ro = v.fechada;
  const sugestao = (sid: SvcId) => sid === "eletr" ? Number(d.f.diag_pontos_eletricos) || 2 : v.med.pav || 1;
  let total = 0;
  const linha = (sid: SvcId, q: number, on: boolean, origem: ReactNode, toggle: () => void, extra: boolean) => {
    const s = S.svc[sid];
    if (on) total += q * s.preco;
    return (
      <tr key={sid} className={on ? "" : "offr"}>
        <td style={{ width: 34 }}><button className={"tick " + (on ? "on" : "")} aria-pressed={on} aria-label={s.n} disabled={ro} onClick={toggle}>✓</button></td>
        <td>{s.n}<small>{s.perfil} · {nfmt(s.h)} h/{s.un} na receita</small></td>
        <td>{extra && on && !ro
          ? <><Campo id={`ex-${sid}-${d.id}`} ariaLabel={"Quantidade de " + s.n} value={nfmt(q)} onCommit={(x) => run(() => { const n = numero(x); A.extra(d.id, sid, isNaN(n) ? 0 : Math.max(0, n)); })} /> {s.un}</>
          : on ? <>{nfmt(q)} {s.un}</> : <span className="sub">—</span>}
          <small>{origem}</small></td>
        <td className="n">{eur(s.preco)} €/{s.un}</td>
        <td className="n">{on ? eur(q * s.preco) + " €" : ""}</td>
      </tr>
    );
  };
  const rows = [
    ...L.map.map(([sid, k]) => {
      const q = v.med[k] || 0, on = q > 0 && !v.off.includes(sid);
      return linha(sid, q, on, q > 0 ? "das medidas · " + L.med[k]!.replace(/ \(.*\)/, "").toLowerCase() : "falta a medida", () => run(() => A.servico(d.id, sid)), false);
    }),
    ...L.extras.map((sid) => {
      const q = v.extra[sid] || 0;
      return linha(sid, q, q > 0, "juntado na visita", () => run(() => A.extra(d.id, sid, q > 0 ? 0 : sugestao(sid))), true);
    }),
  ];
  return (
    <div className="fx">
      <h4>Necessidades · serviços do Catálogo <span>{orcLinhas(d, S).length} serviços · {eur(total)} € a preço de tabela</span></h4>
      <div className="tw"><table style={{ minWidth: 560 }}>
        <thead><tr><th /><th>Serviço</th><th>Quantidade</th><th className="n">Preço de tabela</th><th className="n">Total</th></tr></thead>
        <tbody>{rows}</tbody>
      </table></div>
      <div className="row">
        <span className="sub">Cada serviço traz a sua receita do Catálogo: mão de obra, equipamentos e consumíveis. Os materiais (louças, cerâmico) entram pelo modelo "{L.modelo}".</span>
        <Btn cls="sec sm" onClick={go(() => A.nav("catalogo"))}>Abrir Catálogo</Btn>
      </div>
    </div>
  );
}

function PaginaNegocio(ctx: Ctx) {
  const { S, A, go, run } = ctx;
  const d = S.deals.find((x) => x.id === S.deal)!;
  const p = proximo(d, S), L = LINHAS[d.linha], r = S.role, o = d.orc;
  const meu = !!p.who && p.who === r;
  const T = o ? tot(d, S) : null;

  let nextBtn: ReactNode = null;
  if (p.btn) nextBtn = meu
    ? <Btn cls="big" onClick={go(() => fazer(A, p.act!, d.id))}>{p.btn}</Btn>
    : (
      <div style={{ display: "grid", gap: 4, justifyItems: "end" }}>
        <Btn cls="big" disabled>{p.btn}</Btn>
        <button className="link" onClick={go(() => A.role(p.who as Papel))}>Mudar para {PAPEIS[p.who as Papel].n}</button>
      </div>
    );
  if (p.sim) nextBtn = (
    <div className="row">
      <span className="sub">Simular o cliente:</span>
      {p.sim === "aceitar"
        ? <><Btn cls="sec" onClick={go(() => A.recusar(d.id))}>Recusou</Btn><Btn onClick={go(() => A.aceitar(d.id))}>Aceitou</Btn></>
        : <Btn onClick={go(() => A.assinar(d.id))}>Assinou</Btn>}
    </div>
  );
  if (p.wait && p.who === "direcao") nextBtn = <button className="link" onClick={go(() => A.role("direcao"))}>Mudar para Direção</button>;

  const v = d.visita, vro = v.fechada;
  const fx = { d, A, run };
  const conta = (gs: Grupo[]) => { const c = contagem(gs, d.f); return `${c.f} de ${c.n} campos`; };
  const VISITA = [EXTERIOR, INTERIOR, AREA, ESCOLHAS];
  const contrato = o && o.vendaDireta ? [] : PROPOSTA.slice(1);
  const cli = S.clientes.find((c) => c.deal === d.id);

  return (
    <>
      <button className="back" onClick={go(() => A.nav("negocios"))}>← Negócios</button>
      <div className="dhead">
        <div className="row">
          <div>
            <h1 className="h1">{d.servico}{d.local ? " · " + d.local.split(",").pop()!.trim() : ""}</h1>
            <div className="sub">{d.nome} · {d.tel} · linha: {L.n} · comercial: Rúben</div>
          </div>
          <div className="row">
            {T && <span className="pill pri">{eur(T.pf)} € · margem {pct(T.m)}</span>}
            {d.fase < 4 && !d.perdido && <Btn cls="sec sm" onClick={go(() => A.perder(d.id))}>Marcar perdido</Btn>}
          </div>
        </div>
        {S.confirmPerda === d.id && (
          <div className="confirm">
            <b>Marcar como perdido?</b><span>Sai do quadro, mas fica no histórico.</span>
            <Btn cls="sec sm" onClick={go(() => A.perderNao())}>Cancelar</Btn><Btn cls="bad sm" onClick={go(() => A.perderSim(d.id))}>Marcar perdido</Btn>
          </div>
        )}
        <div className="phz">
          {FASES.map((f, i) => (
            <button key={f} className={d.fase > i ? "d" : d.fase === i ? "on" : ""} onClick={() => document.getElementById("sec-" + i)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{f}</button>
          ))}
        </div>
      </div>
      <div className={"next " + (p.done ? "done" : "")}>
        <div>
          <small>{p.done ? "Concluído" : "Próximo passo"}{p.who && p.who !== "cliente" && !p.done ? " · " + PAPEIS[p.who].n.split("·").pop()!.trim() : ""}</small>
          <b>{p.t}</b><span className="sub">{p.sub || ""}</span>
        </div>
        {nextBtn}
      </div>
      <div className="withside">
        <div className="stack">
          <Secao S={S} d={d} i={0} titulo="Lead" dir={`${d.origem} · ${d.quando} · ${conta(LEAD)}`}>
            <Fecha aberta={d.fase <= 1} n={conta(LEAD)}>
              <div className="fx">
                <h4>Quem pede</h4>
                <div className="form3">
                  <div className="f"><label htmlFor={`ld-nome-${d.id}`}>Nome</label><Campo id={`ld-nome-${d.id}`} value={d.nome} readOnly={d.fase > 1} onCommit={(x) => run(() => { if (x.trim()) d.nome = x.trim(); })} /></div>
                  <div className="f"><label htmlFor={`ld-tel-${d.id}`}>Telefone</label><Campo id={`ld-tel-${d.id}`} value={d.tel} readOnly={d.fase > 1} onCommit={(x) => run(() => { if (x.trim()) d.tel = x.trim(); })} /></div>
                  <div className="f"><span>Linha de serviço</span><b className="vv">{L.n}</b></div>
                </div>
              </div>
              <Ficha {...fx} grupos={LEAD} ro={d.fase > 1} />
            </Fecha>
          </Secao>
          <Secao S={S} d={d} i={1} titulo="Contacto" dir={(d.fase > 1 && v.slot ? "visita marcada · " : d.fase === 1 ? "em curso · " : "") + conta(CONTACTO)}>
            <Fecha aberta={d.fase === 1} n={conta(CONTACTO)}>
              <Ficha {...fx} grupos={CONTACTO} ro={d.fase > 1} />
            </Fecha>
            {d.fase === 1 && (
              <div className="f">Vagas do Rúben em {d.f.localidade || (d.local || "").split(",").pop() || "—"}
                <div className="slots">{SLOTS.map((s) => <button key={s} className="chip" onClick={go(() => A.marcarVisita(d.id, s))}>{s}</button>)}</div>
              </div>
            )}
            {d.fase === 1 && <span className="sub">Grava sozinho ao sair do campo. Os campos são todos opcionais por agora.</span>}
          </Secao>
          <Secao S={S} d={d} i={2} titulo="Visita" dir={(v.slot ? v.slot + " · " : "") + conta(VISITA)}>
            <Fecha aberta={!vro} n={conta(VISITA) + " · " + (orcLinhas(d, S).length) + " serviços"}>
              <Legenda />
              <Ficha {...fx} grupos={[EXTERIOR, INTERIOR]} ro={vro} />
              <Ficha {...fx} grupos={[AREA]} ro={vro} />
              <div className="fx">
                <h4>Medidas da área <span>dão as quantidades dos serviços</span></h4>
                <div className="form4">
                  {(Object.entries(L.med) as [MedKey, string][]).map(([k, l]) => (
                    <div className="f" key={k}>
                      <label htmlFor={`med-${k}-${d.id}`}>{l}</label>
                      <Campo id={`med-${k}-${d.id}`} className="num" type="number" min="0" step="0.5" value={v.med[k] || ""} readOnly={vro}
                        onCommit={(x) => run(() => { const n = numero(x); v.med[k] = isNaN(n) ? 0 : n; })} />
                    </div>
                  ))}
                </div>
              </div>
              <Necessidades {...ctx} d={d} />
              <div className="fx">
                <h4>Equipamentos pedidos</h4>
                <div className="chips">{L.nec.map((x) => <button key={x} className={"chip " + (v.nec.includes(x) ? "on" : "")} disabled={vro} onClick={go(() => A.nec(d.id, x))}>{x}</button>)}</div>
              </div>
              <Ficha {...fx} grupos={[ESCOLHAS]} ro={vro} />
              <div className="fx">
                <h4>Fotografias</h4>
                <div className="row">
                  <span className="sub">{v.fotos} fotos da área{vro ? "" : " · no telemóvel tira-se com a câmara, antes de sentar com o cliente"}</span>
                  {!vro && <Btn cls="sec sm" onClick={go(() => A.foto(d.id))}>+ Foto</Btn>}
                </div>
                <Ficha {...fx} grupos={[{ titulo: "", campos: [{ k: "diag_cliente_recusou_fotos", l: "O cliente não quis fotografias", t: "sim_nao" }] }]} ro={vro} />
              </div>
            </Fecha>
            {!vro && d.fase === 2 && <span className="sub">Ao fechar o levantamento, o orçamento nasce com estes serviços e quantidades, e os custos vêm do Catálogo.</span>}
          </Secao>
          <Secao S={S} d={d} i={3} titulo="Negócio" dir={o ? (o.enviada ? "proposta enviada" : "orçamento, proposta e contrato") : "orçamento, proposta e contrato"}>
            {o && <Orcamento {...ctx} d={d} />}
            {o && (
              <Fecha aberta={d.fase === 3} n={conta([PROPOSTA[0], ...contrato])}>
                <Ficha {...fx} grupos={[PROPOSTA[0]]} ro={!!o.enviada} />
                <Ficha {...fx} grupos={contrato} ro={!!o.contrato} />
              </Fecha>
            )}
          </Secao>
          <Secao S={S} d={d} i={4} titulo="Financeiro" dir={"fatura e recibo · " + conta(FINANCEIRO)}>
            <div className="withside">
              <div className="tw"><table><thead><tr><th>Documento</th><th>Estado</th><th className="n">Valor s/ IVA</th></tr></thead><tbody>
                <tr>
                  <td>{d.fin.fatura ? d.fin.fatura.n : "Fatura"}<small>{d.fin.fatura ? "emitida " + d.fin.fatura.q + " · enviada ao portal do cliente" : "por emitir · só o Financeiro emite"}</small></td>
                  <td>{d.fin.pago ? <span className="pill ok">Paga</span> : d.fin.fatura ? <span className="pill warn">Por pagar</span> : <span className="pill mut">Por emitir</span>}</td>
                  <td className="n">{T ? eur(T.pf) : ""}</td>
                </tr>
                <tr>
                  <td>{d.fin.recibo ? d.fin.recibo.n : "Recibo"}<small>{d.fin.recibo ? "emitido " + d.fin.recibo.q : "emitido ao validar o pagamento"}</small></td>
                  <td>{d.fin.recibo ? <span className="pill ok">Emitido</span> : <span className="pill mut">Ainda não</span>}</td>
                  <td className="n" />
                </tr>
              </tbody></table></div>
              <div className="card">
                <h3>Ao emitir o recibo</h3>
                <div className="trig">
                  <div><i className={d.fin.recibo ? "on" : ""}>1</i><span><b>Inventário</b><small>confirma os materiais e cria a encomenda ao fornecedor, se faltar algo</small></span></div>
                  <div><i className={d.fin.recibo ? "on" : ""}>2</i><span><b>Operações</b><small>gera o plano da obra com os técnicos do RH</small></span></div>
                  <div><i className={d.fin.recibo ? "on" : ""}>3</i><span><b>Cliente</b><small>recebe o recibo no portal</small></span></div>
                </div>
                <span className="sub">Por agora a validação é interna. Quando o portal aceitar pagamentos, passa a ser automática.</span>
              </div>
            </div>
            <Fecha aberta={d.fase === 4} n={conta(FINANCEIRO)}>
              <Ficha {...fx} grupos={FINANCEIRO} ro={d.fase !== 4} />
            </Fecha>
          </Secao>
          <Secao S={S} d={d} i={5} titulo="Obra" dir={d.fase === 5 ? d.obra.plano!.estado + " · " + conta(OBRA) : ""}>
            {d.fase === 5 && <ObraResumo {...ctx} d={d} />}
            {d.fase === 5 && (
              <Fecha aberta n={conta(OBRA)}>
                <Ficha {...fx} grupos={OBRA} ro={false} />
              </Fecha>
            )}
          </Secao>
        </div>
        <div className="stack">
          <div className="card">
            <h3>Cliente {cli && <span className="pill ok">em Clientes</span>}</h3>
            <div className="kv">
              <span>Nome</span><b>{d.nome}</b><span>Telefone</span><b>{d.tel}</b>
              {d.f.email && <><span>Email</span><b style={{ fontWeight: 500 }}>{d.f.email}</b></>}
              <span>Morada da obra</span><b style={{ fontWeight: 500 }}>{d.f.morada ? `${d.f.morada}, ${d.f.localidade || ""}` : d.local || "—"}</b>
              {d.f.imovel && <><span>Imóvel</span><b style={{ fontWeight: 500 }}>{d.f.imovel}{d.f.tipologia ? " " + d.f.tipologia : ""}</b></>}
              <span>Origem</span><b style={{ fontWeight: 500 }}>{d.f.origem || d.origem}</b>
              {d.f.pref && <><span>Contactar por</span><b style={{ fontWeight: 500 }}>{d.f.pref}{d.f.hora ? " · " + d.f.hora.toLowerCase() : ""}</b></>}
            </div>
          </div>
          <div className="card">
            <h3>Histórico <span>{d.hist.length}</span></h3>
            <div className="tl">
              {d.hist.map((h, i) => (
                <div key={i}><i className={h.k === "x" ? "x" : h.k === "w" ? "w" : h.t.startsWith("Passou") ? "a" : ""} /><span>{h.t}<small>{h.q}</small></span></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Orcamento({ S, A, go, run, d }: Ctx & { d: Negocio }) {
  const o = d.orc!, T = tot(d, S), locked = !!o.enviada;
  const pt = partes(d, S), mw = Math.max(0, Math.min(1, T.m / 0.5));
  const mcls = T.m < S.cfg.min / 100 ? "bad" : T.m < S.cfg.alvo / 100 - 0.005 ? "warn" : "ok";
  const mudou = () => { d.orc!.aprov = null; d.fresh = false; };
  const AL = o.verif && !locked ? alertas(d, S) : [];
  const nX = AL.filter((a) => a.k === "x").length, nW = AL.filter((a) => a.k === "w").length;
  const okLinhas = ["Nenhuma linha abaixo do custo", "Todas as linhas têm custo no Catálogo"].filter((_, i) => !AL.some((a) => (i === 0 ? a.t.startsWith("Preço abaixo") : false)));

  return (
    <>
      <div className="row">
        <span className="sub">Orçamento v1 · modelo "{o.modelo}" · medidas da visita</span>
        <label className="row" style={{ gap: 6, fontSize: 12.5 }}>
          <input type="checkbox" checked={o.vendaDireta} disabled={locked}
            onChange={(e) => { const val = e.target.checked; run(() => A.vendaDireta(d.id, val)); }} />
          {" "}Venda direta (sem contrato)
        </label>
      </div>
      <div className="withside">
        <div className="stack">
          <div className="tw"><table style={{ minWidth: 560 }}>
            <thead><tr><th>Serviço</th><th>Medida</th><th className="n">Custo</th><th className="n">Preço/un.</th><th className="n">Margem</th></tr></thead>
            <tbody>
              {o.linhas.map((l, i) => {
                const x = linhaCalc(l, S);
                const m = x.preco > 0 ? (x.preco - x.custo) / x.preco : 0;
                const cls = m < S.cfg.min / 100 ? "bad" : m < S.cfg.alvo / 100 - 0.005 ? "warn" : "ok";
                if (l.t === "mat") return (
                  <tr key={i}><td>Materiais<small>{l.d} · do modelo</small></td><td className="sub">—</td><td className="n">{eur(x.custo)}</td><td className="n">{eur(x.preco)}</td><td className="n"><span className={"pill " + cls}>{pct(m)}</span></td></tr>
                );
                const s = x.s!, novo = r2(custoUn(s, S));
                const mud = !locked && Math.abs(novo - l.cu) > 0.004;
                return (
                  <tr key={i} className={cls === "bad" ? "hl" : ""}>
                    <td>{s.n}<small>custo {eur(l.cu)} €/{s.un} do Catálogo{mud && <> · <button className="link" onClick={go(() => A.recalc(d.id, i))}>Catálogo mudou: usar {eur(novo)}</button></>}</small></td>
                    <td><Campo id={`lq-${d.id}-${i}`} ariaLabel="Medida" value={nfmt(l.q)} readOnly={locked} onCommit={(v) => run(() => { const n = numero(v); if (!isNaN(n) && n >= 0) { l.q = n; mudou(); } })} /> {s.un}</td>
                    <td className="n">{eur(x.custo)}</td>
                    <td className="n"><Campo id={`lp-${d.id}-${i}`} ariaLabel="Preço unitário" value={eur(l.pu)} readOnly={locked}
                      onCommit={(v) => run(() => { const n = numero(v.replace(/\./g, "")); if (!isNaN(n) && n >= 0) { l.pu = n; mudou(); } })} /><small>{eur(x.preco)} €</small></td>
                    <td className="n"><span className={"pill " + cls}>{pct(m)}</span></td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={3}>Desconto</td>
                <td className="n"><Campo id={`desc-${d.id}`} ariaLabel="Desconto em percentagem" value={nfmt(o.desconto)} readOnly={locked}
                  onCommit={(v) => run(() => { const n = numero(v); o.desconto = isNaN(n) ? 0 : Math.max(0, Math.min(50, n)); mudou(); })} /> %</td>
                <td />
              </tr>
              <tr className="sum"><td>Total sem IVA</td><td>{nfmt(T.h)} h</td><td className="n">{eur(T.custo)}</td><td className="n">{eur(T.pf)}</td><td className="n">{pct(T.m)}</td></tr>
            </tbody>
          </table></div>
          {o.verif && !locked && (
            <div className={"card " + (S.pulse === "verif" ? "sec pulse" : "")} id="verif" style={{ borderColor: "var(--pri-line)" }}>
              <h3>Verificar antes de enviar <span>{nX} bloqueio(s) · {nW} aviso(s)</span></h3>
              <div className="al">
                {AL.map((a, k) => (
                  <div key={k} className={a.k}>
                    <i>!</i><span><b>{a.t}</b><small>{a.d}</small></span>
                    <span className="acts">
                      {a.sug != null && <Btn cls="sm" onClick={go(() => A.sugerido(d.id, a.i!, a.sug!))}>Usar {eur(a.sug)} €</Btn>}
                      {a.go && <Btn cls="sec sm" onClick={go(() => A.nav(a.go!))}>Abrir Catálogo</Btn>}
                      {a.key && <Btn cls="sec sm" onClick={go(() => A.vistoAviso(d.id, a.key!))}>Visto</Btn>}
                    </span>
                  </div>
                ))}
                {okLinhas.map((t) => <div key={t} className="o"><i>✓</i><span><b>{t}</b></span><span /></div>)}
              </div>
              {bloqueado(d, S) && AL.filter((a) => a.k === "x").every((a) => a.aprov) && (
                o.aprov === "pedida"
                  ? <div className="note">Pedido de aprovação enviado à Direção. Fica registado quem aprovou.</div>
                  : <div className="row"><span className="sub">Quer mesmo enviar assim? É preciso aprovação.</span><Btn cls="sec sm" onClick={go(() => A.pedirAprov(d.id))}>Pedir aprovação à Direção</Btn></div>
              )}
              {o.aprov === "ok" && <div className="note" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}>Exceção aprovada pela Direção.</div>}
            </div>
          )}
          {locked && (
            <div className="kv">
              <span>Proposta</span><b>enviada {o.enviada}{o.aceite ? " · aceite " + o.aceite : ""}</b>
              {o.vendaDireta
                ? <><span>Contrato</span><b>venda direta, não há</b></>
                : <><span>Contrato</span><b>{o.contrato === "assinado" ? "assinado" : o.contrato === "enviado" ? "enviado, à espera da assinatura" : "por enviar"}</b></>}
            </div>
          )}
        </div>
        <div className="card">
          <h3>Margem <span className={"pill " + mcls}>{pct(T.m)}</span></h3>
          <div className="meter">
            <i style={{ width: mw * 100 + "%", background: mcls === "ok" ? "var(--ok)" : mcls === "warn" ? "var(--amber)" : "var(--bad)" }} />
            <b style={{ left: S.cfg.min * 2 + "%" }} title="mínimo" /><b style={{ left: S.cfg.alvo * 2 + "%" }} title="alvo" />
          </div>
          <div className="sub">mínimo {S.cfg.min}% · alvo {S.cfg.alvo}% · em Definições</div>
          <div className="kv">
            <span>Mão de obra</span><b>{eur(pt.mo)} €</b><span>Equipamentos</span><b>{eur(pt.eq)} €</b><span>Consumíveis</span><b>{eur(pt.cons)} €</b>
            {S.cfg.estrutura && <><span>Estrutura</span><b>{eur(pt.estr)} €</b></>}
            <span>Materiais</span><b>{eur(pt.mat)} €</b>
            <span className="tot">Custo total</span><b className="tot">{eur(T.custo)} €</b>
            <span className="tot">Lucro previsto</span><b className="tot">{eur(T.pf - T.custo)} €</b>
          </div>
        </div>
      </div>
    </>
  );
}

function ObraResumo({ S, A, go, d }: Ctx & { d: Negocio }) {
  const pl = d.obra.plano!, e = d.obra.enc, T = tot(d, S);
  const est = { "por aprovar": "warn", aprovado: "pri", "em curso": "pri", "concluída": "ok" }[pl.estado];
  const R = d.obra.real;
  const mx = R ? Math.max(...R.tasks.map((t) => Math.max(t.prev, t.real))) : 1;
  return (
    <>
      <div className="g2">
        <div className="card">
          <h3>Plano da obra <span className={"pill " + est}>{pl.estado}</span></h3>
          <div className="kv"><span>Fases</span><b>{pl.tasks.length}</b><span>Horas previstas</span><b>{nfmt(pl.tasks.reduce((a, t) => a + t.h, 0))} h</b><span>Conflitos</span><b>{conflitos(pl).length}</b></div>
          <Btn cls="sec sm" onClick={go(() => A.abrirPlano(d.id))}>Abrir nas Operações</Btn>
        </div>
        <div className="card">
          <h3>Materiais <span className={"pill " + (!e || e.estado === "recebida" ? "ok" : "warn")}>{!e ? "em stock" : e.estado === "recebida" ? "reservados" : e.n + " · " + e.estado}</span></h3>
          <div className="kv">
            {(d.obra.mats || []).slice(0, 4).map((x) => <Fragment key={x.n}><span>{x.n}</span><b>{x.falta > 0 ? "faltam " + nfmt(x.falta) + " " + x.un : "✓ " + nfmt(x.q) + " " + x.un}</b></Fragment>)}
          </div>
          <Btn cls="sec sm" onClick={go(() => A.abrirInv())}>Abrir no Inventário</Btn>
        </div>
      </div>
      {R && (
        <div className="withside">
          <div className="card">
            <h3>Previsto contra real <span>horas de equipa</span></h3>
            <div className="bars">
              {R.tasks.map((t) => (
                <div className="b" key={t.nome}>
                  <span>{t.nome}</span>
                  <div className="tr"><i style={{ width: (t.prev / mx) * 100 + "%" }} /><i className={"r " + (t.real > t.prev * 1.05 ? "over" : "")} style={{ width: (t.real / mx) * 100 + "%" }} /></div>
                  <em>{nfmt(t.real)} h<small>prev. {nfmt(t.prev)}</small></em>
                </div>
              ))}
            </div>
            <div className="legend"><span><i style={{ background: "var(--pri-line)" }} />previsto</span><span><i style={{ background: "var(--pri)" }} />real</span><span><i style={{ background: "var(--amber)" }} />acima do previsto</span></div>
          </div>
          <div className="card">
            <h3>O que se aprende</h3>
            <div className="kv">
              <span>Custo previsto</span><b>{eur(T.custo)} €</b><span>Custo real</span><b>{eur(R.custoReal)} €</b>
              <span className="tot">Margem orçada</span><b className="tot">{pct(T.m)}</b><span className="tot">Margem real</span><b className="tot">{pct(R.m)}</b>
            </div>
            {d.obra.aprendido
              ? <span className="pill ok">Receita do revestimento atualizada</span>
              : <>
                <span className="sub">O revestimento levou mais 23% do que a receita prevê. Proposta: subir de {nfmt(S.svc.revest.h)} para {nfmt(r2(S.svc.revest.h * fatorReal("revest")))} h/m² no Catálogo.</span>
                <Btn cls="sm" onClick={go(() => A.aprender(d.id))}>Atualizar a receita</Btn>
              </>}
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ Operações */
function Operacoes({ S, A, go }: Ctx) {
  const obras = aberto(S).filter((d) => d.fase === 5);
  const d = S.op ? S.deals.find((x) => x.id === S.op) : null;
  if (d && d.obra.plano) {
    const p = d.obra.plano, C = conflitos(p), nd = Math.max(5, ...p.tasks.map((t) => t.dia + t.dur));
    const e = d.obra.enc, matsOk = !e || e.estado === "recebida";
    let acao: ReactNode = null;
    if (p.estado === "por aprovar") acao = <Btn cls={C.length ? "sec" : ""} onClick={go(() => A.aprovarPlano(d.id))}>Aprovar plano</Btn>;
    else if (p.estado === "aprovado") acao = <Btn cls={matsOk ? "" : "sec"} onClick={go(() => A.arrancar(d.id))}>Arrancar obra</Btn>;
    else if (p.estado === "em curso") acao = <Btn onClick={go(() => A.fimObra(d.id))}>Registar fim da obra (simular)</Btn>;
    const pode = S.role === "operacoes";
    const equipa = [...new Set(p.tasks.map((t) => t.tec))];
    return (
      <>
        <button className="back" onClick={go(() => A.nav("operacoes"))}>← Operações</button>
        <div className="row">
          <div>
            <h1 className="h1">Plano · {d.servico} · {d.nome}</h1>
            <div className="sub">Gerado do contrato · {p.tasks.length} fases · {nfmt(p.tasks.reduce((a, t) => a + t.h, 0))} h de equipa · tarefas das receitas do Catálogo</div>
          </div>
          <div className="row">
            {C.length > 0 && <span className="pill warn">{C.length} conflito</span>}
            <span className={"pill " + (p.estado === "concluída" ? "ok" : "pri")}>{p.estado}</span>
            {pode ? acao : acao ? <button className="link" onClick={go(() => A.role("operacoes"))}>Mudar para Operações</button> : null}
          </div>
        </div>
        <div className="gw">
          <div className="gantt" style={{ gridTemplateColumns: `170px repeat(${nd},minmax(74px,1fr))`, minWidth: 170 + nd * 74 }}>
            <div className="h">Fase</div>
            {Array.from({ length: nd }, (_, k) => <div className="h" key={k}>{DIAS[k]}</div>)}
            {p.tasks.map((t) => {
              const tec = TECS.find((x) => x.id === t.tec);
              const c = C.find((x) => x.t === t);
              const cells: ReactNode[] = [];
              for (let k = 0; k < nd; k++) {
                if (k === t.dia) {
                  const done = p.estado === "concluída" || (p.estado === "em curso" && k < p.dia);
                  cells.push(<div className="gb" key={k} style={{ gridColumn: `span ${t.dur}` }}><i className={c ? "warn" : done ? "done" : ""}>{tec ? tec.n.split(" ")[0] : "?"}{c ? " · de férias " + DIAS[c.dia].split(" ")[1] : ""}</i></div>);
                  k += t.dur - 1;
                } else cells.push(<div key={k} />);
              }
              return <Fragment key={t.nome}><div className="t">{t.nome}<small>{nfmt(t.h)} h · {t.sk.toLowerCase()}</small></div>{cells}</Fragment>;
            })}
          </div>
        </div>
        <div className="g2">
          <div className="card">
            <h3>Equipa proposta <span>do RH: competências e disponibilidade</span></h3>
            {equipa.map((id) => {
              const t = TECS.find((x) => x.id === id)!;
              const c = C.find((x) => x.tec.id === id);
              return (
                <div className="item" key={id}>
                  <div><b>{t.n}</b><small>{t.sk}{t.ferias.length ? " · férias " + t.ferias.map((k) => DIAS[k].split(" ")[1]).join(", ") : ""}</small></div>
                  {c ? <span className="pill warn">Conflito</span> : <span className="pill ok">Disponível</span>}
                </div>
              );
            })}
          </div>
          <div className="card">
            <h3>{C.length ? "Resolver o conflito" : "Materiais"}</h3>
            {C.map((c) => {
              const ti = p.tasks.indexOf(c.t);
              const alt = TECS.find((x) => x.sk === c.t.sk && x.id !== c.tec.id && !x.ferias.some((k) => k >= c.t.dia && k < c.t.dia + c.t.dur));
              return (
                <div className="al" key={ti}>
                  {alt && (
                    <div className="w"><i>!</i><span><b>Trocar por {alt.n}</b><small>{alt.sk} · livre nesses dias · mesmo custo/hora</small></span>
                      <span className="acts"><Btn cls="sm" onClick={go(() => A.trocar(d.id, ti))}>Trocar</Btn></span></div>
                  )}
                  <div><i>→</i><span><b>Ou adiar {c.t.nome.toLowerCase()}</b><small>{c.tec.n.split(" ")[0]} volta depois das férias · a obra acaba mais tarde</small></span>
                    <span className="acts"><Btn cls="sec sm" onClick={go(() => A.adiar(d.id, ti))}>Adiar</Btn></span></div>
                </div>
              );
            })}
            <span className="sub">Materiais: {!e ? "tudo em stock, reservado" : e.estado === "recebida" ? "encomenda recebida, tudo reservado ✓" : e.n + " " + e.estado + " · o armazém trata no Inventário"}</span>
            {!matsOk && p.estado === "aprovado" && <span className="err">A obra só arranca com os materiais garantidos.</span>}
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <div><h1 className="h1">Operações</h1><div className="sub">As obras chegam aqui sozinhas quando o Financeiro emite o recibo.</div></div>
      <div className="tw"><table>
        <thead><tr><th>Obra</th><th>Plano</th><th>Conflitos</th><th className="n">Horas previstas</th></tr></thead>
        <tbody>
          {obras.length ? obras.map((o) => {
            const p = o.obra.plano!;
            return (
              <tr key={o.id}>
                <td><button className="link" onClick={go(() => A.abrirPlano(o.id))}>{o.nome}</button><small>{o.servico} · {o.local}</small></td>
                <td><span className={"pill " + (p.estado === "concluída" ? "ok" : p.estado === "por aprovar" ? "warn" : "pri")}>{p.estado}</span></td>
                <td>{conflitos(p).length ? <span className="pill warn">1 conflito</span> : "—"}</td>
                <td className="n">{nfmt(p.tasks.reduce((a, t) => a + t.h, 0))} h</td>
              </tr>
            );
          }) : <tr><td colSpan={4} className="empty">Sem obras. Valide um pagamento no Financeiro para gerar uma.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

/* ------------------------------------------------------------------ Inventário */
const NOMES_STOCK: Record<string, string> = {
  cp: "Cerâmico de parede 30×60 (m²)", pv: "Pavimento cerâmico 60×60 (m²)", san: "Sanita suspensa com estrutura", base: "Base de duche 80×120",
  cim: "Cimento-cola · saco 25 kg", mov: "Conjunto de móveis de cozinha", banc: "Bancada em pedra",
};
function Inventario({ S, A, go }: Ctx) {
  const obras = aberto(S).filter((d) => d.fase === 5 && d.obra.mats);
  const pode = S.role === "armazem";
  const mudar = <button className="link" onClick={go(() => A.role("armazem"))}>Mudar para Armazém</button>;
  return (
    <>
      <div><h1 className="h1">Inventário · materiais por obra</h1><div className="sub">A lista vem do orçamento de cada obra. Aparece aqui quando o Financeiro emite o recibo.</div></div>
      {obras.length ? obras.map((d) => {
        const e = d.obra.enc;
        let act: ReactNode = null;
        if (e && e.estado === "por confirmar") act = pode ? <Btn onClick={go(() => A.confirmarEnc(d.id))}>Confirmar encomenda</Btn> : mudar;
        if (e && e.estado === "encomendada") act = pode ? <Btn onClick={go(() => A.receberEnc(d.id))}>Marcar como recebida (simular)</Btn> : mudar;
        return (
          <div className="card" key={d.id}>
            <h3>{d.nome} · {d.servico} <span>{e ? e.n + " · " + e.estado : "tudo em stock"}</span></h3>
            <div className="tw"><table style={{ minWidth: 520 }}>
              <thead><tr><th>Material</th><th className="n">Precisa</th><th className="n">Reservado</th><th>Estado</th></tr></thead>
              <tbody>
                {d.obra.mats!.map((x) => (
                  <tr key={x.n} className={x.falta > 0 ? "hl" : ""}>
                    <td>{x.n}</td><td className="n">{nfmt(x.q)} {x.un}</td><td className="n">{nfmt(x.res)} {x.un}</td>
                    <td>{x.falta > 0 ? <span className="pill bad">Faltam {nfmt(x.falta)} {x.un}</span> : <span className="pill ok">Reservado</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {e && e.estado !== "recebida" && (
              <div className="next">
                <div>
                  <small>Encomenda ao fornecedor</small>
                  <b>{e.n} · {e.forn} · {e.linhas.length} linha(s)</b>
                  <span className="sub">{e.linhas.map((l) => nfmt(l.q) + " " + l.un + " " + l.n.toLowerCase()).join(" · ")} · entrega pedida até 12/10</span>
                </div>
                {act}
              </div>
            )}
          </div>
        );
      }) : <p className="empty">Ainda não há obras com materiais. Valide um pagamento no Financeiro.</p>}
      <div className="card">
        <h3>Stock livre <span>exemplo</span></h3>
        <div className="kv">{Object.entries(S.stock).map(([k, v]) => <Fragment key={k}><span>{NOMES_STOCK[k]}</span><b>{nfmt(Math.max(0, v))}</b></Fragment>)}</div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Catálogo */
function Catalogo({ S, run }: Ctx) {
  return (
    <>
      <div className="row">
        <div><h1 className="h1">Catálogo e custos · serviços</h1><div className="sub">A receita de cada serviço por unidade de medida. É daqui que o orçamento tira o custo.</div></div>
        <span className="lock">salários: só a Direção vê</span>
      </div>
      <div className="banner"><b>Experimente:</b> mude as horas ou o custo/hora de um serviço. Os orçamentos ainda não enviados mostram "Catálogo mudou"; os enviados guardam a cópia do cálculo.</div>
      <div className="tw"><table style={{ minWidth: 900 }}>
        <thead><tr>
          <th>Serviço</th><th>Medida</th><th className="n">Horas/un.</th><th className="n">€/h técnico</th><th className="n">Equip. €/un.</th><th className="n">Consum. €/un.</th>
          {S.cfg.estrutura && <th className="n">Estrutura €/un.</th>}<th className="n">Custo/un.</th><th className="n">Preço/un.</th><th className="n">Margem</th>
        </tr></thead>
        <tbody>
          {(Object.entries(S.svc) as [SvcId, (typeof S.svc)[SvcId]][]).map(([k, s]) => {
            const c = custoUn(s, S), m = (s.preco - c) / s.preco;
            const cls = m < S.cfg.min / 100 ? "bad" : m < S.cfg.alvo / 100 - 0.005 ? "warn" : "ok";
            const inp = (f: "h" | "eh" | "cons" | "preco") => (
              <Campo id={`svc-${k}-${f}`} ariaLabel={f} value={nfmt(s[f])} onCommit={(v) => run(() => {
                const n = numero(v);
                if (isNaN(n) || n < 0) return;
                s[f] = n;
                if (f === "eh") s.semCusto = false;
                if (f === "cons") s.stale = null;
              })} />
            );
            return (
              <tr key={k} className={cls === "bad" ? "hl" : ""}>
                <td>{s.n}<small>{s.perfil}{s.semCusto && <> · <span style={{ color: "var(--warn)" }}>técnico sem custo/hora, usa o médio</span></>}{s.stale && <> · <span style={{ color: "var(--warn)" }}>preço de consumível antigo</span></>}</small></td>
                <td>{s.un}</td>
                <td className="n">{inp("h")}</td><td className="n">{inp("eh")}</td><td className="n">{eur(s.eq)}</td><td className="n">{inp("cons")}</td>
                {S.cfg.estrutura && <td className="n">{eur(s.h * ESTR)}</td>}
                <td className="n"><b>{eur(c)}</b></td><td className="n">{inp("preco")}</td><td className="n"><span className={"pill " + cls}>{pct(m)}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      <p className="sub">Custo por unidade = horas × €/h do técnico + equipamento + consumíveis{S.cfg.estrutura ? " + horas × " + eur(ESTR) + " €/h de estrutura" : ""}. Todos os valores são de exemplo.</p>
    </>
  );
}

/* ------------------------------------------------------------------ Clientes, Marketing, Definições */
function Clientes({ S, A, go }: Ctx) {
  return (
    <>
      <div><h1 className="h1">Clientes</h1><div className="sub">O cliente é criado sozinho quando o contrato é assinado ou a venda direta é aceite.</div></div>
      <div className="tw"><table>
        <thead><tr><th>Cliente</th><th>Telefone</th><th>Desde</th><th>Negócio</th></tr></thead>
        <tbody>{S.clientes.map((c) => (
          <tr key={c.deal}><td>{c.nome}<small>{c.local}</small></td><td>{c.tel}</td><td>{c.desde}</td><td><button className="link" onClick={go(() => A.abrir(c.deal))}>#{c.deal}</button></td></tr>
        ))}</tbody>
      </table></div>
    </>
  );
}

function Marketing() {
  const C: [string, string, number, number][] = [["Campanha de outono", 'Meta Ads · formulário "Cozinha nova"', 14, 3], ["Site · pedido de orçamento", "Formulário do site", 31, 9], ["Recomendações", "À mão", 6, 2]];
  return (
    <>
      <div><h1 className="h1">Marketing · campanhas</h1><div className="sub">A origem e o formulário vivem dentro de cada campanha. Fora do âmbito deste protótipo.</div></div>
      <div className="tw"><table>
        <thead><tr><th>Campanha</th><th className="n">Leads</th><th className="n">Ganhos</th></tr></thead>
        <tbody>{C.map((c) => <tr key={c[0]}><td>{c[0]}<small>{c[1]}</small></td><td className="n">{c[2]}</td><td className="n">{c[3]}</td></tr>)}</tbody>
      </table></div>
    </>
  );
}

function Definicoes({ S, run, repor }: Ctx) {
  const n = (k: "min" | "alvo") => (
    <Campo id={`cfg-${k}`} type="number" value={S.cfg[k]} onCommit={(v) => run(() => { const x = numero(v); if (!isNaN(x)) S.cfg[k] = x; })} />
  );
  return (
    <>
      <div><h1 className="h1">Definições</h1><div className="sub">Neste protótipo só estão as regras que mexem no orçamento.</div></div>
      <div className="g2">
        <div className="card">
          <h3>Margens <span>por empresa e linha de serviço</span></h3>
          <div className="form">
            <div className="f"><label htmlFor="cfg-min">Margem mínima (%)</label>{n("min")}</div>
            <div className="f"><label htmlFor="cfg-alvo">Margem-alvo (%)</label>{n("alvo")}</div>
          </div>
          <span className="sub">Abaixo do mínimo, a proposta só sai com aprovação da Direção. O preço sugerido repõe a margem-alvo.</span>
        </div>
        <div className="card">
          <h3>Estrutura no custo <span>decisão em aberto</span></h3>
          <label className="row" style={{ justifyContent: "flex-start", gap: 8 }}>
            <input type="checkbox" id="cfg-estr" checked={S.cfg.estrutura} onChange={(e) => { const v = e.target.checked; run(() => { S.cfg.estrutura = v; }); }} />
            Somar {eur(ESTR)} €/h de estrutura ao custo de cada serviço
          </label>
          <span className="sub">Pelo método BMG, a estrutura fica dentro da margem. Somá-la ao custo sem baixar a margem cobra-a duas vezes. Ligue e desligue para ver o efeito nos orçamentos.</span>
        </div>
      </div>
      <div className="card">
        <h3>Demonstração</h3>
        <span className="sub">Os passos que der ficam guardados neste browser. Para recomeçar do zero:</span>
        <div><Btn cls="sec" onClick={repor}>Repor a demonstração</Btn></div>
      </div>
    </>
  );
}
