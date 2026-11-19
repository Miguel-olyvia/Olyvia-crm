// Portal do cliente, os blocos da obra no documento do template (src/components/portal/obra): a proposta e as cláusulas do contrato,
// em português (os textos são os do documento da Emylia, DocsCliente.tsx).
export const clientePtDocObra: Record<string, string> = {
  "pc.docObra.aria": "A obra",
  "pc.docObra.diaUtil": "{n} dia útil",
  "pc.docObra.diasUteis": "{n} dias úteis",

  // Títulos dos blocos
  "pc.docObra.titulo.fazer": "O que vamos fazer",
  "pc.docObra.titulo.materiais": "Materiais e escolhas",
  "pc.docObra.titulo.planeamento": "Planeamento",
  "pc.docObra.titulo.pagamento": "Pagamento",
  "pc.docObra.titulo.condicoes": "Condições",
  "pc.docObra.titulo.aceitacao": "Aceitação",

  // 01 O que vamos fazer
  "pc.docObra.fazer.modelo": "Remodelação com o modelo \"{modelo}\".",
  "pc.docObra.fazer.fases": "A obra divide-se em fases, pela ordem em que acontecem.",
  "pc.docObra.fase.rotulo": "Fase {n}",
  "pc.docObra.fase.nome1": "Trabalhos preparatórios e demolições",
  "pc.docObra.fase.nome2": "Infraestruturas (instalações técnicas)",
  "pc.docObra.fase.nome3": "Revestimentos e acabamentos base",
  "pc.docObra.fase.nome4": "Montagem final e acabamentos finos",
  "pc.docObra.fase.curto1": "Preparação e demolições",
  "pc.docObra.fase.curto2": "Infraestruturas",
  "pc.docObra.fase.curto3": "Revestimentos",
  "pc.docObra.fase.curto4": "Montagem final",
  "pc.docObra.grupo.trabalhos": "Trabalhos",
  "pc.docObra.grupo.preparacao": "Preparação e proteção",
  "pc.docObra.grupo.materiais": "Materiais",
  "pc.docObra.grupo.cliente": "Fornecido por si",
  "pc.docObra.fixo.demolicao": "Demolição e remoção de entulho",
  "pc.docObra.fixo.demolicaoDet": "operador licenciado, com e-GAR",
  "pc.docObra.fixo.incluidosModelo": "incluídos no modelo",

  // 02 Materiais e escolhas
  "pc.docObra.mat.incluidos": "Incluídos no modelo",
  "pc.docObra.mat.escolhidos": "Escolhidos consigo",
  "pc.docObra.mat.poupa": "poupa {valor}",
  "pc.docObra.mat.poupaTotal": "Ao todo, poupa {valor} sem IVA, já descontados no preço.",
  "pc.docObra.mat.escolhas": "As suas escolhas",
  "pc.docObra.escolha.mobilidadeReduzida": "Mobilidade reduzida",

  // 04 Planeamento
  "pc.docObra.plan.periodo": "{de} a {ate}",
  "pc.docObra.plan.resumo": "Início previsto a {inicio} e fim a {fim}, só em dias úteis (sem fins de semana nem feriados).",

  // 05 Pagamento
  "pc.docObra.pag.momento": "Quando",
  "pc.docObra.pag.percentagem": "Percentagem",
  "pc.docObra.pag.valor": "Valor com IVA",
  "pc.docObra.pag.previsto": "previsto {data}",
  "pc.docObra.pag.texto": "Por transferência, referência Multibanco ou débito direto, à escolha do cliente no portal. Cada prestação tem a sua fatura, enviada para o portal.",
  "pc.docObra.prest.adjudicacao": "Na adjudicação",
  "pc.docObra.prest.arranque": "No arranque da obra",
  "pc.docObra.prest.fimEntrega": "No fim, antes da entrega",
  "pc.docObra.prest.meio": "A meio da obra",
  "pc.docObra.prest.fimObra": "No fim da obra",
  "pc.docObra.prest.fimFase": "No fim da fase {n} ({fase})",

  // 06 Condições
  "pc.docObra.cond.prazo": "Prazo de execução: {prazo}, a contar do início acordado, sem fins de semana nem feriados.",
  "pc.docObra.cond.garantia": "Garantia de {garantia} sobre a mão de obra, a contar do auto de receção; os materiais têm a garantia do fabricante.",
  "pc.docObra.cond.validade": "Proposta válida até {data}.",
  "pc.docObra.cond.extra": "Trabalhos que não estão descritos nesta proposta fazem-se só com o seu acordo, numa adenda com o preço e o prazo.",
  "pc.docObra.garantia.umAno": "1 ano",
  "pc.docObra.garantia.doisAnos": "2 anos",
  "pc.docObra.garantia.cincoAnos": "5 anos",

  // 07 Aceitação
  "pc.docObra.aceit.empresa": "Pela {empresa}",
  "pc.docObra.aceit.cliente": "O cliente",
  "pc.docObra.aceit.aceite": "Aceite no portal do cliente a {data}.",
  "pc.docObra.aceit.pode": "Pode aceitar nesta página, com o código que lhe enviamos por SMS: fica registado quem, quando e de onde.",

  // Contrato: as cláusulas do negócio
  "pc.docObra.ct.titulo": "Cláusulas do negócio",
  "pc.docObra.ct.clausula": "Cláusula {n}.ª · {titulo}",
  "pc.docObra.ct.revista": "revista",
  "pc.docObra.ct.t.objeto": "Objeto",
  "pc.docObra.ct.t.preco": "Preço",
  "pc.docObra.ct.t.pagamento": "Pagamento",
  "pc.docObra.ct.t.prazo": "Prazo",
  "pc.docObra.ct.t.garantia": "Garantia",
  "pc.docObra.ct.t.condicoes": "Condições gerais",
  "pc.docObra.ct.objeto": "Os trabalhos de {servico} em {local}: {servicos}, e os materiais do modelo escolhido.",
  "pc.docObra.ct.preco": "{base} sem IVA: {mo} de mão de obra, com IVA a 6% ({ivaMo}), e {mat} de materiais, com IVA a 23% ({ivaMat}). Total com IVA: {total}.",
  "pc.docObra.ct.prestacao": "{momento}: {p}%, {valor}",
  "pc.docObra.ct.prestacaoPrevista": "{momento} (previsto: {data}): {p}%, {valor}",
  "pc.docObra.ct.prazo": "Início {inicio}, com {dias} dias úteis de execução: fim previsto a {fim}.",
  "pc.docObra.ct.inicioA": "a {data}",
  "pc.docObra.ct.inicioPorMarcar": "por marcar",
  "pc.docObra.ct.aDefinir": "a definir",
  "pc.docObra.ct.multa": "O atraso imputável à empresa dá lugar a penalização, nos termos das condições gerais.",
  "pc.docObra.ct.garantia": "{garantia} sobre a mão de obra, a contar da data do auto de receção. Os materiais têm a garantia do fabricante.",
  "pc.docObra.ct.condicoes": "Fazem parte deste contrato as condições gerais da empresa, entregues ao cliente com a proposta.",

  // Contrato: as adendas assinadas
  "pc.docObra.ad.titulo": "Adendas ao contrato",
  "pc.docObra.ad.texto": "Fazem parte deste contrato. O resto mantém-se.",
  "pc.docObra.ad.linha": "+{total} com IVA · {dias} · {motivo}",
  "pc.docObra.ad.assinada": "Assinada",
  "pc.docObra.ad.assinadaEm": "Assinada · {data}",
  "pc.docObra.ad.contrato": "Contrato",
  "pc.docObra.ad.uma": "Adenda",
  "pc.docObra.ad.varias": "{n} adendas",
  "pc.docObra.ad.valorTotal": "Valor do contrato, com IVA",
};
