// 17/11: o seletor «Estado» do produto (Rascunho, Ativo, Descontinuado). Na ficha grava direto (cat_definir_estado_produto), com a permissão de editar o
// produto, e a recusa da base (CT001/CT002/CT003) mostra-se tal como vem; nno formulário de criar escolhe-se com chips (CriarNoCatalogo).
import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";
import { ESTADOS_PRODUTO, definirEstadoProduto, rotuloEstadoProduto, type EstadoProduto, type FichaProdutoReal } from "./fichaProdutoDados";

const SELETOR = "h-11 w-full max-w-xs rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-60";
const NOTA = "text-[15px] text-muted-foreground";

/** Na ficha: grava ao escolher. `aoMudar` relê o produto; o seletor fica no estado que a base tem (volta atrás se a base recusar). */
export function EstadoFicha({ produto, nome, estado, real, anunciar }: { produto: string; nome: string; estado: EstadoProduto; real: FichaProdutoReal; anunciar: (msg: string) => void }) {
  const id = useId();
  const [aGravar, setAGravar] = useState(false), [erro, setErro] = useState<string | null>(null);
  // o estado que a base aceitou mas que não se conseguiu reler: mostra-se este até a ficha trazer o seu
  const [aplicado, setAplicado] = useState<EstadoProduto | null>(null);
  useEffect(() => { setAplicado(null); }, [estado, produto]);
  const mudar = async (novo: EstadoProduto) => {
    if (novo === (aplicado ?? estado) || aGravar) return;
    setAGravar(true); setErro(null);
    const r = await definirEstadoProduto(real.org, produto, novo);
    if (!r.ok) { setAGravar(false); setErro(r.erro); return; }
    anunciar(`Estado de ${nome}: ${rotuloEstadoProduto(novo)}.`);
    try { await real.recarregar(); } catch (e) {
      const motivo = e instanceof Error && e.message ? `: ${e.message}` : "";
      setAplicado(novo);
      setErro(`A base gravou, mas não foi possível reler o produto${motivo}. Mostra-se o estado ${rotuloEstadoProduto(novo)}; volte a abrir a ficha para ver o resto atualizado.`);
    }
    setAGravar(false);
  };
  return (
    <div className="mt-3 grid gap-1.5">
      <label htmlFor={id} className="text-[15px] font-medium">Estado</label>
      <select id={id} value={aplicado ?? estado} disabled={!real.podeEditar || aGravar} onChange={(e) => void mudar(e.target.value as EstadoProduto)} className={SELETOR} aria-describedby={real.podeEditar ? undefined : `${id}-nota`}>
        {ESTADOS_PRODUTO.map((x) => <option key={x.v} value={x.v}>{x.rotulo}</option>)}
      </select>
      {!real.podeEditar && <p id={`${id}-nota`} className={cn(NOTA)}>Sem permissão para mudar o estado (products.edit).</p>}
      {erro && <p role="alert" className="text-[15px] text-destructive">{erro}</p>}
    </div>
  );
}
