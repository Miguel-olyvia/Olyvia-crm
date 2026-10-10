// O detalhe de um negócio no separador Negócios da ficha (o lado direito do mestre-detalhe): estado, valor total, probabilidade de fechar,
// próximo passo, o percurso numa linha fina de quatro ou cinco passos (com a marca "Ganho"), "O que falta" e os documentos REAIS do negócio:
// cada orçamento, a proposta que os junta e o contrato (se exigido). Um negócio perdido aparece a cinzento, com o motivo, sem próximo passo nem percurso.
import { forwardRef, type ReactNode } from "react";
import { ArrowRight, BadgeCheck, Check, Circle, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, type Estado, type Negocio } from "./motor";
import { documentosDoNegocio, resumoDoc, textoOrcamentos, valorNegocio, type NegocioApp } from "./negociosApp";
import { proximoNegocio } from "./pessoasDocs";
import { estadoDe, faltaParaOrcamento, percursoDe, probabilidadeDe, type EstadoPasso } from "./perfilDocs";
import { BORDA_CTRL } from "./PessoaLinha";
import { COR_NEGOCIO, ICONE_NEGOCIO } from "./iconeNegocio";
import { Chip } from "./pecas";
import { CHIP_PEQ, Exemplo, LINHA, SETA, icone } from "./FichaListas";

type Abrir = (id: number) => () => void;
const MAX_CAMPOS = 4;

const PASSO: Record<EstadoPasso, { texto: string; icone: typeof Check; classe: string }> = {
  feito: { texto: "Feito", icone: Check, classe: "border-foreground text-foreground" },
  atual: { texto: "Atual", icone: CircleDot, classe: "border-primary font-semibold text-foreground" },
  seguinte: { texto: "Por fazer", icone: Circle, classe: cn(BORDA_CTRL, "text-muted-foreground") },
};

/** A cor do ícone de um negócio perdido: cinzento neutro, como o resto do texto de apoio. */
export const COR_PERDIDO = "bg-muted text-muted-foreground";

/** O valor total em texto: a soma dos orçamentos do negócio, ou "Sem valor ainda". */
export function valorTexto(n: NegocioApp): string {
  const v = valorNegocio(n);
  return v === null ? "Sem valor ainda" : `${eur(v)} €`;
}

/** Levantamento, Orçamento, Proposta, Contrato (só se exigido) e Financeiro: o passo atual marcado em ícone e em texto, e a marca "Ganho"
 *  no passo em que a pessoa passa a cliente. Com vários orçamentos, o passo Orçamento di-lo. Em fila fina quando há largura, em lista quando não. */
export function Percurso({ d, orcamentos = 1 }: { d: Negocio; orcamentos?: number }) {
  return (
    <div className="percurso-cx">
      <ol aria-label="Percurso do negócio" className="percurso text-[15px]">
        {percursoDe(d).map(({ nome, estado, ganho }) => {
          const p = PASSO[estado], I = p.icone;
          return (
            <li key={nome} aria-current={estado === "atual" ? "step" : undefined} className={cn("grid gap-0.5", p.classe)}>
              <span className="flex items-center gap-1.5">
                <I className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="break-words font-medium text-foreground">{nome}{nome === "Orçamento" && orcamentos > 1 && <span className="font-normal text-muted-foreground"> ({orcamentos} orçamentos)</span>}</span>
              </span>
              <span>{p.texto}</span>
              {ganho && <span className="flex items-center gap-1 font-medium text-foreground"><BadgeCheck className="h-4 w-4 shrink-0" aria-hidden="true" />Ganho<span className="sr-only">: a pessoa passa a cliente a seguir a este passo</span></span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <section aria-label={titulo} className="grid min-w-0 gap-2 border-t border-border pt-3"><h4 className="text-[16px] font-semibold">{titulo}</h4>{children}</section>;
}

/** Uma lista curta e concreta, derivada da fase e dos campos obrigatórios que o motor ainda pede. */
function Falta({ S, d }: { S: Estado; d: Negocio }) {
  const f = faltaParaOrcamento(S, d), extra = f.campos.length - MAX_CAMPOS;
  return (
    <Secao titulo={f.titulo}>
      {f.passos.length === 0 ? <p className="text-[15px] text-muted-foreground">Nada em falta: o percurso está completo.</p> : (
        <ol className="grid gap-1.5">
          {f.passos.map((t, i) => (
            <li key={t} className="flex items-center gap-2 text-[15px]">
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />{t}{i === 0 && <span className="text-muted-foreground">· agora</span>}
            </li>
          ))}
        </ol>
      )}
      {f.campos.length > 0 && <p className="text-[15px] text-muted-foreground">Campos por preencher: {f.campos.slice(0, MAX_CAMPOS).join(", ")}{extra > 0 ? ` e mais ${extra}` : ""}.</p>}
    </Secao>
  );
}

/** Os documentos do negócio, cada um com o ícone do seu tipo; sem eles, diz quando aparecem. */
function Documentos({ n, abrir }: { n: NegocioApp; abrir: Abrir }) {
  const docs = documentosDoNegocio(n);
  return (
    <Secao titulo="Documentos">
      {docs.length === 0 ? <p className="text-[15px] text-muted-foreground">Orçamento, proposta e contrato aparecem aqui quando existirem.</p> : (
        <ul className="divide-y divide-border border-y border-border" aria-label="Documentos do negócio">
          {docs.map((x) => {
            const ic = icone(x.tipo);
            return (
              <li key={x.id}>
                <button type="button" onClick={abrir(x.negocioId)} className={LINHA}>
                  <span className="flex items-center gap-2 text-[15px] text-muted-foreground"><Chip icone={ic.i} cor={ic.cor} className={CHIP_PEQ} />{x.tipo}</span>
                  <span className="text-base font-semibold">{x.titulo}</span>
                  <span className="text-[15px] text-muted-foreground">{resumoDoc(x)}</span>
                  <span className="text-[15px] font-medium">Abrir<ArrowRight className={SETA} aria-hidden="true" /></span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Secao>
  );
}

interface DetalheProps { S: Estado; n: NegocioApp; abrir: Abrir; id: string }

/** O que só um negócio em curso tem: o próximo passo, o percurso e o que falta. */
function EmCurso({ S, n, abrir }: { S: Estado; n: NegocioApp; abrir: Abrir }) {
  return (
    <>
      <div>
        <p className="text-[15px] text-muted-foreground">Próximo passo</p>
        <Button type="button" variant="outline" className={cn("mt-1 min-h-11 max-w-full cursor-pointer whitespace-normal text-left text-[15px]", BORDA_CTRL)} onClick={abrir(n.negocioId)}>
          {proximoNegocio(n.deal, S).t}<ArrowRight className="ml-2 h-4 w-4 shrink-0" aria-hidden="true" />
        </Button>
      </div>
      <Secao titulo="Percurso do negócio"><Percurso d={n.deal} orcamentos={n.orcamentos.length} /></Secao>
      <Falta S={S} d={n.deal} />
    </>
  );
}

/** O negócio escolhido. O foco vai para aqui quando o detalhe aparece por baixo da lista (ver SepNegocios). */
export const NegocioDetalhe = forwardRef<HTMLDivElement, DetalheProps>(function NegocioDetalhe({ S, n, abrir, id }, ref) {
  const perdido = n.perdido !== null, nOrc = textoOrcamentos(n);
  return (
    <div ref={ref} id={id} tabIndex={-1} role="region" aria-label={`Negócio: ${n.titulo}`} className="grid min-w-0 content-start gap-4 focus-visible:outline-none">
      <div className="flex items-center gap-3">
        <Chip icone={ICONE_NEGOCIO} cor={perdido ? COR_PERDIDO : COR_NEGOCIO} />
        <h3 className={cn("min-w-0 break-words text-xl font-semibold tracking-tight", perdido && "text-muted-foreground")}>{n.titulo}{n.demo && <Exemplo />}</h3>
      </div>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-x-6 gap-y-2 text-[15px]">
        <div><dt className="text-muted-foreground">Estado</dt><dd className="text-base font-semibold">{estadoDe(n)}</dd></div>
        <div><dt className="text-muted-foreground">Valor total</dt><dd className="text-base font-semibold tabular-nums">{valorTexto(n)}</dd></div>
        {perdido
          ? <div><dt className="text-muted-foreground">Motivo</dt><dd className="text-base font-semibold">{n.perdido}</dd></div>
          : <div><dt className="text-muted-foreground">Probabilidade de fechar</dt><dd className="text-base font-semibold tabular-nums">{probabilidadeDe(n.deal)} %<Exemplo /></dd></div>}
      </dl>
      {nOrc && <p className="text-[15px] text-muted-foreground">{nOrc}, numa só proposta.</p>}
      {n.demo && <p className="text-[15px] text-muted-foreground">Negócio de exemplo: os botões abrem o negócio base da pessoa.</p>}
      {!perdido && <EmCurso S={S} n={n} abrir={abrir} />}
      <Documentos n={n} abrir={abrir} />
    </div>
  );
});
