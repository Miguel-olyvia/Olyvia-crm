// Portal do fornecedor, detalhe da encomenda (sp.encomendaDet.*) e diálogo de confirmação (sp.encomendaDet.confirmar.*).
export const fornecedorPtEncomendaDet: Record<string, string> = {
  "sp.encomendaDet.aCarregar": "A carregar encomenda…",
  "sp.encomendaDet.naoDisponivel.titulo": "Encomenda não disponível",
  "sp.encomendaDet.naoDisponivel.texto":
    "Esta encomenda não existe, foi retirada do portal pela empresa ou já não tem acesso a ela.",
  "sp.encomendaDet.naoAbre": "Não foi possível abrir a encomenda",
  "sp.encomendaDet.voltarLista": "Voltar às encomendas",
  "sp.encomendaDet.voltar": "Encomendas",
  "sp.encomendaDet.titulo": "Encomenda {numero}",

  "sp.encomendaDet.descarregarPdf": "Descarregar PDF",
  "sp.encomendaDet.aGerarPdf": "A gerar PDF…",
  "sp.encomendaDet.confirmar": "Confirmar encomenda",
  "sp.encomendaDet.expedir": "Expedir encomenda",
  "sp.encomendaDet.pdfErro": "Não foi possível gerar o PDF",
  "sp.encomendaDet.tenteNovamente": "Tente novamente.",

  "sp.encomendaDet.alterada.titulo": "A encomenda foi alterada",
  "sp.encomendaDet.alterada.toast": "A empresa alterou a encomenda. Reveja-a antes de confirmar.",
  "sp.encomendaDet.alterada.texto":
    "A empresa alterou a encomenda enquanto a confirmava. Reveja as linhas abaixo antes de confirmar.",
  "sp.encomendaDet.versao":
    "A empresa atualizou esta encomenda (versão {n}, enviada em {data}). Reveja as linhas antes de confirmar.",

  "sp.encomendaDet.confirmadaEm": "Confirmada em {data}",
  "sp.encomendaDet.confirmadaPor": " por {nome}",
  "sp.encomendaDet.entregaPrevistaAviso": " · entrega prevista {data}",
  "sp.encomendaDet.comentario": "Comentário: {texto}",
  "sp.encomendaDet.dataAceite": "A empresa aceitou a data de entrega prevista.",
  "sp.encomendaDet.jaRecebida": "Esta encomenda já foi recebida pela empresa.",
  "sp.encomendaDet.jaCancelada": "Esta encomenda foi cancelada pela empresa.",

  "sp.encomendaDet.sla.ultrapassado": "Prazo de entrega (SLA) ultrapassado",
  "sp.encomendaDet.sla.atrasoSemContrato": "Prazo era {data} · {dias} de atraso face à data que indicou.",
  "sp.encomendaDet.sla.atrasoComContrato":
    "Prazo era {data} ({origem}) · {dias} de atraso. O incumprimento fica registado no SLA do contrato com a empresa.",
  "sp.encomendaDet.sla.risco": "Atenção: esta encomenda está perto de falhar o prazo de entrega (SLA)",
  "sp.encomendaDet.sla.riscoHoje": "Prazo: {data} · termina hoje ({origem}).",
  "sp.encomendaDet.sla.riscoFaltam": "Prazo: {data} · faltam {dias} ({origem}).",

  "sp.encomendaDet.cartao.encomenda": "Encomenda",
  "sp.encomendaDet.campo.numero": "Número",
  "sp.encomendaDet.campo.dataEncomenda": "Data da encomenda",
  "sp.encomendaDet.campo.entregaPedida": "Entrega pedida",
  "sp.encomendaDet.campo.enviadaEm": "Enviada em",
  "sp.encomendaDet.campo.vistaEm": "Vista em",
  "sp.encomendaDet.campo.responsavel": "Responsável",
  "sp.encomendaDet.cartao.empresa": "Empresa",
  "sp.encomendaDet.campo.nome": "Nome",
  "sp.encomendaDet.campo.nif": "NIF",
  "sp.encomendaDet.campo.morada": "Morada",
  "sp.encomendaDet.campo.telefone": "Telefone",
  "sp.encomendaDet.notas": "Notas da empresa",

  "sp.encomendaDet.linhas": "Linhas ({n})",
  "sp.encomendaDet.coluna.referencia": "Referência",
  "sp.encomendaDet.coluna.descricao": "Descrição",
  "sp.encomendaDet.coluna.qtd": "Qtd.",
  "sp.encomendaDet.coluna.precoUnit": "Preço unit.",
  "sp.encomendaDet.coluna.iva": "IVA",
  "sp.encomendaDet.coluna.total": "Total",
  "sp.encomendaDet.coluna.recebido": "Recebido",
  "sp.encomendaDet.nossaRef": "Nossa ref.: {ref}",
  "sp.encomendaDet.subtotal": "Subtotal (sem IVA)",
  "sp.encomendaDet.iva": "IVA",
  "sp.encomendaDet.total": "Total",

  "sp.encomendaDet.expedicoesErro": "Não foi possível ler as expedições",

  // Expedição: avisos depois de expedir
  "sp.encomendaDet.expedida.jaRegistada": "Expedição já registada",
  "sp.encomendaDet.expedida.titulo": "Encomenda expedida",
  "sp.encomendaDet.expedida.guia.um": "Guia de remessa {guia} · {n} linha.",
  "sp.encomendaDet.expedida.guia.varios": "Guia de remessa {guia} · {n} linhas.",
  "sp.encomendaDet.expedida.anexado": "Ficheiro da guia anexado",
  "sp.encomendaDet.expedida.anexoFalhou": "A guia foi registada, mas o ficheiro não foi anexado",
  "sp.encomendaDet.expedida.anexoTente": "Tente anexar de novo.",
  "sp.encomendaDet.expedirErro.stale": "Encomenda atualizada pela empresa",
  "sp.encomendaDet.expedirErro.guiaRepetida": "Guia de remessa repetida",
  "sp.encomendaDet.expedirErro.fechada": "Já não é possível expedir",
  "sp.encomendaDet.expedirErro.geral": "Não foi possível expedir",

  // Confirmação: avisos depois de confirmar
  "sp.encomendaDet.confirmada.jaEstava": "Encomenda já estava confirmada",
  "sp.encomendaDet.confirmada.titulo": "Encomenda confirmada",
  "sp.encomendaDet.confirmada.entregaPrevista": "Entrega prevista: {data}.",
  "sp.encomendaDet.confirmada.empresaAvisada": "A empresa foi avisada.",
  "sp.encomendaDet.confirmarErro.stale": "Encomenda atualizada pela empresa",
  "sp.encomendaDet.confirmarErro.fechada": "Já não é possível confirmar",
  "sp.encomendaDet.confirmarErro.geral": "Não foi possível confirmar",

  // Diálogo de confirmação
  "sp.encomendaDet.confirmar.titulo": "Confirmar encomenda {numero}",
  "sp.encomendaDet.confirmar.descricao":
    "A empresa {empresa} é avisada da confirmação. Depois de confirmar, a data e o comentário já não podem ser alterados aqui.",
  "sp.encomendaDet.confirmar.data": "Data de entrega prevista (opcional)",
  "sp.encomendaDet.confirmar.dataInvalida": "Data inválida.",
  "sp.encomendaDet.confirmar.dataAntes": "A data não pode ser anterior a {data}.",
  "sp.encomendaDet.confirmar.dataDepois": "A data não pode ser posterior a {data}.",
  "sp.encomendaDet.confirmar.empresaPediu": "A empresa pediu entrega até {data}.",
  "sp.encomendaDet.confirmar.empresaNaoIndicou": "A empresa não indicou data de entrega.",
  "sp.encomendaDet.confirmar.comentario": "Comentário (opcional)",
  "sp.encomendaDet.confirmar.comentarioPlaceholder": "Ex.: entrega em duas vezes, artigo X com prazo maior…",
  "sp.encomendaDet.confirmar.cancelar": "Cancelar",
  "sp.encomendaDet.confirmar.botao": "Confirmar encomenda",
};
