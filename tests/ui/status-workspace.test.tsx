import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { StatusWorkspace } from "@/components/status/status-workspace";
import { EMPTY_VALIDATION_SNAPSHOT } from "@/lib/validation-types";

describe("StatusWorkspace", () => {
  it("renders the empty state without raw secret details", () => {
    render(
      <StatusWorkspace
        initialSnapshot={EMPTY_VALIDATION_SNAPSHOT}
        logoutAction={vi.fn()}
      />,
    );

    expect(screen.getByText("数据源状态")).toBeTruthy();
    expect(screen.getByText("尚未执行数据源验证")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "重新验证数据源" }),
    ).toBeTruthy();
    expect(screen.queryByText("TUSHARE_TOKEN=")).toBeNull();
  });

  it("renders blocked chip candidate copy without approximating data", () => {
    render(
      <StatusWorkspace
        initialSnapshot={{
          overallStatus: "blocked",
          lastRunAt: "2026-06-23T00:00:00.000Z",
          summary: "筹码候选接口当前不可用。",
          sections: [
            {
              key: "chip_candidate",
              title: "筹码候选接口",
              status: "blocked",
              summary:
                "筹码候选接口当前不可用或权限不足；后续筹码峰功能保持阻塞，不使用估算值替代。",
            },
          ],
        }}
        logoutAction={vi.fn()}
      />,
    );

    expect(
      screen.getAllByText(
        "筹码候选接口当前不可用或权限不足；后续筹码峰功能保持阻塞，不使用估算值替代。",
      ).length,
    ).toBeGreaterThan(0);
  });
});
