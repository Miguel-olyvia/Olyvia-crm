// 16/11: a ficha do produto aberta no Catálogo real. Com o Catálogo por páginas os produtos do arranque (K.produtos) já não trazem o modelo: vem da linha da
// lista que se abriu (CatalogoV1 guarda-as em `vistas`) ou, se a ficha abriu pelo endereço (?produto=…) sem passar pela lista, de uma procura pelo nome
// (lerModeloDoProduto). Depois de gravar (K muda) volta a lê-lo. Os atributos lê-os a própria ficha (cat_ler_atributos_produto).
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SvcId } from "./motor";
import type { Catalogo } from "./v2/catalogoModelo";
import { FichaProduto } from "./FichaProduto";
import { eUuid, type FichaProdutoReal } from "./fichaProdutoDados";
import { lerModeloDoProduto, type LinhaPaginaProduto, type ModeloDoProduto } from "./real/produtosPaginados";

interface Props {
  id: string; K: Catalogo; real?: FichaProdutoReal; vistas: ReadonlyMap<string, LinhaPaginaProduto>; min: number; alvo: number;
  voltar: () => void; anunciar: (msg: string) => void; nomeServico: (sid: SvcId) => string; onAbrirServico: (sid: SvcId) => void;
}
/** `undefined` = ainda não se sabe; `null` = sabe-se que não tem modelo. */
type Modelo = ModeloDoProduto | null | undefined;
const modeloDaLinha = (l: LinhaPaginaProduto): ModeloDoProduto | null => (l.modelo_id ? { modeloId: l.modelo_id, modelo: l.modelo ?? "", modeloNumero: l.modelo_numero ?? 0 } : null);

export function FichaProdutoAberto({ id, K, real, vistas, min, alvo, voltar, anunciar, nomeServico, onAbrirServico }: Props) {
  const p0 = K.produtos.find((x) => x.id === id);
  const precisa = !!real && !!p0 && eUuid(id);
  const linha = vistas.get(id);
  const [modelo, setModelo] = useState<Modelo>(linha ? modeloDaLinha(linha) : undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const K0 = useRef(K), vistoNaLista = useRef(!!linha), modeloRef = useRef(modelo);
  modeloRef.current = modelo;
  const nome = p0?.n ?? "";
  useEffect(() => {
    if (!precisa || !real) return undefined;
    // veio da lista e nada mudou desde então: o modelo da linha vale
    if (vistoNaLista.current && K === K0.current && tentativa === 0) return undefined;
    let vivo = true;
    setErro(null);
    lerModeloDoProduto(real.org, id, nome).then((r) => {
      if (!vivo) return;
      if (!r.ok) { setErro(r.erro); return; }
      if (r.v !== undefined) { setModelo(r.v); return; }
      // a procura não trouxe o produto: se já se sabia o modelo, fica; senão não se sabe
      if (modeloRef.current === undefined) setErro("Não foi possível confirmar o modelo deste produto.");
    }, (e: unknown) => { if (vivo) setErro(e instanceof Error && e.message ? e.message : "Não foi possível ler o produto."); });
    return () => { vivo = false; };
  }, [precisa, real, id, nome, K, tentativa]);

  const sair = <Button variant="ghost" className="min-h-11 gap-2 px-0 text-[15px] font-medium text-muted-foreground" onClick={voltar}><ArrowLeft className="h-5 w-5" aria-hidden="true" />Voltar ao Catálogo</Button>;
  if (precisa && modelo === undefined) {
    return (
      <div>
        {sair}
        {erro
          ? <p role="alert" className="mt-3 text-[15px] text-destructive">{erro} <Button variant="outline" className="ml-2 min-h-11 text-[15px]" onClick={() => setTentativa((n) => n + 1)}>Tentar de novo</Button></p>
          : <p role="status" className="mt-3 text-[15px] text-muted-foreground">A ler o produto…</p>}
      </div>
    );
  }
  const p = p0 && precisa ? { ...p0, modeloId: modelo?.modeloId, modelo: modelo?.modelo, modeloNumero: modelo?.modeloNumero } : p0;
  return (
    <FichaProduto key={id} p={p} min={min} alvo={alvo} real={real} atributos={K.atributos} arvore={K.arvore} marcas={K.marcas} modelos={K.modelos}
      voltar={voltar} anunciar={anunciar} nomeServico={nomeServico} onAbrirServico={onAbrirServico} />
  );
}
