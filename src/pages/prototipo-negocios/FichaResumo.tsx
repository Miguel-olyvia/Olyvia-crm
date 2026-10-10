// O separador Resumo da ficha: secções em colunas, separadas por linhas, e "Marcar como perdida" só nas leads.
import { useEffect, useRef, type ReactNode } from "react";
import { AlertCircle, ArrowRight, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eur, type Estado } from "./motor";
import { atrasada, proximoDe } from "./leadsDocs";
import { itensPessoa, type PessoaApp } from "./pessoasDocs";
import { LIMITE_SEM_CONTACTO, camposContacto, infoOrigemDe, probabilidade, utmDe, type Perfil } from "./perfilDocs";
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

function NegociosCurso({ S, p, abrir }: { S: Estado; p: PessoaApp; abrir: (id: number) => () => void }) {
  const negocios = itensPessoa(S, p).slice(0, 3);
  return (
    <Secao titulo="Negócios em curso">
      {negocios.length === 0 ? <p className="text-[15px] text-muted-foreground">Sem negócios em curso.</p> : (
        <ul className="divide-y divide-border">
          {negocios.map((it) => (
            <li key={it.id}>
              <button type="button" onClick={abrir(it.negocioId)} className="group flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 py-2 text-left text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span><span className="block font-medium">{it.tipo} · {it.servico}</span><span className="block text-muted-foreground">{it.valor !== null ? `${eur(it.valor)} € · ` : ""}{probabilidade(it.tipo)} % de fechar</span></span>
                <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

function NotasRapidas({ f }: { f: Perfil }) {
  if (f.notas.length === 0) return <Secao titulo="Notas rápidas"><p className="text-[15px] text-muted-foreground">Ainda sem notas.</p></Secao>;
  return (
    <Secao titulo="Notas rápidas">
      <ul className="divide-y divide-border">
        {f.notas.map((n) => (
          <li key={n.id} className="py-2 text-[15px]"><p>{n.texto}</p><p className="text-muted-foreground">{n.autor} · {n.q}{n.exemplo ? " · exemplo" : ""}</p></li>
        ))}
      </ul>
    </Secao>
  );
}

export interface ResumoProps extends Pick<Ctx, "S" | "A" | "go"> {
  p: PessoaApp;
  f: Perfil;
  voltar: () => void;
}

export function FichaResumo({ S, A, go, p, f, voltar }: ResumoProps) {
  const d = p.principal, nx = proximoDe(p, S), abrir = (id: number) => go(() => A.abrir(id));
  const avisos = avisosDe(S, p, f), origem = infoOrigemDe(S, p), utm = utmDe(S, p);
  const perder = () => { for (const x of p.negocios) A.perderSim(x.id); A.nav("pessoas"); voltar(); };
  const contacto = camposContacto(f);
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Secao titulo="Próximo passo e prazo">
        <p className="text-base font-medium">{nx.t}</p>
        {nx.sub && <p className="text-[15px] text-muted-foreground">{nx.sub}</p>}
        <p className="mt-1 text-[15px]">{f.prazo.atrasado ? `Prazo ultrapassado (era ${f.prazo.data})` : `Até ${f.prazo.data}`}<span className="ml-2 text-muted-foreground">exemplo</span></p>
      </Secao>
      <Secao titulo="Avisos">{avisos.length ? <ul className="grid gap-2">{avisos}</ul> : <p className="text-[15px] text-muted-foreground">Sem avisos. Está tudo em ordem com esta pessoa.</p>}</Secao>
      <Secao titulo="Contacto"><ListaCampos campos={contacto} larg="6rem" /></Secao>
      <Secao titulo="Origem e atribuição" exemplo>
        <ListaCampos campos={[...origem.origem, { rotulo: "UTM em bruto", valor: utm || "Sem UTM" }]} larg="9rem" />
      </Secao>
      {f.visita ? (
        <Secao titulo="Visita">
          <p className="mb-2 flex items-center gap-2 text-[15px] font-medium"><CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />{f.visita.estado}</p>
          <ListaCampos larg="6rem" campos={[{ rotulo: "Data", valor: f.visita.data }, { rotulo: "Hora", valor: f.visita.hora }, { rotulo: "Quem vai", valor: f.visita.quemExemplo ? `${f.visita.quem} (exemplo)` : f.visita.quem }, { rotulo: "Morada", valor: f.visita.morada }]} />
        </Secao>
      ) : <Secao titulo="Visita"><p className="text-[15px] text-muted-foreground">Sem visita marcada.</p></Secao>}
      <NegociosCurso S={S} p={p} abrir={abrir} />
      <NotasRapidas f={f} />
      {p.papel === "lead" && (
        <div className="border-t border-border pt-4 2xl:col-span-2">
          <MarcarPerdida nome={p.nome} abertos={p.negocios.length} confirmar={S.confirmPerda === d.id} perder={go(() => A.perder(d.id))} cancelar={go(() => A.perderNao())} confirmarSim={go(perder)} />
        </div>
      )}
    </div>
  );
}
