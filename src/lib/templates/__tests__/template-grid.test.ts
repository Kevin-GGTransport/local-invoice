import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  mergeRange,
  patchCellStyle,
  resizeColumn,
  resizeRow,
  setCellText,
  unmergeAt,
  validateTemplateGrid,
} from "../template-grid";
import { validateBindingForPublish } from "../types";
import type { TemplateBinding, TemplateGrid } from "../types";

function makeGrid(): TemplateGrid {
  return {
    colWidths: [40, 40, 40],
    rowHeights: [15, 15, 15],
    cells: [{ row: 0, col: 0, rowSpan: 1, colSpan: 1, text: "Invoice", style: {} }],
  };
}

const emptyBinding = (): TemplateBinding => ({ fields: {}, lineItems: null });

test("编辑空白格会创建单元格，清空无样式格会移除", () => {
  const created = setCellText(makeGrid(), 1, 1, "Value");
  assert.equal(created.cells.find((cell) => cell.row === 1 && cell.col === 1)?.text, "Value");
  const removed = setCellText(created, 1, 1, "");
  assert.equal(removed.cells.some((cell) => cell.row === 1 && cell.col === 1), false);
});

test("格式与行列尺寸使用不可变更新并限制范围", () => {
  const grid = makeGrid();
  const styled = patchCellStyle(grid, { startRow: 1, endRow: 1, startCol: 1, endCol: 1 }, { bold: true });
  assert.equal(styled.cells.find((cell) => cell.row === 1 && cell.col === 1)?.style.bold, true);
  assert.equal(resizeRow(grid, 0, 500).rowHeights[0], 200);
  assert.equal(resizeColumn(grid, 0, 1).colWidths[0], 16);
  assert.equal(grid.rowHeights[0], 15);
});

test("合并保留内容并迁移唯一字段绑定到锚点", () => {
  const grid = setCellText(makeGrid(), 1, 1, "Total");
  const binding: TemplateBinding = {
    fields: { total: { cells: [{ row: 1, col: 1 }], format: "money" } },
    lineItems: null,
  };
  const result = mergeRange(grid, binding, { startRow: 1, endRow: 1, startCol: 0, endCol: 1 });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.binding.fields.total?.cells, [{ row: 1, col: 0 }]);
  assert.equal(result.grid.cells.find((cell) => cell.row === 1 && cell.col === 0)?.colSpan, 2);
  assert.equal(result.grid.cells.find((cell) => cell.row === 1 && cell.col === 0)?.text, "Total");
});

test("包含不同字段绑定的选区不能合并", () => {
  const binding: TemplateBinding = {
    fields: {
      invoice_number: { cells: [{ row: 1, col: 0 }], format: "text" },
      total: { cells: [{ row: 1, col: 1 }], format: "money" },
    },
    lineItems: null,
  };
  const result = mergeRange(makeGrid(), binding, { startRow: 1, endRow: 1, startCol: 0, endCol: 1 });
  assert.match(result.error ?? "", /多个不同字段/);
});

test("合并不会静默丢弃多个非空单元格内容", () => {
  let grid = setCellText(makeGrid(), 1, 0, "A");
  grid = setCellText(grid, 1, 1, "B");
  const result = mergeRange(grid, emptyBinding(), { startRow: 1, endRow: 1, startCol: 0, endCol: 1 });
  assert.match(result.error ?? "", /多个非空单元格/);
});

test("选择合并区域的次级坐标也会修改锚点格式", () => {
  const merged = mergeRange(makeGrid(), emptyBinding(), { startRow: 0, endRow: 0, startCol: 0, endCol: 1 }).grid;
  const styled = patchCellStyle(merged, { startRow: 0, endRow: 0, startCol: 1, endCol: 1 }, { bold: true });
  assert.equal(styled.cells.find((cell) => cell.row === 0 && cell.col === 0)?.style.bold, true);
});

test("取消合并仅保留锚点内容和样式", () => {
  const result = mergeRange(makeGrid(), emptyBinding(), { startRow: 0, endRow: 0, startCol: 0, endCol: 1 });
  const unmerged = unmergeAt(result.grid, 0, 1);
  const anchor = unmerged.cells.find((cell) => cell.row === 0 && cell.col === 0);
  assert.equal(anchor?.colSpan, 1);
  assert.equal(anchor?.text, "Invoice");
  assert.equal(unmerged.cells.some((cell) => cell.row === 0 && cell.col === 1), false);
});

test("联合校验拒绝重叠、越界和非锚点绑定", () => {
  const grid: TemplateGrid = {
    ...makeGrid(),
    cells: [
      { row: 0, col: 0, rowSpan: 1, colSpan: 2, text: "A", style: {} },
      { row: 0, col: 1, rowSpan: 1, colSpan: 1, text: "B", style: {} },
    ],
  };
  const binding: TemplateBinding = {
    fields: { total: { cells: [{ row: 0, col: 2 }], format: "money" } },
    lineItems: { startRow: 0, endRow: 9, columns: { description: 0, amount: 9 }, minRows: 1 },
  };
  const errors = validateTemplateGrid(grid, binding).join("\n");
  assert.match(errors, /重叠/);
  assert.match(errors, /绑定的单元格不存在/);
  assert.match(errors, /明细行区域超出/);
  assert.match(errors, /明细列超出/);
});

test("历史合法网格与绑定保持兼容", () => {
  const binding: TemplateBinding = {
    fields: { invoice_number: { cells: [{ row: 0, col: 0 }], format: "text" } },
    lineItems: { startRow: 1, endRow: 2, columns: { description: 0, amount: 2 }, minRows: 2 },
  };
  let grid = patchCellStyle(makeGrid(), { startRow: 1, endRow: 1, startCol: 0, endCol: 0 }, { fontSize: 10 });
  grid = patchCellStyle(grid, { startRow: 1, endRow: 1, startCol: 2, endCol: 2 }, { fontSize: 10 });
  assert.deepEqual(validateTemplateGrid(grid, binding), []);
});

test("明细模板列不能指向合并覆盖格或参与合并", () => {
  let grid = patchCellStyle(makeGrid(), { startRow: 1, endRow: 1, startCol: 0, endCol: 1 }, { fontSize: 10 });
  const binding: TemplateBinding = {
    fields: {},
    lineItems: { startRow: 1, endRow: 1, columns: { description: 0, amount: 1 }, minRows: 1 },
  };
  const rejected = mergeRange(grid, binding, { startRow: 1, endRow: 1, startCol: 0, endCol: 1 });
  assert.match(rejected.error ?? "", /明细模板列/);

  grid = mergeRange(grid, emptyBinding(), { startRow: 1, endRow: 1, startCol: 0, endCol: 1 }).grid;
  assert.match(validateTemplateGrid(grid, binding).join("\n"), /没有独立的模板单元格/);
});

test("插入行列同步迁移单元格、合并跨度、字段和明细坐标", () => {
  const grid: TemplateGrid = {
    colWidths: [40, 40, 40],
    rowHeights: [15, 15, 15],
    cells: [
      { row: 0, col: 0, rowSpan: 2, colSpan: 2, text: "Merged", style: {} },
      { row: 2, col: 2, rowSpan: 1, colSpan: 1, text: "Total", style: {} },
    ],
  };
  const binding: TemplateBinding = {
    fields: { total: { cells: [{ row: 2, col: 2 }], format: "money" } },
    lineItems: { startRow: 1, endRow: 2, columns: { description: 0, amount: 2 }, minRows: 2 },
  };
  const withRow = insertRow(grid, binding, 1);
  assert.equal(withRow.grid.cells[0].rowSpan, 3);
  assert.deepEqual(withRow.binding.fields.total?.cells, [{ row: 3, col: 2 }]);
  assert.deepEqual(
    [withRow.binding.lineItems?.startRow, withRow.binding.lineItems?.endRow],
    [2, 3]
  );
  const withColumn = insertColumn(withRow.grid, withRow.binding, 1);
  assert.equal(withColumn.grid.cells[0].colSpan, 3);
  assert.deepEqual(withColumn.binding.fields.total?.cells, [{ row: 3, col: 3 }]);
  assert.equal(withColumn.binding.lineItems?.columns.amount, 3);
});

test("删除行列收缩合并区域并解除被删的最后绑定", () => {
  const grid: TemplateGrid = {
    colWidths: [40, 40, 40],
    rowHeights: [15, 15, 15],
    cells: [
      { row: 0, col: 0, rowSpan: 2, colSpan: 2, text: "Merged", style: {} },
      { row: 2, col: 2, rowSpan: 1, colSpan: 1, text: "Total", style: {} },
    ],
  };
  const binding: TemplateBinding = {
    fields: {
      invoice_number: { cells: [{ row: 0, col: 0 }], format: "text" },
      total: { cells: [{ row: 2, col: 2 }], format: "money" },
    },
    lineItems: { startRow: 1, endRow: 2, columns: { description: 0, amount: 2 }, minRows: 2 },
  };
  const withoutLastRow = deleteRow(grid, binding, 2);
  assert.equal(withoutLastRow.binding.fields.total, undefined);
  assert.deepEqual(
    [withoutLastRow.binding.lineItems?.startRow, withoutLastRow.binding.lineItems?.endRow],
    [1, 1]
  );
  const withoutFirstColumn = deleteColumn(withoutLastRow.grid, withoutLastRow.binding, 0);
  assert.equal(withoutFirstColumn.grid.cells[0].colSpan, 1);
  assert.deepEqual(withoutFirstColumn.binding.fields.invoice_number?.cells, [{ row: 0, col: 0 }]);
  assert.equal(withoutFirstColumn.binding.lineItems?.columns.description, undefined);
  assert.equal(withoutFirstColumn.binding.lineItems?.columns.amount, 1);
});

test("不能删除最后一行列或超过模板上限", () => {
  const oneCell: TemplateGrid = {
    colWidths: [40],
    rowHeights: [15],
    cells: [{ row: 0, col: 0, rowSpan: 1, colSpan: 1, text: "A", style: {} }],
  };
  assert.match(deleteRow(oneCell, emptyBinding(), 0).error ?? "", /至少保留一行/);
  assert.match(deleteColumn(oneCell, emptyBinding(), 0).error ?? "", /至少保留一列/);
  assert.match(
    insertRow({ ...oneCell, rowHeights: Array(80).fill(15) }, emptyBinding(), 0).error ?? "",
    /最多支持 80 行/
  );
  assert.match(
    insertColumn({ ...oneCell, colWidths: Array(30).fill(40) }, emptyBinding(), 0).error ?? "",
    /最多支持 30 列/
  );
});

test("字段绑定位于明细区域内时校验报错（渲染时会被数据行覆盖）", () => {
  const grid: TemplateGrid = {
    colWidths: [40, 40],
    rowHeights: [15, 15],
    cells: [
      { row: 0, col: 0, rowSpan: 1, colSpan: 1, text: "TOTAL", style: {} },
      { row: 1, col: 0, rowSpan: 1, colSpan: 1, text: "", style: {} },
      { row: 1, col: 1, rowSpan: 1, colSpan: 1, text: "", style: {} },
    ],
  };
  const inside: TemplateBinding = {
    fields: { total: { cells: [{ row: 1, col: 0 }], format: "money" } },
    lineItems: { startRow: 1, endRow: 1, columns: { description: 0, amount: 1 }, minRows: 1 },
  };
  assert.ok(
    validateTemplateGrid(grid, inside).some((e) => e.includes("明细区域")),
    "区域内绑定应报错"
  );
  const outside: TemplateBinding = {
    ...inside,
    fields: { total: { cells: [{ row: 0, col: 0 }], format: "money" } },
  };
  assert.equal(
    validateTemplateGrid(grid, outside).some((e) => e.includes("明细区域")),
    false,
    "区域外绑定不应报错"
  );
});

test("发布校验同样拒绝明细区域内的字段绑定", () => {
  const bad: TemplateBinding = {
    fields: { invoice_number: { cells: [{ row: 4, col: 4 }], format: "text" } },
    lineItems: { startRow: 4, endRow: 4, columns: { description: 1, amount: 4 }, minRows: 10 },
  };
  assert.ok(
    validateBindingForPublish(bad).some((e) => e.includes("明细区域")),
    "G&G 误绑形态（invoice_number 在明细区域内）应被发布校验拦截"
  );
  const good: TemplateBinding = {
    fields: { invoice_number: { cells: [{ row: 2, col: 4 }], format: "text" } },
    lineItems: { startRow: 16, endRow: 30, columns: { description: 1, amount: 4 }, minRows: 15 },
  };
  assert.equal(
    validateBindingForPublish(good).some((e) => e.includes("明细区域")),
    false,
    "区域外绑定应通过发布校验"
  );
});
