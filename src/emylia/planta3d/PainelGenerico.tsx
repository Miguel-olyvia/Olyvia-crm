// Protótipo (visualizador 3D): o painel da peça com modelo GENÉRICO (categoriasGlb.ts): a cor e as opções da categoria (depósito, coluna,
// porta de abrir ou de correr, bica extraível…). Grava em `opc.gen` da peça; as medidas são as da peça na planta.
import { USAR_GLB_GENERICOS, categoriaDoTipo, categoriaPorId, opcoesComOmissao } from "./categoriasGlb";
import type { ProdutoModelo3D } from "./catalogo3d";
import type { OpcoesPeca } from "./modelo";

export interface PainelGenericoProps {
  modelo: ProdutoModelo3D | undefined;
  opc: OpcoesPeca | undefined;
  onGen: (gen: Record<string, string | boolean>) => void;
}

export function PainelGenerico({ modelo, opc, onGen }: PainelGenericoProps) {
  const pr = modelo?.mockup3d.params;
  const c = modelo && USAR_GLB_GENERICOS && !(pr && "html" in pr && pr.html) ? categoriaPorId(modelo.mockup3d.generico?.id) ?? categoriaDoTipo(modelo.mockup3d.tipo, modelo.nome) : undefined;
  if (!modelo || !c) return null;
  const gen = opc?.gen ?? {}, valores = opcoesComOmissao(c, modelo.mockup3d.tipo, { ...modelo.mockup3d.generico?.o, ...gen }, modelo.nome);
  const mudar = (id: string, v: string | boolean) => onGen({ ...gen, [id]: v });
  const cor = typeof gen.cor === "string" ? gen.cor : modelo.mockup3d.cor;
  return (
    <fieldset className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-medium">Modelo genérico: {c.rotulo}</legend>
      <label className="flex min-h-11 items-center gap-2 text-[15px]">Cor
        <input type="color" className="h-11 w-14 rounded border border-input" value={cor} onChange={(e) => mudar("cor", e.target.value)} aria-label="Cor do modelo genérico" />
      </label>
      {c.opcoes.map((o) => o.tipo === "sim" ? (
        <label key={o.id} className="flex min-h-11 items-center gap-2 text-[15px]">
          <input type="checkbox" className="h-5 w-5" checked={valores[o.id] === true} onChange={(e) => mudar(o.id, e.target.checked)} />{o.rotulo}
        </label>
      ) : (
        <label key={o.id} className="flex min-h-11 items-center gap-2 text-[15px]">{o.rotulo}
          <select className="h-11 rounded-md border border-input bg-background px-2" value={String(valores[o.id])} onChange={(e) => mudar(o.id, e.target.value)}>
            {o.valores.map((v) => <option key={v.id} value={v.id}>{v.rotulo}</option>)}
          </select>
        </label>
      ))}
    </fieldset>
  );
}
