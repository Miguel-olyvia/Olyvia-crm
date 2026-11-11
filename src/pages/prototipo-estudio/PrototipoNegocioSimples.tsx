// 10/11 (Rúben: «não queremos muitos passos, queremos certezas e informação limpa nas screens»): a página do negócio, sem conta, com os
// dados de exemplo do motor. 11/11 (Rúben: «testa e otimiza o fluxo todo; fácil, intuitivo e divertido»): um negócio vivo, do princípio ao
// fim, para se percorrer como na app: a proposta enviada → o cliente aceita (botão de teste) → medidas → plano aprovado → contrato (o
// cliente assina, botão de teste) → fatura e pagamento → obra. Muda-se de papel em cima (como o «A ver como» da app) ou no «Mudar para …»
// do próprio passo; os avisos do motor aparecem em baixo, como na app. Nada é real: o negócio do Tiago Almeida (1027) refeito pelo fluxo de
// 10/11, só na memória do browser (os dados de faturação vêm preenchidos com valores de exemplo).
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Check, Info, RotateCcw, X } from "lucide-react";
import { acoes, seed, PAPEIS, type Aviso, type Estado, type Papel } from "@/emylia/motor";
import { FINANCEIRO, emFalta } from "@/emylia/campos";
import type { Ctx } from "@/emylia/pecas";
import { NegocioSimples } from "@/emylia/NegocioSimples";
import { definirModoTeste } from "@/emylia/real/modoTeste";
import "@/emylia/prototipo.css";

const PAPEIS_DO_FLUXO: Papel[] = ["comercial", "operacoes", "financeiro", "direcao"];

/** O negócio 1027 com a proposta enviada, por aceitar (sem contrato, sem fatura, sem medidas nem plano). */
function montar(): Estado {
  const S = seed();
  const d = S.deals.find((x) => x.id === 1027)!;
  d.fase = 3;
  Object.assign(d.orc!, { verif: true, enviada: "hoje", aceite: null, contrato: null, pedidoCliente: null });
  d.fin = { fatura: null, pago: false, recibo: null } as typeof d.fin;
  d.obra = { ...d.obra, plano: undefined as unknown as typeof d.obra.plano, ec: undefined };
  for (const k of Object.keys(d.f)) if (k.startsWith("retif_")) delete d.f[k];
  // os dados de faturação e da fatura, com valores de exemplo (o NIF de teste 123456789), para a fatura se poder registar
  d.f.nif_fat = "123456789";
  for (let i = 0; i < 4; i++) for (const c of emFalta([FINANCEIRO[0], FINANCEIRO[1]], d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Sim" : c.t === "data" ? "2026-11-11" : c.k.includes("email") ? "tiago.almeida@exemplo.pt" : "Tiago Almeida";
  S.role = "comercial";
  S.view = "negocio"; S.deal = d.id;
  return S;
}

type AvisoVisto = Aviso & { id: number };

function Demo({ vez }: { vez: number }) {
  const S = useMemo(() => montar(), [vez]); // eslint-disable-line react-hooks/exhaustive-deps
  const [, redesenhar] = useReducer((x: number) => x + 1, 0);
  const [avisos, setAvisos] = useState<AvisoVisto[]>([]);
  const prox = useRef(1);
  const run = (fn: () => void) => { fn(); redesenhar(); };
  const avisar = (a: Aviso) => {
    const id = prox.current++;
    window.setTimeout(() => {
      setAvisos((x) => [...x, { ...a, id }].slice(-3));
      window.setTimeout(() => setAvisos((x) => x.filter((y) => y.id !== id)), a.kind === "bad" ? 7000 : 4500);
    }, a.atraso ?? 0);
    redesenhar();
  };
  const A = useMemo(() => acoes(S, avisar, run), [S]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = { S, A, run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
  // o cliente e o fornecedor, pelos botões de teste da página (como o super admin na app): aqui, no motor local
  useEffect(() => {
    definirModoTeste({
      aceitarProposta: async (d) => run(() => A.aceitar(d.id)),
      assinarContrato: async (d) => run(() => A.assinar(d.id)),
      confirmarFornecedor: async () => {},
    });
    return () => definirModoTeste(null);
  }, [A]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 pt-3 sm:px-8">
        <span className="text-sm text-muted-foreground">A ver como</span>
        {PAPEIS_DO_FLUXO.map((r) => (
          <button key={r} type="button" aria-pressed={S.role === r} onClick={() => run(() => A.role(r))}
            className={S.role === r ? "min-h-10 rounded-full bg-foreground px-4 text-sm text-background" : "min-h-10 rounded-full border border-input px-4 text-sm"}>
            {PAPEIS[r].n}
          </button>
        ))}
      </div>
      <NegocioSimples {...ctx} />
      {/* os avisos do motor, como na app */}
      <div aria-live="polite" className="pointer-events-none fixed bottom-20 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {avisos.map((a) => (
          <div key={a.id} role="status" className={"pointer-events-auto flex items-start gap-3 rounded-xl border bg-card px-4 py-3 text-[15px] shadow-lg motion-safe:animate-in motion-safe:slide-in-from-right-4 motion-safe:fade-in-0 " + (a.kind === "bad" ? "border-destructive/40" : a.kind === "ok" ? "border-success/40" : "border-border")}>
            <span aria-hidden="true" className={"mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full " + (a.kind === "bad" ? "bg-destructive/10 text-destructive" : a.kind === "ok" ? "bg-success text-white" : "bg-primary/10 text-primary")}>
              {a.kind === "ok" ? <Check className="h-3.5 w-3.5" /> : a.kind === "bad" ? <X className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
            </span>
            <span className="min-w-0"><b className="block font-semibold">{a.msg}</b>{a.sub && <span className="block text-sm text-muted-foreground">{a.sub}</span>}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default function PrototipoNegocioSimples() {
  const [vez, setVez] = useState(0);
  return (
    <main className="pn calma pg-root min-h-screen bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Protótipo · do aceite à obra · dados de exemplo</p>
        <button type="button" onClick={() => setVez((x) => x + 1)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-input px-4 text-sm">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />Recomeçar
        </button>
      </div>
      <Demo key={vez} vez={vez} />
    </main>
  );
}
