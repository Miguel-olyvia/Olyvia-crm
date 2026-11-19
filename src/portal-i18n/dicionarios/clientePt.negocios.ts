// Textos do portal de CLIENTE, em português: «Os Meus Negócios» (lista), o negócio por dentro (código por SMS, avisos),
// os passos do negócio (barra e cartão «Passo n de 5») e a conversa com a equipa. Chaves `pc.negocios.*`.
// O que vem do servidor, as mensagens escritas por pessoas e o ecrã da V1 (src/emylia) ficam como vêm.
export const clientePtNegocios: Record<string, string> = {
  // Lista
  "pc.negocios.lista.titulo": "Os Meus Negócios",
  "pc.negocios.lista.vazio": "Não tem negócios disponíveis.",
  "pc.negocios.lista.vazioOutros": "Se esperava ver outros, troque de empresa no seletor no topo da página.",
  "pc.negocios.lista.abrir": "Abrir",
  "pc.negocios.lista.abrirNegocio": "Abrir {titulo}",
  "pc.negocios.lista.passoAria": "Passo {passo} de {total}: {nome}",
  "pc.negocios.lista.novas.um": "{n} mensagem nova",
  "pc.negocios.lista.novas.varios": "{n} mensagens novas",

  // Passos (barra e cartão)
  "pc.negocios.passos.lista": "Passos do negócio",
  "pc.negocios.passos.feito": "(feito)",
  "pc.negocios.passos.atual": "(passo atual)",
  "pc.negocios.passos.passoDe": "Passo {passo} de {total}",
  "pc.negocios.passos.totalComIva": "Total, com IVA",
  "pc.negocios.passos.prazo": "Prazo",
  "pc.negocios.passos.1.nome": "Rever a proposta",
  "pc.negocios.passos.1.titulo": "Reveja a sua proposta",
  "pc.negocios.passos.1.texto": "Está toda aqui em baixo: o que vamos fazer, fase a fase, os materiais, o preço e as condições.",
  "pc.negocios.passos.2.nome": "Aceitar",
  "pc.negocios.passos.2.titulo": "Aceite a proposta",
  "pc.negocios.passos.2.texto": "Se está de acordo, aceite com o código que lhe enviamos por SMS. Se quiser mudar alguma coisa, peça alterações.",
  "pc.negocios.passos.3.nome": "Assinar o contrato",
  "pc.negocios.passos.3.titulo": "Assine o contrato",
  "pc.negocios.passos.3.texto": "A proposta foi aceite. Leia o contrato e assine com o código que lhe enviamos por SMS.",
  "pc.negocios.passos.4.nome": "Acompanhar o serviço",
  "pc.negocios.passos.4.titulo": "A sua obra está em curso",
  "pc.negocios.passos.4.texto": "O contrato está assinado. A equipa avisa-o por aqui e por contacto direto a cada avanço.",
  "pc.negocios.passos.5.nome": "Receber o serviço",
  "pc.negocios.passos.5.titulo": "Receber o serviço",
  "pc.negocios.passos.5.texto": "No fim da obra confirmamos consigo que está tudo como combinado.",

  // Conversa com a equipa
  "pc.negocios.conversa.titulo": "Conversa com a equipa",
  "pc.negocios.conversa.aCarregar": "A carregar a conversa…",
  "pc.negocios.conversa.erroLer": "Não foi possível ler a conversa. Tente de novo daqui a pouco.",
  "pc.negocios.conversa.erroAtualizar": "Não foi possível atualizar a conversa; a tentar de novo…",
  "pc.negocios.conversa.erroEnviar": "Não foi possível enviar a mensagem.",
  "pc.negocios.conversa.respostaInesperada": "Resposta inesperada do servidor: a mensagem pode ter seguido, confirme na conversa.",
  "pc.negocios.conversa.vazio": "Ainda sem mensagens. Escreva à equipa: respondemos por aqui. Se houver um problema na obra, junte fotografias.",

  // O negócio por dentro: avisos
  "pc.negocios.detalhe.avisoSemAcao": "Isto ainda não se faz por aqui. Escreva-nos na conversa e tratamos consigo.",
  "pc.negocios.detalhe.propostaIndisponivel": "A proposta ainda não está disponível. Tente daqui a pouco.",

  // Receber o serviço (auto de receção) e adenda: o código por SMS
  "pc.negocios.receber.subtitulo": "Receber o serviço · auto {n}",
  "pc.negocios.receber.titulo": "Assinar o auto de receção",
  "pc.negocios.receber.comReservas": "Fica escrita a sua observação: «{reservas}».",
  "pc.negocios.receber.semReservas": "Diz que está tudo bem.",
  "pc.negocios.receber.acao": "Assinar o auto",
  "pc.negocios.receber.voltar": "Voltar ao auto",
  "pc.negocios.adenda.subtitulo": "Trabalhos a mais · adenda {ref}",
  "pc.negocios.adenda.voltar": "Voltar à adenda",
  "pc.negocios.sms.confirmar": "Para confirmar, enviamos um código por SMS para o seu telemóvel.",
  "pc.negocios.sms.enviar": "Enviar o código por SMS",
  "pc.negocios.sms.aEnviar": "A enviar o código…",
  "pc.negocios.sms.codigo": "Código que recebeu",
  "pc.negocios.sms.codigoEm": "Código que recebeu em {tel}",
  "pc.negocios.sms.aConfirmar": "A confirmar…",
  "pc.negocios.sms.outro": "Enviar outro código",
  "pc.negocios.sms.erroEnvio": "Não foi possível enviar o código.",
  "pc.negocios.sms.erroCodigo": "Código inválido.",
};
