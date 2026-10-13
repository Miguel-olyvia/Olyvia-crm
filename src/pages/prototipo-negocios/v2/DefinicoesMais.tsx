// As secções das Definições da V2 acrescentadas a 13/10/2026: Funil e pontuação das leads, Agenda,
// Marketing (tipos de canal) e Plataforma. Saem de ecrãs antigos com separadores e diálogos (o
// LeadWorkflowConfig de Leads, os separadores Quadros/Recursos/Regras do /scheduling, os canais e o menu
// Plataforma). Edita-se na linha, escolhe-se em listas e chips; os dados vivem na store (definicoesDados.ts).
// Sem botões primários: o único da página continua a ser "Aplicar o modelo" do arranque.
import {
  CalendarDays, CircleDot, Handshake, KeyRound, LogIn, Megaphone, Plus, Search, ShieldAlert, Signpost, Trash2, Truck, User, UserX, Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IconeFase } from "../pecas";
import { CANAL_DE_ORIGEM, type Canal } from "../toquesDocs";
import {
  CORES_QUADRO, DIAS, DIAS_NOME, HORAS, OPCOES_ANTECEDENCIA, OPCOES_QUEM_VE, TIPOS_RECURSO, acertarHorario, duracao, resumoDias,
  type QuemVe, type TipoRecurso,
} from "./agendaDefinicoes";
import { CANAIS } from "./campanhas";
import { PLATAFORMA, mudarDefinicoes, useDefinicoes, type TipoPlataforma } from "./definicoesDados";
import {
  CAMPOS_PONTOS, FACTOS, LEADS_EXEMPLO, OPCOES_AVANCO, OPCOES_PONTOS, OPERADORES, acertarLimiares, experimentar, fraseAvanco, fraseRegra, regraNova,
  type CampoLead, type Facto, type Operador,
} from "./funil";
import { BTN, CARTAO, Escolhas, INP, LINHA, Passo, Secao, Sub } from "./pecasDefinicoes";

type Anunciar = (m: string) => void;

const SEL = cn(INP, "w-auto max-w-full");
const pts = (n: number): string => (n > 0 ? `+${n}` : `${n}`);

/* ------------------------------------------------------------------ Funil e pontuação das leads */

export function FunilPontuacao({ anunciar }: { anunciar: Anunciar }) {
  const D = useDefinicoes();
  const nomes = D.nomesFases;
  const resultados = experimentar(LEADS_EXEMPLO, { regras: D.regrasPontos, limiares: D.limiares, avanco: D.avanco });

  return (
    <Secao id="funil" titulo="Funil e pontuação das leads" ajuda="As seis fases são fixas; aqui escolhe o facto que faz cada uma avançar, sem saltar fases. A pontuação soma os pontos das regras que a lead cumpre: a partir do limiar MQL está pronta para o marketing trabalhar, a partir do SQL passa ao comercial. Em Experimentar vê o efeito nas leads de exemplo antes de contar com ele.">
      <Sub id="funil-avanco" titulo="Quando cada fase avança">
        <ol className={CARTAO}>
          {nomes.map((nome, i) => (
            <li key={i} className={LINHA}>
              <IconeFase fase={i} tam="sm" />
              {i === 0 ? <span className="min-w-0 flex-1 text-[15px]">{fraseAvanco(0, null, nomes)}</span> : (
                <label className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[15px]">
                  <span>Passa a <span className="font-medium">{nome}</span> quando</span>
                  <select value={D.avanco[i] ?? ""} className={SEL} aria-label={`Quando passa a ${nome}`}
                    onChange={(e) => { const f = e.target.value as Facto; mudarDefinicoes((d) => { d.avanco[i] = f; }); anunciar(fraseAvanco(i, f, nomes)); }}>
                    {OPCOES_AVANCO[i].map((f) => <option key={f} value={f}>{FACTOS[f]}</option>)}
                  </select>
                </label>
              )}
            </li>
          ))}
        </ol>
      </Sub>

      <Sub id="funil-pontos" titulo="Pontuação das leads">
        {D.regrasPontos.length ? (
          <ul className={CARTAO} aria-label="Regras de pontuação">
            {D.regrasPontos.map((r, i) => {
              const n = i + 1;
              const mudar = (fn: (x: typeof r) => void): void => mudarDefinicoes((d) => { fn(d.regrasPontos[i]); });
              return (
                <li key={r.id} className={cn(LINHA, "text-[15px]")} aria-label={fraseRegra(r)}>
                  <span>Se</span>
                  <select value={r.campo} className={SEL} aria-label={`Campo da regra ${n}`}
                    onChange={(e) => { const c = e.target.value as CampoLead; mudar((x) => { x.campo = c; x.valor = CAMPOS_PONTOS[c].valores[0]; }); }}>
                    {(Object.keys(CAMPOS_PONTOS) as CampoLead[]).map((c) => <option key={c} value={c}>{CAMPOS_PONTOS[c].nome}</option>)}
                  </select>
                  <select value={r.op} className={SEL} aria-label={`Condição da regra ${n}`} onChange={(e) => mudar((x) => { x.op = e.target.value as Operador; })}>
                    {(Object.keys(OPERADORES) as Operador[]).map((o) => <option key={o} value={o}>{OPERADORES[o]}</option>)}
                  </select>
                  <select value={r.valor} className={SEL} aria-label={`Valor da regra ${n}`} onChange={(e) => mudar((x) => { x.valor = e.target.value; })}>
                    {CAMPOS_PONTOS[r.campo].valores.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <span aria-hidden="true">→</span>
                  <select value={r.pontos} className={SEL} aria-label={`Pontos da regra ${n}`} onChange={(e) => mudar((x) => { x.pontos = Number(e.target.value); })}>
                    {OPCOES_PONTOS.map((p) => <option key={p} value={p}>{pts(p)} pontos</option>)}
                  </select>
                  <Button variant="outline" size="icon" className="ml-auto h-11 w-11" aria-label={`Tirar a regra: ${fraseRegra(r)}`}
                    onClick={() => { mudarDefinicoes((d) => { d.regrasPontos.splice(i, 1); }); anunciar("Regra tirada"); }}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : <p className="text-[15px] text-muted-foreground">Sem regras: todas as leads ficam com 0 pontos.</p>}
        <Button variant="outline" className={cn(BTN, "mt-3")}
          onClick={() => { mudarDefinicoes((d) => { d.regrasPontos.push(regraNova(d.regrasPontos)); }); anunciar("Regra nova juntada no fim da lista"); }}>
          <Plus className="h-4 w-4" aria-hidden="true" />Juntar regra
        </Button>
      </Sub>

      <Sub id="funil-limiares" titulo="Limiares MQL e SQL">
        <div className={CARTAO}>
          <Passo rot="Pronta para o marketing (MQL) a partir de" v={D.limiares.mql} un=" pontos" passo={5} max={200} mostrar={(n) => `${n} pts`}
            onSet={(n) => mudarDefinicoes((d) => { d.limiares = acertarLimiares({ ...d.limiares, mql: n }, "mql"); })} />
          <Passo rot="Pronta para o comercial (SQL) a partir de" v={D.limiares.sql} un=" pontos" passo={5} max={200} mostrar={(n) => `${n} pts`}
            onSet={(n) => mudarDefinicoes((d) => { d.limiares = acertarLimiares({ ...d.limiares, sql: n }, "sql"); })} />
        </div>
      </Sub>

      <Sub id="funil-experimentar" titulo="Experimentar">
        <p className="text-[15px] text-muted-foreground">As regras de cima aplicadas a três leads de exemplo. Mude uma regra e o resultado muda logo aqui; nenhuma lead verdadeira é tocada.</p>
        <ul className={cn(CARTAO, "mt-3")} aria-label="Leads de exemplo" aria-live="polite">
          {resultados.map(({ lead, pontos, qualificacao, fase }) => (
            <li key={lead.id} className="grid gap-1 px-4 py-3 sm:px-5" aria-label={lead.nome}>
              <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-[15px] font-medium">{lead.nome}</span>
                <span className="text-[15px] tabular-nums"><span className="font-medium">{pontos.total} pontos</span> · {qualificacao}</span>
              </span>
              <span className="text-[15px] text-muted-foreground">{(Object.keys(CAMPOS_PONTOS) as CampoLead[]).map((c) => lead.campos[c]).join(" · ")}</span>
              <span className="flex items-center gap-2 text-[15px]">
                <IconeFase fase={fase} tam="sm" />Fica em {nomes[fase]}
              </span>
              <span className="text-[15px] text-muted-foreground">
                {pontos.razoes.length
                  ? `Porque: ${pontos.razoes.map((x) => `${CAMPOS_PONTOS[x.regra.campo].nome} ${OPERADORES[x.regra.op]} ${x.regra.valor} (${pts(x.pontos)})`).join("; ")}.`
                  : "Nenhuma regra se aplica."}
              </span>
            </li>
          ))}
        </ul>
      </Sub>
    </Secao>
  );
}

/* ------------------------------------------------------------------ Agenda */

const ICONE_RECURSO: Record<TipoRecurso, LucideIcon> = { Pessoa: User, "Veículo": Truck, Equipamento: Wrench };

function DiasChips({ rot, dias, onAlternar }: { rot: string; dias: readonly boolean[]; onAlternar: (i: number) => void }) {
  return (
    <span role="group" aria-label={rot} className="flex flex-wrap gap-1.5">
      {DIAS.map((d, i) => (
        <button key={d} type="button" aria-pressed={dias[i]} aria-label={DIAS_NOME[i]} title={DIAS_NOME[i]} onClick={() => onAlternar(i)}
          className={cn("inline-grid min-h-11 min-w-11 place-items-center rounded-full border px-2 text-[15px]", dias[i] ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-muted")}>
          {d}
        </button>
      ))}
    </span>
  );
}

function NomeNaLinha({ v, rot, onSet }: { v: string; rot: string; onSet: (v: string) => void }) {
  return (
    <input key={v} defaultValue={v} aria-label={rot} className={cn(INP, "min-w-[10rem] flex-1")}
      onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== v) onSet(n); else e.target.value = v; }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { (e.target as HTMLInputElement).value = v; (e.target as HTMLInputElement).blur(); } }} />
  );
}

export function Agenda({ anunciar }: { anunciar: Anunciar }) {
  const D = useDefinicoes();
  const R = D.marcacao;
  return (
    <Secao id="agenda" titulo="Agenda" ajuda="Os quadros separam as marcações (visitas, obras, entregas) e dizem quem as vê. Os recursos são o que se marca: pessoas, veículos e equipamentos, com os dias em que estão disponíveis. As regras de marcação valem para todas as visitas novas.">
      <Sub id="agenda-quadros" titulo="Quadros">
        <ul className={CARTAO} aria-label="Quadros">
          {D.quadros.map((q, i) => (
            <li key={q.id} className={LINHA}>
              <CalendarDays className={cn("h-5 w-5 shrink-0", CORES_QUADRO[q.cor])} aria-hidden="true" />
              <NomeNaLinha v={q.nome} rot="Nome do quadro" onSet={(n) => { mudarDefinicoes((d) => { d.quadros[i].nome = n; }); anunciar(`Quadro passa a chamar-se ${n}`); }} />
              <label className="flex items-center gap-2 text-[15px]">
                <span className="text-muted-foreground">Cor</span>
                <select value={q.cor} className={SEL} aria-label={`Cor de ${q.nome}`} onChange={(e) => mudarDefinicoes((d) => { d.quadros[i].cor = e.target.value; })}>
                  {Object.keys(CORES_QUADRO).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-[15px]">
                <span className="text-muted-foreground">Quem vê</span>
                <select value={q.quemVe} className={SEL} aria-label={`Quem vê ${q.nome}`}
                  onChange={(e) => { const v = e.target.value as QuemVe; mudarDefinicoes((d) => { d.quadros[i].quemVe = v; }); anunciar(`${q.nome}: ${OPCOES_QUEM_VE.find((o) => o.id === v)?.nome}`); }}>
                  {OPCOES_QUEM_VE.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
              </label>
              <Button variant="outline" size="icon" className="h-11 w-11" aria-label={`Tirar o quadro ${q.nome}`}
                onClick={() => { mudarDefinicoes((d) => { d.quadros.splice(i, 1); }); anunciar(`Quadro ${q.nome} tirado`); }}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
        <Button variant="outline" className={cn(BTN, "mt-3")}
          onClick={() => { mudarDefinicoes((d) => { d.quadros.push({ id: novoId("q", d.quadros), nome: "Quadro novo", cor: "Cinzento", quemVe: "todos" }); }); anunciar("Quadro novo juntado no fim da lista"); }}>
          <Plus className="h-4 w-4" aria-hidden="true" />Juntar quadro
        </Button>
      </Sub>

      <Sub id="agenda-recursos" titulo="Recursos">
        <ul className={CARTAO} aria-label="Recursos">
          {D.recursos.map((r, i) => {
            const I = ICONE_RECURSO[r.tipo];
            return (
              <li key={r.id} className="grid gap-2 px-4 py-3 sm:px-5">
                <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <I className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <NomeNaLinha v={r.nome} rot="Nome do recurso" onSet={(n) => mudarDefinicoes((d) => { d.recursos[i].nome = n; })} />
                  <select value={r.tipo} className={SEL} aria-label={`Tipo de ${r.nome}`} onChange={(e) => mudarDefinicoes((d) => { d.recursos[i].tipo = e.target.value as TipoRecurso; })}>
                    {TIPOS_RECURSO.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <Button variant="outline" size="icon" className="h-11 w-11" aria-label={`Tirar o recurso ${r.nome}`}
                    onClick={() => { mudarDefinicoes((d) => { d.recursos.splice(i, 1); }); anunciar(`${r.nome} tirado dos recursos`); }}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:pl-9">
                  <DiasChips rot={`Dias de ${r.nome}`} dias={r.dias} onAlternar={(k) => mudarDefinicoes((d) => { d.recursos[i].dias[k] = !d.recursos[i].dias[k]; })} />
                  <span className="text-[15px] text-muted-foreground">{resumoDias(r.dias)}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <Button variant="outline" className={cn(BTN, "mt-3")}
          onClick={() => { mudarDefinicoes((d) => { d.recursos.push({ id: novoId("r", d.recursos), nome: "Recurso novo", tipo: "Pessoa", dias: [...d.marcacao.diasTrabalho] }); }); anunciar("Recurso novo juntado no fim da lista"); }}>
          <Plus className="h-4 w-4" aria-hidden="true" />Juntar recurso
        </Button>
      </Sub>

      <Sub id="agenda-regras" titulo="Regras de marcação">
        <div className={CARTAO}>
          {R.duracoes.map((x, i) => (
            <Passo key={x.tipo} rot={`Duração · ${x.tipo}`} v={x.minutos} un=" min" passo={15} min={15} max={480} mostrar={duracao}
              onSet={(n) => mudarDefinicoes((d) => { d.marcacao.duracoes[i].minutos = n; })} />
          ))}
          <Passo rot="Intervalo mínimo entre visitas" v={R.intervaloMin} un=" min" passo={15} max={240} mostrar={duracao}
            onSet={(n) => mudarDefinicoes((d) => { d.marcacao.intervaloMin = n; })} />
          <Escolhas rot="Antecedência mínima" op={OPCOES_ANTECEDENCIA} v={R.antecedencia} onSet={(v) => mudarDefinicoes((d) => { d.marcacao.antecedencia = v; })} />
          <div role="group" aria-label="Horário de trabalho" className={LINHA}>
            <span className="w-32 shrink-0 text-[15px] font-medium">Horário</span>
            <span className="flex flex-wrap items-center gap-2 text-[15px]">
              <span>das</span>
              <select value={R.inicio} className={SEL} aria-label="Começa às"
                onChange={(e) => { const v = e.target.value; mudarDefinicoes((d) => { Object.assign(d.marcacao, acertarHorario(v, d.marcacao.fim, "inicio")); }); }}>
                {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <span>às</span>
              <select value={R.fim} className={SEL} aria-label="Acaba às"
                onChange={(e) => { const v = e.target.value; mudarDefinicoes((d) => { Object.assign(d.marcacao, acertarHorario(d.marcacao.inicio, v, "fim")); }); }}>
                {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </span>
          </div>
          <div className={LINHA}>
            <span className="w-32 shrink-0 text-[15px] font-medium">Dias de trabalho</span>
            <DiasChips rot="Dias de trabalho" dias={R.diasTrabalho} onAlternar={(k) => mudarDefinicoes((d) => { d.marcacao.diasTrabalho[k] = !d.marcacao.diasTrabalho[k]; })} />
          </div>
        </div>
      </Sub>
    </Secao>
  );
}

function novoId(prefixo: string, itens: readonly { id: string }[]): string {
  let n = itens.length + 1;
  while (itens.some((x) => x.id === `${prefixo}${n}`)) n++;
  return `${prefixo}${n}`;
}

/* ------------------------------------------------------------------ Marketing: tipos de canal */

const ICONE_CANAL: Record<Canal, LucideIcon> = {
  "Redes sociais pagas": Megaphone, Pesquisa: Search, Offline: Signpost, Parcerias: Handshake, Outros: CircleDot,
};

export const origensDoCanal = (c: Canal): string[] => Object.keys(CANAL_DE_ORIGEM).filter((o) => CANAL_DE_ORIGEM[o] === c);

export function Marketing({ anunciar }: { anunciar: Anunciar }) {
  const D = useDefinicoes();
  return (
    <Secao id="marketing" titulo="Marketing" ajuda="Os tipos de canal são fixos: cada campanha pertence a um, e cada origem (Meta Ads, Outdoor, Indicação…) cai sempre no mesmo. Marque se o canal é pago: nos pagos, as campanhas pedem o investimento para dar o custo por lead. As campanhas fazem-se no Marketing.">
      <Sub id="marketing-canais" titulo="Tipos de canal">
        <ul className={CARTAO} aria-label="Tipos de canal">
          {CANAIS.map((c) => {
            const I = ICONE_CANAL[c];
            const pago = D.canalPago[c];
            const origens = origensDoCanal(c);
            return (
              <li key={c} className={LINHA}>
                <I className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{c}</span>
                  <span className="block text-[15px] text-muted-foreground">{origens.length ? origens.join(", ") : "O que não tem origem conhecida"}</span>
                </span>
                <button type="button" role="switch" aria-checked={pago} aria-label={`${c} é pago`}
                  onClick={() => { mudarDefinicoes((d) => { d.canalPago[c] = !pago; }); anunciar(`${c}: ${pago ? "não pago" : "pago"}`); }}
                  className="inline-flex min-h-11 items-center gap-3 rounded-lg px-2 text-[15px] hover:bg-muted">
                  <span className="w-16 text-right">{pago ? "Pago" : "Não pago"}</span>
                  <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", pago ? "bg-primary" : "bg-input")}>
                    <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", pago ? "left-[22px]" : "left-0.5")} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sub>
    </Secao>
  );
}

/* ------------------------------------------------------------------ Plataforma (só Direção) */

const ICONE_PLATAFORMA: Record<TipoPlataforma, LucideIcon> = {
  "Acesso de suporte": KeyRound, "Entrada na conta": LogIn, "Pedido de apagamento (RGPD)": UserX,
};

export function Plataforma() {
  return (
    <Secao id="plataforma" titulo="Plataforma" ajuda="O que a Olyvia faz por trás da conta: quando o suporte entrou e até quando, as entradas na conta (também as falhadas) e os pedidos de apagamento de dados ao abrigo do RGPD, com o prazo de 30 dias. Só de leitura.">
      <p className="mt-3 flex items-center gap-2 text-[15px] text-muted-foreground">
        <ShieldAlert className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />Só para o administrador da Olyvia. A equipa da empresa não vê esta secção.
      </p>
      <Sub id="plataforma-lista" titulo="Acessos de suporte, entradas e pedidos RGPD">
        <ul className={CARTAO} aria-label="Registo da plataforma">
          {PLATAFORMA.map((x) => {
            const I = ICONE_PLATAFORMA[x.tipo];
            return (
              <li key={x.id} className={LINHA}>
                <I className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px]">{x.texto}</span>
                  <span className="block text-[15px] text-muted-foreground">{x.tipo} · {x.quem} · {x.quando}</span>
                </span>
                <span className="text-[15px]">{x.estado}</span>
              </li>
            );
          })}
        </ul>
      </Sub>
    </Secao>
  );
}
