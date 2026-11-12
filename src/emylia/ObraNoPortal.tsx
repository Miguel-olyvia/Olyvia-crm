// A obra a andar, no portal do cliente (12/11/2026, Rúben: «o cliente tem de ver todo o histórico no portal das coisas que estão a
// acontecer na obra e o progresso»). As contas estão em obraCliente.ts; aqui só se desenha, no estilo do portal (PortalCliente.tsx).
// · ProgressoObraPortal: a percentagem, os trabalhos concluídos, a decorrer e por começar, as datas (início e fim previsto, e a data
//   de fim que o cliente conhecia, se mudou), os atrasos, o que está a acontecer agora e o que vem a seguir, e os materiais.
// · HistoricoObraPortal: tudo o que aconteceu, do mais recente para o mais antigo, por dia: os técnicos que foram (com as notas e as
//   fotografias), os trabalhos acabados e verificados, os avisos da equipa, os materiais, as adendas, as faturas e os pagamentos.
import { useMemo, useState } from "react";
import {
  AlertTriangle, CalendarClock, Check, CheckCircle2, ClipboardCheck, FilePlus2, FileSignature, FileText, Flag, HardHat, Package, Receipt,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Negocio } from "./motor";
import { COR_FASE } from "./planoObra";
import { Miniaturas } from "./AcompanhamentoObra";
import { useInventario } from "./inventario/loja";
import { resumoEcNegocio } from "./inventario/ponteNegocios";
import { horaCurta, historicoDaObra, materiaisDaObra, porDia, progressoDaObra, type EstadoCliente, type MarcoCliente, type TarefaCliente, type TipoMarco } from "./obraCliente";

const ROXO = "#5a36bf";
const ROTULO: Record<EstadoCliente, string> = { "concluída": "concluído", "a verificar": "a verificar", "a decorrer": "a decorrer", hoje: "previsto para hoje", "por começar": "por começar" };

function Estado({ t }: { t: TarefaCliente }) {
  if (t.atrasada) return <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-900"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />com atraso</span>;
  const tom = t.estado === "concluída" ? "bg-emerald-50 text-emerald-800" : t.estado === "por começar" ? "bg-slate-100 text-slate-600" : "bg-[#5a36bf]/10 text-[#4a2ca3]";
  return <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-sm font-medium", tom)}>{ROTULO[t.estado]}</span>;
}

/** Um trabalho numa linha: o nome (com a cor da fase), as datas previstas e o estado. */
function LinhaTrabalho({ t, datas }: { t: TarefaCliente; datas: string }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <span className="flex min-w-0 items-start gap-2">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.fase ? COR_FASE[t.fase] : ROXO }} aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-[15px] font-medium">{t.nome}</span>
          <span className="block text-sm tabular-nums text-slate-500">{datas}</span>
        </span>
      </span>
      <Estado t={t} />
    </li>
  );
}

const datasDe = (t: TarefaCliente) => (t.de === t.ate ? t.de : `${t.de} a ${t.ate}`);

/** O progresso da obra: a percentagem, as contagens, as datas, os atrasos, agora e a seguir, e os materiais. */
export function ProgressoObraPortal({ d, hoje }: { d: Negocio; hoje?: Date }) {
  const inv = useInventario();
  const P = useMemo(() => progressoDaObra(d, hoje), [d, hoje]);
  const M = materiaisDaObra(resumoEcNegocio(inv, d.obra.ec?.ref));
  if (!P) return null;
  const comecou = P.estado === "em curso" || P.estado === "concluída";
  return (
    <section aria-labelledby="progresso-obra-t" className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="progresso-obra-t" className="text-lg font-semibold tracking-tight">{P.estado === "concluída" ? "A obra está concluída" : comecou ? "Como vai a obra" : "A sua obra vai começar"}</h2>
        <span className="text-2xl font-semibold tabular-nums" aria-label={`${P.pct}% feito`}>{P.pct}%</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={P.pct} aria-label="Progresso da obra">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${P.pct}%`, background: ROXO }} />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {([["Concluídos", P.concluidas], ["A decorrer", P.aDecorrer], ["Por começar", P.porComecar]] as const).map(([t, n]) => (
          <div key={t} className="flex flex-col-reverse rounded-xl bg-slate-50 px-2 py-2.5">
            <dt className="text-sm text-slate-600">{t}</dt>
            <dd className="text-xl font-semibold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-sm text-slate-500">{P.total} {P.total === 1 ? "trabalho" : "trabalhos"} no plano. Um trabalho fica concluído quando o responsável de obra o verifica.</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4">
        <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">{comecou ? "Começou" : "Começa"}</dt><dd className="text-[15px] font-semibold tabular-nums">{P.inicio}</dd></div>
        <div>
          <dt className="text-xs uppercase tracking-[0.12em] text-slate-500">{P.estado === "concluída" ? "Acabou" : "Fim previsto"}</dt>
          <dd className="text-[15px] font-semibold tabular-nums">{P.fim}</dd>
          {P.fimInicial && <dd className="text-sm text-slate-500">Antes: {P.fimInicial}</dd>}
        </div>
      </dl>
      {P.fimPassou && (
        <p role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[15px] text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />A data prevista de fim já passou e a equipa ainda está a terminar. Se tiver dúvidas, escreva-nos aqui em baixo.
        </p>
      )}
      {P.atrasadas.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-amber-950"><AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />{P.atrasadas.length === 1 ? "Um trabalho está atrasado" : `${P.atrasadas.length} trabalhos estão atrasados`}</p>
          <ul className="mt-1 space-y-0.5">{P.atrasadas.map((t) => <li key={t.nome} className="text-[15px] text-amber-950">{t.nome} <span className="text-amber-800">· devia ter acabado a {t.atrasada}</span></li>)}</ul>
        </div>
      )}

      {P.agora.length > 0 && P.estado !== "concluída" && (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <h3 className="text-[15px] font-semibold">Agora</h3>
          <ul className="divide-y divide-slate-100">{P.agora.map((t) => <LinhaTrabalho key={t.nome} t={t} datas={datasDe(t)} />)}</ul>
        </div>
      )}
      {P.aSeguir.length > 0 && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <h3 className="text-[15px] font-semibold">A seguir</h3>
          <ul className="divide-y divide-slate-100">{P.aSeguir.map((t) => <LinhaTrabalho key={t.nome} t={t} datas={`Previsto: ${datasDe(t)}`} />)}</ul>
        </div>
      )}
      {M && (
        <p className="mt-3 flex items-start gap-2 border-t border-slate-200 pt-3 text-sm text-slate-600">
          <Package className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <span>Materiais: {M.naObra === M.total ? "todos já estão na obra." : [
            M.naObra ? `${M.naObra} de ${M.total} já na obra` : "",
            M.prontos ? `${M.prontos} ${M.prontos === 1 ? "pronto" : "prontos"} no nosso armazém` : "",
            M.aChegar ? `${M.aChegar} a chegar do fornecedor${M.chegam ? ` (até ${M.chegam})` : ""}` : "",
          ].filter(Boolean).join(", ") + "."}</span>
        </p>
      )}
    </section>
  );
}

const ICONE: Record<TipoMarco, LucideIcon> = {
  tecnico: HardHat, acabou: Check, concluida: CheckCircle2, inicio: Flag, plano: CalendarClock, materiais: Package, adenda: FilePlus2,
  pagamento: Receipt, fatura: FileText, contrato: FileSignature, fim: Flag, auto: ClipboardCheck,
};
const TOM_MARCO: Partial<Record<TipoMarco, string>> = {
  concluida: "bg-emerald-600 text-white", fim: "bg-emerald-600 text-white", auto: "bg-emerald-600 text-white", inicio: "bg-[#5a36bf] text-white",
  plano: "bg-amber-100 text-amber-800", pagamento: "bg-slate-900 text-white",
};

function Marco({ m, ultimo }: { m: MarcoCliente; ultimo: boolean }) {
  const I = ICONE[m.k], hora = m.quando ? horaCurta(m.quando) : "";
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!ultimo && <span aria-hidden="true" className="absolute bottom-0 left-[15px] top-9 w-px bg-slate-200" />}
      <span className={cn("relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full", TOM_MARCO[m.k] ?? "border border-slate-300 bg-white text-slate-700")} aria-hidden="true"><I className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-[15px]">
          <b className="font-semibold">{m.t}</b>
          {hora && <span className="text-sm tabular-nums text-slate-500">{hora}</span>}
        </p>
        {m.sub && <p className="flex items-center gap-1.5 text-sm text-slate-600">
          {m.k === "tecnico" && m.fase ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR_FASE[m.fase] }} aria-hidden="true" /> : null}{m.sub}</p>}
        {m.nota && <p className="mt-1 text-[15px] leading-relaxed text-slate-800">«{m.nota}»</p>}
        {m.fotos && <Miniaturas fotos={m.fotos} tam="h-20 w-24 sm:h-24 sm:w-32" />}
      </div>
    </li>
  );
}

const MOSTRAR = 8;
/** Tudo o que aconteceu na obra, do mais recente para o mais antigo, por dia. */
export function HistoricoObraPortal({ d, hoje }: { d: Negocio; hoje?: Date }) {
  const [todos, setTodos] = useState(false);
  const L = useMemo(() => historicoDaObra(d, hoje), [d, hoje]);
  const nFotos = L.reduce((a, m) => a + (m.fotos?.length ?? 0), 0);
  const V = todos ? L : L.slice(0, MOSTRAR);
  const dias = porDia(V, hoje);
  return (
    <section aria-labelledby="historico-obra-t" className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 id="historico-obra-t" className="text-lg font-semibold tracking-tight">O que aconteceu na obra</h2>
      <p className="text-sm text-slate-500">{L.length ? `Do mais recente para o mais antigo${nFotos ? ` · ${nFotos} ${nFotos === 1 ? "fotografia" : "fotografias"}` : ""}.` : "Quando a equipa começar, os registos aparecem aqui, dia a dia, com as fotografias."}</p>
      {dias.map(({ dia, marcos }) => (
        <div key={dia} className="mt-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.1em] text-slate-500">{dia}</h3>
          <ol>{marcos.map((m, k) => <Marco key={k} m={m} ultimo={k === marcos.length - 1} />)}</ol>
        </div>
      ))}
      {L.length > MOSTRAR && (
        <button type="button" onClick={() => setTodos(!todos)} aria-expanded={todos}
          className="mt-4 min-h-11 w-full rounded-xl border border-slate-300 px-4 text-[15px] font-medium text-slate-800 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-900">
          {todos ? "Ver menos" : `Ver todo o histórico (${L.length})`}
        </button>
      )}
    </section>
  );
}
