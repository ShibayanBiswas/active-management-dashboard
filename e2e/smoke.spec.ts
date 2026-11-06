import { expect, test } from "@playwright/test";

const ROUTES: Array<[string, string]> = [
  ["/", "Book Summary"],
  ["/observations", "Observations And Targets"],
  ["/scenarios", "Scenario Grid"],
  ["/legs", "Leg Book"],
  ["/pricing", "Option Chain And Surface Pricing"],
  ["/intelligence", "Logic Atlas"],
  ["/upload", "Uploads"],
];

test("health answers with the database and a timestamp", async ({ request }) => {
  const res = await request.get("/api/health");
  const body = await res.json();
  expect(body).toHaveProperty("checkedAt");
  expect(body).toHaveProperty("database");
});

for (const [path, heading] of ROUTES) {
  test(`${path} renders ${heading}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible({ timeout: 30_000 });
  });
}

test("book summary shows the expected difference column and opens a product", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("columnheader", { name: "Expected Difference At Maturity In Crore" })).toBeVisible({ timeout: 30_000 });
  await page.locator("tbody tr.desk-virtual-row").first().click();
  await expect(page).toHaveURL(/\/product\//);
  await expect(page.getByText("What If Levels")).toBeVisible();
});
