// O separador Resumo da ficha, numa só coluna: próximo passo, avisos (só se houver), contacto, origem, factos e notas, separados por linhas
// (sem cartões dentro de cartões), e "Marcar como perdida" só nas leads.
import { useEffect, useRef, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { Estado } from "./motor";
import { atrasada, proximoDe } from "./leadsDocs";
import type { PessoaApp } from "./pessoasDocs";
import { LIMITE_SEM_CONTACTO, camposContacto, factosResumo, infoOrigemDe, type Perfil } from "./perfilDocs";
import { ListaCampos } from "./FichaListas";
import type { Ctx } from "./pecas";

function Secao({ titulo, exemplo, children }: { titulo: string; exemplo?: boolean; children: ReactNode }) {
  // Sem acentos no id: "Negócios em curso" não pode virar "neg-cios-em-curso".
  const id = "sec-" + titulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]+/g, "-");
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
  if (p.novoNegocio) l.push(<Aviso key="n">Cliente com um novo negócio em curso, ainda sem contrato.</Aviso>);
  if (atrasada(p)) l.push(<Aviso key="a">Há uma tarefa atrasada nesta pessoa.</Aviso>);
  if (f.diasSemContacto >= LIMITE_SEM_CONTACTO) l.push(<Aviso key="c">Sem contacto há {f.diasSemContacto} dias.</Aviso>);
  return l;
}

interface PerderProps { nome: string; abertos: number; confirmar: boolean; perder: () => void; cancelar: () => void; confirmarSim: () => void }

function MarcarPerdida({ nome, abertos, confirmar, perder, cancelar, confirmarSim }: PerderProps) {
  const botao = useRef<HTMLButtonElement>(null), cancelarRef = useRef<HTMLButtonElement>(null), jaConfirmou = useRef(false);
  // A confirmação aparece no lugar do botão com o foco em "Cancelar"; ao fechá-la sem perder, o foco volta ao botão.
  useEffect(() => {
    if (confirmar) cancelarRef.current?.focus();
    else if (jaConfirmou.current) botao.current?.focus();
    jaConfirmou.current = confirmar;
  }, [confirmar]);
  const negocios = abertos === 1 ? "o negócio aberto" : `os ${abertos} negócios abertos`;
  if (!confirmar) return <Button ref={botao} type="button" variant="outline" className="min-h-11 cursor-pointer text-[15px]" onClick={perder}>Marcar como perdida</Button>;
  return (
    <div role="alertdialog" aria-labelledby="pessoa-perda-texto" className="flex flex-wrap items-center gap-3 border-y border-border py-3 animate-in fade-in-0 motion-reduce:animate-none">
      <p id="pessoa-perda-texto" className="flex-1 text-[15px]">
        Marcar {nome} como perdida? Perdem-se {negocios}. Sai das leads, mas fica no histórico.{abertos > 1 ? " Cada negócio tem o seu aviso com “Anular”." : ""}
      </p>
      <Button ref={cancelarRef} type="button" variant="outline" className="min-h-11 cursor-pointer text-[15px]" aria-label={`Cancelar e manter ${nome} nas leads`} onClick={cancelar}>Cancelar</Button>
      <Button type="button" variant="destructive" className="min-h-11 cursor-pointer text-[15px]" aria-label={`Sim, marcar como perdida: ${nome} e perder ${negocios}`} onClick={confirmarSim}>Sim, marcar como perdida</Button>
    </div>
  );
}

const MAX_NOTAS = 3;
/** Os campos de origem que o Resumo mostra; o resto (primeiro e último toque, UTM) está em Entradas. */
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
}

/** Saúde (com a barra, de exemplo) e os factos pequenos, em etiqueta e valor. */
function Factos({ p, f }: { p: PessoaApp; f: Perfil }) {
  const { score } = f.saude;
  return (
    <dl aria-label="Factos da pessoa" className="grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-[9rem_minmax(0,1fr)]">
      <dt className="text-muted-foreground">Saúde</dt>
      <dd><span className="font-semibold tabular-nums">{score}/100</span><span className="ml-1.5 text-muted-foreground">exemplo</span>
        <Progress value={score} aria-label={`Saúde ${score} em 100`} className="mt-1 h-2 max-w-48" /></dd>
      {factosResumo(p, f).map((x) => (
        <div key={x.rotulo} className="contents">
          <dt className="text-muted-foreground">{x.rotulo}</dt>
          <dd className="break-words text-foreground">{x.valor}{x.exemplo && <span className="ml-1.5 text-muted-foreground">exemplo</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FichaResumo({ S, A, go, p, f, voltar }: ResumoProps) {
  const d = p.principal, nx = proximoDe(p, S);
  const avisos = avisosDe(S, p, f), origem = infoOrigemDe(S, p).origem.filter((c) => CAMPOS_ORIGEM.includes(c.rotulo));
  const perder = () => { for (const x of p.negocios) A.perderSim(x.id); A.nav("pessoas"); voltar(); };
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <Secao titulo="Próximo passo e prazo">
        <p className="text-base font-medium">{nx.t}</p>
        {nx.sub && <p className="text-[15px] text-muted-foreground">{nx.sub}</p>}
        <p className="mt-1 text-[15px]">{f.prazo.atrasado ? `Prazo ultrapassado (era ${f.prazo.data})` : `Até ${f.prazo.data}`}<span className="ml-2 text-muted-foreground">exemplo</span></p>
        {f.visita && <p className="mt-1 text-[15px]">Visita {f.visita.estado.toLowerCase()}: {f.visita.data}{f.visita.hora && ` · ${f.visita.hora}`}</p>}
      </Secao>
      {avisos.length > 0 && <Secao titulo="Avisos"><ul className="grid gap-2">{avisos}</ul></Secao>}
      <Secao titulo="Contacto"><ListaCampos campos={camposContacto(f)} larg="9rem" /></Secao>
      <Secao titulo="Origem" exemplo><ListaCampos campos={origem} larg="9rem" /></Secao>
      <Secao titulo="Sobre a pessoa"><Factos p={p} f={f} /></Secao>
      <NotasRapidas f={f} />
      {p.papel === "lead" && (
        <div className="border-t border-border pt-4">
          <MarcarPerdida nome={p.nome} abertos={p.negocios.length} confirmar={S.confirmPerda === d.id} perder={go(() => A.perder(d.id))} cancelar={go(() => A.perderNao())} confirmarSim={go(perder)} />
        </div>
      )}
    </div>
  );
}
