import { expect, test } from "@playwright/test";

test("protected workspace renders dual chip distributions and inline chart", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await page
    .getByLabel("访问密码")
    .fill(process.env.APP_PASSWORD ?? "smoke-password");
  await page.getByRole("button", { name: "进入工作台" }).click();

  await expect(page.getByRole("button", { name: "开始增量刷新" })).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /全量重建|rebuild:market|重建市场缓存/,
    }),
  ).toHaveCount(0);
  await expect(page.getByText("rebuild:market")).toHaveCount(0);
  await expect(page.getByText("最新筛选结果")).toBeVisible();
  await expect(page.getByText("筹码峰价格")).toHaveCount(0);
  await expect(page.getByText(/筹码峰[123]/)).toHaveCount(0);

  const blockedRow = page.getByRole("row", { name: /000002\.SZ.*万科A/ });
  const availableRow = page.getByRole("row", {
    name: /000001\.SZ.*平安银行/,
  });
  await expect(blockedRow).toBeVisible();
  await expect(availableRow).toBeVisible();
  await expect(page.getByRole("img")).toHaveCount(0);

  await blockedRow.click();
  await expect(page.getByText("000002.SZ 万科A")).toBeVisible();
  await expect(page.getByLabel("000002.SZ K线图")).toBeVisible();
  await expect(page.getByText("最新有效交易日 20260060")).toBeVisible();
  await expect(page.getByText("前一有效交易日 20260059")).toBeVisible();
  await expect(page.getByText("permission_denied")).toBeVisible();
  await expect(page.getByText("empty_data")).toBeVisible();
  await expect(page.getByText("阻塞")).toHaveCount(2);
  await expect(page.getByText(/TUSHARE_TOKEN|Authorization|REFRESH_DB_PATH|C:\\/)).toHaveCount(0);

  await availableRow.click();
  await expect(page.getByText("000001.SZ 平安银行")).toBeVisible();
  await expect(page.getByText(/筹码峰[123]/)).toHaveCount(0);
  await expect(page.getByLabel("000001.SZ K线图")).toBeVisible();
  await expect(
    page.getByLabel("前一有效交易日 20260059 筹码分布图"),
  ).toBeVisible();
  await expect(
    page.getByLabel("最新有效交易日 20260060 筹码分布图"),
  ).toBeVisible();
  await expect(page.getByText("最大占比 35.90 / 5.50%")).toBeVisible();
  await expect(page.getByText("最大占比 36.20 / 6.50%")).toBeVisible();
  await expect(
    page.locator('[aria-label="000001.SZ K线图"] canvas'),
  ).toHaveCount(1);
  await expect(
    page.locator(
      '[aria-label="前一有效交易日 20260059 筹码分布图"] canvas',
    ),
  ).toHaveCount(1);
  await expect(
    page.locator('[aria-label="最新有效交易日 20260060 筹码分布图"] canvas'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-testid="stock-chart-row-000001.SZ"] canvas'),
  ).toHaveCount(3);
});
