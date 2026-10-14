// O separador «Admissões» de Pessoas: quem está em admissão, agrupado por estado, com contadores («Por aprovar» destacado) e,
// em cada linha compacta (~45 px), a pessoa, o cargo, o role previsto, o estado (ícone + texto), o prazo do login temporário e
// a ação certa para esse estado. Só memória; nenhum e-mail sai (as ações mostram o que aconteceria, em texto).
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useAdmissoes } from "@/components/rh-exemplo/dados/lojaAdmissao";
import { usePapeisDaOrganizacao } from "@/components/rh-exemplo/hooks/usePapeisDaOrganizacao";
import { usePessoas } from "@/components/rh-exemplo/hooks/usePessoas";
import {
  acaoDaLinha, estadoVisivel, prazoDoLogin, type Admissao, type EstadoVisivel,
} from "@/components/rh-exemplo/lib/admissaoFluxo";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { EstadoAdmissaoChip } from "./aspeto";
import { GRUPOS_PIPELINE, textoPrazo } from "./auxiliares";
import { useAcoesAdmissao, type AcaoUi } from "./useAcoesAdmissao";

interface Item {
  adm: Admissao;
  visivel: EstadoVisivel;
  nome: string;
  cargo: string | null;
}

interface LinhaProps {
  item: Item;
  agora: Date;
  papel: string;
  aoAbrirFicha: (id: string) => void;
  executar: (id: string, acao: AcaoUi) => void;
}

function LinhaAdmissao({ item, agora, papel, aoAbrirFicha, executar }: LinhaProps) {
  const { t } = useTranslation();
  const { adm, nome, cargo, visivel } = item;
  const acao = acaoDaLinha(adm, agora);
  const rotuloAcao = t(`rhAdm.linha.${acao}`);
  return (
    <li
      data-admissao-pessoa={adm.pessoaId}
      className="flex min-h-[45px] flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1 sm:grid sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto_7rem_auto]"
    >
      <button
        type="button" onClick={() => aoAbrirFicha(adm.pessoaId)} aria-label={t("rhForm.lista.abrir", { nome })}
        className={cn("relative min-h-11 min-w-0 truncate rounded-sm text-left text-sm font-medium hover:underline", FOCO)}
      >
        {nome}
      </button>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{cargo ?? "—"}</span>
      <span className="min-w-0 truncate text-sm">{papel}</span>
      <EstadoAdmissaoChip estado={visivel} />
      <span className={cn("text-xs tabular-nums", visivel === "expirado" ? "font-medium text-destructive" : "text-muted-foreground")}>
        {textoPrazo(t, prazoDoLogin(adm, agora))}
      </span>
      <Button
        type="button" size="sm" variant={acao === "rever" ? "default" : "outline"} className={cn("min-h-11", FOCO)}
        aria-label={t("rhAdm.linha.rotulo", { acao: rotuloAcao, nome })}
        onClick={() => (acao === "abrir" ? aoAbrirFicha(adm.pessoaId) : executar(adm.pessoaId, acao))}
      >
        {rotuloAcao}
      </Button>
    </li>
  );
}

function Contadores({ contagem }: { contagem: Map<EstadoVisivel, number> }) {
  const { t } = useTranslation();
  const visiveis = GRUPOS_PIPELINE.filter((g) => g === "submetida" || (contagem.get(g) ?? 0) > 0);
  return (
    <ul aria-label={t("rhAdm.pipeline.contadores")} className="flex flex-wrap gap-2">
      {visiveis.map((g) => {
        const n = contagem.get(g) ?? 0;
        const destaque = g === "submetida" && n > 0;
        return (
          <li
            key={g}
            className={cn("rounded-md border px-3 py-1 text-sm tabular-nums", destaque ? "border-amber-500/70 bg-amber-500/10 font-semibold text-amber-900 dark:text-amber-300" : "text-muted-foreground")}
          >
            {t(`rhAdm.grupo.${g}`)}: {n}
          </li>
        );
      })}
    </ul>
  );
}

interface GrupoProps {
  estado: EstadoVisivel;
  itens: Item[];
  agora: Date;
  papeis: Array<{ id: string; name: string }>;
  aoAbrirFicha: (id: string) => void;
  executar: (id: string, acao: AcaoUi) => void;
}

function GrupoPipeline({ estado, itens, agora, papeis, aoAbrirFicha, executar }: GrupoProps) {
  const { t } = useTranslation();
  if (itens.length === 0) return null;
  return (
    <section aria-labelledby={`rh-adm-grupo-${estado}`} className="space-y-1.5">
      <h2 id={`rh-adm-grupo-${estado}`} className="text-sm font-semibold">{t(`rhAdm.grupo.${estado}`)} ({itens.length})</h2>
      <ul className="divide-y overflow-hidden rounded-xl border border-border bg-card">
        {itens.map((item) => (
          <LinhaAdmissao
            key={item.adm.pessoaId} item={item} agora={agora} aoAbrirFicha={aoAbrirFicha} executar={executar}
            papel={papeis.find((p) => p.id === item.adm.roleId)?.name ?? t("rhAdm.credenciais.semRole")}
          />
        ))}
      </ul>
    </section>
  );
}

export function PipelineAdmissoes({ aoAbrirFicha }: { aoAbrirFicha: (id: string) => void }) {
  const { t } = useTranslation();
  const { pessoas } = usePessoas();
  const { papeis } = usePapeisDaOrganizacao();
  const porPessoa = useAdmissoes((e) => e.porPessoa);
  const ordem = useAdmissoes((e) => e.ordem);
  const { executar, dialogos, mensagem } = useAcoesAdmissao();
  const agora = new Date();

  const itens = useMemo<Item[]>(
    () => ordem.flatMap((id) => {
      const adm = porPessoa[id];
      const pessoa = pessoas.find((p) => p.id === id);
      return adm && pessoa ? [{ adm, visivel: estadoVisivel(adm, new Date()), nome: pessoa.nome_completo, cargo: pessoa.cargo }] : [];
    }),
    [ordem, porPessoa, pessoas],
  );
  const contagem = new Map<EstadoVisivel, number>();
  itens.forEach((i) => contagem.set(i.visivel, (contagem.get(i.visivel) ?? 0) + 1));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("rhAdm.pipeline.explicacao")}</p>
      <Contadores contagem={contagem} />
      <p role="status" className="min-h-5 text-sm text-foreground">{mensagem}</p>
      {itens.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm">{t("rhAdm.pipeline.vazio")}</p>
      )}
      {GRUPOS_PIPELINE.map((g) => (
        <GrupoPipeline
          key={g} estado={g} itens={itens.filter((i) => i.visivel === g)} agora={agora} papeis={papeis}
          aoAbrirFicha={aoAbrirFicha} executar={executar}
        />
      ))}
      {dialogos}
    </div>
  );
}
