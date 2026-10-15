// Textos do canal de denúncias DENTRO da app: «A minha área» (Denunciar, As minhas denúncias) e a entrada «Denúncias» do
// menu de RH (chaves `cdm.*` e `sidebar.rhExemplo...`). Módulo próprio, juntado em `useTranslation.ts`. Apenas en/pt:
// nas outras línguas o `t()` cai para `en`.

const pt: Record<string, string> = {
  // Menu lateral
  "sidebar.rhExemploDenunciar": "Denunciar",
  "sidebar.rhExemploMinhasDenuncias": "As minhas denúncias",
  "sidebar.rhExemploDenuncias": "Denúncias",
  "sidebar.rhExemploDenunciasPorConfirmar": "{n} por confirmar",

  // Comuns às páginas dentro da app
  "cdm.organizacao": "Organização: {nome}",
  "cdm.verPublica": "Ver a página pública (como a vê quem não tem login)",
  "cdm.guardarCodigo": "Guardar o código nesta sessão",
  "cdm.codigoGuardado": "Código guardado",
  "cdm.guardarCodigoNota": "O código ficou guardado só neste ecrã e esquece-se ao recarregar a página. O PIN não se guarda.",
  "cdm.semFicha.titulo": "Sem ficha ligada à tua sessão",
  "cdm.semFicha.texto": "Para denunciar ou acompanhar denúncias aqui, a tua sessão tem de estar ligada a uma ficha de Recursos Humanos.",

  // Denunciar
  "cdm.denunciar.titulo": "Denunciar",
  "cdm.denunciar.subtitulo": "Conta-nos o que se passa. Podes denunciar de forma anónima ou identificada: escolhes no primeiro passo.",
  "cdm.denunciar.botao": "Denunciar",

  // As minhas denúncias
  "cdm.minhas.titulo": "As minhas denúncias",
  "cdm.minhas.subtitulo": "Acompanha as denúncias que fizeste identificado e as que fizeste de forma anónima.",
  "cdm.minhas.abas": "Identificadas ou anónimas",
  "cdm.minhas.identificadas": "Identificadas",
  "cdm.minhas.anonimas": "Anónimas",
  "cdm.identificadas.intro": "As denúncias que fizeste identificado ficam ligadas à tua ficha. Só o responsável do canal as vê, e só ele pode ver quem és.",
  "cdm.identificadas.lista": "As minhas denúncias identificadas",
  "cdm.identificadas.recebidaEm": "Recebida a {data}",
  "cdm.identificadas.painelNota": "Aqui vês o estado, os prazos e a conversa com o responsável do canal. As notas internas são só da gestão.",
  "cdm.identificadas.vazioTitulo": "Ainda não fizeste nenhuma denúncia identificada",
  "cdm.identificadas.vazioTexto": "Quando denunciares identificado, a denúncia aparece aqui e podes conversar com o responsável do canal.",
  "cdm.anonimas.explica": "Uma denúncia anónima não fica ligada a ti, por isso não aparece numa lista. Acompanha-se com o código e o PIN que recebeste ao denunciar.",
  "cdm.anonimas.guardadosTitulo": "Códigos guardados nesta sessão",
  "cdm.anonimas.guardadosVazio": "Não guardaste nenhum código. Podes guardá-lo depois de denunciar ou de acompanhar uma denúncia; o PIN escreve-se sempre à mão.",
  "cdm.anonimas.guardadosNota": "Só o código fica guardado, só em memória. Escolhe um para o preencher; falta escreveres o PIN.",
  "cdm.anonimas.usarCodigo": "Usar o código {codigo}",

  // Gestão: abas por origem
  "cdm.origem.abas": "Origem da denúncia",
  "cdm.origem.todas": "Todas",
  "cdm.origem.anonimas": "Anónimas",
  "cdm.origem.identificadas": "Identificadas",
};

const en: Record<string, string> = {
  // Side menu
  "sidebar.rhExemploDenunciar": "Report a concern",
  "sidebar.rhExemploMinhasDenuncias": "My reports",
  "sidebar.rhExemploDenuncias": "Reports",
  "sidebar.rhExemploDenunciasPorConfirmar": "{n} to confirm",

  // Common to the in-app pages
  "cdm.organizacao": "Organization: {nome}",
  "cdm.verPublica": "See the public page (as someone without a login sees it)",
  "cdm.guardarCodigo": "Keep the code for this session",
  "cdm.codigoGuardado": "Code kept",
  "cdm.guardarCodigoNota": "The code is kept on this screen only and is forgotten when the page reloads. The PIN is never kept.",
  "cdm.semFicha.titulo": "No profile linked to your session",
  "cdm.semFicha.texto": "To report or follow reports here, your session must be linked to a Human Resources profile.",

  // Report
  "cdm.denunciar.titulo": "Report a concern",
  "cdm.denunciar.subtitulo": "Tell us what is going on. You can report anonymously or with your name: you choose in the first step.",
  "cdm.denunciar.botao": "Report a concern",

  // My reports
  "cdm.minhas.titulo": "My reports",
  "cdm.minhas.subtitulo": "Follow the reports you made with your name and the ones you made anonymously.",
  "cdm.minhas.abas": "Identified or anonymous",
  "cdm.minhas.identificadas": "Identified",
  "cdm.minhas.anonimas": "Anonymous",
  "cdm.identificadas.intro": "Reports you made with your name are linked to your profile. Only the channel manager sees them, and only they can see who you are.",
  "cdm.identificadas.lista": "My identified reports",
  "cdm.identificadas.recebidaEm": "Received on {data}",
  "cdm.identificadas.painelNota": "Here you see the status, the deadlines and the conversation with the channel manager. Internal notes are for management only.",
  "cdm.identificadas.vazioTitulo": "You have not made any identified report yet",
  "cdm.identificadas.vazioTexto": "When you report with your name, the report appears here and you can talk to the channel manager.",
  "cdm.anonimas.explica": "An anonymous report is not linked to you, so it does not appear in a list. You follow it with the code and PIN you received when you reported.",
  "cdm.anonimas.guardadosTitulo": "Codes kept for this session",
  "cdm.anonimas.guardadosVazio": "You have not kept any code. You can keep one after reporting or following a report; the PIN is always typed by hand.",
  "cdm.anonimas.guardadosNota": "Only the code is kept, in memory only. Pick one to fill it in; you still have to type the PIN.",
  "cdm.anonimas.usarCodigo": "Use the code {codigo}",

  // Management: tabs by origin
  "cdm.origem.abas": "Origin of the report",
  "cdm.origem.todas": "All",
  "cdm.origem.anonimas": "Anonymous",
  "cdm.origem.identificadas": "Identified",
};

export const canalDenunciasMinhaAreaTranslations: Record<"en" | "pt", Record<string, string>> = { en, pt };
