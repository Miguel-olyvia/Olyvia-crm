// A folha lateral aberta, conforme o detalhe escolhido (uma de cada vez). Carrega-se só quando se abre um detalhe.
import type { Detalhe } from "./ctxInv";
import { ContagemFolha } from "./ContagensInv";
import { EcFolha } from "./EcFolha";
import { FornecedorFolha } from "./FornecedorFolha";
import { GuiaFolha } from "./GuiasInv";
import { PoFolha } from "./PoFolha";
import { StockFolha } from "./StockFolha";

export default function FolhasInv({ detalhe, aoFechar }: { detalhe: Detalhe; aoFechar: () => void }) {
  switch (detalhe.t) {
    case "po": return <PoFolha key={detalhe.id} id={detalhe.id} tabInicial={detalhe.tab} aoFechar={aoFechar} />;
    case "ec": return <EcFolha key={detalhe.id} id={detalhe.id} aoFechar={aoFechar} />;
    case "sup": return <FornecedorFolha key={detalhe.id} id={detalhe.id} tabInicial={detalhe.tab} aoFechar={aoFechar} />;
    case "guia": return <GuiaFolha key={detalhe.id} id={detalhe.id} aoFechar={aoFechar} />;
    case "cont": return <ContagemFolha key={detalhe.id} id={detalhe.id} aoFechar={aoFechar} />;
    case "stock": return <StockFolha key={detalhe.sku} sku={detalhe.sku} aoFechar={aoFechar} />;
  }
}
