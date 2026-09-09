import { test, expect } from '@playwright/test'

// Modulo de RH -- pessoas. Verifica ao vivo o que as rondas 1 e 2 prometeram,
// e em especial as correccoes que o utilizador pediu por escrito:
//   - fora os separadores Atividade e Equipas, que nao tinham sido pedidos
//   - Organograma e Funcoes levam ao que ja existe, nao a stubs
//   - o formulario permite preencher tudo de uma vez, por seccoes
//   - sem "Entidade legal" nem "Grupo de colaboradores": a entidade legal e a
//     da organizacao activa e nao se escolhe
//   - fechar com dados preenchidos pede confirmacao em vez de descartar
//
// Nao escreve nada na base: preenche e fecha, nunca submete.

test.describe('RH — Pessoas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/rh/pessoas', { waitUntil: 'domcontentloaded' })
  })

  test('a lista abre e nao e negada por permissoes', async ({ page }) => {
    await expect(page.getByText('Access Denied')).toHaveCount(0)
    await expect(page.getByText('Perfil não encontrado')).toHaveCount(0)
    expect(page.url()).toContain('/rh/pessoas')
  })

  test('os separadores sao os pedidos, e nada mais', async ({ page }) => {
    const tabs = page.getByRole('tablist').first()
    // allInnerTexts() NAO espera por nada: devolve o que estiver no DOM naquele
    // instante. Com waitUntil 'domcontentloaded' isso e antes de o React
    // renderizar, e a lista vinha vazia -- o teste falhava sem a aplicacao ter
    // defeito nenhum. Espera-se explicitamente pelo primeiro separador.
    await expect(tabs.getByRole('tab').first()).toBeVisible()
    const rotulos = (await tabs.getByRole('tab').allInnerTexts())
      .map(t => t.trim())
      .filter(Boolean)

    // Estes tres tem de estar.
    for (const esperado of [/pessoas|people/i, /organograma|org chart/i, /func|roles/i]) {
      expect(
        rotulos.some(r => esperado.test(r)),
        `separador em falta (${esperado}); encontrei: ${rotulos.join(', ')}`,
      ).toBe(true)
    }

    // Estes dois nao foram pedidos e tinham sido inventados na ronda 1.
    for (const proibido of [/atividade|activity/i, /equipas|teams/i]) {
      expect(
        rotulos.some(r => proibido.test(r)),
        `separador que nao devia existir (${proibido}); encontrei: ${rotulos.join(', ')}`,
      ).toBe(false)
    }
  })

  test('o formulario de criar pessoa tem as cinco seccoes', async ({ page }) => {
    await page.getByRole('button', { name: /nova pessoa|new person|adicionar pessoa/i }).first().click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo).toBeVisible()

    for (const seccao of [
      /informa(ç|c)(õ|o)es gerais|general/i,
      /detalhes pessoais|personal/i,
      /informa(ç|c)(õ|o)es laborais|work/i,
      /contrato|contract/i,
      /configura(ç|c)(õ|o)es|settings/i,
    ]) {
      await expect(
        dialogo.getByText(seccao).first(),
        `seccao em falta: ${seccao}`,
      ).toBeVisible()
    }
  })

  test('o formulario nao pede entidade legal nem grupo de colaboradores', async ({ page }) => {
    await page.getByRole('button', { name: /nova pessoa|new person|adicionar pessoa/i }).first().click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo).toBeVisible()

    // A entidade legal e a da organizacao activa, ponto -- nao e uma ESCOLHA.
    // O que nao pode existir e um campo para a escolher. Mostra-la em texto,
    // para quem preenche saber a que empresa a ficha vai, e o comportamento
    // pretendido -- por isso nao se afirma que as palavras nao aparecem.
    const escolhaDeEntidade = dialogo
      .getByRole('combobox')
      .filter({ hasText: /entidade legal|legal entity/i })
    await expect(escolhaDeEntidade).toHaveCount(0)
    await expect(dialogo.getByLabel(/entidade legal|legal entity/i)).toHaveCount(0)

    // O grupo de colaboradores nao existe de forma nenhuma.
    await expect(dialogo.getByText(/grupo de colaboradores|employee group/i)).toHaveCount(0)
  })

  test('fechar com dados preenchidos pede confirmacao antes de descartar', async ({ page }) => {
    await page.getByRole('button', { name: /nova pessoa|new person|adicionar pessoa/i }).first().click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo).toBeVisible()

    // Um campo preenchido basta para haver algo a perder.
    const primeiro = dialogo.getByRole('textbox').first()
    await primeiro.fill('Teste')
    await primeiro.blur()

    await page.keyboard.press('Escape')

    // Nao pode fechar em silencio: tem de aparecer a confirmacao.
    await expect(
      page.getByRole('alertdialog').or(page.getByText(/descartar|perde os dados/i)).first(),
    ).toBeVisible({ timeout: 5000 })
  })

  test('um formulario intocado fecha sem perguntar nada', async ({ page }) => {
    await page.getByRole('button', { name: /nova pessoa|new person|adicionar pessoa/i }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})
