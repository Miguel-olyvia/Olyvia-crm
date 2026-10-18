// "Registos ligados" de um negócio, dentro da ficha da pessoa: o que (contactos, visitas e levantamentos) já pertence a este negócio e o que
// ainda está por ligar, com o botão de ligar e o de desligar (só com o negócio aberto). Nada se copia: o registo continua a ser da pessoa e
// só aponta para o negócio.
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAnunciar } from "@/components/ficha-comum/anuncioFicha";
import { registosDoNegocio, registosPorLigar } from "@/components/negocio-metas/acoesRegistos";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { desligarRegisto, ligarRegisto, useRegistosPessoa } from "@/components/negocio-metas/registosPessoa";
import type { RefRegisto, RegistosDaPessoa, TipoRegisto } from "@/components/negocio-metas/registosTipos";
import { textoDiaCompleto } from "./formatoPessoas";

const P = "pessoasPagina.linked.";
const TIPO: Record<TipoRegisto, string> = { contacto: "kind.contact", visita: "kind.visit", levantamento: "kind.survey" };

interface Item {
  ref: RefRegisto;
  data: string;
}

/** Os registos de um grupo, do mais antigo para o mais recente. */
const itensDe = (r: RegistosDaPessoa): Item[] => [
  ...r.contactos.map((c): Item => ({ ref: { tipo: "contacto", id: c.id }, data: c.data })),
  ...r.visitas.map((v): Item => ({ ref: { tipo: "visita", id: v.id }, data: v.data })),
  ...r.levantamentos.map((l): Item => ({ ref: { tipo: "levantamento", id: l.id }, data: l.data })),
].sort((a, b) => a.data.localeCompare(b.data));

interface BotaoItem {
  texto: string;
  rotulo: string;
  aoClicar: () => void;
}

/** Uma lista de registos, cada um com o seu botão (ou sem botão, num negócio terminado). */
function Lista({ itens, oQue, botao }: { itens: readonly Item[]; oQue: (i: Item) => string; botao: (i: Item) => BotaoItem | null }) {
  return (
    <ul role="list" className="divide-y divide-border">
      {itens.map((i) => {
        const b = botao(i);
        return (
          <li key={`${i.ref.tipo}-${i.ref.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="text-[15px] text-foreground">{oQue(i)}</span>
            {b && (
              <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} aria-label={b.rotulo} onClick={b.aoClicar}>{b.texto}</Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function RegistosLigadosNegocio({ negocio, aberto }: { negocio: NegocioMes; aberto: boolean }) {
  const { t } = useTranslation();
  const anunciar = useAnunciar();
  const estado = useRegistosPessoa();
  const ligados = itensDe(registosDoNegocio(estado, negocio.id));
  const porLigar = itensDe(registosPorLigar(estado, negocio.pessoaId ?? ""));
  const oQue = (i: Item): string => t(`${P}what`, { kind: t(`${P}${TIPO[i.ref.tipo]}`), date: textoDiaCompleto(i.data) });
  const desligar = (i: Item) => { if (desligarRegisto(i.ref, negocio.id, aberto)) anunciar(t(`${P}live.unlinked`, { what: oQue(i) })); };
  const ligar = (i: Item) => { if (ligarRegisto(i.ref, negocio.id)) anunciar(t(`${P}live.linked`, { what: oQue(i) })); };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t(`${P}hint`)}</p>
      {ligados.length === 0 ? <p className="text-[15px] text-foreground">{t(`${P}none`)}</p> : (
        <Lista
          itens={ligados} oQue={oQue}
          botao={(i) => (aberto ? { texto: t(`${P}unlink`), rotulo: t(`${P}unlinkLabel`, { what: oQue(i) }), aoClicar: () => desligar(i) } : null)}
        />
      )}
      {aberto ? (
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{t(`${P}toLink`)}</p>
          {porLigar.length === 0 ? <p className="text-sm text-muted-foreground">{t(`${P}toLinkNone`)}</p> : (
            <Lista
              itens={porLigar} oQue={oQue}
              botao={(i) => ({ texto: t(`${P}link`), rotulo: t(`${P}linkLabel`, { what: oQue(i) }), aoClicar: () => ligar(i) })}
            />
          )}
        </div>
      ) : <p className="text-sm text-muted-foreground">{t(`${P}closed`)}</p>}
    </div>
  );
}
