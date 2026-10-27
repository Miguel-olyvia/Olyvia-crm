// O funil de Pessoas: uma barra por etapa (Lead, Contacto, Visita, Negócio, Cliente) com quantas pessoas já chegaram a ela e que parte do passo anterior passou.
// Cada etapa é um botão que junta o filtro "já chegou a esta etapa". O texto diz tudo: a cor de destaque só marca a primeira barra.
import type { EtapaFunil } from "./dashboardPessoas";
import { LinhaBarra } from "./BarrasH";

interface FunilProps<A> {
  etapas: readonly (EtapaFunil & { acao: A })[];
  aoEscolher: (acao: A, rotulo: string) => void;
  /** O que o botão de cada etapa diz a quem usa leitor de ecrã. */
  acaoRotulo: (e: EtapaFunil) => string;
}

const textoEtapa = (e: EtapaFunil): string =>
  e.passagem === null ? `${e.chegaram} pessoas` : `${e.chegaram} · ${e.passagem} % do passo anterior`;

export function Funil<A>({ etapas, aoEscolher, acaoRotulo }: FunilProps<A>) {
  const base = etapas[0]?.chegaram ?? 0;
  return (
    <ol aria-label="Funil por etapa" className="grid gap-0.5">
      {etapas.map((e, i) => (
        <LinhaBarra key={e.id} rotulo={e.rotulo} texto={textoEtapa(e)} largura={base > 0 ? (100 * e.chegaram) / base : 0} destaque={i === 0}
          acaoRotulo={acaoRotulo(e)} aoClicar={() => aoEscolher(e.acao, `já chegou a ${e.rotulo}`)} />
      ))}
    </ol>
  );
}
