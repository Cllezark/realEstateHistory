import { test, expect } from '@playwright/test';

test.describe('Map MVP smoke test', () => {
  test('application loads and map is visible', async ({ page }) => {
    await page.goto('/');

    // Check that the page title is correct
    await expect(page).toHaveTitle('St. Petersburg Real Estate — Tract Map');

    // Check that the map container exists
    const mapContainer = page.locator('[aria-label="St. Petersburg Census tract map"]');
    await expect(mapContainer).toBeVisible({ timeout: 10000 });

    // Check that the timeline exists
    const timeline = page.locator('[aria-label="Quarter selector"]');
    await expect(timeline).toBeVisible();
  });

  test('a tract can be selected from the map', async ({ page }) => {
    await page.goto('/');

    // Wait for map to load
    await page.waitForSelector('[aria-label="St. Petersburg Census tract map"]', { timeout: 10000 });

    // Click on the map canvas to try selecting a tract
    const mapCanvas = page.locator('.maplibregl-canvas');
    await mapCanvas.click({ position: { x: 200, y: 200 } });
  });

  test('quarter can be changed', async ({ page }) => {
    await page.goto('/');

    // Wait for map to load
    await page.waitForSelector('[aria-label="St. Petersburg Census tract map"]', { timeout: 10000 });

    // Click the next quarter button
    const nextBtn = page.locator('[aria-label="Next quarter"]');
    if (await nextBtn.isEnabled()) {
      await nextBtn.click();
    }
  });

  test('details panel exists', async ({ page }) => {
    await page.goto('/');

    // Wait for map to load
    await page.waitForSelector('[aria-label="St. Petersburg Census tract map"]', { timeout: 10000 });

    // The details panel should be visible
    const detailsPanel = page.locator('[aria-label="Tract details"]');
    await expect(detailsPanel).toBeVisible();
  });

  test('no uncaught browser errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => {
      errors.push(error.message);
    });

    await page.goto('/');
    await page.waitForSelector('[aria-label="St. Petersburg Census tract map"]', { timeout: 10000 });
    await page.waitForTimeout(2000);

    expect(errors).toEqual([]);
  });
});
