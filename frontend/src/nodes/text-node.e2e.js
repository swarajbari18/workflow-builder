/**
 * E2E: the Text node grows an input handle per {{variable}} the user types into its
 * template, edited through the inspector — the full Phase 4 path in a real browser.
 */
const { test, expect } = require('@playwright/test');

test('typing template variables creates matching input handles on the Text node', async ({ page }) => {
  await page.goto('/');

  // Add a Text node from the Data category in the dock.
  await page.getByTestId('dock-category-data').hover();
  await page.getByTestId('dock-node-card-text').click();

  // Open the inspector for it and type a template with two variables.
  const node = page.locator('.react-flow__node').first();
  await node.click();
  const template = page.getByLabel('Template');
  await template.fill('Hello {{name}}, your task is {{task}}');

  // Two labeled input handles appear on the node.
  await expect(page.getByText('◁ name')).toBeVisible();
  await expect(page.getByText('◁ task')).toBeVisible();

  // Removing a variable removes its handle.
  await template.fill('Hello {{name}}');
  await expect(page.getByText('◁ task')).toHaveCount(0);
  await expect(page.getByText('◁ name')).toBeVisible();
});
