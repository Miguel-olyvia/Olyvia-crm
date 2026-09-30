# O que mudou a 2 de setembro

> **Um dia de UX**, quase todo na lista de ordens e na ficha da ordem — os dois
> ecrãs onde se passa mais tempo — mais uma funcionalidade nova: o módulo passa
> a saber sugerir **quem devia ir** a cada ordem.
>
> Cada secção diz o que estava mal **antes de dizer o que mudou**. Uma lista de
> melhorias sem o problema ao lado não se consegue discutir: parece gosto.

---

## Em três linhas

1. **A lista de ordens** ganhou memória (o estado vive no endereço), faixas por
   dia, números nos separadores, e deixou de mandar uma consulta por cada letra
   escrita.
2. **A ficha da ordem** passou a ter as ações sempre à mão, duas colunas em
   ecrã largo, e uma régua que diz **o que falta a seguir**.
3. **Sugerir quem vai** — especialidade, agenda e distância, com o porquê de
   cada lugar escrito ao lado. Sugere; nunca decide.

---

## 1. Sugerir quem vai a uma ordem 🆕

**O problema.** Quem coordena escolhe a pessoa de cabeça. Com quatro técnicos e
uma cidade isso funciona. Com doze e três distritos, o que acontece é que vai
sempre o mesmo — porque o que a pessoa se lembra é de quem lhe respondeu da
última vez, e não de quem sabe fazer aquilo, está livre, e está perto.

**O que passa a haver.** Um botão **Sugerir** ao lado de *Quem vai, e quando*.
Ordena a equipa por três perguntas, com pesos:

| | Peso | Como |
|---|---|---|
| **Sabe fazer isto?** | 50 % | As especialidades que as tarefas desta ordem pedem — que vêm da checklist do plano |
| **Está livre?** | 30 % | Horas já comprometidas nesse dia, mais férias, feriados e choques de hora |
| **Está perto?** | 20 % | Distância em linha reta à paragem mais próxima que a pessoa já tem nesse dia |

Três decisões que valem mais do que a fórmula:

**Uma pergunta sem resposta não vota.** Se a ordem não pede especialidade
nenhuma, ou se o local não tem ponto no mapa, esse peso **reparte-se pelos
restantes** em vez de contar como zero. Contar um desconhecido como zero
castigava toda a gente por igual, e mudava a ordem final por causa de uma coisa
que ninguém sabe. O painel diz sempre quais das três perguntas ficaram de fora.

**Bloqueios não são vetos.** Férias, feriado e choque de hora põem a pessoa no
fim com o motivo escrito — e **nunca a tiram da lista**. É a mesma regra da
marcação, que já avisava sem impedir: há dias em que se telefona a quem está de
folga porque só essa pessoa tem a chave.

**Cada lugar traz o porquê.** Uma lista ordenada sem razões seria um oráculo, e
ninguém confia num oráculo à segunda vez que ele erra. Quem coordena tem de
conseguir escolher o terceiro por um motivo que nenhum código sabe — o cliente
conhece-o, a carrinha tem a peça, ele pediu para ir.

**Sem data marcada, a pergunta muda.** Passa de *"quem está livre nesse dia?"*
para *"quem consegue ir mais cedo?"*: olham-se 14 dias e procura-se o primeiro
em que a pessoa cabe. O botão passa a dizer *"Escolher e marcar para qui,
17/09"* — as duas perguntas foram respondidas ao mesmo tempo, e obrigar a
repetir a segunda à mão era deitar fora metade da resposta.

**Não grava nada.** Preenche os campos que já lá estavam; a marcação continua a
precisar dos mesmos dois botões. Uma sugestão que gravasse sozinha seria uma
decisão tomada por um botão chamado "sugerir".

**Nenhum serviço de fora.** A conta corre no browser, com dados que a aplicação
já lê. Sem chave de API, sem fatura, e sem dados da equipa a passar por
servidor de terceiros. A distância usa a mesma trigonometria que já ordena as
paragens do dia.

`src/domain/sugerir-tecnico.ts` (puro, 27 testes) ·
`src/components/SugerirTecnico.tsx` · explicado por inteiro em
`/ajuda?ver=funciona#sugerir`

> ⚠ **Para isto valer alguma coisa** faltam três hábitos: pôr as especialidades
> nas tarefas das checklists, marcar as moradas no mapa, e manter as férias no
> CRM. Sem eles continua a funcionar — só responde a menos perguntas, e diz
> quais.

---

## 2. A lista de ordens

### O estado da lista vive no endereço

Vista, pesquisa, filtros e ordenação foram todos para a barra de endereço.
Resolve três coisas de uma vez: **recarregar não perde nada**, o botão "voltar"
volta mesmo, e um link colado no chat abre a mesma lista do outro lado.

Era o item *"Guardar os filtros da lista"* de [`a-seguir.md`](a-seguir.md).

### A pesquisa deixou de disparar a cada letra

Escrever "compressor" mandava **dez consultas** à base, e a última a chegar é
que ganhava. Isso dava resultados a piscar e, com rede fraca, resultados
errados — a resposta da quinta letra a chegar depois da décima. Agora espera
300 ms depois de os dedos pararem.

### Faixas por dia

Setenta linhas seguidas, todas com o mesmo peso, obrigam a ler a data de cada
uma. O olho não faz isso: percorre até desistir. A lista passa a partir-se em
**Atrasadas · Hoje · Amanhã · Até domingo · Mais tarde · Já passou · Sem data**,
e responde à primeira pergunta antes de se ler uma linha.

Só quando se ordena por data. Cabeçalhos de dia por cima de uma lista ordenada
por prioridade seriam duas respostas contraditórias no mesmo ecrã.

Uma decisão que só apareceu ao escrever o teste: **uma ordem já fechada nunca é
"atrasada"**, mesmo com a data no passado. O trabalho aconteceu, e pintá-la de
vermelho no histórico era acusar alguém de uma coisa que já está feita. Vai
para "Já passou", que é a única coisa verdadeira que se pode dizer dela.

`src/domain/agrupar-ordens.ts` (puro, 18 testes)

### Números nos separadores

Saber que há quatro ordens atrasadas obrigava a carregar em "Atrasadas" — e
ninguém carrega num separador só para descobrir que está vazio. Agora a lista
diz onde está o problema antes de se lhe tocar, e o número das atrasadas vem a
vermelho.

O histórico continua sem número, de propósito: cresce para sempre, e "4318" não
ajuda ninguém a decidir nada.

### "As minhas", à vista

Um técnico faz esta pergunta dez vezes por dia, e estava a três toques dentro
de uma gaveta. Passou a ser um botão ao lado dos filtros.

### As condições ligadas dizem quais são

Um contador a dizer "3 filtros" obrigava a abrir a gaveta para saber quais.
Agora são pastilhas com o nome, e cada uma tira-se onde está.

### E ainda

- **A barra de comando fica colada ao topo** ao percorrer a lista. Ter de subir
  ao princípio para trocar de vista é o que faz as pessoas deixarem de trocar
  de vista.
- **`/` põe o cursor na pesquisa**, como em toda a parte. Não rouba a tecla a
  quem está a escrever noutro campo.
- **O título abre a linha.** Estava em terceiro, depois do código e das
  etiquetas — e é a única coisa que se lê a sério.
- **O ecrã vazio propõe o passo seguinte** em vez de só constatar: tirar os
  filtros, ou abrir uma ordem nova.

---

## 3. A ficha da ordem

### As ações deixaram de fugir

Iniciar, pausar e fechar viviam no cartão de cima. Quem responde a doze tarefas
no telemóvel desce meia página — e depois tem de subir tudo outra vez para
fechar a ordem.

Agora as ações andam com a pessoa: **barra colada ao topo** no computador (com
o código à vista, para não haver dúvida de em que ordem se está), e **barra
fixa em baixo** no telemóvel, que é onde o polegar está.

### Duas colunas em ecrã largo

Num ecrã largo, metade do espaço era margem e a ficha eram dez cartões numa
coluna só. A partir de `lg`:

| Esquerda — o trabalho | Direita — o contexto |
|---|---|
| Tarefas · Custos · Fotos · Assinatura · Conversa | Onde e para quem · Quem vai e quando · Classificação · Sessões |

No telemóvel volta a ser uma coluna, e **o contexto vem primeiro**: quem chega
ao local quer saber onde é antes de responder a tarefas de uma ordem que ainda
não sabe onde fica.

A assinatura continua a subir ao topo enquanto for o passo seguinte — agora
fora da grelha, para ser a primeira coisa em qualquer tamanho de ecrã.

### A régua do percurso, e o que falta a seguir

A ficha dizia o estado e **não dizia o que falta**. Uma ordem fechada há três
semanas parecia estar bem — está verde — quando o que se passava é que ninguém
a confirmou e o cliente nunca recebeu o relatório.

Cinco degraus, sempre os mesmos, com a marca onde a ordem está, e por baixo uma
frase: *"O trabalho está feito. Falta confirmar — é aí que o relatório sai."*

Uma **pausada** mostra-se no mesmo degrau que uma em curso: o que parou foi o
relógio, não o trabalho. Uma **cancelada** não tem degrau atual — o caminho
acabou antes do fim.

`src/domain/percurso.ts` (puro, 12 testes)

### O relógio anda

O tempo era o que era no instante em que a página carregou. Um técnico que
abria a ordem às 9h e olhava às 11h via "0h04". Um contador parado numa ordem
em curso não é só feio: faz duvidar de que o tempo esteja mesmo a ser contado.
O intervalo só existe enquanto houver sessão aberta.

### A morada deixou de ser cortada

A ficha tinha o rótulo à esquerda numa coluna de 9 rem, com o valor a truncar.
Numa coluna estreita isso deixava metade da largura para uma morada — e uma
morada cortada a meio não serve para chegar a lado nenhum.

---

## 4. O ecrã «Hoje»

**Contar não chegava.** Dizia "4 ordens atrasadas" e mais nada, e o que
acontecia era sempre o mesmo: carregava-se para ir ver quais, olhava-se,
voltava-se atrás. Quatro linhas de contagem obrigavam a quatro viagens à lista.

- **Cada bloco mostra as três primeiras**, com código, título, cliente, local e
  de quem é. Chega para se reconhecer o problema — *"ah, é outra vez a Padaria
  Lima"* — sem sair dali.
- **Ganhou o dia.** O ecrã chamava-se "Hoje" e não mostrava **uma única ordem
  marcada para hoje**. Agora abre com a agenda do dia, por hora, com quem vai e
  onde é. Quem coordena vê a equipa toda; um técnico vê só o dele.
- Uma ordem que já passou da hora leva a marca aqui mesmo. Descobri-lo às cinco
  da tarde não serve de nada.

---

## 5. A Ajuda

- **O título mudou.** Era *"O trabalho faz-se sempre. O que se perde é a
  prova."* — lê-se como uma acusação a quem já anda a trabalhar, e é a primeira
  frase que o cliente vê. Passou a *"Fica provado o que se fez, e quanto
  custou."*, que é a soma das três colunas que vêm logo a seguir.
- **A sugestão de técnico está documentada por inteiro** em *Como funciona*,
  com os pesos, o que acontece quando falta informação, e os limites — a
  distância é em linha reta, e isso está escrito. É a única coisa nesta
  aplicação que **ordena pessoas**, e um número ao lado do nome de um colega
  tem de poder ser discutido.
- O tutorial ganhou o passo correspondente.

---

## 6. Um bug silencioso, encontrado pelo caminho

`ordensDoPeriodo` — a consulta que alimenta a semana e o mês da agenda — não
trazia `local_id`, `cliente_id`, `tipo_trabalho_id` nem `fornecedor_id`, **e o
tipo dizia que trazia**. O efeito era mudo e feio: na semana e no mês, filtrar
por cliente ou por tipo de trabalho nunca dava nada, porque `undefined` não é
igual a coisa nenhuma. Ninguém tinha dado por isso porque o filtro parecia
funcionar — devolvia zero linhas, que é o que um filtro apertado também faz.

---

## O que ficou verificado

| | |
|---|---|
| Testes de domínio | **449** (57 novos hoje) |
| Typecheck · lint · build | limpos |
| Escritas fora de `ops_*` | continuam a ser **três**, e todas deliberadas |
| SQL novo | **nenhum** — a sugestão lê o que já existia |

---

## Ver também

- [`onde-estamos.md`](onde-estamos.md) — o estado do módulo
- [`a-seguir.md`](a-seguir.md) — o que vem a seguir
- [`o-que-mudou-a-1-de-setembro.md`](o-que-mudou-a-1-de-setembro.md) — o dia
  anterior, e as dezasseis correções que saíram dele
- [`email-que-nao-chega.md`](email-que-nao-chega.md) — **o bug do CRM que
  continua por corrigir**, e que é o mais importante desta lista toda
