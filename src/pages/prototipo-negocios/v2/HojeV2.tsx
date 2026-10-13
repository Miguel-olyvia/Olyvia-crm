// Hoje da V2 (13/10/2026): um só Hoje por papel (ver docs/melhorias-v2-2026-10-13, 2 · lote 1 · item 2, e 4.1).
// - Cada coisa aparece uma vez, com a razão em texto, por prioridade. Comercial: as regras de Pessoas e Negócios da V2 funcional
//   (funcHoje.ts, funcNegocios.ts) numa só lista; os outros papéis: os passos do motor e a agenda de Hoje.tsx. Regras em hojeV2Regras.ts.
// - Os contadores filtram a lista aqui mesmo; os alertas levam a outro ecrã (já filtrado quando o filtro existe no Estado).
// - Na linha: marcar a visita (dia e hora em chips) e "+ Tarefa" (escolher o quê e quando). Só um editor aberto de cada vez, e o seu
//   "Guardar" é o único botão primário do ecrã.
// - A faixa da semana filtra a agenda. Direção: a equipa numa tabela. Armazém: os números do Inventário.
// - As perguntas do cliente (do portal; perguntasCliente.ts) aparecem no Comercial e na Direção, com a mensagem inteira e a resposta na
//   linha: o canal (Email / WhatsApp, com o contacto já resolvido) e uma resposta rápida; 2 cliques (a resposta e "Enviar").
// Não desenha o HojeSimples (que fica como está para a Atual).
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CalendarDays, CheckCircle2, ListTodo, Mail, MessageCircle, MessageSquareText, Plus, Users, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, PAPEIS, type Papel } from "../motor";
import { IconeFase, fazer, type Ctx } from "../pecas";
import { CHIP, FOCO } from "../FiltrosPopover";
import { useAviso } from "../useAviso";
import { useRegistos } from "../diaADia";
import { lerVersao } from "../versaoPrototipo";
import { escolherPessoa } from "../PessoasSimples";
import { escolherPessoaFunc } from "../PessoasFunc";
import { contadores as contadoresInv } from "../inventario/contadores";
import { useInventario } from "../inventario/loja";
import {
  agendaV2, alertasV2, contadores, destinoVisita, diasVisita, doDia, equipa, filtrarCat, hojeV2, quandoTexto, semana, slotDe,
  CATEGORIAS, HOJE_V2, HORAS_VISITA, rotuloDia, type AlertaV2, type CatV2, type ItemV2,
} from "./hojeV2Regras";
import { resumoInventario } from "./hojeArmazem";
import { concluirTarefa, guardarVisita, juntarTarefa, responderPergunta, useHojeV2, OUTRO, QUANDO_TAREFA, TITULOS_TAREFA, type RespostaV2, type TituloTarefa } from "./hojeV2Store";
import {
  CANAIS, MAX_TEXTO, MODELOS_RESPOSTA, OUTRA, contactoDe, destinoDe, faltaEnviar, haQuanto, perguntasPorResponder, textoResposta,
  vePerguntas, type CanalResposta, type PerguntaCliente,
} from "./perguntasCliente";

const saudacao = (h: number): string => (h < 12 ? "Bom dia" : h < 20 ? "Boa tarde" : "Boa noite");
const BOTAO = "h-11 min-h-11 text-[15px]";
const idSeguro = (t: string): string => t.normalize("NFD").replace(/[^\w]+/g, "-");

type Editor = { chave: string; tipo: "visita" | "tarefa" | "resposta"; modelo?: string } | null;
/** O filtro da lista: um contador do Hoje, ou as perguntas do cliente. */
type FiltroV2 = CatV2 | "perguntas" | null;
const ESCREVER_OUTRA = "Escrever outra";
const OPCOES_RESPOSTA = [...MODELOS_RESPOSTA.map((m) => ({ id: m.id, nome: m.nome })), { id: OUTRA, nome: ESCREVER_OUTRA }];

/* ---------------------------------------------------------------- peças pequenas */

function Secao({ id, titulo, icone, children, tituloRef }: { id: string; titulo: string; icone: ReactNode; children: ReactNode; tituloRef?: React.Ref<HTMLHeadingElement> }) {
  return (
    <section aria-labelledby={id} className="mt-10 border-t border-border pt-6">
      <h2 id={id} ref={tituloRef} tabIndex={-1} className={cn("flex items-center gap-2 text-lg font-semibold", FOCO)}>{icone}{titulo}</h2>
      {children}
    </section>
  );
}

function Chips<T extends string>({ rotulo, opcoes, valor, escolher }: { rotulo: string; opcoes: readonly { id: T; nome: string }[]; valor: T | null; escolher: (v: T) => void }) {
  return (
    <fieldset className="mt-3">
      <legend className="text-[15px] font-medium">{rotulo}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {opcoes.map((o) => <button key={o.id} type="button" aria-pressed={valor === o.id} onClick={() => escolher(o.id)} className={CHIP(valor === o.id)}>{o.nome}</button>)}
      </div>
    </fieldset>
  );
}

/* ---------------------------------------------------------------- os editores na linha */

interface EditorProps { i: ItemV2; id: string; fechar: (guardou: boolean) => void; esc: (e: KeyboardEvent) => void }

function EditorVisita({ i, id, fechar, esc, S, A, run, anunciar }: EditorProps & Pick<Ctx, "S" | "A" | "run"> & { anunciar: (m: string) => void }) {
  const [dia, setDia] = useState<string | null>(null), [hora, setHora] = useState<string | null>(null);
  const dias = diasVisita(), destino = destinoVisita(S, i.dealId);
  const guardar = (): void => {
    const d = dias.find((x) => x.dia === dia)!;
    if (destino.motor) {
      run(() => A.marcarVisita(destino.id!, slotDe(d.rotulo, hora!)));
      anunciar(`Visita marcada: ${i.nome}, ${d.rotulo} às ${hora}. O negócio passou a Visita.`);
    } else {
      guardarVisita({ nome: i.nome, dealId: i.dealId, servico: i.servico, dia: d.dia, rotulo: d.rotulo, hora: hora! });
      anunciar(`Visita marcada: ${i.nome}, ${d.rotulo} às ${hora}. ${destino.motivo}`);
    }
    fechar(true);
  };
  return (
    <div id={id} role="group" aria-label={`Marcar visita: ${i.nome}`} onKeyDown={esc} className="mt-3 border-l-2 border-border pl-4">
      <Chips rotulo="Dia" opcoes={dias.map((d) => ({ id: d.dia, nome: d.rotulo }))} valor={dia} escolher={setDia} />
      <Chips rotulo="Hora" opcoes={HORAS_VISITA.map((h) => ({ id: h, nome: h }))} valor={hora} escolher={setHora} />
      <p className="mt-3 text-[15px] text-muted-foreground">{destino.motor ? "Ao guardar, o negócio passa a Visita e a visita fica na agenda." : destino.motivo}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" className={BOTAO} disabled={!dia || !hora} onClick={guardar}>Guardar</Button>
        <Button type="button" variant="ghost" className={BOTAO} onClick={() => fechar(false)}>Cancelar</Button>
      </div>
      {(!dia || !hora) && <p className="mt-2 text-[15px] text-muted-foreground">Escolha o dia e a hora.</p>}
    </div>
  );
}

function EditorTarefa({ i, id, fechar, esc, anunciar }: EditorProps & { anunciar: (m: string) => void }) {
  const [titulo, setTitulo] = useState<TituloTarefa | null>(null), [outro, setOutro] = useState(""), [dias, setDias] = useState<string | null>(null);
  const idOutro = useId();
  const texto = titulo === OUTRO ? outro.trim() : titulo;
  const pronto = !!texto && dias !== null;
  const guardar = (): void => {
    const n = Number(dias);
    juntarTarefa({ nome: i.nome, dealId: i.dealId, servico: i.servico, titulo: texto!, dias: n });
    anunciar(`Tarefa criada: ${texto}, ${i.nome}, para ${quandoTexto(n)}.`);
    fechar(true);
  };
  return (
    <div id={id} role="group" aria-label={`Nova tarefa: ${i.nome}`} onKeyDown={esc} className="mt-3 border-l-2 border-border pl-4">
      <Chips rotulo="O quê" opcoes={TITULOS_TAREFA.map((t) => ({ id: t, nome: t }))} valor={titulo} escolher={(v) => setTitulo(v as TituloTarefa)} />
      {titulo === OUTRO && (
        <div className="mt-3">
          <label htmlFor={idOutro} className="block text-[15px] font-medium">Qual?</label>
          <input id={idOutro} value={outro} maxLength={60} onChange={(e) => setOutro(e.target.value)} autoFocus
            className="mt-2 h-11 w-full max-w-sm rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
      )}
      <Chips rotulo="Quando" opcoes={QUANDO_TAREFA.map((q) => ({ id: String(q.dias), nome: q.nome }))} valor={dias} escolher={setDias} />
      <p className="mt-3 text-[15px] text-muted-foreground">Fica ligada a {i.nome}{i.dealId ? ` e ao negócio ${i.servico}` : ""}.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" className={BOTAO} disabled={!pronto} onClick={guardar}>Guardar</Button>
        <Button type="button" variant="ghost" className={BOTAO} onClick={() => fechar(false)}>Cancelar</Button>
      </div>
      {!pronto && <p className="mt-2 text-[15px] text-muted-foreground">Escolha o quê e quando.</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- uma linha */

interface LinhaProps extends Pick<Ctx, "S" | "A" | "run" | "go"> {
  i: ItemV2; editor: Editor; abrirEditor: (e: Editor) => void; fecharEditor: (guardou: boolean) => void; anunciar: (m: string) => void; verPessoa: (i: ItemV2) => void;
}

function Linha({ i, editor, abrirEditor, fecharEditor, anunciar, verPessoa, S, A, run, go }: LinhaProps) {
  const base = `hv2-${idSeguro(i.chave)}`, aberto = editor?.chave === i.chave ? editor.tipo : null;
  const esc = (e: KeyboardEvent): void => { if (e.key === "Escape") { e.stopPropagation(); fecharEditor(false); } };
  const alternar = (tipo: "visita" | "tarefa"): void => abrirEditor(aberto === tipo ? null : { chave: i.chave, tipo });
  return (
    <li className="border-t border-border py-4 first:border-t-0">
      <div className="flex items-start gap-3">
        <IconeFase fase={i.fase} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-foreground">{i.nome}{i.exemplo && <span className="font-normal text-muted-foreground"> · exemplo</span>}</p>
          <p className="text-[15px] text-muted-foreground">{CATEGORIAS[i.cat].nome} · {i.servico}</p>
          <p className="text-[15px] font-medium text-foreground">{i.razao}</p>
          {i.outras.length > 0 && <p className="text-[15px] text-muted-foreground">Também: {i.outras.join(" · ")}</p>}
          {i.tarefas.length > 0 && (
            <ul className="mt-2 grid gap-1" aria-label={`Tarefas de ${i.nome}`}>
              {i.tarefas.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ListTodo className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="text-[15px]">Tarefa: {t.titulo} · {quandoTexto(t.dias)}</span>
                  <Button type="button" variant="outline" className={BOTAO} aria-label={`Marcar como feita: ${t.titulo}, ${i.nome}`}
                    onClick={() => { concluirTarefa(t.id); anunciar(`Tarefa feita: ${t.titulo}, ${i.nome}.`); }}>
                    <CheckCircle2 className="mr-2 h-5 w-5" aria-hidden="true" />Feita
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 pl-0 sm:pl-12">
        {i.aprovar && (
          <>
            <Button type="button" variant="outline" className={BOTAO} onClick={go(() => A.aprovar(i.dealId!))}>Aprovar</Button>
            <Button type="button" variant="outline" className={BOTAO} onClick={go(() => A.recusarAprov(i.dealId!))}>Recusar</Button>
          </>
        )}
        {i.acao && <Button type="button" variant="outline" className={BOTAO} onClick={go(() => fazer(A, i.acao!.act, i.dealId!))}>{i.acao.rotulo}</Button>}
        {i.podeVisita && (
          <Button type="button" id={`${base}-bv`} variant="outline" className={BOTAO} aria-label={`Marcar visita: ${i.nome}`} aria-expanded={aberto === "visita"} aria-controls={aberto === "visita" ? `${base}-ev` : undefined}
            onClick={() => alternar("visita")}><CalendarDays className="mr-2 h-5 w-5" aria-hidden="true" />Marcar visita</Button>
        )}
        <Button type="button" id={`${base}-bt`} variant="outline" className={BOTAO} aria-expanded={aberto === "tarefa"} aria-controls={aberto === "tarefa" ? `${base}-et` : undefined}
          aria-label={`Tarefa para ${i.nome}`} onClick={() => alternar("tarefa")}><Plus className="mr-2 h-5 w-5" aria-hidden="true" />Tarefa</Button>
        {i.dealId
          ? <Button type="button" variant="ghost" className={BOTAO} aria-label={`Abrir o negócio: ${i.nome}`} onClick={go(() => A.abrir(i.dealId!))}>Abrir o negócio</Button>
          : <Button type="button" variant="ghost" className={BOTAO} aria-label={`Ver a pessoa: ${i.nome}`} onClick={() => verPessoa(i)}>Ver a pessoa</Button>}
      </div>
      {aberto === "visita" && <EditorVisita i={i} id={`${base}-ev`} fechar={fecharEditor} esc={esc} S={S} A={A} run={run} anunciar={anunciar} />}
      {aberto === "tarefa" && <EditorTarefa i={i} id={`${base}-et`} fechar={fecharEditor} esc={esc} anunciar={anunciar} />}
    </li>
  );
}

/* ---------------------------------------------------------------- as perguntas do cliente */

const ICONE_CANAL: Record<CanalResposta, typeof Mail> = { Email: Mail, WhatsApp: MessageCircle };

interface EditorRespostaProps { p: PerguntaCliente; S: Ctx["S"]; id: string; modelo0: string; fechar: (guardou: boolean) => void; esc: (e: KeyboardEvent) => void; anunciar: (m: string) => void }

function EditorResposta({ p, S, id, modelo0, fechar, esc, anunciar }: EditorRespostaProps) {
  const c = contactoDe(S, p);
  const [canal, setCanal] = useState<CanalResposta | null>(c.preferido);
  const [modelo, setModelo] = useState<string | null>(modelo0);
  const [escrito, setEscrito] = useState("");
  const idTexto = useId();
  const texto = textoResposta(p, modelo, escrito), falta = faltaEnviar(c, canal, texto);
  const enviar = (): void => {
    if (falta.length) return;
    const para = destinoDe(c, canal!)!;
    responderPergunta({ pergunta: p.id, cliente: p.cliente, canal: canal!, para, texto: texto! });
    anunciar(`Resposta enviada a ${p.cliente} por ${canal} (${para}). A pergunta saiu da lista.`);
    fechar(true);
  };
  return (
    <div id={id} role="group" aria-label={`Responder a ${p.cliente}`} onKeyDown={esc} className="mt-3 border-l-2 border-border pl-4">
      <fieldset className="mt-1">
        <legend className="text-[15px] font-medium">Responder por</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CANAIS.map((k) => {
            const para = destinoDe(c, k), I = ICONE_CANAL[k];
            return (
              <button key={k} type="button" aria-pressed={canal === k} disabled={!para} onClick={() => setCanal(k)}
                className={cn(CHIP(canal === k), "inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60")}>
                <I className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />{k} · {para ?? (k === "Email" ? "sem email" : "sem telefone")}
              </button>
            );
          })}
        </div>
      </fieldset>
      <Chips rotulo="Resposta" opcoes={OPCOES_RESPOSTA} valor={modelo} escolher={setModelo} />
      {modelo === OUTRA && (
        <div className="mt-3">
          <label htmlFor={idTexto} className="block text-[15px] font-medium">A sua resposta (curta)</label>
          <textarea id={idTexto} value={escrito} maxLength={MAX_TEXTO} rows={3} onChange={(e) => setEscrito(e.target.value)} autoFocus
            className="mt-2 w-full max-w-xl rounded-lg border border-input bg-card px-3 py-2 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
      )}
      {texto && modelo !== OUTRA && <p className="mt-3 text-[15px] text-foreground">Vai enviar: “{texto}”</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" className={BOTAO} disabled={falta.length > 0} onClick={enviar}>Enviar</Button>
        <Button type="button" variant="ghost" className={BOTAO} onClick={() => fechar(false)}>Cancelar</Button>
      </div>
      {falta.length > 0 && <p className="mt-2 text-[15px] text-muted-foreground">{falta.join(" ")}</p>}
      <p className="mt-2 text-[15px] text-muted-foreground">Protótipo: a resposta não sai daqui, fica só nesta sessão.</p>
    </div>
  );
}

interface PerguntaProps extends Pick<Ctx, "S" | "A" | "go"> {
  p: PerguntaCliente; editor: Editor; abrirEditor: (e: Editor) => void; fecharEditor: (guardou: boolean) => void; anunciar: (m: string) => void;
}

function LinhaPergunta({ p, editor, abrirEditor, fecharEditor, anunciar, S, A, go }: PerguntaProps) {
  const base = `hv2p-${idSeguro(p.id)}`, aberto = editor?.chave === p.id && editor.tipo === "resposta";
  const c = contactoDe(S, p);
  const esc = (e: KeyboardEvent): void => { if (e.key === "Escape") { e.stopPropagation(); fecharEditor(false); } };
  const contacto = [c.email && `Email ${c.email}`, c.tel && `WhatsApp ${c.tel}`].filter(Boolean).join(" · ") || "Sem contacto no negócio";
  return (
    <li className="border-t border-border py-4 first:border-t-0">
      <div className="flex items-start gap-3">
        <MessageSquareText className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-foreground">{p.cliente}</p>
          <p className="text-[15px] text-muted-foreground">Pergunta · {p.negocio} · {p.origem} · {haQuanto(p.minutos)}</p>
          <blockquote className="mt-2 border-l-2 border-border pl-3 text-base text-foreground">{p.texto}</blockquote>
          <p className="mt-2 text-[15px] text-muted-foreground">{contacto}</p>
        </div>
      </div>
      {!aberto && (
        <div role="group" aria-label={`Responder a ${p.cliente} com`} className="mt-3 flex flex-wrap gap-2 pl-0 sm:pl-9">
          {OPCOES_RESPOSTA.map((m, k) => (
            <button key={m.id} id={`${base}-br${k}`} type="button" aria-expanded={false} className={CHIP(false)}
              onClick={() => abrirEditor({ chave: p.id, tipo: "resposta", modelo: m.id })}>{m.nome}</button>
          ))}
          <Button type="button" variant="ghost" className={BOTAO} aria-label={`Abrir o negócio: ${p.cliente}`} onClick={go(() => A.abrir(p.dealId))}>Abrir o negócio</Button>
        </div>
      )}
      {aberto && <EditorResposta p={p} S={S} id={`${base}-er`} modelo0={editor!.modelo ?? MODELOS_RESPOSTA[0].id} fechar={fecharEditor} esc={esc} anunciar={anunciar} />}
    </li>
  );
}

function Respondidas({ rs }: { rs: readonly RespostaV2[] }) {
  if (!rs.length) return null;
  return (
    <ul className="mt-2" aria-label="Perguntas respondidas">
      {rs.map((r) => {
        const I = ICONE_CANAL[r.canal];
        return (
          <li key={r.id} className="flex items-center gap-3 border-t border-border py-3 text-[15px] text-muted-foreground first:border-t-0">
            <I className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span><span className="font-medium text-foreground">{r.cliente}</span> · Respondida há instantes por {r.canal} ({r.para})</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------- Direção: a equipa */

function Equipa({ S, A, go }: Pick<Ctx, "S" | "A" | "go">) {
  const linhas = equipa(S);
  const cols: [string, (l: (typeof linhas)[number]) => string][] = [
    ["Por contactar", (l) => String(l.porContactar)], ["Visitas", (l) => String(l.visitas)], ["Orçamentos por enviar", (l) => String(l.orcamentos)],
    ["Propostas à espera", (l) => String(l.propostas)], ["Por assinar", (l) => String(l.contratos)], ["Em proposta", (l) => `${eur(l.valorPropostas)} €`],
    ["Com atraso", (l) => String(l.atrasos)],
  ];
  return (
    <Secao id="hv2-equipa" titulo="A equipa" icone={<Users className="h-5 w-5 text-primary" aria-hidden="true" />}>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[15px]">
          <caption className="sr-only">Os números de cada comercial (pessoas por contactar e com visita; negócios nas outras colunas)</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-3 font-semibold">Comercial</th>
              {cols.map(([c]) => <th key={c} scope="col" className="py-2 pr-3 font-semibold">{c}</th>)}
              <th scope="col" className="py-2"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.comercial} className="border-b border-border">
                <th scope="row" className="py-2 pr-3 font-medium">{l.comercial}</th>
                {cols.map(([c, v]) => <td key={c} className="py-2 pr-3 tabular-nums">{v(l)}</td>)}
                <td className="py-2">
                  {/* "Os meus" (S.filtro "meus") são os negócios do comercial: é o filtro que existe no Estado. */}
                  <Button type="button" variant="outline" className={BOTAO} aria-label={`Ver os negócios de ${l.comercial}`} onClick={go(() => { A.nav("negocios"); A.filtro("meus"); })}>Ver os negócios</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {linhas.length === 1 && <p className="mt-2 text-[15px] text-muted-foreground">Nos dados de exemplo há um só comercial.</p>}
    </Secao>
  );
}

/* ---------------------------------------------------------------- Armazém: o Inventário */

function InventarioArmazem({ A, go }: Pick<Ctx, "A" | "go">) {
  const linhas = resumoInventario(contadoresInv(useInventario()));
  return (
    <Secao id="hv2-inv" titulo="Inventário" icone={<Warehouse className="h-5 w-5 text-primary" aria-hidden="true" />}>
      {linhas.length === 0
        ? <p className="mt-3 text-[15px] text-muted-foreground">Nada pendente no Inventário.</p>
        : <ul className="mt-3 grid gap-1">{linhas.map((l) => <li key={l.id} className="text-[15px]"><span className="font-semibold tabular-nums">{l.n}</span> {l.texto}</li>)}</ul>}
      {/* O ecrã aberto dentro do Inventário vive em PrototipoNegocios.tsx: na V2 a vista "inventario" abre nas Encomendas, não nas Contagens. */}
      <Button type="button" variant="outline" className={cn(BOTAO, "mt-3")} onClick={go(() => A.nav("inventario"))}>Abrir o Inventário</Button>
      <p className="mt-2 text-[15px] text-muted-foreground">Na V2 abre nas Encomendas; as Contagens estão no menu do Inventário.</p>
    </Secao>
  );
}

/* ---------------------------------------------------------------- o ecrã */

export function HojeV2({ S, A, run, go }: Ctx) {
  const r: Papel = S.role;
  const regs = useRegistos(), dados = useHojeV2();
  const [aviso, anunciar] = useAviso();
  const [cat, setCat] = useState<FiltroV2>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const focar = useRef<string | null>(null), tituloLista = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!focar.current) return;
    const alvo = focar.current === "lista" ? tituloLista.current : document.getElementById(focar.current);
    focar.current = null;
    alvo?.focus();
  });
  useEffect(() => { setCat(null); setEditor(null); }, [r]);

  const itens = hojeV2(S, r, regs, dados);
  const respostas = dados.respostas ?? [];
  const perguntas = perguntasPorResponder(r, respostas.map((x) => x.pergunta));
  const verPerguntas = vePerguntas(r) && (cat === null || cat === "perguntas");
  const conts = contadores(itens, r), vistos = cat === "perguntas" ? [] : filtrarCat(itens, cat);
  const total = itens.length + perguntas.length;
  const alertas = alertasV2(S, r);
  const ag = agendaV2(S, r, regs, dados), sem = semana(), agVisto = doDia(ag, dia);
  const atrasos = itens.filter((i) => i.atraso).length;

  const abrirEditor = (e: Editor): void => setEditor(e);
  const fecharEditor = (guardou: boolean): void => {
    if (editor) {
      focar.current = guardou ? "lista"
        : editor.tipo === "resposta" ? `hv2p-${idSeguro(editor.chave)}-br0`
          : `hv2-${idSeguro(editor.chave)}-${editor.tipo === "visita" ? "bv" : "bt"}`;
    }
    setEditor(null);
  };
  const verPessoa = (i: ItemV2): void => {
    const lista = i.papel === "cliente" ? "clientes" : "leads";
    if (lerVersao() === "funcional") escolherPessoaFunc(i.nome, lista); else escolherPessoa(i.nome, lista);
    go(() => A.nav("pessoas"))();
  };
  const irAlerta = (a: AlertaV2): void => go(() => {
    if (a.destino === "negocios-atraso") { A.nav("negocios"); A.filtro("atraso"); }
    else if (a.destino === "negocios") { A.nav("negocios"); A.filtro("todos"); }
    else A.nav(a.destino);
  })();
  const escolherCat = (c: FiltroV2): void => {
    setCat(c); setEditor(null);
    if (c === "perguntas") { anunciar(`Lista filtrada por Perguntas: ${perguntas.length}`); return; }
    const n = c ? filtrarCat(itens, c).length : total;
    anunciar(c ? `Lista filtrada por ${CATEGORIAS[c].nome}: ${n}` : `A mostrar tudo: ${n}`);
  };
  const escolherDia = (d: string | null): void => {
    setDia(d);
    const n = doDia(ag, d).length;
    anunciar(d ? `Agenda de ${rotuloDia(d)}: ${n === 1 ? "1 compromisso" : `${n} compromissos`}` : `Agenda da semana: ${n}`);
  };

  const nP = perguntas.length, textoPerguntas = nP ? `${nP} ${nP === 1 ? "pergunta" : "perguntas"} de clientes` : "";
  const frase = itens.length === 0
    ? (nP ? `Tem ${textoPerguntas} por responder.` : "Não tem nada pendente. Mude de papel no menu para ver o trabalho dos outros.")
    : `Tem ${itens.length} ${itens.length === 1 ? "coisa" : "coisas"} para tratar${atrasos ? `, ${atrasos} com atraso` : ""}${nP ? ` e ${textoPerguntas}` : ""}.`;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <p className="text-[15px] text-muted-foreground">Hoje é {rotuloDia(HOJE_V2)} (o dia dos dados de exemplo)</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">{saudacao(new Date().getHours())}, {PAPEIS[r].nome}</h1>
      <p className="mt-2 text-lg text-muted-foreground">{frase}</p>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{aviso}</p>
      <button type="button" onClick={go(() => A.abrir(1050))} className={cn("mt-2 min-h-11 text-left text-[15px] font-medium text-foreground underline underline-offset-4", FOCO)}>
        Ver um exemplo com tudo preenchido (Joana Ribeiro, obra concluída)
      </button>

      {r === "direcao" && <Equipa S={S} A={A} go={go} />}
      {r === "armazem" && <InventarioArmazem A={A} go={go} />}

      <Secao id="hv2-lista" titulo="Para tratar" icone={<ListTodo className="h-5 w-5 text-primary" aria-hidden="true" />} tituloRef={tituloLista}>
        <div role="group" aria-label="Mostrar na lista" className="mt-3 flex flex-wrap gap-2">
          <button type="button" aria-pressed={cat === null} onClick={() => escolherCat(null)} className={CHIP(cat === null)}>Tudo <span className="tabular-nums">{total}</span></button>
          {vePerguntas(r) && (
            <button type="button" aria-pressed={cat === "perguntas"} onClick={() => escolherCat(cat === "perguntas" ? null : "perguntas")} className={CHIP(cat === "perguntas")}>
              Perguntas <span className="tabular-nums">{perguntas.length}</span>
            </button>
          )}
          {conts.map((c) => (
            <button key={c.cat} type="button" aria-pressed={cat === c.cat} onClick={() => escolherCat(cat === c.cat ? null : c.cat)} className={CHIP(cat === c.cat)}>
              {c.nome} <span className="tabular-nums">{c.n}</span>
            </button>
          ))}
        </div>
        {alertas.length > 0 && (
          <ul className="mt-4 grid gap-2" aria-label="Alertas noutros ecrãs">
            {alertas.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[15px]"><span className="font-semibold tabular-nums">{a.n}</span> {a.texto}</span>
                <Button type="button" variant="outline" className={BOTAO} onClick={() => irAlerta(a)} aria-label={a.filtrado ? `Ver com o filtro: ${a.texto} (abre Negócios com o filtro Com atraso)` : `Abrir: ${a.texto} (em ${a.destino === "negocios" ? "Negócios" : a.destino === "operacoes" ? "Operações" : "Inventário"})`}>
                  {a.filtrado ? "Ver com o filtro" : "Abrir"}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {verPerguntas && (perguntas.length > 0 || respostas.length > 0) && (
          <div className="mt-4">
            <h3 className="text-base font-semibold">Perguntas do cliente</h3>
            {perguntas.length === 0
              ? <p className="mt-2 text-[15px] text-muted-foreground">Todas as perguntas estão respondidas.</p>
              : (
                <ul className="mt-2" aria-label="Perguntas do cliente">
                  {perguntas.map((p) => <LinhaPergunta key={p.id} p={p} editor={editor} abrirEditor={abrirEditor} fecharEditor={fecharEditor} anunciar={anunciar} S={S} A={A} go={go} />)}
                </ul>
              )}
            <Respondidas rs={respostas} />
          </div>
        )}
        {cat === "perguntas" ? null : vistos.length === 0
          ? <p className="mt-4 text-[15px] text-muted-foreground">{cat ? `Nada em ${CATEGORIAS[cat].nome}.` : "Nada para tratar."}</p>
          : (
            <ul className="mt-4" aria-label={cat ? CATEGORIAS[cat].nome : "Para tratar"}>
              {vistos.map((i) => <Linha key={i.chave} i={i} editor={editor} abrirEditor={abrirEditor} fecharEditor={fecharEditor} anunciar={anunciar} verPessoa={verPessoa} S={S} A={A} run={run} go={go} />)}
            </ul>
          )}
      </Secao>

      <Secao id="hv2-agenda" titulo="Agenda" icone={<CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />}>
        <div role="group" aria-label="Escolher o dia" className="mt-3 flex flex-wrap gap-2">
          <button type="button" aria-pressed={dia === null} onClick={() => escolherDia(null)} className={CHIP(dia === null)}>Toda a semana</button>
          {sem.map((d) => {
            const n = doDia(ag, d.dia).length;
            return (
              <button key={d.dia} type="button" aria-pressed={dia === d.dia} onClick={() => escolherDia(dia === d.dia ? null : d.dia)} className={CHIP(dia === d.dia)}
                aria-label={`${d.hoje ? "Hoje, " : ""}${d.rotulo}: ${n === 1 ? "1 compromisso" : `${n} compromissos`}`}>
                {d.hoje ? "Hoje" : d.rotulo} <span className="tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>
        {agVisto.length === 0
          ? <p className="mt-4 text-[15px] text-muted-foreground">{dia ? `Nada marcado para ${rotuloDia(dia)}.` : "Nada marcado."}</p>
          : (
            <ul className="mt-4" aria-label={dia ? `Agenda de ${rotuloDia(dia)}` : "Agenda"}>
              {agVisto.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border py-3 first:border-t-0">
                  <span className="w-24 shrink-0 tabular-nums">
                    <span className="block text-base font-medium">{c.hora || "—"}</span>
                    <span className="block text-[15px] text-muted-foreground">{rotuloDia(c.dia)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base text-foreground">{c.titulo}</span>
                    <span className="block text-[15px] text-muted-foreground">{c.quem}</span>
                  </span>
                  {c.dealId !== null && <Button type="button" variant="ghost" className={BOTAO} aria-label={`Abrir o negócio: ${c.quem}`} onClick={go(() => A.abrir(c.dealId!))}>Abrir</Button>}
                </li>
              ))}
            </ul>
          )}
      </Secao>
    </div>
  );
}
