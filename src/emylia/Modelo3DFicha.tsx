// A secção «Modelo 3D» da ficha do produto: o seletor (grava logo, como o Estado: cat_definir_modelo_3d com o alvo 'produto') e, por baixo, o «Ver em 3D».
// O modelo escolhido aqui manda sobre o da subcategoria e o da categoria (produto > subcategoria > categoria > automático); vazio herda. A recusa da base
// mostra-se em português e o seletor fica no que a base tem. Sem página real (o protótipo) ou sem o produto na base não há seletor: só se vê o modelo e a origem.
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CampoModelo3D } from "./CampoModelo3D";
import { Modelo3DProduto, type Modelo3DProdutoProps } from "./Modelo3DProduto";
import { definirModelo3d, modelo3dDeLeitura } from "./modelo3dDados";
import { eUuid, type FichaProdutoReal } from "./fichaProdutoDados";
import { resolverDoNo, rotuloDoModelo3D } from "./planta3d/modelos3dEscolha";

const NOTA = "text-[15px] text-muted-foreground";

interface Props extends Omit<Modelo3DProdutoProps, "modelo3d"> {
  produto: { id: string; n: string; modelo3d?: string | null };
  real?: FichaProdutoReal;
  anunciar: (msg: string) => void;
}

export function Modelo3DFicha({ produto, real, anunciar, ...ver }: Props) {
  const lido = modelo3dDeLeitura(produto.modelo3d);
  // o que a base aceitou mas a ficha ainda não releu: mostra-se este até a ficha trazer o seu (undefined: vale o lido)
  const [aplicado, setAplicado] = useState<string | null | undefined>(undefined);
  const [aGravar, setAGravar] = useState(false), [erro, setErro] = useState<string | null>(null);
  useEffect(() => { setAplicado(undefined); setErro(null); }, [lido, produto.id]);
  const valor = aplicado !== undefined ? aplicado : lido;
  const heranca = resolverDoNo({ arvore: ver.arvore, no: ver.no, soHerdado: true });
  const podeGravar = !!real && eUuid(produto.id);

  const mudar = async (novo: string | null) => {
    if (!real || novo === valor || aGravar) return;
    setAGravar(true); setErro(null);
    const r = await definirModelo3d(real.org, "produto", produto.id, novo);
    if (r.ok === false) { setAGravar(false); setErro(r.erro); return; }
    setAplicado(novo);
    anunciar(novo ? `Modelo 3D de ${produto.n}: ${rotuloDoModelo3D(novo)}.` : `Modelo 3D de ${produto.n}: automático, herda da subcategoria e da categoria.`);
    try { await real.recarregar(); } catch { /* a ficha diz o que gravou; a releitura fica para depois */ }
    setAGravar(false);
  };

  return (
    <div className="mt-3 grid gap-4">
      {podeGravar && (
        <div className="grid gap-1.5">
          <CampoModelo3D valor={valor} heranca={heranca} onChange={(v) => void mudar(v)} nivel="produto" desativado={!real!.podeEditar} ocupado={aGravar} erro={erro} />
          {!real!.podeEditar && <p className={cn(NOTA)}>Sem permissão para mudar o modelo 3D (products.edit).</p>}
        </div>
      )}
      {/* 25/11: a configuração 3D (eixos e ligações) só existe para um produto da base; lê-se ao abrir o 3D e grava com products.edit (a base decide: aqui só se esconde o que ela não dá) */}
      <Modelo3DProduto {...ver} modelo3d={valor} alvoConfig3d={podeGravar ? { org: real!.org, produtoId: produto.id, podeEditar: real!.podeEditar } : undefined} />
    </div>
  );
}
