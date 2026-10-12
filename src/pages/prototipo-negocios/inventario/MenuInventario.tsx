// A secção INVENTÁRIO do menu lateral, como no mockup: Hoje (com o total da fila), o grupo Compras, o grupo Armazém, e em baixo o "Simular perfil".
// Cada item abre diretamente o ecrã. Só existe na V2 (quem a monta decide); os contadores vêm da base em memória.
import { useEffect, useId } from "react";
import { cn } from "@/lib/utils";
import type { AbaInv } from "./ctxInv";
import { GRUPOS, ICONE_COBERTURA, ICONE_HOJE, grupoDe, pilulas, totalFila, type Pilula } from "./menuInv";
import { useTema } from "./tema";
import { PERFIS, mudarPerfil, podePerfil, usePerfil, type PerfilId } from "./perfil";
import { useInventario } from "./loja";
import "./inventario.css";

const Pil = ({ p }: { p?: Pilula }) => (p && p.n > 0 ? <span className={cn("pill", p.tom)} title={p.dica} aria-label={`${p.n}: ${p.dica}`}>{p.n}</span> : null);

interface Props { aba: AbaInv | null; aoIr: (a: AbaInv) => void }
/** `aba` é o ecrã aberto (null quando se está noutra página do protótipo). */
export default function MenuInventario({ aba, aoIr }: Props) {
  const db = useInventario();
  const perfil = usePerfil(), tema = useTema();
  const pil = pilulas(db);
  const total = totalFila(db);
  const ativo = aba ? grupoDe(aba)?.id : undefined;
  const rotulo = useId(), seletor = useId(), rotuloMock = useId();
  // Um perfil que não vê o ecrã aberto volta ao Hoje.
  useEffect(() => {
    const item = GRUPOS.flatMap((g) => g.itens).find((i) => i.aba === aba);
    if (item && !podePerfil(perfil, item.perm)) aoIr("hoje");
  }, [aba, perfil, aoIr]);
  return (
    <div className="inv-root inv-sbbox" data-theme={tema} data-testid="menu-inventario">
      <div className="sb-sec" id={rotulo}>Inventário</div>
      <nav className="sb-nav" aria-labelledby={rotulo}>
        <button type="button" className={cn("sb-head", aba === "hoje" && "on")} aria-current={aba === "hoje" ? "page" : undefined} onClick={() => aoIr("hoje")}>
          <ICONE_HOJE className="ic" aria-hidden="true" /><span>Hoje</span>{total ? <span className="pill bad" title="Itens na fila de trabalho" aria-label={`${total}: itens na fila de trabalho`}>{total}</span> : null}
        </button>
        {GRUPOS.map((g) => {
          const itens = g.itens.filter((i) => podePerfil(perfil, i.perm));
          if (!itens.length) return null;
          const Ic = g.icone;
          return (
            <div key={g.id} role="group" aria-label={g.t}>
              <button type="button" className={cn("sb-item", ativo === g.id && "on")} aria-expanded="true" onClick={() => aoIr(ativo === g.id && aba ? aba : itens[0].aba)}><Ic className="ic" aria-hidden="true" /><span>{g.t}</span></button>
              <div className="sb-subs">
                {itens.map((i) => (
                  <button key={i.aba} type="button" className={cn("sb-sub", aba === i.aba && "on")} aria-current={aba === i.aba ? "page" : undefined} onClick={() => aoIr(i.aba)}>
                    <span>{i.t}{i.novo ? <> <span className="new">Novo</span></> : null}</span><Pil p={pil[i.aba]} />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="sb-sec" id={rotuloMock}>Mockup</div>
      <nav className="sb-nav" aria-labelledby={rotuloMock}>
        <button type="button" className={cn("sb-item", aba === "cov" && "on")} aria-current={aba === "cov" ? "page" : undefined} onClick={() => aoIr("cov")}><ICONE_COBERTURA className="ic" aria-hidden="true" /><span>Mockup · cobertura</span></button>
      </nav>
      <div className="sb-foot">
        <label htmlFor={seletor}>Simular perfil · menu filtrado por permissão <span className="new">Novo</span></label>
        <select id={seletor} value={perfil} onChange={(e) => mudarPerfil(e.target.value as PerfilId)}>
          {(Object.keys(PERFIS) as PerfilId[]).map((k) => <option key={k} value={k}>{PERFIS[k].t}</option>)}
        </select>
        <span style={{ opacity: 0.8 }}>{PERFIS[perfil].nota}</span><span className="src" title="Fonte de dados">has_permission() · anew_role_permissions</span>
      </div>
    </div>
  );
}
