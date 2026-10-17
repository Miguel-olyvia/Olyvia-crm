// O estado do formulário "Registar chamada": o que se escolheu, os erros (só depois de tentar guardar) e os dados prontos
// para `registarChamada`. Os valores de partida: amanhã, às 10:00, e a visita na morada da lead (se a tiver).
import { useMemo, useState } from "react";
import { somarDias, type DadosChamada } from "./acoesPessoa";
import {
  errosChamada, passoPorDefeito, passosDisponiveis, temErros, type ContextoChamada, type ErrosChamada,
} from "./chamadaPassos";
import { passoAtual } from "./etapaPessoa";
import { faseDoPedido } from "./pedidoNegocio";
import { destinoInicial, moradaDaLead, validarDestino, type DestinoVisita, type ErroMoradaVisita } from "./moradaVisita";
import type { MotivoPerda, PassoChamada, PedidoNegocio, ResultadoContacto, ResumoPessoa } from "./pessoasTipos";

export const HORA_POR_DEFEITO = "10:00";

export interface CamposChamada {
  resultado: ResultadoContacto | null;
  nota: string;
  passo: PassoChamada;
  data: string;
  hora: string;
  /** Onde é a visita: a morada da lead ou outra. */
  destino: DestinoVisita;
  motivo: MotivoPerda | "";
  /** O pedido a que a visita vai (só no passo "marcarVisita"); vazio quando a pessoa não tem nenhum sem visita (então cria-se um). */
  pedidoId: string;
}

/** Os pedidos a que a visita pode ir: os da pessoa que ainda não têm visita. */
const candidatosAVisita = (resumo: Pick<ResumoPessoa, "pedidos">): PedidoNegocio[] =>
  resumo.pedidos.filter((p) => faseDoPedido(p) !== "visita");

const SEM_ERROS: ErrosChamada = { data: null, hora: null, motivo: null };

const inicial = (resumo: ResumoPessoa, hoje: string, pedidoFixo?: string): CamposChamada => ({
  resultado: null, nota: "", passo: "nenhum", data: somarDias(hoje, 1), hora: HORA_POR_DEFEITO,
  destino: destinoInicial(moradaDaLead(resumo.pessoa)), motivo: "", pedidoId: pedidoFixo ?? candidatosAVisita(resumo)[0]?.id ?? "",
});

/** Os dados para `registarChamada`, com o dia, a hora, o local e o motivo só nos passos que os usam. */
export function dadosDaChamada(c: CamposChamada, resumo: ResumoPessoa): Omit<DadosChamada, "hoje"> | null {
  if (c.resultado === null) return null;
  const base = { resultado: c.resultado, nota: c.nota, passo: c.passo };
  if (c.passo === "marcarVisita") return { ...base, data: c.data, hora: c.hora, destinoVisita: c.destino, ...(c.pedidoId ? { pedidoId: c.pedidoId } : {}) };
  if (c.passo === "ligarData") return { ...base, data: c.data, hora: c.hora };
  if (c.passo === "perder" && c.motivo !== "") return { ...base, motivo: c.motivo, contexto: { passo: passoAtual(resumo), papel: resumo.papel } };
  return c.passo === "perder" ? null : base;
}

/**
 * O estado do formulário. `pedidoFixo` é o pedido do item de onde veio a chamada (a visita vai para ele); sem ele, a visita vai para o
 * pedido escolhido entre os `candidatos` (o primeiro, por omissão) e o seletor só se mostra havendo mais de um.
 */
export function useFormChamada(resumo: ResumoPessoa, hoje: string, pedidoFixo?: string) {
  const ctx = useMemo<ContextoChamada>(() => ({ papel: resumo.papel, perdida: !!resumo.pessoa.perdida }), [resumo.papel, resumo.pessoa.perdida]);
  const [campos, setCampos] = useState<CamposChamada>(() => inicial(resumo, hoje, pedidoFixo));
  const candidatos = useMemo(() => (pedidoFixo === undefined ? candidatosAVisita(resumo) : []), [pedidoFixo, resumo]);
  const [tentativas, setTentativas] = useState(0);
  const mudar = (parcial: Partial<CamposChamada>) => setCampos((c) => ({ ...c, ...parcial }));
  // A primeira escolha traz o passo por defeito; ao trocar de resultado, o passo fica se ainda couber.
  const escolherResultado = (r: ResultadoContacto) => setCampos((c) => ({
    ...c, resultado: r, passo: c.resultado !== null && passosDisponiveis(r, ctx).includes(c.passo) ? c.passo : passoPorDefeito(r, ctx),
  }));
  const erros = errosChamada(campos, hoje);
  const moradaLead = moradaDaLead(resumo.pessoa);
  const erroMorada: ErroMoradaVisita | null = campos.passo === "marcarVisita" ? validarDestino(campos.destino, moradaLead) : null;
  const passos = campos.resultado === null ? [] : passosDisponiveis(campos.resultado, ctx);
  /** Tenta guardar: devolve os dados, ou `null` (e passa a mostrar os erros) se faltar algo. */
  const preparar = () => {
    if (campos.resultado === null) return null;
    if (temErros(erros) || erroMorada) { setTentativas((n) => n + 1); return null; }
    return dadosDaChamada(campos, resumo);
  };
  return {
    campos, mudar, escolherResultado, passos, candidatos, erros: tentativas > 0 ? erros : SEM_ERROS, moradaLead, erroMorada: tentativas > 0 ? erroMorada : null,
    tentativas, preparar,
  };
}
