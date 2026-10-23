import { forwardRef, useMemo } from "react";
import type { PessoaDaLista } from "@/hooks/pessoas/listaPessoasTipos";
import { useContactosPessoas } from "@/hooks/pessoas/useContactosPessoas";
import { useNomesResponsaveis } from "@/hooks/pessoas/useNomesResponsaveis";
import type { IdColuna } from "@/components/pessoas/vistaLinhaPessoa";
import type { AoAbrirPessoa } from "./LinhaListaReal";
import { TabelaListaReal } from "./TabelaListaReal";

interface TabelaListaRealComDadosProps {
  linhas: readonly PessoaDaLista[];
  ocupada: boolean;
  aoAbrir?: AoAbrirPessoa;
  colunas: readonly IdColuna[];
}

const COLUNAS_DE_CONTACTO: readonly IdColuna[] = ["phone", "email", "whatsapp"];

/**
 * A tabela da Lista real com as leituras em lote por página: telefone, email e WhatsApp (uma chamada por página) e o nome do comercial
 * (uma consulta por página). Só se lê o que as colunas visíveis precisam; quem escondeu as colunas não paga as leituras. Só se monta
 * em modo real (as leituras dependem da organização).
 */
export const TabelaListaRealComDados = forwardRef<HTMLDivElement, TabelaListaRealComDadosProps>(function TabelaListaRealComDados(props, ref) {
  const { linhas, colunas } = props;
  const querContactos = colunas.some((c) => COLUNAS_DE_CONTACTO.includes(c));
  const querComerciais = colunas.includes("assigned");
  const idsPessoas = useMemo(() => linhas.map((l) => l.id), [linhas]);
  const idsResponsaveis = useMemo(() => linhas.map((l) => l.responsavelId), [linhas]);
  const contactos = useContactosPessoas(idsPessoas, querContactos);
  const comerciais = useNomesResponsaveis(idsResponsaveis, querComerciais);
  const dados = useMemo(() => ({ contactos, comerciais }), [contactos, comerciais]);
  return <TabelaListaReal ref={ref} {...props} dados={dados} />;
});
