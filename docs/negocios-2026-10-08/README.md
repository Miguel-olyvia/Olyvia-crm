# Negócios — menu simplificado e fases (08/10/2026)

Decisões tomadas pelo Rúben a 08/10/2026, para servir de base às screens. Complementa a auditoria de 04/10 (`docs/auditoria-crm-2026-10-04/`) e a proposta de 06/10 (`docs/reuniao-2026-10-06/`).

> A pasta `docs/` está no `.gitignore`: este ficheiro vive só neste PC.

## 1. O problema

- 228 separadores em 63 ecrãs, 50 deles com modais ou painéis.
- O modal da lead tem 12 separadores.
- São precisas 5 páginas até chegar ao contrato.
- A mesma coisa aparece em vários sítios: Leads, Pedidos de Proposta, Propostas, Orçamentos, Venda Direta e Contratos.

## 2. Menu: o que se junta

A coluna da esquerda usa os nomes atuais do menu, no formato Secção › Página.

| Entrada nova | Junta (menu atual) |
|---|---|
| **Hoje** | Painel · Atividades · Calendário/Agenda |
| **Negócios** | CRM › Leads · CRM › Submissões Pendentes · Aquisição › Pedidos de Proposta · Aquisição › Propostas › Propostas e Orçamentos · Aquisição › Venda Direta · Aquisição › Contratos |
| **Clientes** | CRM › Clientes · Organizações › Organizações (empresas clientes) · Contactos (Novo e Legado) |
| **Operações** | Operações (obras), sem alterações nesta fase |
| **Inventário** | Fornecedores · Armazéns · Encomendas a Fornecedores · Stocks · Encomendas Clientes · Contagem de Inventário. **Fica no menu**, porque é preciso depois do recibo (ver a fase 5) |
| **Catálogo e custos** | Produtos › Produtos, Bundles, Marcas, Categorias, Subcategorias, Atributos, Unidades de Medida · Serviços › Serviços, Categorias, Subcategorias, Taxas de Serviço · área de custos nova |
| **Marketing** | Campanhas · Origens · Formulários. A origem e o formulário passam a viver dentro da campanha |
| **Definições** | Definições · Email SMTP · Templates de Email · Falhas de Envio · Lixo · Utilizadores · Funções · Auditoria de Exportações · Organograma · Flow Builder · modelos de orçamento, de proposta e de contrato |

**Sai do menu:**
- **Plataforma:** fica só para o admin da Olyvia.
- **Ajuda** e **Ajuda & FAQs:** passam a um botão "?" em cada página.
- O separador **Definições** dentro de Aquisição.

## 3. As fases do negócio

**Lead → Contacto → Visita → Negócio → Financeiro → Obra**

A fase avança pelos factos (por exemplo, quando a visita é marcada ou o contrato é assinado). Não se arrasta à mão.

| # | Fase | Quem | O que acontece | Passa à seguinte quando |
|---|---|---|---|---|
| 1 | **Lead** | Comercial / automático | Entra o pedido: formulário, campanha ou registo à mão. Só são precisos o nome e o contacto | O comercial fala com o cliente |
| 2 | **Contacto** | Comercial | Qualifica o pedido e marca a visita | A visita fica marcada |
| 3 | **Visita** | Comercial / técnico | No telemóvel, faz o levantamento do local e das necessidades: ficha do local, medidas, fotos | O levantamento fica fechado |
| 4 | **Negócio** | Comercial | As medidas da visita criam o **orçamento**, que vai buscar os custos ao Catálogo, mostra a margem real e dá alertas. Depois vêm a **proposta** e o **contrato**. Na **venda direta** só há proposta | O contrato é assinado, ou a proposta é aceite na venda direta |
| 5 | **Financeiro** | Departamento financeiro | Emite a **fatura**, que vai para o portal do cliente. Quando a fatura é paga, valida o pagamento e o **recibo** é emitido | O recibo é emitido |
| 6 | **Obra** | Operações | Executa o plano com os técnicos e os materiais. No fim compara o previsto com o real | A obra é concluída |

### Fase 4 em detalhe (Negócio): o orçamento vai buscar os custos ao Catálogo

O orçamento usa a atualização do **Catálogo e custos** que já estava planeada (proposta de 06/10, etapas 2 e 3 do `plano-execucao.md`).

**O que o Catálogo tem, por serviço (a "receita" do serviço):**
- **Medida:** m², unidade, hora…
- **Mão de obra:** horas por medida × o **custo médio por hora do técnico** para aquele serviço, com todos os encargos (salário × 14, TSU, subsídio de alimentação, seguro…).
- **Equipamentos:** horas de uso × o €/h do equipamento (preço ÷ vida útil + manutenção).
- **Consumíveis:** quantidade por medida × o preço.
- **Custo por medida:** a soma das três linhas acima, calculada sozinha.
- **Preço:** o de tabela, ou o custo mais a margem. A margem conta **sobre o preço**.

**No orçamento:**
1. Escolhe-se o serviço e mete-se só a **medida**, que já vem sugerida pela visita (ex.: 6 m²).
2. O custo calcula-se a partir do Catálogo: mão de obra, equipamentos e consumíveis.
3. Em cada linha e no total aparecem o **preço**, o **custo** e a **margem real**. Exemplo: WC suite com preço de 3.606,12 €, custo de 2.454,55 € e margem de 31,9%.
4. A linha guarda uma cópia do cálculo, para que o orçamento enviado não mude quando o Catálogo for atualizado.

**Alertas antes de enviar a proposta.** O botão "Enviar proposta" verifica primeiro:

| Alerta | Exemplo | Efeito |
|---|---|---|
| Margem abaixo do mínimo | Margem de 18% com um mínimo de 25% | Bloqueia, ou pede aprovação da chefia |
| Preço abaixo do custo | Linha com margem negativa | Bloqueia |
| Linha sem custo | Serviço sem receita no Catálogo | Aviso: "custo desconhecido" |
| Técnico sem custo/hora | Perfil sem custo/hora definido | Aviso |
| Desconto que come a margem | Um desconto de 15% deixa a margem em 12% | Aviso, com a margem depois do desconto |
| Custos desatualizados | Preço dos consumíveis com mais de X meses | Aviso |

- A margem mínima e os limites configuram-se em Definições, por empresa e por linha de serviço.
- Só passa a proposta quando não há bloqueios. Os avisos ficam registados no histórico.

### Fase 5 em detalhe: o Financeiro

- **Por agora:** a fatura vai para o portal do cliente e o pagamento é uma **validação interna**. O financeiro carrega em "Validar pagamento" e o recibo é emitido.
- **No futuro:** o cliente paga no portal, que ainda está em desenvolvimento, e a validação passa a ser automática. O resto do fluxo não muda.
- **A emissão do recibo dispara duas coisas ao mesmo tempo:**
  1. **Inventário:** confirma se há os equipamentos e materiais necessários e, se faltar algo, cria a encomenda ao fornecedor (purchase order).
  2. **Obras:** recebe o contrato, ou a proposta na venda direta, e gera o plano, cruzando com os técnicos disponíveis do RH.

## 4. Layout de Negócios

### Lista
- Um botão **"Novo negócio"**, que pede só o nome e o contacto.
- Colunas por fase: Lead · Contacto · Visita · Negócio · Financeiro · Obra.
- Cada cartão mostra o cliente, o serviço, o valor e a próxima ação.
- Um clique abre o negócio.

### Página do negócio
- **Em cima:** o cliente, o valor, a barra das 6 fases e um botão com o próximo passo.
- **No meio, de cima para baixo:** uma secção por fase:
  - Pedido;
  - Visita;
  - Negócio, com o orçamento, a proposta e o contrato;
  - Financeiro, com a fatura e o recibo;
  - Obra, com uma ligação para Operações.
  - A secção da fase atual vem aberta; as futuras aparecem a cinzento.
- **À direita:** os contactos do cliente e o histórico (chamadas, emails, notas, mudanças de fase).

O botão do próximo passo muda com a fase:

| Fase | Botão |
|---|---|
| Lead | Contactar |
| Contacto | Marcar visita |
| Visita | Fechar levantamento |
| Negócio | Criar orçamento → Enviar proposta → Enviar contrato |
| Financeiro | Emitir fatura → Validar pagamento |
| Obra | Abrir obra |

### Regras
- Não há separadores nem modais. Só há modal para perder, anular ou apagar.
- Edita-se no próprio campo.
- Quando o contrato é assinado, o cliente é criado sozinho.
- Quando o recibo é emitido, entram em marcha o Inventário e o plano da obra.

## 5. Mudanças de âmbito

- Até agora, o **Inventário e as compras** estavam fora do âmbito (Stock, Vendas e Compras). Passam a ser precisos para validar os materiais e criar as encomendas a fornecedores depois do recibo.
- Entra um papel novo, o **Financeiro**, com permissão para emitir faturas, validar pagamentos e emitir recibos.

## 6. Em aberto

1. A fatura emite-se na Olyvia ou num programa externo (PHC, Moloni…)?
2. Há pagamentos em tranches, como adiantamento e final? Se houver, o disparo para o Inventário e para as Obras acontece logo no primeiro recibo?
3. O cruzamento com o RH vai buscar o quê: a disponibilidade, as competências, ou as duas?
4. Quem aprova a encomenda ao fornecedor: é automática ou fica à espera de validação?
5. Qual é a margem mínima, por empresa e por linha de serviço? Quem pode aprovar uma proposta abaixo dela?
6. A margem abaixo do mínimo bloqueia sempre, ou basta a aprovação da chefia?

## 7. Screens a fazer

| # | Screen | Notas |
|---|---|---|
| 1 | Menu novo | As 8 entradas da secção 2 |
| 2 | Negócios: lista em colunas | As 6 fases, cartões, botão "Novo negócio" |
| 3 | Negócios: criar | Só nome e contacto |
| 4 | Negócio: página, fase Lead/Contacto | Cabeçalho, barra das fases, histórico |
| 5 | Negócio: Visita no telemóvel | Ficha do local, necessidades, medidas, fotos |
| 6 | Negócio: fase Negócio | Orçamento a partir das medidas, com o custo vindo do Catálogo e a margem real por linha; proposta e contrato; variante de venda direta |
| 6a | Orçamento: verificar antes de enviar | A lista de alertas (bloqueios e avisos) e o pedido de aprovação da chefia |
| 6b | Catálogo: ficha do serviço | A receita do serviço: medida, mão de obra (custo médio por hora do técnico), equipamentos, consumíveis, custo e preço |
| 7 | Negócio: Financeiro | Fatura emitida, enviada ao portal, "Validar pagamento", recibo |
| 8 | Financeiro: lista de faturas por validar | A vista do departamento financeiro |
| 9 | Inventário: materiais da obra | O que há, o que falta, encomenda ao fornecedor |
| 10 | Operações: plano gerado | Tarefas e técnicos do RH atribuídos |
| 11 | Negócio: fase Obra | Estado da obra e previsto contra real |

## 8. Maquetas (08/10/2026)

As 12 screens estão desenhadas numa página publicada: https://claude.ai/artifact/N8srtZpvVdBaZdu8bVaE6s (privada; partilha-se pelo menu *Partilhar* da página).

- **Fonte:** `ecras.src.html`.
- **Montar** (a partir de `D:\Olyvia\Olyvia-crm`): `node docs/reuniao-2026-10-06/gerar.cjs docs/negocios-2026-10-08/ecras.src.html docs/negocios-2026-10-08/ecras.html`.
- **Caso de exemplo:** a casa de banho da Ana Martins (3.606,12 €, margem de 31,9%).

Decisões de desenho tomadas nas maquetas, para validar:
- Criar um negócio ("Novo negócio") faz-se num cartão na coluna Lead, sem modal.
- Não há entrada "Financeiro" no menu. O financeiro trabalha no seu **Hoje** e na fase Financeiro de cada negócio.
- O Inventário tem uma vista nova, **Materiais por obra**.
