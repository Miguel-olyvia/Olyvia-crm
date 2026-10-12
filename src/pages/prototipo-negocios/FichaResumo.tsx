// O separador Resumo da ficha, numa só coluna: próximo passo e prazo (ou, na lead perdida, o motivo da perda), avisos (só se houver), contacto, origem, factos
// e notas, separados por linhas (sem cartões dentro de cartões), e "Marcar como perdida" só nas leads em curso. Os campos são os mesmos na lead e no cliente.
import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { Estado } from "./motor";
import { atrasada } from "./leadsDocs";
import { proximoNegocio, type PessoaApp } from "./pessoasDocs";
import { LIMITE_SEM_CONTACTO, camposContacto, factosResumo, infoOrigemDe, type Perfil } from "./perfilDocs";
import { contactoTexto } from "./listaDocs";
import { resultadoContacto, voltouAContactar } from "./camposPessoa";
import { lembrarPerda } from "./perdaDocs";
import { ListaCampos } from "./FichaListas";
import { MarcarPerdida } from "./MarcarPerdida";
import { MarcaExemplo, ResultadoSelo } from "./SelosPessoa";
import { NOME_QUALIFICACAO } from "./pessoasExemplo";
import type { Ctx } from "./pecas";

function Secao({ titulo, exemplo, children }: { titulo: string; exemplo?: boolean; children: ReactNode }) {
  // Sem acentos no id: "Negócios em curso" não pode virar "neg-cios-em-curso".
  const id = "sec-" + titulo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, "-");
  return (
    <section aria-labelledby={id} className="min-w-0 border-t border-border pt-4">
      <h3 id={id} className="mb-2 text-[16px] font-semibold">{titulo}{exemplo && <span className="ml-2 text-[15px] font-normal text-muted-foreground">exemplo</span>}</h3>
      {children}
    </section>
  );
}

const Aviso = ({ children }: { children: ReactNode }) => (
  <li className="flex items-start gap-2 text-[15px] font-medium text-foreground">
    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" /><span>{children}</span>
  </li>
);

function avisosDe(S: Estado, p: PessoaApp, f: Perfil): ReactNode[] {
  const o = infoOrigemDe(S, p).aviso, l: ReactNode[] = [];
  if (o) l.push(<Aviso key="o">{o.tipo === "conflito" ? "Conflito de contacto: " : "Possível duplicado evitado: "}{o.texto}</Aviso>);
  if (voltouAContactar(S, p, f)) l.push(<Aviso key="v">Voltou a contactar: preencheu o formulário outra vez e ainda ninguém lhe respondeu.</Aviso>);
  if (p.novoNegocio) l.push(<Aviso key="n">Novo negócio em curso: o cliente tem um negócio por fechar.</Aviso>);
  if (atrasada(p)) l.push(<Aviso key="a">Há uma tarefa atrasada nesta pessoa.</Aviso>);
  if (f.diasSemContacto >= LIMITE_SEM_CONTACTO) l.push(<Aviso key="c">Sem contacto há {f.diasSemContacto} dias.</Aviso>);
  return l;
}

const MAX_NOTAS = 3;
/** Os campos de origem que o Resumo mostra; o resto (primeiro e último toque, UTM) está em Entradas. A campanha fica só aqui, nunca na lista. */
const CAMPOS_ORIGEM: readonly string[] = ["Origem", "Canal", "Campanha", "Via de entrada", "Formulário"];

function NotasRapidas({ f }: { f: Perfil }) {
  if (f.notas.length === 0) return <Secao titulo="Notas rápidas"><p className="text-[15px] text-muted-foreground">Ainda sem notas.</p></Secao>;
  return (
    <Secao titulo="Notas rápidas">
      <ul className="divide-y divide-border">
        {f.notas.slice(0, MAX_NOTAS).map((n) => (
          <li key={n.id} className="py-2 text-[15px]"><p>{n.texto}</p><p className="text-muted-foreground">{n.autor} · {n.q}{n.exemplo ? " · exemplo" : ""}</p></li>
        ))}
      </ul>
    </Secao>
  );
}

export interface ResumoProps extends Pick<Ctx, "S" | "A" | "go"> {
  p: PessoaApp;
  f: Perfil;
  /** Fecha a ficha (depois de marcar a lead como perdida). */
  voltar: () => void;
  /** Opcional (V2 funcional): o conteúdo do bloco Contacto (com os botões de copiar). Sem ele, a lista de sempre. */
  contacto?: ReactNode;
}

/** Saúde (com a barra, de exemplo), o último contacto com o resultado e os factos pequenos, em etiqueta e valor. */
function Factos({ p, f }: { p: PessoaApp; f: Perfil }) {
  const { score } = f.saude, c = contactoTexto(f);
  return (
    <dl aria-label="Factos da pessoa" className="grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-[9rem_minmax(0,1fr)]">
      <dt className="text-muted-foreground">Saúde</dt>
      <dd><span className="font-semibold tabular-nums">{score}/100</span><span className="ml-1.5 text-muted-foreground">exemplo</span>
        <Progress value={score} aria-label={`Saúde ${score} em 100`} className="mt-1 h-2 max-w-48" /></dd>
      <dt className="text-muted-foreground">Último contacto</dt>
      <dd className="flex flex-wrap items-center gap-x-2 gap-y-1"><span>{c.texto}</span><ResultadoSelo resultado={resultadoContacto(f)} /><MarcaExemplo /></dd>
      {p.qualificacao && <><dt className="text-muted-foreground">Qualificação</dt><dd>{p.qualificacao}: {NOME_QUALIFICACAO[p.qualificacao]}</dd></>}
      {factosResumo(p, f).map((x) => (
        <div key={x.rotulo} className="contents">
          <dt className="text-muted-foreground">{x.rotulo}</dt>
          <dd className="break-words text-foreground">{x.valor}{x.exemplo && <span className="ml-1.5 text-muted-foreground">exemplo</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** O que a ficha diz primeiro: o próximo passo e o prazo; numa lead perdida, o motivo da perda (e nada de próximo passo). */
function PassoOuPerda({ S, p, f }: { S: Estado; p: PessoaApp; f: Perfil }) {
  const nx = proximoNegocio(p.principal, S);
  if (p.perdida !== null) return <Secao titulo="Perdida"><p className="text-base font-medium">Motivo da perda: {p.perdida}</p></Secao>;
  return (
    <Secao titulo="Próximo passo e prazo">
      <p className="text-base font-medium">{nx.t}</p>
      {nx.sub && <p className="text-[15px] text-muted-foreground">{nx.sub}</p>}
      <p className="mt-1 text-[15px]">{f.prazo.atrasado ? `Prazo ultrapassado (era ${f.prazo.data})` : `Até ${f.prazo.data}`}<span className="ml-2 text-muted-foreground">exemplo</span></p>
      {f.visita && <p className="mt-1 text-[15px]">Visita {f.visita.estado.toLowerCase()}: {f.visita.data}{f.visita.hora && ` · ${f.visita.hora}`}</p>}
    </Secao>
  );
}

export function FichaResumo({ S, A, go, p, f, voltar, contacto }: ResumoProps) {
  const d = p.principal;
  const avisos = avisosDe(S, p, f), origem = infoOrigemDe(S, p).origem.filter((c) => CAMPOS_ORIGEM.includes(c.rotulo));
  // Uma pessoa de exemplo não tem negócio no Estado: perde-se só na memória da sessão (perdaDocs.ts), sem tocar no negócio base.
  const perder = (motivo: string) => {
    lembrarPerda(p.nome, motivo);
    // Numa pessoa de exemplo não há negócio no Estado para perder: só se limpa a confirmação (o motor não o faz sozinho).
    if (p.exemplo) A.perderNao(); else for (const x of p.negocios) A.perderSim(x.id);
    A.nav("pessoas");
    voltar();
  };
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <PassoOuPerda S={S} p={p} f={f} />
      {avisos.length > 0 && <Secao titulo="Avisos"><ul className="grid gap-2">{avisos}</ul></Secao>}
      <Secao titulo="Contacto">{contacto ?? <ListaCampos campos={camposContacto(f, p.empresa)} larg="9rem" />}</Secao>
      <Secao titulo="Origem" exemplo><ListaCampos campos={origem} larg="9rem" /></Secao>
      <Secao titulo="Sobre a pessoa"><Factos p={p} f={f} /></Secao>
      <NotasRapidas f={f} />
      {p.papel === "lead" && p.perdida === null && (
        <div className="border-t border-border pt-4">
          <MarcarPerdida nome={p.nome} abertos={p.negocios.length} exemplo={p.exemplo} confirmar={S.confirmPerda === d.id} perder={go(() => A.perder(d.id))} cancelar={go(() => A.perderNao())}
            confirmarSim={(motivo) => go(() => perder(motivo))()} />
        </div>
      )}
    </div>
  );
}
