# O que mudou a 1 de setembro de 2026

> **O dia em que o módulo foi usado a sério pela primeira vez.**
>
> Não foi um dia de funcionalidades novas: foi um dia de correções ao desenho,
> quase todas vindas da mesma frase — *"isto está muito difícil"*. Quem montou
> a operação passo a passo encontrou em duas horas o que meses de código não
> tinham encontrado.
>
> Este ficheiro guarda **o que mudou e porquê**, na ordem em que aconteceu.
> Cada secção tem a queixa original, porque a queixa é a parte que não se
> reconstrói depois.

---

## Índice

| | O que mudou | Precisa de SQL? |
|---|---|---|
| [1](#1-o-catálogo-de-categorias) | Categorias de equipamento: 47 sugestões, escolhidas de uma vez | não |
| [2](#2-os-locais-saíram-das-definições) | Os locais saíram das Definições | não |
| [3](#3-uma-morada-uma-página) | Uma morada, uma página — os espaços deixam de ter a sua | não |
| [4](#4-mover-equipamentos-de-casa) | Mover equipamentos: arrastar, ou botão | não |
| [5](#5-remover-nunca-apaga) | Remover, repor, e o que não se deixa remover | não |
| [6](#6-sítio-passa-a-local) | "Sítio" passa a "Local" em todo o lado | não |
| [7](#7-duplicar-leva-a-árvore-toda) | Duplicar um local leva os espaços e os equipamentos | **`db/duplicar.sql`** |
| [8](#8-trabalho-acrescentado-na-própria-ordem) | Tarefas e leituras na própria ordem | **`db/tarefas-na-ordem.sql`** |
| [9](#9-a-tarefa-respondida-fecha-se) | Tarefa respondida fecha-se, só "alterar" pequeno | não |
| [10](#10-o-sino-em-operações) | O sino do CRM, mostrado dentro de Operações | não |
| [11](#11-a-agenda-diz-o-quê) | Nomes das ordens na vista de mês | não |
| [12](#12-espreitar-sem-sair-da-agenda) | Painel lateral em vez de mudar de página | não |
| [13](#13-mapa-onde-a-pergunta-se-faz) | Mapa na ficha do local e no painel da ordem | não |
| [14](#14-o-que-não-mudou-e-porquê) | O que se decidiu **não** mudar | — |

**Dois ficheiros SQL para correr**, por esta ordem:

```
db/duplicar.sql          (outra vez — a função ganhou um argumento)
db/tarefas-na-ordem.sql  (novo)
```

---

## 1. O catálogo de categorias

> *"Faltam muitas categorias, só tenho duas: extintor e sistemas de combate."*

**O problema.** A lista de categorias de equipamento começava vazia, e cada
categoria era um formulário inteiro: nome, código, gravar, outra vez. Quem
monta uma operação a sério tem trinta para meter, não duas.

**O que se fez.** O formulário abre com um catálogo por ofício — **47
sugestões em 8 famílias**. Toca-se no que serve (ou "Escolher todas" numa
família) e grava tudo de uma vez. O formulário à mão continua lá em baixo para
o que não está no catálogo, que é sempre metade.

| Família | Para quem |
|---|---|
| Segurança contra incêndio | quem faz manutenção obrigatória e tem de provar datas |
| Climatização e águas | manutenção de edifícios e condomínios |
| Eletricidade e energia | quem tem quadros, geradores ou postos de transformação |
| Elevação e acessos | edifícios com elevadores, portões ou cais |
| Segurança e controlo | manutenção de sistemas de segurança |
| Limpeza | empresas de limpeza e condomínios |
| Obras e remodelações | quem entra numa casa e tem de provar o estado em que a encontrou |
| Espaços verdes e frota | jardinagem, piscinas, e carrinhas para manter |

**O que já existe não é oferecido outra vez** — nem escrito de outra maneira.
Quem escreveu "extintor" à mão não vê "Extintores" na lista de sugestões.

`src/domain/categorias-sugeridas.ts` · `src/components/FormCategoria.tsx`

---

## 2. Os locais saíram das Definições

> *"Os locais devem ser criados dentro da tab de Locais ou dentro de uma
> ordem… isto sai fora e é trabalhado tudo dentro da criação da ordem, detalhe
> da ordem e na tab de locais."*

**O problema.** Um local não é uma definição. Quem chega a uma morada nova
está a abrir uma ordem, ou está na árvore dos locais — não vai a Definições.

**O que se fez.** O separador *Locais e equipamentos* desapareceu das
Definições. Os locais criam-se em três sítios:

| Onde | Como |
|---|---|
| `/locais` | botão **+ Local** no topo |
| `/locais` | o **+** de cada linha da árvore → cria um espaço lá dentro |
| Dentro da ordem | como já era, e agora também espaços — com o cliente já preenchido |

**As categorias de equipamento mudaram-se para `Definições › Procedimentos`**,
que é onde pertencem: uma categoria é a etiqueta a que as medições e as
checklists se penduram. Estava no separador errado.

As Definições passaram de seis separadores para cinco:

```
Procedimentos · Equipa · Tipos e custos · Vocabulário · Automático
```

### E o separador ganhou um explicador

> *"Tens de me explicar como funciona, porque não estou a ver o benefício. É
> para associar a ordens? Tipos de ordem?"*

Era uma pergunta justa: o ecrã mostrava três listas e nunca dizia para onde é
que elas iam. Agora abre com um cartão que o diz em quatro linhas:

| | O que é | Exemplo |
|---|---|---|
| **Categoria** | o que o equipamento **é** | Extintor |
| **Medição** | o que se **lê** nele | 12,4 bar |
| **Checklist** | a lista de **tarefas** | Verificação trimestral |
| **Plano** | a mesma checklist, a **nascer sozinha** | todos os meses |

E a frase que faltava: **isto é o que o técnico vê no telemóvel, e o que sai
escrito no relatório do cliente.** Sem isto, uma ordem é uma caixa de texto e a
prova do trabalho é a palavra de quem lá esteve.

---

## 3. Uma morada, uma página

> *"Não faz sentido cada sítio e cada espaço ter a sua página. Devia haver um
> sítio com uma página, e lá dentro de forma hierárquica e bem percetível ter
> os espaços, com tudo gerível dentro de uma só interface, sem ter de mudar de
> página."*

**O problema.** Para meter um extintor na box 12 da garagem eram três cliques
e três carregamentos de página — e a meio já ninguém sabia onde estava.

**O que se fez.** A ficha de uma morada mostra a árvore inteira, a qualquer
profundidade, e cada degrau gere-se onde está:

```
▼ 📍 Torre A                    1 · 14 ao todo   [+ Equipamento] [+ Espaço]
      EXT-0001  Extintor da entrada

  ▼ 🏢 Garagem −1               2 · 9 ao todo    [+][+] [editar] [duplicar] [✕]
        EXT-0004  Extintor da rampa
        EXT-0005  Extintor do fundo

    ▸ 🏢 Box 12                 7
  ▸ 🏢 Piso 3                   4

  ▸ Ver o que foi removido (2)
```

**Um espaço não tem página própria.** O endereço de um espaço
(`/locais/LOC-0042`) abre a página da **morada dele**, com a árvore aberta até
lá e o espaço destacado. Os links antigos continuam a funcionar — um link
antigo que morre é pior do que um que aterra no sítio certo.

### Três detalhes que valem a pena

**A contagem diz a verdade.** `3` quando é tudo ali; `1 · 12 ao todo` quando há
mais escondido lá dentro. Um número só, num degrau que esconde doze, mente.

**O histórico é da morada inteira.** *"Esta torre tem dado problemas?"* não
distingue o piso 3 da garagem — e perguntar só pelo nó de cima dava sempre uma
lista vazia, porque o trabalho acontece nos espaços.

**A procura abre as gavetas.** Procura na árvore toda e abre sozinha os
degraus onde encontra alguma coisa. Procurar e depois ter de abrir sete gavetas
à mão não é procurar.

### E cada ordem diz onde foi

> *"Na lista de ordens associadas e histórico deve ter antes do nome o nome do
> local ou espaço associado. Se foi na garagem é garagem daquele local, se for
> o local é só o local."*

| Onde foi | O que mostra |
|---|---|
| No próprio local | `Torre A` |
| Num espaço | `Garagem −1` |
| Num espaço mais fundo | `Garagem −1 › Box 12` |

Não repete o nome do local em cada linha — isso já está no topo da página. E
uma ordem cujo local pertence a **outra** árvore não se anuncia como sendo
daqui: acontece quando alguém muda um espaço de casa.

`src/domain/arvore-de-locais.ts` (puro, 21 testes) ·
`src/components/EstruturaDoLocal.tsx`

---

## 4. Mover equipamentos de casa

> *"Na lista do local, permitir mover os equipamentos para outros espaços ou
> local com drag and drop."*

**O problema.** O extintor que estava "na torre" e afinal está na garagem só se
resolvia apagando e criando outro — e aí perdia-se o histórico dele, que é
metade da razão de o equipamento existir na base.

**O que se fez.** Arrasta-se para outro degrau e fica lá. O degrau que pode
receber acende-se; o de origem não, senão a árvore toda parecia um destino
válido.

**E um botão "mover"**, porque arrastar não funciona com o dedo. Um equipamento
que só se pode mudar no computador é um equipamento que fica onde está.

A mudança escreve-se **sozinha** no histórico: já havia um gatilho para isso
desde `documentos-e-ativos.sql`, e nunca tinha tido como ser accionado.

---

## 5. Remover nunca apaga

Isto não foi pedido — foi uma decisão que se tomou ao dar o botão.

**Remover põe `ativo = false`.** O item sai de todas as listas (que já
filtravam por esse campo desde o schema inicial) e o histórico fica intacto.

**Porquê.** As ordens apontam para o equipamento, e a chave é em cascata. Um
`DELETE` a sério levava atrás o histórico — um engano numa lista passaria a
custar dois anos de trabalho.

**Por isso há uma gaveta.** *"Ver o que foi removido (2)"*, fechada por
omissão, com um **repor** em cada linha. Sem ela, remover era uma decisão sem
volta tomada com um clique.

**E um espaço com coisas lá dentro não se remove.** O diálogo deixa de ser um
botão vermelho e passa a dizer o que fazer primeiro: tirar ou mudar de sítio os
equipamentos. Senão ficariam sem casa e ninguém os encontrava.

---

## 6. "Sítio" passa a "Local"

> *"Onde diz 'Sítio' vamos colocar 'Local'."*

O produto dizia **Sítio** nos botões e **Local** no menu, e eram a mesma coisa.
Passou a ser **Local** em todo o lado que se lê: botões, títulos, ecrãs vazios,
tutorial, e os nomes dos eventos do histórico (`Mudou de sítio` → **Mudou de
local**).

**Ficou "sítio" onde é português corrente e não o nome da coisa:** *"mudar de
sítio"*, *"no sítio certo"*, *"a sessão em sítios separados"*, *"cada uma no
seu sítio"*. Trocar essas por "local" não arrumava vocabulário nenhum — só
tornava as frases piores.

---

## 7. Duplicar leva a árvore toda

> *"O duplicar o local também devia duplicar os espaços e todos os
> equipamentos. (Duplicar o espaço não cria um local novo, apenas cria um
> espaço igual dentro do local atual.)"*

**O problema.** Duplicar copiava o nó e os equipamentos dele, e deixava os
espaços para trás. A cópia de uma torre de sete pisos vinha vazia — que é
precisamente o caso em que duplicar valia a pena.

**O que se fez.** A cópia leva os espaços, os espaços dos espaços, e os
equipamentos de cada um. Por níveis, porque um filho precisa do pai já criado;
com um travão de 20 níveis contra dados em ciclo.

**Duplicar um espaço dá um irmão dentro do mesmo local** — a box 13 nasce ao
lado da box 12, e não como morada nova. Já era assim (o `parent_id` copiava-se),
mas não havia botão para o fazer. Agora cada degrau tem o seu.

**O que a cópia continua a não levar:**

- **as coordenadas** — dois apartamentos na mesma torre não são o mesmo ponto,
  e um ponto errado manda o técnico com confiança para o sítio errado;
- **os números de série** — são únicos de cada máquina;
- **as ordens e o histórico** — o que aconteceu fica onde aconteceu.

> ⚠ **A assinatura da função mudou** (ganhou `p_com_espacos`). O ficheiro larga
> a antiga com um `DROP FUNCTION IF EXISTS` — sem isso ficavam as duas, e a
> chamada de três argumentos continuava a correr a versão velha.

`db/duplicar.sql` · `tools/validar-duplicar.mjs`

---

## 8. Trabalho acrescentado na própria ordem

> *"Não achas super complexo e longo? Não podemos fazer logo tudo na ordem,
> opcionalmente? Haverá sempre situações específicas e temos de estar
> prontos."*

**O problema.** Para registar `12,4 bar` numa ordem eram seis passos e dois
ecrãs: ir a Definições, criar a medição, abrir a checklist, pendurá-la numa
tarefa, publicar a checklist, e só depois escolher essa checklist ao abrir a
ordem.

**O que se fez.** Há um **+ Tarefa** na própria ordem. Quatro feitios, todos
escolhidos com um toque:

| Feitio | Para quê |
|---|---|
| **Conforme / não conforme** | uma verificação simples |
| **Número** | com unidade e limites — o valor decide sozinho |
| **Texto** | uma observação |
| **Foto** | uma prova |

**O detalhe que faz isto ser possível sem tabelas novas:** `ops_ordem_tarefa`
já tinha `unidade`, `limite_min`, `limite_max` e `valor_num` desde o schema
inicial. Uma leitura com limites é uma tarefa — não precisa de
`ops_medicao_def` nenhuma. Só nunca tinha tido um botão.

### ⚠ O que isto NÃO faz

**Uma tarefa acrescentada à mão vive só nessa ordem.** Não entra em checklist
nenhuma, não passa à visita seguinte, e não conta para o cumprimento do plano.

É de propósito: se entrasse, a decisão de um técnico num dia passava a ser
procedimento da casa sem ninguém decidir.

**O caminho longo continua a ser o certo para o trabalho que se repete** — uma
checklist publicada é o que faz doze visitas serem comparáveis. O curto é para
o que não se repete, e o técnico que chega ao local e encontra mais uma coisa
não vai a Definições publicar uma checklist nova. Ou regista ali, ou não
regista.

**Tirar só enquanto estiver por responder.** Trabalho feito não se apaga: isso
não é corrigir um engano, é apagar a prova.

`db/tarefas-na-ordem.sql`

---

## 9. A tarefa respondida fecha-se

> *"No detalhe da ordem, o técnico ao preencher uma task deve ficar fechada.
> Mas opcionalmente editável. Se clica conforme, então fica conforme,
> desaparecem os botões e só aparece 'alterar' em pequeno."*

Feito exatamente assim. Responder fecha a tarefa e deixa à vista só o que ficou
registado — o valor com a unidade, ou o veredicto — com um **alterar** pequeno
ao lado.

**Porquê.** Manter três botões grandes debaixo de uma tarefa já feita dá uma
lista onde tudo parece por fazer. Num telemóvel, onde cabem três tarefas no
ecrã, é a diferença entre ver o progresso e não ver nada. E o polegar acerta no
botão errado.

**"Alterar" é pequeno de propósito:** mudar uma resposta é raro, e uma coisa
rara não merece o mesmo tamanho que a comum.

Numa tarefa com várias leituras, só se fecha quando a **última** ficar
respondida — fechar à primeira escondia as outras cinco.

---

## 10. O sino em Operações

> *"Falta o sininho no módulo de operação."*

**A decisão original era não ter sino nenhum**, para não haver dois sítios para
olhar. Está escrito em `db/notificacoes.sql`, com essas palavras.

**A premissa estava errada.** Um técnico que passa o dia em Operações não vai
ao CRM ver se lhe caiu trabalho — e quem lho atribuiu fica a pensar que avisou.

**Não é um segundo sino. É o mesmo, mostrado onde a pessoa está:**

- lê a **mesma** tabela `notifications`, filtrada por `data->>'modulo' = 'operacoes'`;
- marcar como lido **aqui apaga lá**, e ao contrário também;
- clicar num aviso abre a ordem.

Duas janelas para a mesma caixa não são duas caixas.

> ✅ **Sem uma linha de SQL.** O CRM tem, desde o baseline, as políticas que
> deixam cada pessoa ver e marcar as **suas** notificações
> (`user_id = auth.uid()`). O módulo usa exatamente a mesma porta que o sino do
> CRM usa.

**Um detalhe do caminho:** o link das notificações está escrito para o CRM
(`/operacao/ordens/OT-1`) e aqui dentro a aplicação já vive em `/operacao` — o
prefixo tira-se, senão o caminho ficava duplicado e não abria nada.

Se a leitura falhar, o sino fica vazio em vez de deitar abaixo o cabeçalho. É a
mesma regra que já governava a escrita: **o aviso é acessório, o trabalho não
é.**

`src/components/Sino.tsx`

---

## 11. A agenda diz o quê

> *"Na agenda, na visão de mês, não aparece o nome da ordem."*

A vista de mês mostrava um número. Agora mostra os **nomes** — três por dia,
com a cor da natureza (preventiva, corretiva, obra) — e um **"+2 outras"** que
abre o dia.

**Porquê.** Um número responde a *"tenho muito?"*. Mas o mês também serve para
*"quando é que fizemos a inspeção dos extintores?"*, e para isso um **4** não
serve de nada.

A barra relativa ao dia mais cheio do mês manteve-se: dá a forma do mês num
relance.

---

## 12. Espreitar sem sair da agenda

> *"Ao clicar na ordem em qualquer view não devia redirecionar para o detalhe,
> devia aparecer uma tab ao lado com o detalhe, com o local etc, e opção para
> ver a página."*

**O problema.** Um gestor a marcar o dia abre seis ordens a seguir umas às
outras para decidir a ordem das visitas. Com navegação, cada espreitadela
custava duas viagens — e o botão de voltar trazia-o para o topo da lista, não
para onde estava.

**O que se fez.** Um painel ao lado, em **todas** as vistas (dia, semana, mês,
mapa), com: o quando, o cliente, o onde, o quem, **o mapa**, e o botão para a
ficha inteira.

**Não é uma página:** não mexe no endereço, não entra no histórico do browser,
e fecha-se com Esc. O que é uma página continua a sê-lo — *"Abrir a ficha"*
leva à ordem, para quem vai mesmo trabalhar nela.

**No telemóvel encosta-se em baixo**, não ao lado: uma coluna de 380px num ecrã
de 360 tapa o que se estava a ver.

`src/components/PainelDaOrdem.tsx`

---

## 13. Mapa onde a pergunta se faz

> *"No local metermos o Google Maps ou outro tipo de mapa gratuito para ser
> mais apelativo, inclusive na agenda ao clicar na ordem para ver onde é o
> trabalho."*

O mapa já existia — mas só na vista de mapa da agenda, a que ninguém abre
primeiro. Passou a estar na **ficha do local** e no **painel da ordem**.

**Uma morada é uma coisa que se lê; um mapa é uma coisa que se reconhece.**
Antes de sair para um sítio, reconhecer vale mais.

> ✅ **OpenStreetMap, não Google.** Sem chave, sem conta, sem fatura no fim do
> mês. É o mesmo que a vista de mapa da agenda já usava — uma segunda
> biblioteca de mapas seria peso a mais pela mesma coisa.

O botão **"Como lá chegar"** continua a abrir a navegação do telemóvel (Google
Maps, ou o que a pessoa tiver por omissão). Aí o link é externo de propósito:
ninguém quer conduzir dentro de um `iframe`.

Sem coordenadas mas com morada, o mapa não aparece e o botão de navegação
aparece na mesma. São duas perguntas diferentes com duas respostas diferentes.

`src/components/MapaPequeno.tsx`

---

## 14. O que NÃO mudou, e porquê

### A notificação ao atribuir a ordem a si próprio

> *"Não vi a notificação ao criar a ordem e escolher-me como agente para o dia
> de hoje, não apareceu no CRM."*

**Não é uma avaria.** Está no código com o comentário a explicar:

> Só quando o responsável **muda**, e **nunca para quem carregou no botão**.
> Quem se atribui a si próprio já sabe; quem reatribui à mesma pessoa não mudou
> nada. Sem estas duas condições, o sino toca por tudo e deixa de contar.

Fica **por decidir**: durante o piloto é uma pessoa a fazer tudo, e o sino
tocaria a cada ordem aberta. É uma linha de SQL a mudar, se se decidir que sim.

### O erro ao criar um cliente no CRM

Não é do módulo, e não é código: **33 edge functions do CRM não são
reinstaladas desde antes de 26 de agosto**, e por isso ainda carregam a lista
antiga de endereços permitidos. Recusam os endereços de preview do Vercel.

Está documentado no fim de [`teste-de-ponta-a-ponta.md`](teste-de-ponta-a-ponta.md).
O módulo não chama uma única edge function — zero — por isso o teste do módulo
não é afetado.

### O email que não chega

Continua por resolver, e continua a ser um bug do CRM —
[`email-que-nao-chega.md`](email-que-nao-chega.md).

---

## O que ficou verificado

| | |
|---|---|
| Testes de domínio | **357** (36 novos hoje) |
| Validadores contra Postgres | todos verdes, incluindo a sequência de instalação de ponta a ponta |
| Typecheck · lint · build | limpos |
| Escritas fora de `ops_*` | continuam a ser **três**, e todas deliberadas |

**A leitura do sino é nova, e é leitura.** O módulo passou a ler
`public.notifications` e a marcar as do próprio como lidas — com as políticas
que o CRM já tinha, sem alterar nada. Junta-se a fornecedores e clientes na
lista do que se **lê** do CRM.

---

## Ver também

- [`onde-estamos.md`](onde-estamos.md) — o estado do módulo
- [`mapa-do-modulo.md`](mapa-do-modulo.md) — o inventário completo
- [`teste-de-ponta-a-ponta.md`](teste-de-ponta-a-ponta.md) — como testar sem merge
- [`email-que-nao-chega.md`](email-que-nao-chega.md) — o bug do CRM que falta
