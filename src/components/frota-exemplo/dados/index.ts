// A lógica da Frota de exemplo na app real: as MESMAS regras e ações puras do protótipo (prototipo-negocios/frota),
// reexportadas daqui para não as duplicar. Só se reexporta o que é puro (tipos, base, regras, ações, seed): nada do
// motor nem do estadoV2 do protótipo, nem a ponte para o Inventário do protótipo (pontesInv.ts). A base de dados de
// exemplo da app real é outra (loja.ts, chave própria no localStorage).
export type {
  Tom, EstadoViatura, Posse, TipoAtrib, EstadoManut, TipoOcorr, EstadoOcorr, ChaveVenc, Pessoa, Viatura, Atribuicao, Manutencao,
  Leitura, Custo, Ocorrencia, Compromisso, Frota, LinhaCarrinha, ObraRef,
} from "@/pages/prototipo-negocios/frota/tipos";
export {
  HOJE, INICIO_PERIODO, ErroFrota, falhar, d2n, dias, addDias, addMeses, diasUteis,
  fData, fDataC, fEur, fNum, fKm, diaSemana, diaLongo, soma, uid, maiuscula,
} from "@/pages/prototipo-negocios/frota/base";
export * from "@/pages/prototipo-negocios/frota/regras";
export {
  obraDoMotivo, iniAtribuir, validarAtribuir, gravarAtribuir, iniDevolver, validarDevolver, gravarDevolver, cancelarReserva,
  iniKm, validarKm, gravarKm, iniAbastecer, validarAbastecer, gravarAbastecer, iniDespesa, validarDespesa, gravarDespesa,
  FICHEIRO_EXTRATO, extratoImportado, validarImportar, LINHAS_EXTRATO, verificarLinha, gravarImportar,
  iniManut, validarManut, gravarManut, iniConcluir, validarConcluir, gravarConcluir, iniEstado, validarEstado, gravarEstado,
  iniOcorrencia, validarOcorrencia, gravarOcorrencia, iniIdentificar, validarIdentificar, gravarIdentificar, resolverOcorrencia,
  iniRenovar, validarRenovar, gravarRenovar, iniNova, MATRICULA, validarNova, gravarNova, podeReservar,
  type Vals, type Erros,
} from "@/pages/prototipo-negocios/frota/acoes";
export { seedFrota, VERSAO_FROTA, CENTROS, OFICINAS, POSTOS, TIPOS_CUSTO, centroObra, obraDoCentro } from "@/pages/prototipo-negocios/frota/seed";
