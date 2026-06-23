import { expect, test } from "@playwright/test";

test("protected workspace renders results table and inline stock chart", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("访问密码").fill(process.env.APP_PASSWORD ?? "smoke-password");
  await page.getByRole("button", { name: "进入工作台" }).click();

  await expect(page.getByText("最新筛选结果")).toBeVisible();
  await expect(page.getByRole("row", { name: /000002\.SZ.*万科A/ })).toBeVisible();
  await expect(
    page.getByRole("row", { name: /000001\.SZ.*平安银行/ }),
  ).toBeVisible();

  await expect(page.getByText("000002.SZ 万科A")).toBeVisible();
  await expect(page.getByLabel("000002.SZ K线图")).toBeVisible();
  await expect(page.locator('[aria-label="000002.SZ K线图"] canvas')).toHaveCount(1);

  await page.getByRole("row", { name: /000001\.SZ.*平安银行/ }).click();

  await expect(page.getByText("000001.SZ 平安银行")).toBeVisible();
  await expect(page.getByText("筹码峰：36.20")).toBeVisible();
  await expect(page.getByLabel("000001.SZ K线图")).toBeVisible();
});
