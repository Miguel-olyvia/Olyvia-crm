import { useTranslation } from "@/hooks/useTranslation";
import { LinhaCampo, ListaCampos } from "@/components/ficha-comum/ListaCampos";
import { Seccao } from "@/components/ficha-comum/Seccao";
import type { Pessoa } from "./pessoasTipos";
import { MarcaExemplo } from "./SelosPessoa";

const P = "pessoasPagina.";

/** "Origem": a origem, o canal, a campanha, o formulário e a via de entrada; só as linhas que existem (sem nenhuma, a secção não aparece). */
export function SeccaoOrigem({ pessoa }: { pessoa: Pessoa }) {
  const { t } = useTranslation();
  const linhas: [string, string | undefined][] = [
    [t(`${P}origin.source`), pessoa.origem ? t(`${P}origin.${pessoa.origem}`) : undefined],
    [t(`${P}origin.channel`), pessoa.canal],
    [t(`${P}origin.campaign`), pessoa.campanha],
    [t(`${P}origin.form`), pessoa.formulario],
    [t(`${P}origin.via`), pessoa.viaEntrada ? t(`${P}via.${pessoa.viaEntrada}`) : undefined],
  ];
  const comValor = linhas.filter(([, valor]) => valor);
  if (comValor.length === 0) return null;
  return (
    <Seccao titulo={t(`${P}origin.title`)} marca={<MarcaExemplo />}>
      <ListaCampos>
        {comValor.map(([rotulo, valor]) => <LinhaCampo key={rotulo} rotulo={rotulo}>{valor}</LinhaCampo>)}
      </ListaCampos>
    </Seccao>
  );
}
