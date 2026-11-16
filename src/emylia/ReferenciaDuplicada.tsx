// 16/11 (20270118300000): dois produtos do mesmo modelo com os mesmos atributos são o mesmo produto, e a base não gera a referência. Diz-se, com uma ligação
// para abrir o outro produto NUM SEPARADOR NOVO (quem está a criar não perde o que escreveu). A ligação segue o modo de endereço da página: hash (a moldura
// do protótipo) ou pesquisa (a app); o produto aberto vai em ?produto=<id>, como o Catálogo o lê (CatalogoV1).
import { useContext } from "react";
import { EnderecoAtivo, type ModoEndereco } from "@/lib/paramUrl";
import { descreverFaltas } from "./skuDados";

/** O endereço da ficha de um produto, a partir do sítio onde se está (sem os parâmetros de dentro da página, como «criar»). */
export function hrefProduto(id: string, modo: ModoEndereco = "hash"): string {
  const l = window.location, valor = encodeURIComponent(id);
  if (modo === "pesquisa") return `${l.pathname}?produto=${valor}`;
  const h = l.hash || "#/", i = h.indexOf("?");
  return `${l.pathname}${l.search}${i >= 0 ? h.slice(0, i) : h}?produto=${valor}`;
}

const FRASE = descreverFaltas(["duplicado"])[0];

/** «Já existe um produto com este modelo e estes atributos» + «Abrir esse produto». `apagado`: o outro já foi apagado (não há ficha para abrir). */
export function ReferenciaDuplicada({ outro, apagado = false }: { outro: string | null | undefined; apagado?: boolean }) {
  const ativo = useContext(EnderecoAtivo);
  if (!outro || apagado) return <span>{apagado ? `${FRASE} (apagado): a referência dele não se reutiliza` : FRASE}</span>;
  return (
    <span>
      {FRASE}.{" "}
      <a href={hrefProduto(outro, ativo === "pesquisa" ? "pesquisa" : "hash")} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-0">
        Abrir esse produto<span className="sr-only"> (abre num separador novo)</span>
      </a>
    </span>
  );
}
