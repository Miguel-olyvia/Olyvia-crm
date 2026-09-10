import { test, expect } from '@playwright/test'

// O e-mail pessoal mudou de sitio: saiu de Detalhes laborais e passou a
// Detalhes pessoais, no lugar do antigo "E-mail para comunicacoes" -- que
// deixou de existir, tambem na base.
//
// Estes testes existem porque o campo passou a viver num separador que grava
// noutra tabela: os dados gerais estao em pessoas_dados_pessoais e o e-mail
// pessoal em pessoas. Nenhum teste unitario prova que a gravacao das duas
// chega mesmo ao fim e sobrevive a um recarregamento.
//
// ESCREVE na org nike, e so la, e so nesta ficha de teste.

const NIKE = 'b6ffce4f-f630-4933-833a-008649757a33'
test.setTimeout(180_000)

async function abrirPrimeiraFicha(page: import('@playwright/test').Page) {
  await page.addInitScript(id => localStorage.setItem('activeCompanyId', id), NIKE)
  await page.goto('/rh/pessoas', { waitUntil: 'domcontentloaded' })
  const primeira = page.locator('table tbody tr').first()
  await expect(primeira).toBeVisible({ timeout: 60000 })
  await primeira.click()
  await page.waitForURL(/\/rh\/pessoas\/[0-9a-f-]{36}/, { timeout: 30000 })
}

test.describe('RH — o e-mail pessoal', () => {
  test('saiu de Detalhes laborais', async ({ page }) => {
    await abrirPrimeiraFicha(page)
    await page.getByRole('tab', { name: /detalhes laborais|job details/i }).click()

    await expect(
      page.getByLabel(/e-mail pessoal|personal email/i),
      'o e-mail pessoal ainda aparece nos detalhes laborais',
    ).toHaveCount(0)

    // O de trabalho fica, que e o que ali faz sentido.
    await expect(page.getByLabel(/e-mail de trabalho|work email/i).first()).toBeVisible()
  })

  test('esta em Detalhes pessoais, e "e-mail para comunicacoes" desapareceu', async ({ page }) => {
    await abrirPrimeiraFicha(page)
    await page.getByRole('tab', { name: /detalhes pessoais|personal details/i }).click()

    await expect(
      page.getByLabel(/e-mail pessoal|personal email/i).first(),
      'o e-mail pessoal nao aparece nos detalhes pessoais',
    ).toBeVisible({ timeout: 30000 })

    await expect(
      page.getByText(/e-mail para comunicações|communications email/i),
      'o campo "e-mail para comunicacoes" ainda existe no ecra',
    ).toHaveCount(0)
  })

  test('gravar o e-mail pessoal persiste depois de recarregar', async ({ page }) => {
    const erros: string[] = []
    page.on('response', r => { if (r.status() >= 400) erros.push(`${r.status()} ${r.url().slice(0, 120)}`) })

    await abrirPrimeiraFicha(page)
    const url = page.url()
    await page.getByRole('tab', { name: /detalhes pessoais|personal details/i }).click()

    const campo = page.getByLabel(/e-mail pessoal|personal email/i).first()
    await expect(campo).toBeVisible({ timeout: 30000 })

    const valor = `pessoal.teste.${Date.now()}@exemplo.pt`
    await campo.fill(valor)

    await page.getByRole('button', { name: /^guardar$|^atualizar$|^save$|^update$/i }).first().click()
    await page.waitForTimeout(4000)

    await page.goto(url + '?tab=pessoais', { waitUntil: 'domcontentloaded' })
    const depois = page.getByLabel(/e-mail pessoal|personal email/i).first()
    await expect(depois).toBeVisible({ timeout: 30000 })
    await expect(depois, 'o e-mail pessoal nao sobreviveu ao recarregamento').toHaveValue(valor)

    expect(erros, `pedidos falhados: ${erros.join(' | ')}`).toEqual([])
  })
})
