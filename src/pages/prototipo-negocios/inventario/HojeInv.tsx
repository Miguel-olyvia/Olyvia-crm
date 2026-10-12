// O Hoje do Inventário: o fluxo em cinco passos, a fila de trabalho (cada cartão abre a lista já filtrada), as POs automáticas e os últimos movimentos.
// Os números vêm do estado atual e mudam quando se age. Um só botão primário: "Simular venda assinada".
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCO } from "../FiltrosPopover";
import { BORDA_CTRL } from "../PessoaLinha";
import { eur, fmtDT, N, nomeArm, nomeProd } from "./base";
import { contadores, type Contadores } from "./contadores";
import { useCtxInv, type Destino } from "./ctxInv";
import { TIPOS_MOV } from "./stock";
import { MovimentoDialogo } from "./MovimentoDialogo";
import { Bloco, Ligacao, Pri, Sec, Selo, Vazio } from "./pecasInv";
import { VendaDialogo } from "./VendaDialogo";
import type { Tom } from "./tipos";

interface ItemFila { n: number; titulo: string; desc: string; tom: Tom; destino: Destino }
const fila = (c: Contadores): ItemFila[] => [
  { n: c.pending, titulo: "POs por aprovar", desc: "Rascunhos, manuais ou automáticos. Passar a Encomendado é aprovar.", tom: "warn", destino: { aba: "po", f: { status: "pending" } } },
  { n: c.late, titulo: "POs atrasadas", desc: "A entrega prevista passou e a receção não está completa.", tom: "bad", destino: { aba: "po", f: { status: "late" } } },
  { n: c.ecReady, titulo: "ECs prontas a expedir", desc: "Têm linhas com stock reservado (FIFO) à espera de saída.", tom: "ok", destino: { aba: "ec", f: { prontas: true } } },
  { n: c.ecNoSup, titulo: "ECs sem fornecedor preferencial", desc: "Há quantidades em falta sem fornecedor para encomendar.", tom: "bad", destino: { aba: "ec", f: { status: "nosup" } } },
  { n: c.transfers, titulo: "Pedidos de transferência", desc: "Entre armazéns, ligados a ECs.", tom: "info", destino: { aba: "stock", f: { transferencias: true } } },
  { n: c.prices, titulo: "Alterações de preço por aprovar", desc: "Submetidas pelos fornecedores no portal.", tom: "warn", destino: { aba: "sup", f: { precos: true } } },
  { n: c.low, titulo: "Produtos abaixo do ponto de encomenda", desc: "O stock livre (sem reservas) está abaixo do ponto de encomenda.", tom: "warn", destino: { aba: "stock", f: { state: "low" } } },
  { n: c.stalled, titulo: "Contagem parada", desc: "Em curso sem atividade há 7 dias ou mais.", tom: "neu", destino: { aba: "cont", f: { estado: "open" } } },
  { n: c.awaiting, titulo: "Fornecedores à espera da ficha", desc: "Convidados para o portal: ainda não a preencheram.", tom: "info", destino: { aba: "sup", f: { aguardam: true } } },
  { n: c.catUnlinked, titulo: "Artigos do portal por ligar", desc: "Catálogo carregado pelos fornecedores, com sugestões.", tom: "neu", destino: { aba: "sup", f: { catalogo: true } } },
  { n: c.guiasDiv, titulo: "Guias abertas com divergências", desc: "O anunciado é diferente do recebido.", tom: "bad", destino: { aba: "guia", f: { estado: "div" } } },
];

function Etapa({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <li className="grid gap-1 py-3">
      <h3 className="flex items-center gap-2 text-base font-semibold"><span className="grid h-7 w-7 place-items-center rounded-full border border-foreground text-[15px] tabular-nums" aria-hidden="true">{n}</span>{titulo}</h3>
      <div className="flex flex-wrap gap-x-4 gap-y-1 pl-9 text-[15px]">{children}</div>
    </li>
  );
}
const Conta = ({ r, n, ir }: { r: string; n: string | number; ir: () => void }) => <Ligacao aoClicar={ir}>{r}: <b className="tabular-nums">{n}</b></Ligacao>;

function Fluxo({ c }: { c: Contadores }) {
  const { db, ir } = useCtxInv();
  const por = (k: string): number => db.ecs.filter((e) => !e.deleted && e.origin.k === k).length;
  const ded = db.settings.deduction === "contract" ? "contrato assinado" : "proposta aceite";
  return (
    <Bloco titulo="Fluxo" id="h-fluxo">
      <ol className="divide-y divide-border rounded-xl border border-border px-4">
        <Etapa n={1} titulo="Vendas assinadas">
          <Conta r="Contratos" n={por("CT")} ir={() => ir({ aba: "ec", f: { q: "CT-" } })} /><Conta r="Vendas diretas" n={por("VD")} ir={() => ir({ aba: "ec", f: { q: "VD-" } })} /><Conta r="Encomendas manuais" n={por("manual")} ir={() => ir({ aba: "ec", f: { q: "Manual" } })} />
          <span className="text-muted-foreground">Baixa no momento definido: {ded} (nunca os dois).</span>
        </Etapa>
        <Etapa n={2} titulo="Encomendas Clientes">
          <Conta r="Em aberto" n={c.ecOpen} ir={() => ir({ aba: "ec" })} /><Conta r="Prontas a expedir" n={c.ecReady} ir={() => ir({ aba: "ec", f: { prontas: true } })} /><Conta r="Sem fornecedor" n={c.ecNoSup} ir={() => ir({ aba: "ec", f: { status: "nosup" } })} />
          <span className="text-muted-foreground">Cada linha: há stock livre (stock − reservas anteriores)?</span>
        </Etapa>
        <Etapa n={3} titulo="Se há stock, serve do stock">
          <Conta r="Reserva FIFO" n={N(c.reservedUnits) + " un"} ir={() => ir({ aba: "stock" })} /><Conta r="Saídas por fazer" n={c.ecReady + " EC"} ir={() => ir({ aba: "ec", f: { prontas: true } })} />
        </Etapa>
        <Etapa n={4} titulo="Se falta, encomenda ao fornecedor preferencial">
          <Conta r="POs por aprovar" n={c.pending} ir={() => ir({ aba: "po", f: { status: "pending" } })} /><Conta r="No portal, por ver" n={c.portalUnseen} ir={() => ir({ aba: "po", f: { status: "portal" } })} />
          <Conta r="Confirmadas pelo fornecedor" n={c.portalConfirmed} ir={() => ir({ aba: "po", f: { status: "portal" } })} /><Conta r="Guias abertas" n={c.guiasOpen} ir={() => ir({ aba: "guia" })} />
        </Etapa>
        <Etapa n={5} titulo="Stock">
          <Conta r="Abaixo do ponto de encomenda" n={c.low} ir={() => ir({ aba: "stock", f: { state: "low" } })} /><Conta r="Transferências pendentes" n={c.transfers} ir={() => ir({ aba: "stock", f: { transferencias: true } })} />
          <Conta r="Contagens em curso" n={c.countsOpen} ir={() => ir({ aba: "cont", f: { estado: "open" } })} /><span>Valor em stock (custo médio): <b className="tabular-nums">{eur(c.stockValue)}</b></span>
        </Etapa>
      </ol>
    </Bloco>
  );
}

function Fila({ c }: { c: Contadores }) {
  const { ir } = useCtxInv();
  return (
    <Bloco titulo="Fila de trabalho" id="h-fila">
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {fila(c).map((q) => (
          <li key={q.titulo}>
            <button type="button" onClick={() => ir(q.destino)} className={cn("flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-xl border bg-card p-3 text-left hover:border-foreground", q.n ? "border-border" : "border-dashed border-border opacity-80", FOCO)}>
              <span className="min-w-10 text-2xl font-semibold tabular-nums">{q.n}</span>
              <span className="min-w-0"><span className="block text-[15px] font-semibold">{q.titulo}</span><span className="block text-[15px] text-muted-foreground">{q.desc}</span>
                <span className="mt-1 flex items-center gap-1 text-[15px]">{q.n ? "Abrir lista filtrada" : "Nada pendente"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></span></span>
            </button>
          </li>
        ))}
      </ul>
    </Bloco>
  );
}

function AutoPo() {
  const { db, agir } = useCtxInv();
  const escolher = (v: "direct" | "approval"): void => { agir((d) => { d.settings.autoPO = v; }, v === "direct" ? "POs automáticas passam a ser enviadas diretamente." : "POs automáticas voltam a nascer como rascunho."); };
  const Op = ({ v, nome, nota }: { v: "direct" | "approval"; nome: string; nota: string }) => (
    <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3", BORDA_CTRL)}>
      <input type="radio" name="autopo" checked={db.settings.autoPO === v} onChange={() => escolher(v)} className="mt-1 h-5 w-5 accent-foreground" />
      <span><span className="block text-[15px] font-medium">{nome}</span><span className="block text-[15px] text-muted-foreground">{nota}</span></span>
    </label>
  );
  return (
    <fieldset className="grid gap-2"><legend className="text-lg font-semibold">POs automáticas</legend>
      <Op v="direct" nome="Envio direto ao fornecedor (portal ou email)" nota="Proposta do mockup: a PO nasce encomendada." />
      <Op v="approval" nome="Rascunho com aprovação" nota="Comportamento atual: nasce pendente e alguém aprova e envia." />
    </fieldset>
  );
}

function Ultimos() {
  const { db, ir } = useCtxInv();
  const recentes = db.moves.slice(-6).reverse();
  return (
    <Bloco titulo="Últimos movimentos" id="h-mov" accao={<Sec onClick={() => ir({ aba: "mov" })}>Ver livro completo</Sec>}>
      {recentes.length === 0 ? <Vazio titulo="Sem movimentos" /> : (
        <ul className="grid gap-2">{recentes.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
            <Selo tom={TIPOS_MOV[m.type].tone}>{TIPOS_MOV[m.type].t}</Selo>
            <span className="min-w-0 flex-1">{m.qty > 0 ? "+" : ""}{N(m.qty)} {nomeProd(db, m.sku)} · {nomeArm(db, m.wh)}</span>
            <span className="text-muted-foreground">{fmtDT(m.at)}</span>
          </li>))}
        </ul>
      )}
    </Bloco>
  );
}

export function HojeInv() {
  const { db, ir } = useCtxInv();
  const c = contadores(db);
  const [dlg, setDlg] = useState<"venda" | "mov" | null>(null);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-[15px] text-muted-foreground">Tudo o que precisa de ação no inventário, por ordem do fluxo. Os números vêm do estado atual e mudam quando age.</p>
        <div className="flex flex-wrap gap-2">
          <Sec onClick={() => setDlg("mov")}>Registar movimento</Sec><Sec onClick={() => ir({ aba: "guia" })}>Receber</Sec><Pri onClick={() => setDlg("venda")}>Simular venda assinada</Pri>
        </div>
      </div>
      <Fluxo c={c} />
      <Fila c={c} />
      <div className="grid gap-6 lg:grid-cols-2"><AutoPo /><Ultimos /></div>
      {dlg === "venda" && <VendaDialogo aberto aoFechar={() => setDlg(null)} />}
      {dlg === "mov" && <MovimentoDialogo aberto aoFechar={() => setDlg(null)} />}
    </div>
  );
}
