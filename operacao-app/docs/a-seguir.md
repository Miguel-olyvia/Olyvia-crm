# O que vem a seguir

> **Reescrito a 1 de setembro de 2026**, depois do primeiro dia de uso a sério.
> A versão anterior era de agosto e descrevia como futuro metade de coisas que
> entretanto ficaram feitas — um ficheiro de futuro que descreve o passado é
> pior do que não existir.
>
> Cada item traz **o que já existe** (verificado no código, não suposto), o que
> falta, e o que custa. As que não valem a pena estão marcadas como tal: uma
> lista só de boas ideias não ajuda a decidir.

---

## Em três linhas

O módulo está **completo para o piloto**. O que falta divide-se em três montes,
e só um deles é urgente:

1. **Um bug do CRM** que faz o relatório dizer que foi e não ir. É o único que
   promete ao cliente uma coisa que não acontece.
2. **Três coisas que ficaram de fora de propósito** — portal, WhatsApp, offline
   completo — e que dependem de saber como o piloto corre.
3. **Melhorias que só o uso revela.** A lista de baixo é a de hoje; a de
   depois do piloto vai ser outra, e vai ser melhor.

---

> **Atualizado a 2 de setembro.** Um dia de UX tirou desta lista o item dos
> filtros guardados, e acrescentou uma funcionalidade que não estava aqui: a
> **sugestão de quem devia ir** a cada ordem. O que continua por fazer, e por
> ordem, é o que está abaixo — e o nº 1 não mudou.

---

## 1. O email que não chega ⚠

**Prioridade: a mais alta. É a única coisa que promete e não cumpre.**

A fila de saída do CRM marca como entregue uma carta que voltou para trás. A
investigação está fechada e a causa encontrada:
[`email-que-nao-chega.md`](email-que-nao-chega.md).

| | |
|---|---|
| **O que já existe** | o módulo põe a linha em `scheduled_emails` corretamente, com destinatário, assunto e HTML — testado em `tools/validar-relatorio.mjs` |
| **O que falta** | três linhas em `supabase/functions/process-scheduled-emails/index.ts`, que é **código do CRM** |
| **Custo** | minutos. O que falta é a decisão de quem cuida do CRM |
| **E depois** | ler os registos de `send-email` para saber **qual** era o erro que a fila engolia |

Enquanto isto não estiver resolvido, **quem for ao piloto tem de saber que o
cliente não recebe o relatório sozinho**.

---

## 2. As 33 edge functions do CRM por reinstalar ⚠

Não é do módulo, mas trava quem tenta testar.

As edge functions levam a lista de endereços permitidos colada lá dentro no
momento em que são instaladas. A lista foi corrigida a **26 de agosto**; só as
funções reinstaladas depois disso ficaram com a lista nova. As outras recusam
os endereços de preview do Vercel.

| | |
|---|---|
| **Sintoma** | *"failed to send request"* ao criar um cliente num endereço de preview |
| **A prova** | está em [`teste-de-ponta-a-ponta.md`](teste-de-ponta-a-ponta.md), §6, com o comando |
| **A correção** | `supabase functions deploy <nome>`, a partir do `main`. **Não é código** |
| **Afeta o módulo?** | não — Operações não chama uma única edge function |

---

## 3. Trabalhar sem rede, a sério

**Prioridade: alta, mas depois do piloto.**

| | |
|---|---|
| **O que já existe** | responder a tarefas e a medições sem rede. Fica guardado no telemóvel e sai sozinho quando a rede volta (`lib/fila.ts`) |
| **O que falta** | **abrir a aplicação** sem rede (service worker) e **tirar fotos** sem rede |
| **Custo** | dias, não horas. Um service worker mal feito serve versões antigas a toda a gente e é difícil de despejar |
| **Porque não já** | a forma de resolver depende de saber **onde** a rede falha: uma cave sem sinal e um telhado com 3G fraco pedem coisas diferentes |

---

## 4. O portal do cliente

Ficou de fora de propósito. Ver [`portal-do-cliente.md`](portal-do-cliente.md).

**É um produto, não uma funcionalidade:** contas, permissões, um ecrã público, e
uma decisão sobre o que o cliente pode e não pode ver.

Hoje a base **recusa** escrever no canal `cliente` das mensagens, precisamente
para ninguém escrever a pensar que o cliente lê.

---

## 5. WhatsApp — receber pedidos

| | |
|---|---|
| **O que já existe** | `ops_sessao_trabalho.origem` já aceita `'whatsapp'`, para a integração não precisar de mudar o esquema |
| **O que falta** | tudo o resto: número, webhook, e a decisão de como se liga uma mensagem a um cliente |
| **Custo** | semanas, e uma conta de WhatsApp Business |
| **Vale a pena?** | só se o piloto mostrar que os pedidos chegam por lá. Se chegam por telefone, isto resolve um problema que ninguém tem |

---

## 6. Melhorias que o uso já revelou

Estão por ordem de quanto incomodam, não de dificuldade.

### Custos por cliente e por período

O cartão *orçamentado contra gasto* existe **por ordem**. Não há forma de
perguntar *"quanto é que este cliente nos custou este trimestre?"*.

| | |
|---|---|
| **O que já existe** | `ops_v_ordem_custo` soma previsto e real por ordem |
| **O que falta** | uma vista que some por cliente, por tipo de trabalho e por centro de custo, e um separador nas Análises |
| **Custo** | um ficheiro SQL pequeno e meio ecrã |

### Fechar várias ordens de uma vez

Quem confirma o trabalho da semana fá-lo uma a uma. Numa segunda-feira com
trinta ordens fechadas, isso são trinta viagens.

| | |
|---|---|
| **O que falta** | selecionar linhas na lista e confirmar em bloco |
| **Cuidado** | confirmar dispara o relatório ao cliente. Uma confirmação em bloco tem de **dizer quantos emails vai mandar**, antes |

### O relatório em PDF a sério

Hoje sai pela impressão do browser. Funciona, e o resultado depende do browser.

| | |
|---|---|
| **O que falta** | gerar o PDF do lado do servidor, para sair sempre igual |
| **Custo** | médio. O CRM já tem `generate-contract-pdf` — há caminho aberto |
| **Vale a pena?** | só quando alguém se queixar do aspeto. Até lá, a impressão chega |

### Anexar uma foto à tarefa, e não só à ordem

Uma ordem com quinze fotos não diz qual pertence a qual tarefa.

| | |
|---|---|
| **O que já existe** | `ops_anexo` já tem `ordem_tarefa_id` |
| **O que falta** | o botão na tarefa, e mostrar as fotos por baixo dela |
| **Custo** | horas |

### Dar de comer à sugestão de técnico

A sugestão existe desde 2 de setembro e responde a três perguntas — mas só
responde às que tiverem dados. Hoje, na instalação real, há duas que quase
sempre ficam de fora.

| | |
|---|---|
| **O que já existe** | a conta, os pesos, e o painel que diz quais das perguntas ficaram sem resposta (`domain/sugerir-tecnico.ts`) |
| **O que falta** | **especialidades nas tarefas** das checklists, e **coordenadas nos locais**. Sem elas, a sugestão decide-se quase só pela agenda |
| **Custo** | não é código: é meia hora a preencher, uma vez |
| **Como se vê** | abre o botão *Sugerir* numa ordem qualquer — ele diz, por escrito, o que não conseguiu pesar |

Vale a pena medir isto depois do piloto: se as pessoas ignorarem sempre a
sugestão, a pergunta certa não é "como melhorar a fórmula" — é "que informação
é que quem coordena tem na cabeça e não está em lado nenhum".

### Notificar quem se atribui a si próprio

Hoje não avisa, de propósito — quem se atribui já sabe. Durante o piloto, em que
é uma pessoa a fazer tudo, isso faz parecer que o sino não funciona.

| | |
|---|---|
| **O que falta** | uma condição a menos em `db/despacho.sql` |
| **Custo** | uma linha |
| **Decisão** | por tomar. Ligar isto enche o sino de avisos das próprias ações |

### ~~Guardar os filtros da lista~~ ✅ feito a 2 de setembro

Vista, pesquisa, filtros e ordenação passaram todos para o endereço. Recarregar
não perde nada, o "voltar" volta mesmo, e um link colado no chat abre a mesma
lista do outro lado. Ver
[`o-que-mudou-a-2-de-setembro.md`](o-que-mudou-a-2-de-setembro.md).

---

## 7. O que NÃO vale a pena

Está aqui para não voltar a ser proposto.

### Um construtor de relatórios

O Infraspeak tem onze tipos de documento com campos à escolha, e o resultado é
que **quase ninguém os configura**: usam-se dois. As Análises têm esses dois,
mais o resumo do período. Um construtor genérico é muito trabalho para produzir
ecrãs que ninguém monta.

### Stock, compras e vendas

Não se usam no Infraspeak da casa, e o Olyvia já tem catálogo e compras. Trazer
isto para Operações seria construir uma segunda versão de coisas que já existem
do outro lado.

### Um segundo sino

Já se tentou raciocinar assim, e estava errado ao contrário: a decisão original
foi **não** ter sino no módulo, e o certo era mostrar **o mesmo** sino aqui. Um
sino próprio, com a sua própria caixa, é que seria o erro — dois sítios para
olhar, e ninguém olha para o segundo.

### Um mapa com uma segunda biblioteca

O módulo usa OpenStreetMap com Leaflet, sem chave e sem conta. Trocar por Google
Maps para dentro da aplicação traz uma fatura e uma chave para gerir, e o que se
ganha é o aspeto. O botão *"Como lá chegar"* já abre o Google Maps de quem quer
navegar.

---

## Ver também

- [`onde-estamos.md`](onde-estamos.md) — o estado de hoje
- [`o-que-mudou-a-2-de-setembro.md`](o-que-mudou-a-2-de-setembro.md) — o dia de
  UX, e a sugestão de quem devia ir a cada ordem
- [`o-que-mudou-a-1-de-setembro.md`](o-que-mudou-a-1-de-setembro.md) — o primeiro
  dia de uso a sério, e as dezasseis correções que saíram dele
- [`teste-de-ponta-a-ponta.md`](teste-de-ponta-a-ponta.md) — como validar tudo
- [`portal-do-cliente.md`](portal-do-cliente.md) · [`email-que-nao-chega.md`](email-que-nao-chega.md)
