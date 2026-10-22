// Definições da V2 (13/10/2026): uma só página, com pesquisa em cima ("/" vai para ela) e secções com
// âncoras, sem separadores nem diálogos; edita-se na própria linha. O que o motor já tem (margens da
// empresa, estrutura, campos, setor, aspeto) lê-se e muda-se no Estado, como nas Definições simples;
// o resto vive numa store de módulo (definicoesDados.ts). O único botão primário é "Aplicar" do arranque.
// Funil e pontuação, Agenda, Marketing e Plataforma (só para a Direção) estão em DefinicoesMais.tsx.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, RotateCcw, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EditorFases, ModelosSetor } from "../CamposEditor";
import { FASES, PAPEIS, eur, estruturaHora, type Papel } from "../motor";
import { IconeFase, type Ctx } from "../pecas";
import { useAviso } from "../useAviso";
import { AjudaBotao, AjudaTexto, ComAjuda } from "./Ajuda";
import { BTN, CARTAO, Chip, Escolhas, INP, Interruptor, LINHA, Passo, Secao, Sub } from "./pecasDefinicoes";
import {
  OPCOES_COBRA, OPCOES_EMPRESAS, OPCOES_PESSOAS, SEM_RESPOSTAS, alternarServico, emFalta, escolherSetor, planoArranque, servicosDoSetor, type Respostas,
} from "./arranque";
import {
  PERFIS, TIPOS_LIXO, esquecerDefinicoes, mudarDefinicoes, reenviar, restaurar, useDefinicoes, type Modelo, type TipoLixo,
} from "./definicoesDados";
import { indiceVisivel, procurar, secoesVisiveis, tituloSecao } from "./definicoesIndice";
import { Agenda, FunilPontuacao, Marketing, Plataforma } from "./DefinicoesMais";
import { DemolicaoV2 } from "./DemolicaoV2";
import { RESUMO_SETOR, SETORES_V2, type Termos } from "./setoresV2";

const OPCOES_TERMOS: Record<keyof Termos, { rot: string; op: string[] }> = {
  cliente: { rot: "Quem compra", op: ["Cliente", "Condómino", "Empresa"] },
  local: { rot: "Onde se trabalha", op: ["Local", "Instalação", "Espaço", "Edifício"] },
  obra: { rot: "O trabalho", op: ["Obra", "Serviço", "Instalação", "Intervenção"] },
};

/** É um sítio onde se escreve? (aí o "/" escreve-se, não salta para a pesquisa). */
const aEscrever = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

function irPara(ancora: string): void {
  const el = document.getElementById(ancora);
  if (!el) return;
  el.scrollIntoView?.({ behavior: "smooth", block: "start" });
  el.focus({ preventScroll: true });
}

export function DefinicoesV2({ S, A, go, run, repor }: Ctx) {
  const D = useDefinicoes();
  const [aviso, anunciar] = useAviso();
  const [q, setQ] = useState("");
  const pesquisa = useRef<HTMLInputElement>(null);
  const direcao = S.role === "direcao";
  const achados = useMemo(() => procurar(q, indiceVisivel(direcao)), [q, direcao]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || aEscrever(e.target)) return;
      e.preventDefault();
      pesquisa.current?.focus();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <ComAjuda titulo="Definições">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Definições</h1>
          <AjudaBotao />
        </div>
        <p className="mt-2 text-lg text-muted-foreground">Tudo o que se configura, numa só página. Procure ou desça até à secção.</p>
        <AjudaTexto>
          Escreva o que procura (por exemplo "margem", "SMTP" ou "apagados") e escolha o resultado para ir à linha certa. Carregue em "/" em qualquer sítio da página para ir para a pesquisa. As mudanças ficam logo guardadas, sem botão de gravar.
        </AjudaTexto>
      </ComAjuda>

      <div role="search" className="mt-6">
        <label className="relative block">
          <span className="sr-only">Procurar nas Definições</span>
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input ref={pesquisa} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar nas Definições (prima /)"
            onKeyDown={(e) => { if (e.key === "Escape") setQ(""); if (e.key === "Enter" && achados[0]) { irPara(achados[0].ancora); setQ(""); } }}
            aria-describedby="def-resultados" className={cn(INP, "pl-10")} />
        </label>
        <div id="def-resultados" aria-live="polite">
          {q.trim() && (achados.length ? (
            <ul className={cn(CARTAO, "mt-2")} aria-label="Resultados">
              {achados.map((e) => (
                <li key={e.ancora}>
                  <a href={`#${e.ancora}`} onClick={(ev) => { ev.preventDefault(); irPara(e.ancora); setQ(""); }}
                    className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 text-[15px] hover:bg-muted/50 sm:px-5">
                    <span>{e.rotulo}</span><span className="text-muted-foreground">{tituloSecao(e.secao)}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-[15px] text-muted-foreground">Nada com esse nome nas Definições.</p>)}
        </div>
      </div>

      <nav aria-label="Nesta página" className="mt-4 flex flex-wrap gap-x-1 gap-y-0">
        {secoesVisiveis(direcao).map((s) => (
          <a key={s.id} href={`#${s.id}`} onClick={(ev) => { ev.preventDefault(); irPara(s.id); }}
            className="inline-flex min-h-11 items-center rounded-lg px-2 text-[15px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{s.titulo}</a>
        ))}
      </nav>

      <p className="sr-only" role="status" aria-live="polite">{aviso}</p>

      <Arranque S={S} run={run} anunciar={anunciar} />

      {/* ---------------------------------------------------------- Empresa e setor */}
      <Secao id="empresa" titulo="Empresa e setor" ajuda="Os nomes que a Olyvia usa para o cliente, o local e o trabalho, e o modelo de setor de onde partem os campos. Mudar o modelo substitui os campos ajustados; os valores já preenchidos ficam.">
        <Sub id="empresa-termos" titulo="Como chama às coisas">
          <div className={CARTAO}>
            {(Object.keys(OPCOES_TERMOS) as (keyof Termos)[]).map((k) => (
              <Escolhas key={k} rot={OPCOES_TERMOS[k].rot} op={OPCOES_TERMOS[k].op} v={D.termos[k]}
                onSet={(v) => { mudarDefinicoes((d) => { d.termos[k] = v; }); anunciar(`Passa a dizer "${v}"`); }} />
            ))}
          </div>
        </Sub>
        <Sub id="empresa-setor" titulo="Modelo de setor">
          <ModelosSetor S={S} run={run} setores={SETORES_V2}
            onAplicado={(id) => { const r = RESUMO_SETOR[id]; if (r) mudarDefinicoes((d) => { d.termos = { ...r.termos }; }); anunciar("Modelo de setor aplicado"); }} />
        </Sub>
      </Secao>

      {/* ---------------------------------------------------------- Fases e campos */}
      <Secao id="fases" titulo="Fases e campos" ajuda="As seis fases são fixas e avançam sozinhas pelos factos (visita marcada, contrato assinado…). Só os nomes mudam. Em cada fase escolhe o que se pergunta e o que é obrigatório para passar à seguinte.">
        <Sub id="fases-nomes" titulo="Nomes das fases">
          <ol className={CARTAO}>
            {FASES.map((f, i) => (
              <li key={f} className={LINHA}>
                <IconeFase fase={i} tam="sm" />
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="w-20 shrink-0 text-[15px] text-muted-foreground">Fase {i + 1}</span>
                  <input key={D.nomesFases[i]} defaultValue={D.nomesFases[i]} aria-label={`Nome da fase ${i + 1} (${f})`} className={INP}
                    onBlur={(e) => { const v = e.target.value.trim() || f; if (v !== D.nomesFases[i]) { mudarDefinicoes((d) => { d.nomesFases[i] = v; }); anunciar(`Fase ${i + 1} passa a chamar-se ${v}`); } }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                </label>
              </li>
            ))}
          </ol>
        </Sub>
        <Sub id="fases-campos" titulo="Campos de cada fase">
          <EditorFases S={S} run={run} nomes={D.nomesFases} />
        </Sub>
      </Secao>

      {/* ---------------------------------------------------------- Funil e pontuação das leads */}
      <FunilPontuacao anunciar={anunciar} />

      {/* ---------------------------------------------------------- Orçamento */}
      <Secao id="orcamento" titulo="Orçamento" ajuda="Abaixo da margem mínima a proposta só sai com aprovação da Direção. A margem-alvo é a que as sugestões de preço procuram. Cada linha de serviço pode ter as suas.">
        <Sub id="orcamento-margens" titulo="Margens">
          <div className={CARTAO}>
            <Passo rot="Margem mínima · toda a empresa" v={S.cfg.min} un="%" max={90} onSet={(n) => run(() => { S.cfg.min = Math.min(n, S.cfg.alvo); })} />
            <Passo rot="Margem-alvo · toda a empresa" v={S.cfg.alvo} un="%" max={90} onSet={(n) => run(() => { S.cfg.alvo = Math.max(n, S.cfg.min); })} />
            {D.margensLinha.map((m, i) => (
              <div key={m.linha} className="divide-y divide-border">
                <Passo rot={`Mínima · ${m.linha}`} v={m.min} un="%" max={90} onSet={(n) => mudarDefinicoes((d) => { d.margensLinha[i].min = Math.min(n, d.margensLinha[i].alvo); })} />
                <Passo rot={`Alvo · ${m.linha}`} v={m.alvo} un="%" max={90} onSet={(n) => mudarDefinicoes((d) => { d.margensLinha[i].alvo = Math.max(n, d.margensLinha[i].min); })} />
              </div>
            ))}
          </div>
        </Sub>
        <Sub id="orcamento-estrutura" titulo="Estrutura">
          <div className={CARTAO}>
            <Interruptor on={S.cfg.estrutura} onClick={() => run(() => { S.cfg.estrutura = !S.cfg.estrutura; })} titulo={`Somar ${eur(estruturaHora(S))} €/h de estrutura ao custo`}
              texto="Decisão em aberto. Pelo método BMG a estrutura fica dentro da margem: somá-la aqui cobra-a duas vezes." />
          </div>
        </Sub>
        <Sub id="orcamento-deslocacao" titulo="Taxas de deslocação">
          <div className={CARTAO}>
            {D.deslocacao.map((z, i) => (
              <Passo key={z.zona} rot={z.zona} v={z.valor} un="€" passo={5} max={500} onSet={(n) => mudarDefinicoes((d) => { d.deslocacao[i].valor = n; })} />
            ))}
          </div>
        </Sub>
        <Sub id="orcamento-modelos" titulo="Modelos de orçamento e PDF"><ListaModelos itens={D.modelosOrc} /></Sub>
        <Sub id="orcamento-entulho" titulo="Demolição e entulho · só a Direção"><DemolicaoV2 S={S} mudarPapel={() => run(() => A.role("direcao"))} /></Sub>
      </Secao>

      {/* ---------------------------------------------------------- Agenda */}
      <Agenda anunciar={anunciar} />

      {/* ---------------------------------------------------------- Documentos */}
      <Secao id="documentos" titulo="Documentos" ajuda={`Os modelos de onde saem a proposta, o contrato e os emails. "Usado em" diz onde cada um entra; para mudar o texto abre-se o modelo.`}>
        <Sub id="documentos-propostas" titulo="Modelos de proposta"><ListaModelos itens={D.propostas} /></Sub>
        <Sub id="documentos-contratos" titulo="Modelos de contrato"><ListaModelos itens={D.contratos} /></Sub>
        <Sub id="documentos-emails" titulo="Modelos de email"><ListaModelos itens={D.emails} /></Sub>
      </Secao>

      {/* ---------------------------------------------------------- Email */}
      <Secao id="email" titulo="Email" ajuda="O servidor por onde saem os emails da empresa (propostas, lembretes). Se um envio falhar, aparece em baixo e pode reenviar-se depois de corrigir o endereço.">
        <Sub id="email-smtp" titulo="Servidor de email (SMTP)">
          <div className={CARTAO}>
            <label className={LINHA}>
              <span className="w-32 shrink-0 text-[15px] font-medium">Servidor</span>
              <input key={D.smtp.servidor} defaultValue={D.smtp.servidor} className={cn(INP, "flex-1")}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== D.smtp.servidor) mudarDefinicoes((d) => { d.smtp.servidor = v; d.smtp.estado = "por testar"; }); }} />
            </label>
            <label className={LINHA}>
              <span className="w-32 shrink-0 text-[15px] font-medium">Remetente</span>
              <input key={D.smtp.remetente} type="email" defaultValue={D.smtp.remetente} className={cn(INP, "flex-1")}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== D.smtp.remetente) mudarDefinicoes((d) => { d.smtp.remetente = v; d.smtp.estado = "por testar"; }); }} />
            </label>
            <Escolhas rot="Porta" op={["587", "465", "25"]} v={String(D.smtp.porta)} onSet={(v) => mudarDefinicoes((d) => { d.smtp.porta = Number(v); d.smtp.estado = "por testar"; })} />
            <Escolhas rot="Segurança" op={["TLS", "SSL", "Nenhuma"]} v={D.smtp.seguranca} onSet={(v) => mudarDefinicoes((d) => { d.smtp.seguranca = v as typeof d.smtp.seguranca; d.smtp.estado = "por testar"; })} />
            <div className={LINHA}>
              <span className="flex flex-1 items-center gap-2 text-[15px]">
                {D.smtp.estado === "ligado" ? <><Check className="h-4 w-4 text-primary" aria-hidden="true" />Ligado: os emails saem por este servidor.</> : "Por testar: mudou algum dado."}
              </span>
              <Button variant="outline" className={BTN} onClick={() => { mudarDefinicoes((d) => { d.smtp.estado = "ligado"; }); anunciar("Ligação testada: o servidor respondeu"); }}>Testar a ligação</Button>
            </div>
          </div>
        </Sub>
        <Sub id="email-falhas" titulo="Falhas de envio">
          {D.falhas.length ? (
            <ul className={CARTAO}>
              {D.falhas.map((f) => (
                <li key={f.id} className={LINHA}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px]">{f.assunto} · {f.para}</span>
                    <span className="block text-[15px] text-muted-foreground">{f.motivo} · {f.quando}</span>
                  </span>
                  <Button variant="outline" className={BTN} aria-label={`Reenviar ${f.assunto} para ${f.para}`} onClick={() => { reenviar(f.id); anunciar(`Reenviado para ${f.para}`); }}>
                    <Send className="h-4 w-4" aria-hidden="true" />Reenviar
                  </Button>
                </li>
              ))}
            </ul>
          ) : <p className="text-[15px] text-muted-foreground">Não há envios falhados.</p>}
        </Sub>
      </Secao>

      {/* ---------------------------------------------------------- Marketing */}
      <Marketing anunciar={anunciar} />

      {/* ---------------------------------------------------------- Equipa e acessos */}
      <Secao id="equipa" titulo="Equipa e acessos" ajuda="Cada pessoa tem um perfil. Os perfis são fixos: assim ninguém fica com acessos a meio. Para dar mais acesso, muda-se o perfil.">
        <Sub id="equipa-utilizadores" titulo="Utilizadores">
          <ul className={CARTAO}>
            {D.utilizadores.map((u, i) => (
              <li key={u.id} className={LINHA}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{u.nome}</span>
                  <span className="block text-[15px] text-muted-foreground">{u.email}</span>
                </span>
                <label className="flex items-center gap-2 text-[15px]">
                  <span className="sr-only">Perfil de {u.nome}</span>
                  <select value={u.perfil} className={cn(INP, "w-44")}
                    onChange={(e) => { const p = e.target.value as Papel; mudarDefinicoes((d) => { d.utilizadores[i].perfil = p; }); anunciar(`${u.nome} passa a ${PERFIS.find((x) => x.id === p)?.nome}`); }}>
                    {PERFIS.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        </Sub>
        <Sub id="equipa-perfis" titulo="Perfis">
          <ul className={CARTAO}>
            {PERFIS.map((p) => {
              const n = D.utilizadores.filter((u) => u.perfil === p.id).length;
              return (
                <li key={p.id} className="grid gap-1 px-4 py-3 sm:px-5">
                  <span className="flex items-baseline justify-between gap-3"><span className="text-[15px] font-medium">{p.nome}</span><span className="text-[15px] text-muted-foreground">{n === 1 ? "1 pessoa" : `${n} pessoas`}</span></span>
                  <span className="text-[15px]">Pode: {p.faz}</span>
                  <span className="text-[15px] text-muted-foreground">{p.naoFaz}</span>
                </li>
              );
            })}
          </ul>
        </Sub>
      </Secao>

      {/* ---------------------------------------------------------- Plataforma (só a Direção) */}
      {direcao && <Plataforma />}

      {/* ---------------------------------------------------------- Dados */}
      <Secao id="dados" titulo="Dados" ajuda="O que se apaga fica 30 dias no Lixo e pode restaurar-se. Depois sai de vez. Só a Direção vê o Lixo.">
        <Lixo anunciar={anunciar} />
      </Secao>

      {/* ---------------------------------------------------------- Aspeto e demonstração */}
      <Secao id="aspeto" titulo="Aspeto e demonstração" ajuda="O aspeto vale só para este browser. Repor a demonstração volta os negócios e estas Definições ao início.">
        <div className={CARTAO}>
          <div id="aspeto-leitura" tabIndex={-1} className="scroll-mt-6 px-4 outline-none sm:px-5">
            <Interruptor on={!!S.leitura} onClick={() => run(() => A.leitura(!S.leitura))} titulo="Leitura fácil" texto="Letra maior, mais espaço entre letras e linhas, fundo creme." />
          </div>
          <div id="aspeto-atual" tabIndex={-1} className="scroll-mt-6 px-4 outline-none sm:px-5">
            <Interruptor on={false} onClick={go(() => A.aspeto("atual"))} titulo="Ver o aspeto atual da Olyvia" texto="Para comparar com esta proposta." />
          </div>
        </div>
        <div id="aspeto-repor" tabIndex={-1} className="mt-6 scroll-mt-6 outline-none">
          <p className="text-[15px] text-muted-foreground">O que se faz fica guardado neste browser.</p>
          <Button variant="outline" className={cn(BTN, "mt-3")} onClick={() => { esquecerDefinicoes(); repor(); }}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />Repor a demonstração
          </Button>
        </div>
      </Secao>
    </div>
  );
}

/* ------------------------------------------------------------------ peças da página */

function ListaModelos({ itens }: { itens: Modelo[] }) {
  return (
    <ul className={CARTAO}>
      {itens.map((m) => (
        <li key={m.id} className={cn(LINHA, "justify-between")}>
          <span className="text-[15px]">{m.nome}</span>
          <span className="text-[15px] text-muted-foreground">Usado em: {m.usado}</span>
        </li>
      ))}
    </ul>
  );
}

function Lixo({ anunciar }: { anunciar: (m: string) => void }) {
  const D = useDefinicoes();
  const [tipo, setTipo] = useState<TipoLixo | null>(null);
  const itens = D.lixo.filter((x) => !tipo || x.tipo === tipo);
  return (
    <div id="dados-lixo" tabIndex={-1} className="mt-6 scroll-mt-6 outline-none">
      <h3 className="mb-2 text-base font-semibold">Lixo</h3>
      <div role="group" aria-label="Tipo" className="flex flex-wrap gap-2">
        {[null, ...TIPOS_LIXO].map((t) => {
          const n = D.lixo.filter((x) => !t || x.tipo === t).length;
          return (
            <button key={t || "todos"} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)}
              className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px]", tipo === t ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-muted")}>
              {t || "Todos"} <span className="tabular-nums opacity-80">{n}</span>
            </button>
          );
        })}
      </div>
      {itens.length ? (
        <ul className={cn(CARTAO, "mt-3")} aria-label="No Lixo">
          {itens.map((x) => (
            <li key={x.id} className={LINHA}>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px]">{x.nome}</span>
                <span className="block text-[15px] text-muted-foreground">{x.tipo} · apagado {x.quando} por {x.por}</span>
              </span>
              <Button variant="outline" className={BTN} aria-label={`Restaurar ${x.nome}`} onClick={() => { restaurar(x.id); anunciar(`${x.nome} restaurado`); }}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />Restaurar
              </Button>
            </li>
          ))}
        </ul>
      ) : <p className="mt-3 text-[15px] text-muted-foreground">{tipo ? `Não há nada deste tipo no Lixo.` : "O Lixo está vazio."}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ o arranque */

function Pergunta({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <fieldset className="px-4 py-4 sm:px-5">
      <legend className="float-left mb-3 w-full text-[15px] font-medium">{n}. {titulo}</legend>
      <div className="clear-left flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function Arranque({ S, run, anunciar }: Pick<Ctx, "S" | "run"> & { anunciar: (m: string) => void }) {
  const [r, setR] = useState<Respostas>(SEM_RESPOSTAS);
  const [feito, setFeito] = useState<string | null>(null);
  const plano = planoArranque(r);
  const faltam = emFalta(r);
  const mudar = (novo: Respostas): void => { setR(novo); setFeito(null); };
  const aplicar = (): void => {
    if (!plano) return;
    const s = SETORES_V2.find((x) => x.id === plano.setor)!;
    run(() => { S.campos = structuredClone(s.cfg); S.setor = s.id; S.cfg.min = plano.margem.min; S.cfg.alvo = plano.margem.alvo; });
    mudarDefinicoes((d) => {
      d.termos = { ...plano.termos };
      d.margensLinha = plano.servicos.map((linha) => ({ linha, ...plano.margem }));
    });
    setFeito(plano.nomeSetor);
    anunciar(`Modelo ${plano.nomeSetor} aplicado`);
  };

  return (
    <Secao id="arranque" titulo="Arranque" ajuda="Para uma empresa nova: cinco perguntas, e a Olyvia prepara os nomes, as linhas de serviço, as margens, os perfis e os campos da visita a partir do modelo do setor. Pode ajustar tudo depois, nas secções abaixo.">
      <p className="mt-3 text-[15px] text-muted-foreground">Cinco perguntas para deixar a conta pronta a usar.</p>
      <div className={cn(CARTAO, "mt-3")}>
        <Pergunta n={1} titulo="Qual é o setor?">
          {SETORES_V2.map((s) => <Chip key={s.id} on={r.setor === s.id} onClick={() => mudar(escolherSetor(r, s.id))}>{s.nome}</Chip>)}
        </Pergunta>
        <Pergunta n={2} titulo="Que serviços faz?">
          {r.setor
            ? servicosDoSetor(r.setor).map((s) => <Chip key={s} on={r.servicos.includes(s)} onClick={() => mudar(alternarServico(r, s))}>{s}</Chip>)
            : <span className="text-[15px] text-muted-foreground">Escolha primeiro o setor.</span>}
        </Pergunta>
        <Pergunta n={3} titulo="Quantas pessoas são?">
          {OPCOES_PESSOAS.map((o) => <Chip key={o.id} on={r.pessoas === o.id} onClick={() => mudar({ ...r, pessoas: o.id })}>{o.nome}</Chip>)}
        </Pergunta>
        <Pergunta n={4} titulo="Como cobra?">
          {OPCOES_COBRA.map((o) => <Chip key={o.id} on={r.cobra === o.id} onClick={() => mudar({ ...r, cobra: o.id })}>{o.nome}</Chip>)}
        </Pergunta>
        <Pergunta n={5} titulo="Quantas empresas tem?">
          {OPCOES_EMPRESAS.map((o) => <Chip key={o.id} on={r.empresas === o.id} onClick={() => mudar({ ...r, empresas: o.id })}>{o.nome}</Chip>)}
        </Pergunta>
      </div>

      <div className="mt-4" aria-live="polite">
        {plano ? (
          <div aria-label="O que vai ser aplicado" role="region">
            <h3 className="text-base font-semibold">O que vai ser aplicado</h3>
            <dl className="mt-2 grid gap-x-4 gap-y-1 text-[15px] sm:grid-cols-[11rem_1fr]">
              <dt className="text-muted-foreground">Modelo</dt><dd>{plano.nomeSetor}</dd>
              <dt className="text-muted-foreground">Nomes</dt><dd>{plano.termos.cliente} · {plano.termos.local} · {plano.termos.obra}</dd>
              <dt className="text-muted-foreground">Linhas de serviço</dt><dd>{plano.servicos.join(", ")}</dd>
              <dt className="text-muted-foreground">Margens</dt><dd>mínima {plano.margem.min}% · alvo {plano.margem.alvo}%</dd>
              <dt className="text-muted-foreground">Perfis</dt><dd>{plano.perfis.map((p) => PERFIS.find((x) => x.id === p)?.nome ?? PAPEIS[p].nome).join(", ")}</dd>
              <dt className="text-muted-foreground">Campos da visita</dt>
              <dd>{plano.campos.novos} novos, {plano.campos.escondidos} escondidos{plano.campos.gruposEscondidos ? `, ${plano.campos.gruposEscondidos} ${plano.campos.gruposEscondidos === 1 ? "grupo escondido" : "grupos escondidos"}` : ""}</dd>
            </dl>
            {plano.notas.length > 0 && <ul className="mt-2 list-disc pl-5 text-[15px] text-muted-foreground">{plano.notas.map((n) => <li key={n}>{n}</li>)}</ul>}
          </div>
        ) : <p className="text-[15px] text-muted-foreground">Falta responder: {faltam.join(", ")}.</p>}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button className={BTN} disabled={!plano} onClick={aplicar}>{plano ? `Aplicar o modelo ${plano.nomeSetor}` : "Aplicar o modelo"}</Button>
        {feito && <span className="inline-flex items-center gap-2 text-[15px]"><Check className="h-4 w-4 text-primary" aria-hidden="true" />Aplicado. Veja e ajuste nas secções abaixo.</span>}
      </div>
    </Secao>
  );
}
