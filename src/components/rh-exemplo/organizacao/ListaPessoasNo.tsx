/**
 * As pessoas de um nó. No modo «legal» (aba Pessoas) são as que têm vínculo legal no nó, com a coluna «Trabalha em»; no
 * modo «local» (aba Trabalham aqui, nos centros) são as que trabalham no centro, com o vínculo legal quando é de outra filial.
 * Cada pessoa tem o histórico da ligação (data, de/para) e as ações Alterar ligação e Desligar.
 */
import { useState } from "react";
import { ChevronRight, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChipNoutroCentro } from "@/components/rh-exemplo/organizacao/Chips";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { centroDifere } from "@/components/rh-exemplo/organizacao/arvore";
import { dataCurta, destinoTexto, nomeCentro, nomeEmpresa, nomeFilial } from "@/components/rh-exemplo/organizacao/textos";
import { useTranslation } from "@/hooks/useTranslation";
import type { EstruturaOrg, EventoLigacao, Ligacao, PessoaOrg } from "@/components/rh-exemplo/organizacao/tipos";

export interface ListaPessoasProps {
  est: EstruturaOrg;
  ligacoes: Ligacao[];
  pessoas: ReadonlyMap<string, PessoaOrg>;
  historico: EventoLigacao[];
  modo: "legal" | "local";
  vazio: string;
  aoAlterar: (pessoaId: string) => void;
  aoDesligar: (pessoaId: string) => void;
}

function Historico({ est, eventos }: { est: EstruturaOrg; eventos: EventoLigacao[] }) {
  const { t } = useTranslation();
  if (eventos.length === 0) return <p className="text-xs text-muted-foreground">{t("rhOrg.historico.vazio")}</p>;
  return (
    <ol className="space-y-2 border-l pl-3">
      {[...eventos].reverse().map((e) => (
        <li key={e.id} className="space-y-0.5 text-xs">
          <p className="font-medium">{dataCurta(e.data)} · {t(`rhOrg.ev.${e.tipo}`)}</p>
          {e.de && <p className="text-muted-foreground">{t("rhOrg.ev.de", { destino: destinoTexto(est, e.de, t) })}</p>}
          {e.para && <p className="text-muted-foreground">{t("rhOrg.ev.para", { destino: destinoTexto(est, e.para, t) })}</p>}
          {e.motivo && <p className="text-muted-foreground">{t("rhOrg.ev.motivo", { motivo: e.motivo })}</p>}
        </li>
      ))}
    </ol>
  );
}

function LinhaPessoa({ p, lig, pessoa }: { p: ListaPessoasProps; lig: Ligacao; pessoa: PessoaOrg | undefined }) {
  const { t } = useTranslation();
  const [aberto, setAberto] = useState(false);
  const nome = pessoa?.nome ?? lig.pessoaId;
  const difere = centroDifere(p.est, lig);
  const eventos = p.historico.filter((e) => e.pessoaId === lig.pessoaId);
  return (
    <li className="space-y-2 rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{nome}</p>
          {pessoa?.cargo && <p className="text-xs text-muted-foreground">{pessoa.cargo}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {difere && p.modo === "legal" && <ChipNoutroCentro />}
          {difere && p.modo === "local" && (
            <ChipNoutroCentro texto={t("rhOrg.vinculoDe", { filial: nomeFilial(p.est, lig.filialId) })} />
          )}
        </div>
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[7rem_1fr]">
        <dt className="text-muted-foreground">{t("rhOrg.trabalhaEm")}</dt>
        <dd className="font-medium">{nomeCentro(p.est, lig.centroId)}</dd>
        <dt className="text-muted-foreground">{t("rhOrg.vinculoLegal")}</dt>
        <dd className="font-medium">{nomeEmpresa(p.est, lig.empresaId)} · {nomeFilial(p.est, lig.filialId)}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" className={`min-h-11 gap-1.5 ${FOCO}`} aria-expanded={aberto} aria-label={`${t("rhOrg.historico")}: ${nome}`} onClick={() => setAberto(!aberto)}>
          <ChevronRight className={`h-4 w-4 transition-transform motion-reduce:transition-none ${aberto ? "rotate-90" : ""}`} aria-hidden="true" />
          <History className="h-4 w-4" aria-hidden="true" />
          {t("rhOrg.historico")}
        </Button>
        <Button type="button" variant="outline" size="sm" className={`min-h-11 ${FOCO}`} aria-label={`${t("rhOrg.alterar")}: ${nome}`} onClick={() => p.aoAlterar(lig.pessoaId)}>
          {t("rhOrg.alterar")}
        </Button>
        <Button type="button" variant="outline" size="sm" className={`min-h-11 ${FOCO}`} aria-label={`${t("rhOrg.desligar")}: ${nome}`} onClick={() => p.aoDesligar(lig.pessoaId)}>
          {t("rhOrg.desligar")}
        </Button>
      </div>
      {aberto && <Historico est={p.est} eventos={eventos} />}
    </li>
  );
}

export function ListaPessoasNo(p: ListaPessoasProps) {
  if (p.ligacoes.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{p.vazio}</p>;
  return (
    <ul className="space-y-2 pt-4">
      {p.ligacoes.map((l) => (
        <LinhaPessoa key={l.pessoaId} p={p} lig={l} pessoa={p.pessoas.get(l.pessoaId)} />
      ))}
    </ul>
  );
}
