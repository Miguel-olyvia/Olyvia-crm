// Armazém › Contagens (scrCnt do mockup): as contagens físicas por armazém e categoria. A diferença conta o que se moveu durante a contagem; só se finaliza sem
// linhas por resolver e as diferenças ajustadas geram movimentos de ajuste no livro. A ação "Nova contagem" vive no cabeçalho; a folha está em ContagemFolha.tsx.
import { useState } from "react";
import { Plus } from "lucide-react";
import { diasEntre, fmtDT, HOJE, nomeArm } from "./base";
import { AcoesCab, Fonte } from "./cabInv";
import { ContagemFolha } from "./ContagemFolha";
import { CONTAGEM_ESTADOS, TOM_CONTAGEM, criarContagem, estatisticasContagem } from "./contagens";
import { useCtxInv } from "./ctxInv";
import { Dlg } from "./DialogosInv";
import { filtrarContagens } from "./filtros";
import { Chip } from "./mockPecas";
import { opcoesArmazens } from "./opcoes";
import { Lista, Peq, Pri, Sec, Selo, Vazio } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import { TabelaInv } from "./TabelaInv";
import type { Contagem } from "./tipos";

const ESTADOS: readonly (readonly [string, string])[] = [["", "Todas"], ["open", "Em contagem"], ["final", "Finalizadas"], ["cancelled", "Canceladas"]];

function NovaContagem({ aoFechar }: { aoFechar: () => void }) {
  const { db, agir, abrir } = useCtxInv();
  const [f, setF] = useState<{ wh: string; cat: string; init: "blank" | "system" }>({ wh: db.settings.defaultWh, cat: "", init: "blank" });
  const cats = [...new Set(db.products.filter((p) => !p.kit).map((p) => p.cat))];
  const criar = (): void => {
    const r = agir((d) => criarContagem(d, f), (c) => `${c.id} criada.`);
    if (!r.ok) return;
    aoFechar();
    abrir({ t: "cont", id: r.valor.id });
  };
  return (
    <Dlg aberto aoFechar={aoFechar} titulo="Nova contagem" rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri onClick={criar}>Começar contagem</Pri></>}>
      <div className="fg">
        <Lista rotulo="Armazém" valor={f.wh} aoMudar={(v) => setF({ ...f, wh: v })} opcoes={opcoesArmazens(db)} obrigatorio />
        <Lista rotulo="Categoria" valor={f.cat} aoMudar={(v) => setF({ ...f, cat: v })} opcoes={[["", "Todas"], ...cats.map((c) => [c, c] as const)]} />
        <Lista rotulo="Contagem inicial" valor={f.init} aoMudar={(v) => setF({ ...f, init: v === "system" ? "system" : "blank" })} opcoes={[["blank", "Em branco (contagem cega)"], ["system", "Pré-preenchida com o stock do sistema"]]} />
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>O sistema guarda a fotografia do stock; movimentos feitos durante a contagem aparecem à parte para não falsear a diferença.</p>
      <Fonte>rpc_create_inventory_count</Fonte>
    </Dlg>
  );
}

function Progresso({ c }: { c: Contagem }) {
  const { db } = useCtxInv();
  const s = estatisticasContagem(db, c);
  return <><div className="prog" title={`${s.done} de ${s.total}`}><span style={{ width: `${(s.done / s.total) * 100}%` }} /></div><small className="muted">{s.done} / {s.total} contadas</small></>;
}

export function ContagensInv() {
  const { db, filtros, setFiltros, abrir } = useCtxInv();
  const f = filtros.cont;
  const lista = filtrarContagens(db, f);
  const [nova, setNova] = useState(false);
  const perm = can("inventory.count");
  return (
    <div>
      <AcoesCab><Pri disabled={!perm} title={perm ? undefined : porqueNao("inventory.count")} onClick={() => setNova(true)}><Plus className="ic" aria-hidden="true" />Nova contagem</Pri></AcoesCab>
      <div className="chips" style={{ marginBottom: 12 }} role="group" aria-label="Estado das contagens">
        {ESTADOS.map(([k, nome]) => <Chip key={k} ativo={f.estado === k} aoClicar={() => setFiltros("cont", { estado: k as typeof f.estado })} n={db.counts.filter((c) => !k || c.state === k).length}>{nome}</Chip>)}
      </div>
      {lista.length === 0 ? <Vazio titulo="Sem contagens" /> : (
        <TabelaInv minimo={900} titulo="Contagens" chave={(c) => c.id} linhas={lista} abrir={(c) => abrir({ t: "cont", id: c.id })} rotuloAbrir={(c) => `Abrir a contagem ${c.id}`}
          acoes={(c) => <Peq onClick={() => abrir({ t: "cont", id: c.id })}>Abrir</Peq>}
          colunas={[
            { id: "i", titulo: "Documento", celula: (c) => <span className="mono"><b>{c.id}</b></span>, valor: (c) => c.id }, { id: "w", titulo: "Armazém", celula: (c) => nomeArm(db, c.wh) }, { id: "c", titulo: "Categoria", celula: (c) => c.cat || "Todas" },
            { id: "e", titulo: "Estado", celula: (c) => { const dias = diasEntre(c.last, HOJE); return <><Selo tom={TOM_CONTAGEM[c.state]}>{CONTAGEM_ESTADOS[c.state]}</Selo>{c.state === "open" && dias >= 7 && <> <Selo tom="warn">Parada há {dias} dias</Selo></>}</>; } },
            { id: "s", titulo: "Iniciada", celula: (c) => fmtDT(c.started), valor: (c) => c.started },
            { id: "p", titulo: "Progresso", celula: (c) => <Progresso c={c} /> },
            { id: "d", titulo: "Discrepâncias", direita: true, celula: (c) => { const n = estatisticasContagem(db, c).disc; return n ? <Selo tom="bad">{n}</Selo> : "0"; } },
          ]} />
      )}
      <Fonte>inventory_counts · inventory_count_lines · fn_next_inventory_count_number</Fonte>
      {nova && <NovaContagem aoFechar={() => setNova(false)} />}
    </div>
  );
}

export { ContagemFolha };
