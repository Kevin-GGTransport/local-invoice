import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canOverflowRight,
  fitSingleLineFontSize,
  layoutCellText,
  overflowTextWidth,
} from "../cell-layout";
import type { TemplateCell, TemplateGrid } from "../types";

function cell(row: number, col: number, text: string, style: TemplateCell["style"] = {}, rowSpan = 1, colSpan = 1): TemplateCell {
  return { row, col, rowSpan, colSpan, text, style };
}

function grid(colWidths: number[], cells: TemplateCell[]): TemplateGrid {
  const rows = cells.reduce((max, c) => Math.max(max, c.row + c.rowSpan), 1);
  return { colWidths, rowHeights: Array.from({ length: rows }, () => 20), cells };
}

describe("canOverflowRight", () => {
  it("左对齐/未设置对齐的单行非 wrap 文本可溢出", () => {
    assert.equal(canOverflowRight(cell(0, 0, "text", { halign: "left" })), true);
    assert.equal(canOverflowRight(cell(0, 0, "text", {})), true);
  });

  it("wrap、含换行、居中/右对齐、空文本的单元格不溢出", () => {
    assert.equal(canOverflowRight(cell(0, 0, "text", { wrap: true })), false);
    assert.equal(canOverflowRight(cell(0, 0, "a\nb", {})), false);
    assert.equal(canOverflowRight(cell(0, 0, "text", { halign: "center" })), false);
    assert.equal(canOverflowRight(cell(0, 0, "text", { halign: "right" })), false);
    assert.equal(canOverflowRight(cell(0, 0, "", {})), false);
  });
});

describe("overflowTextWidth", () => {
  it("左对齐单行文本向右溢出连续空列，宽度累计到首个有文本列之前", () => {
    const g = grid(
      [85.5, 141.8, 200],
      [
        cell(0, 0, "MAKE ALL CHECKS PAYABLE TO:", { fontSize: 11 }),
        cell(0, 1, "", { fill: "#CECDE9" }),
        cell(0, 2, "X"),
      ]
    );
    assert.equal(overflowTextWidth(g, g.cells[0], 85.5), 85.5 + 141.8);
  });

  it("网格右边缘的单元格无处溢出，返回 baseWidth", () => {
    const g = grid([100, 100], [cell(0, 1, "edge")]);
    assert.equal(overflowTextWidth(g, g.cells[0], 100), 100);
  });

  it("溢出到网格右缘为止（最后一列为空格时吸收）", () => {
    const g = grid([100, 141.8], [cell(0, 0, "long text here"), cell(0, 1, "")]);
    assert.equal(overflowTextWidth(g, g.cells[0], 100), 241.8);
  });

  it("右侧空合并单元格放行溢出，带文本的合并单元格阻挡", () => {
    const pass = grid(
      [100, 50, 50],
      [cell(0, 0, "text"), cell(0, 1, "", {}, 1, 2)]
    );
    assert.equal(overflowTextWidth(pass, pass.cells[0], 100), 200);

    const block = grid(
      [100, 50, 50],
      [cell(0, 0, "text"), cell(0, 1, "occupied", {}, 1, 2)]
    );
    assert.equal(overflowTextWidth(block, block.cells[0], 100), 100);
  });

  it("rowSpan 大于 1 的源单元格在任一覆盖行遇到文本即停止", () => {
    const g = grid(
      [100, 100],
      [
        cell(0, 0, "text", {}, 2, 1),
        cell(1, 1, "blocker"),
      ]
    );
    assert.equal(overflowTextWidth(g, g.cells[0], 100), 100);
  });

  it("源单元格自身跨列时从自身右边界之后开始扫描", () => {
    const g = grid(
      [50, 50, 100],
      [
        cell(0, 0, "text", {}, 1, 2),
        cell(0, 2, ""),
      ]
    );
    assert.equal(overflowTextWidth(g, g.cells[0], 100), 200);
  });

  it("纯空白文本的邻居不阻挡溢出", () => {
    const g = grid([100, 100], [cell(0, 0, "text"), cell(0, 1, "   ")]);
    assert.equal(overflowTextWidth(g, g.cells[0], 100), 200);
  });
});

describe("fitSingleLineFontSize", () => {
  it("AA PICKUPS 窄日期格会缩小字号并保持单行", () => {
    const size = fitSingleLineFontSize("08/19/2026", 10, 37.5);
    assert.ok(size < 10);
    assert.ok(size >= 5.5);
  });

  it("宽度充足时保留样张原字号", () => {
    assert.equal(fitSingleLineFontSize("08/19/2026", 10, 87.8), 10);
  });

  it("含单元格内换行的文本按最长一行估宽，不按拼接总宽缩小字号", () => {
    // 两行各约 39pt，拼接总宽约 80.8pt；格宽 85pt 时最长一行放得下，应保留原字号
    assert.equal(fitSingleLineFontSize("AAAAAA\nBBBBBB", 10, 85), 10);
  });
});

describe("layoutCellText", () => {
  it("G&G 页脚场景：溢出后放得下则保留 11pt 原字号", () => {
    const g = grid(
      [85.5, 141.8],
      [
        cell(0, 0, "MAKE ALL CHECKS PAYABLE TO:", { fontSize: 11 }),
        cell(0, 1, "", { fill: "#CECDE9" }),
      ]
    );
    const layout = layoutCellText(g, g.cells[0], 85.5, 11);
    assert.equal(layout.overflowed, true);
    assert.equal(layout.textBoxWidth, 227.3);
    assert.equal(layout.fontSize, 11);
  });

  it("溢出后仍放不下时按扩展宽度收缩字号且不低于 5.5", () => {
    const longText = "A VERY VERY LONG FOOTER TEXT THAT CANNOT FIT EVEN WITH OVERFLOW";
    const g = grid(
      [50, 50],
      [
        cell(0, 0, longText, { fontSize: 12 }),
        cell(0, 1, ""),
      ]
    );
    const layout = layoutCellText(g, g.cells[0], 50, 12);
    assert.equal(layout.textBoxWidth, 100);
    assert.ok(layout.fontSize < 12);
    assert.ok(layout.fontSize >= 5.5);
  });

  it("wrap 单元格不缩字号也不溢出", () => {
    const g = grid([50], [cell(0, 0, "some long wrapping text", { fontSize: 11, wrap: true })]);
    const layout = layoutCellText(g, g.cells[0], 50, 11);
    assert.equal(layout.textBoxWidth, 50);
    assert.equal(layout.fontSize, 11);
    assert.equal(layout.overflowed, false);
  });
});
