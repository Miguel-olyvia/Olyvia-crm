// A parte que só se vê dos «Registos ligados» de um negócio: o que está ligado, o que está por ligar, com o botão de ligar e de desligar quando
// há permissão e o negócio está aberto. Não sabe de onde vêm os registos nem como se ligam: o exemplo (stores em memória) e a ficha real
// (a base) montam-na com as suas ações. Uma linha à espera da base fica `aria-disabled` e `aria-busy`; o erro diz-se em role="alert" e
// «A guardar…» numa região de estado sempre montada, para o leitor de ecrã.
import type { ReactNode, RefObject } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import type { RefRegisto, RegistosDaPessoa, TipoRegisto } from "@/components/negocio-metas/registosTipos";
import { ErroDeEnvio } from "@/components/negocio-metas/DialogoDeEnvio";
import { textoDiaCompleto } from "./formatoPessoas";

const P = "pessoasPagina.linked.";
const TIPO: Record<TipoRegisto, string> = { contacto: "kind.contact", visita: "kind.visit", levantamento: "kind.survey" };

/** O texto de um registo: «Visita de 3 de outubro». */
export function oQueDoRegisto(t: (chave: string, params?: Record<string, string | number>) => string, i: ItemRegisto): string {
  return t(`${P}what`, { kind: t(`${P}${TIPO[i.ref.tipo]}`), date: textoDiaCompleto(i.data) });
}

export interface ItemRegisto {
  ref: RefRegisto;
  data: string;
}

/** Os registos de um grupo, do mais antigo para o mais recente. */
export const itensDe = (r: RegistosDaPessoa): ItemRegisto[] => [
  ...r.contactos.map((c): ItemRegisto => ({ ref: { tipo: "contacto", id: c.id }, data: c.data })),
  ...r.visitas.map((v): ItemRegisto => ({ ref: { tipo: "visita", id: v.id }, data: v.data })),
  ...r.levantamentos.map((l): ItemRegisto => ({ ref: { tipo: "levantamento", id: l.id }, data: l.data })),
].sort((a, b) => a.data.localeCompare(b.data));

/** A chave de uma linha (o tipo e o id, que só são únicos dentro do tipo). */
export const chaveDe = (ref: { tipo: string; id: string }): string => `${ref.tipo}:${ref.id}`;

interface ListaProps {
  itens: readonly ItemRegisto[];
  oQue: (i: ItemRegisto) => string;
  /** O botão de uma linha; `null` = a linha só se lê. */
  botao: (i: ItemRegisto) => { texto: string; rotulo: string; aoClicar: () => void } | null;
  ocupadas: ReadonlySet<string>;
  /** Uma explicação em texto, a seguir à linha (um levantamento ligado não se desliga). */
  nota?: (i: ItemRegisto) => string | null;
}

function Lista({ itens, oQue, botao, ocupadas, nota }: ListaProps) {
  return (
    <ul role="list" className="divide-y divide-border">
      {itens.map((i) => {
        const b = botao(i);
        const ocupada = ocupadas.has(chaveDe(i.ref));
        const explicacao = nota?.(i) ?? null;
        return (
          <li key={chaveDe(i.ref)} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="text-[15px] text-foreground">{oQue(i)}</span>
            {b && (
              <Button
                type="button" variant="outline" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-label={b.rotulo} aria-disabled={ocupada || undefined}
                aria-busy={ocupada || undefined} onClick={() => { if (!ocupada) b.aoClicar(); }}
              >
                {b.texto}
              </Button>
            )}
            {explicacao && <span className="basis-full text-sm text-muted-foreground">{explicacao}</span>}
          </li>
        );
      })}
    </ul>
  );
}

interface RegistosLigadosListaProps {
  ligados: readonly ItemRegisto[];
  porLigar: readonly ItemRegisto[];
  /** O negócio está em curso: só então se liga e se desliga. */
  aberto: boolean;
  /** Há permissão para ligar e desligar (o exemplo: sempre). */
  podeAgir: boolean;
  /** Um levantamento ligado deixa-se desligar (o exemplo); na base não (NG005). */
  desligaLevantamento: boolean;
  oQue: (i: ItemRegisto) => string;
  aoLigar: (i: ItemRegisto) => void;
  aoDesligar: (i: ItemRegisto) => void;
  /** As linhas à espera da base; só a ficha real o dá (e com ele aparecem o erro e o «A guardar…»). */
  ocupadas?: ReadonlySet<string>;
  /** A chave do erro da última tentativa; `null` sem erro. */
  erro?: string | null;
  /** Mais secções a seguir às listas (os documentos por ligar da ficha real). */
  depois?: ReactNode;
  /**
   * O título de «por ligar»: um sítio estável para onde levar o foco depois de ligar ou desligar (a linha clicada muda de lista e o botão
   * desaparece). Só a ficha real o pede.
   */
  focoRef?: RefObject<HTMLParagraphElement>;
}

const NENHUMA: ReadonlySet<string> = new Set();

export function RegistosLigadosLista(p: RegistosLigadosListaProps) {
  const { t } = useTranslation();
  const ocupadas = p.ocupadas ?? NENHUMA;
  const agir = p.aberto && p.podeAgir;
  const trancado = (i: ItemRegisto): boolean => i.ref.tipo === "levantamento" && !p.desligaLevantamento;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t(`${P}hint`)}</p>
      {p.ligados.length === 0 ? <p className="text-[15px] text-foreground">{t(`${P}none`)}</p> : (
        <Lista
          itens={p.ligados} oQue={p.oQue} ocupadas={ocupadas}
          botao={(i) => (agir && !trancado(i) ? { texto: t(`${P}unlink`), rotulo: t(`${P}unlinkLabel`, { what: p.oQue(i) }), aoClicar: () => p.aoDesligar(i) } : null)}
          nota={(i) => (agir && trancado(i) ? t("pessoasPagina.neg.link.surveyLocked") : null)}
        />
      )}
      {p.aberto ? (
        <div className="space-y-1">
          <p ref={p.focoRef} tabIndex={p.focoRef ? -1 : undefined} className="text-sm font-semibold text-foreground outline-none">{t(`${P}toLink`)}</p>
          {p.porLigar.length === 0 ? <p className="text-sm text-muted-foreground">{t(`${P}toLinkNone`)}</p> : (
            <Lista
              itens={p.porLigar} oQue={p.oQue} ocupadas={ocupadas}
              botao={(i) => (agir ? { texto: t(`${P}link`), rotulo: t(`${P}linkLabel`, { what: p.oQue(i) }), aoClicar: () => p.aoLigar(i) } : null)}
            />
          )}
        </div>
      ) : <p className="text-sm text-muted-foreground">{t(`${P}closed`)}</p>}
      {p.depois}
      {/* Só na ficha real (a base demora e falha): o exemplo é síncrono e não tem nada a dizer. */}
      {p.ocupadas && (
        <>
          <ErroDeEnvio chave={p.erro ?? null} />
          <p role="status" aria-live="polite" className="sr-only">{ocupadas.size > 0 ? t("pessoasPagina.neg.saving") : ""}</p>
        </>
      )}
    </div>
  );
}
