# Desenho: Visita do Pipeline com a logica da Emylia e levantamento configuravel

Desenho apenas: nada aplicado nem escrito em codigo. Base RH. Nao se altera src/emylia/**.

## 1. Ideia central
A Emylia passa a ser dona dos dados da visita; o questionario configuravel e so a lista de perguntas e das regras de efeito.
O passo Visita do Pipeline corre sobre o negocio da Emylia (d), com os passos dela: Visitas, Exterior, Interior, Area, Medidas, Necessidades, Fotografias.
Exterior, Interior, Area e Escolhas mostram as perguntas do questionario da organizacao; o resto sao os componentes da Emylia, por embrulho.

## 2. Onde vivem os dados (uma so fonte da verdade por campo)
- Pergunta COM campo da Emylia: negocio_respostas (d.f[campo]), valor literal da Emylia.
- Pergunta SEM equivalente: negocio_respostas, chave cfg_<chave da pergunta>, valor = chave da opcao.
- Campo da Emylia sem pergunta (andar, contentor...): negocio_respostas, como a Emylia o tem.
- Medidas, servicos, fotografias: negocio_medidas, negocio_servicos, d.visita. Orcamento: d.orc por neg_guardar_negocio, so por ai.
- levantamento_respostas: DERIVADO, escrito por neg_guardar_levantamento no fecho a partir de d.f (snapshot com o texto das perguntas).
Direcao unica d.f -> levantamento: nenhum ecra edita levantamento_respostas nesta visita; ao reabrir le-se de d.f.

## 3. Mapeamento pergunta -> campo da Emylia (por chave)
- Na configuracao: campo_emylia por pergunta e valor_emylia por opcao (valores de src/emylia/campos.ts, so leitura).
- Botao Ligar as perguntas de origem: preenche as cerca de 28 correspondencias do questionario semeado (so vale ao guardar). Um campo liga a uma so pergunta.
- Sem equivalente: fica como nota do levantamento (cfg_), nao afeta o orcamento salvo efeito proprio (ponto 4).
- Campo da Emylia sem pergunta: aparece no fim da seccao como a Emylia o tem (componente Campos); andar, elevador e contentor continuam.

## 4. Regra de efeito (por pergunta e por opcao)
Pergunta: efeito_modo = nenhum | emylia | proprio (exclusivos, nunca conta duas vezes).
- emylia: efeitos nativos do campo (omissao nos campos que ja os tem).
- proprio: valem os efeitos definidos por opcao (ou por unidade, nas numericas); os nativos desse campo saem do orcamento.
Opcao: efeito = ate 5 itens, cada um: valor (custo e preco), horas (n horas, custo/h, preco/h), percentagem sobre servicos, ou servico do Catalogo + quantidade.
Cada item tem descricao (o motivo da nota ao vivo). Sem valores por omissao. Fora: fator sobre materiais (o motor nao o aplica).
Limite: entulho (contentor, dist_entulho, andar, elevador, estacionamento) e da Emylia (Definicoes da demolicao); nao se desliga aqui.

## 5. Do efeito ao orcamento e a nota ao vivo
Modulo puro efeitosDaVisita(questionario, f): Efeito[] (mesmo tipo da Emylia) = nativos filtrados + configurados.
- Nota ao vivo: componente NotaOrcamento com o texto da Emylia (+ X EUR no orcamento · motivo), calculada de d.f, por baixo de cada pergunta.
- Orcamento: o armazem.run(fn) faz fn() e depois grava. O embrulho correrComEfeitos faz fn() e logo aplicarEfeitosConfigurados(d,S,q) ANTES de gravar.
  Esse passo refaz as linhas Levantamento · (nativas permitidas + configuradas) e sincroniza os servicos do Catalogo em d.visita.extra via A.extra (q=0 remove); as chaves nossas ficam em d.f.cfg_extras.
- Gravacao: nada de novo (neg_guardar_negocio). As linhas refazem-se sempre de d.f + configuracao. Antes de haver orcamento so ha nota ao vivo; as linhas aparecem ao fechar a visita (criarOrc + aplicarEfeitosConfigurados).

## 6. Base de dados (rascunho NOVO-20261231998000_levantamento_efeitos.sql; nada aplicado)
- levantamento_perguntas: campo_emylia, efeito_modo (default nenhum), efeito jsonb. levantamento_opcoes: valor_emylia, efeito jsonb.
- Reescrever a partir da versao mais recente de fn_neg_questionario_normalizar (hoje recusa chaves novas, NG009), neg_guardar_questionario (mudar so o efeito sobe a versao) e neg_questionario_levantamento.
- Validacao da forma do efeito na base; campo_emylia unico por questionario. Custo passa a viajar na leitura do questionario: database-reviewer confirma. Migration e codigo entram juntos; testes antes do push; nunca Mudelar.

## 7. Ficheiros a criar
- src/hooks/pessoas/workflow/efeitosQuestionario.ts (tipos e validacao)
- src/components/pessoas/negocioEmylia/visitaConfiguravel/: camposOrigem.ts, efeitosConfigurados.ts, aplicarEfeitos.ts, respostasConfiguraveis.ts, NotaOrcamento.tsx, CorpoSeccaoConfiguravel.tsx, passosVisitaConfiguravel.ts
- src/components/pessoas-workflow/LevantamentoEfeito.tsx e LevantamentoLigacao.tsx (ecra de configuracao)
- supabase/rascunhos/NOVO-20261231998000_levantamento_efeitos.sql
## 8. Ficheiros a alterar
- workflow/questionario.ts, questionarioEdicao.ts (tipos, lerQuestionario, paraEnvio); LevantamentoOpcoes.tsx, LevantamentoPergunta.tsx, errosQuestionario.ts
- negocio-metas/questionarioForm.ts e perguntasTipos.ts (levar campo, valor e efeito ao preenchimento)
- pessoas/negocioEmylia/FaseDaEmylia.tsx (trocar o corpo dos passos Exterior/Interior/Area/Escolhas; o run do ctx passa por correrComEfeitos)
- pessoas/GuiaDoNegocio.tsx (fazerLevantamento abre o ecra da Emylia, criando o negocio se faltar)
- passagemParaNegocio.ts e useNegocioEmyliaDoGuia.ts (no fecho: guardarLevantamento derivado de d.f, criarOrc, aplicarEfeitosConfigurados)
- VisitaDoGuia.tsx fica como reserva (sem negocio Emylia ou NE005). armazemNegocioEmylia.ts nao muda.

## 9. Riscos e por confirmar
- O negocio da Emylia existir ja na fase de visita do Pipeline (hoje nasce na passagem): maior mudanca, em GuiaDoNegocio e faseEmylia.
- A Emylia ignorar chaves cfg_* em d.f; separador dos campos varios (campos.ts).
- Negocios com documentos do CRM (NE005) nao gravam por este caminho: ficam no VisitaDoGuia, sem efeitos.
- Mudar o efeito nao reescreve levantamentos nem orcamentos ja enviados. Precos nativos da Emylia sao constantes de exemplo.
- Mudelar: a migration so acrescenta colunas com omissao neutra; sem mudanca de comportamento. Testes ficam para a proxima ronda.

## 10. Ordem
1 migration e revisao; 2 puros e tipos; 3 ecra de configuracao; 4 passos, nota e efeitos; 5 fecho; 6 migration e codigo juntos, ver ao vivo na nike.

## DECISOES para o utilizador
1. Colunas novas por migration (sem isto nao ha efeito configuravel). Recomendacao: sim, so colunas, com o codigo no mesmo dia.
2. Precos das perguntas de origem: os nativos da Emylia sao de exemplo. Recomendacao: passar a proprio com os valores da empresa (ecra em branco para preencher).
3. A visita passa a viver no negocio da Emylia, criado ao iniciar a visita. Recomendacao: sim, e a unica forma de o orcamento reagir durante a visita.
