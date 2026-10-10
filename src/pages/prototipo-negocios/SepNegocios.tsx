// O separador Negócios da ficha. Uma lead com um só negócio vê o detalhe (negócio, percurso, o que falta, documentos);
// quem tem vários vê a lista, cada negócio com o mesmo desenho em compacto.
import { ArrowRight, Circle } from "lucide-react";
import { eur, type Estado, type Negocio } from "./motor";
import { ETAPAS_PREPARACAO, itensPessoa, negociosAgrupados, type PessoaApp } from "./pessoasDocs";
import type { ItemNegocio } from "./leadsDocs";
import { faltaParaOrcamento } from "./perfilDocs";
import { Chip } from "./pecas";
import { CHIP_PEQ, LINHA, SETA, Vazio, icone } from "./FichaListas";
import { BlocoNegocio, NegocioAgrupado, Percurso } from "./NegocioBloco";

type Abrir = (id: number) => () => void;
const MAX_CAMPOS = 4;

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <section aria-label={titulo} className="grid min-w-0 gap-2 border-t border-border pt-4"><h3 className="text-[16px] font-semibold">{titulo}</h3>{children}</section>;
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
      {f.campos.length > 0 && (
        <p className="text-[15px] text-muted-foreground">Campos por preencher: {f.campos.slice(0, MAX_CAMPOS).join(", ")}{extra > 0 ? ` e mais ${extra}` : ""}.</p>
      )}
    </Secao>
  );
}

/** Os documentos do negócio (orçamento, proposta, contrato…); sem eles, diz quando aparecem. */
function Documentos({ docs, abrir }: { docs: ItemNegocio[]; abrir: Abrir }) {
  return (
    <Secao titulo="Documentos">
      {docs.length === 0 ? <p className="text-[15px] text-muted-foreground">Orçamento, proposta e contrato aparecem aqui quando existirem.</p> : (
        <ul className="divide-y divide-border border-y border-border" aria-label="Documentos do negócio">
          {docs.map((it) => {
            const ic = icone(it.tipo);
            return (
              <li key={it.id}>
                <button type="button" onClick={abrir(it.negocioId)} className={LINHA}>
                  <span className="flex items-center gap-2 text-[15px] text-muted-foreground"><Chip icone={ic.i} cor={ic.cor} className={CHIP_PEQ} />{it.tipo}</span>
                  <span className="text-[15px] font-medium">{it.valor !== null ? `${eur(it.valor)} € · ` : ""}Abrir<ArrowRight className={SETA} aria-hidden="true" /></span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Secao>
  );
}

function Detalhe({ S, p, itens, abrir }: { S: Estado; p: PessoaApp; itens: ItemNegocio[]; abrir: Abrir }) {
  const d = p.principal, docs = itens.filter((it) => !ETAPAS_PREPARACAO.includes(it.tipo));
  return (
    <div className="detalhe-cx">
      <div className="detalhe">
        <div className="grid min-w-0 content-start gap-6"><BlocoNegocio it={itens[0]} d={d} abrir={abrir} /><Secao titulo="Percurso do negócio"><Percurso d={d} /></Secao></div>
        <div className="grid min-w-0 content-start gap-6"><Falta S={S} d={d} /><Documentos docs={docs} abrir={abrir} /></div>
      </div>
    </div>
  );
}

export function SepNegocios({ S, p, abrir }: { S: Estado; p: PessoaApp; abrir: Abrir }) {
  const itens = itensPessoa(S, p);
  if (!itens.length) return <Vazio texto="Esta pessoa ainda não tem negócios." />;
  if (p.papel === "lead" && p.negocios.length === 1) return <Detalhe S={S} p={p} itens={itens} abrir={abrir} />;
  return (
    <ul className="divide-y divide-border border-y border-border" aria-label="Negócios desta pessoa">
      {negociosAgrupados(p, itens).map((g) => (
        <li key={g.chave} className="grid min-w-0 gap-4 px-1 py-5">
          {g.negocio
            ? <NegocioAgrupado g={g} d={g.negocio} abrir={abrir} />
            : <p role="alert" className="text-[15px] text-muted-foreground">Negócio não encontrado nos dados de exemplo ({g.principal.servico}).</p>}
        </li>
      ))}
    </ul>
  );
}
