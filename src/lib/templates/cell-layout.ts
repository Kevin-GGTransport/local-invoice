/**
 * 账单模版 —— 单元格文本排版共享模型（纯函数，无 react-pdf 依赖）
 * HTML 预览与 PDF 渲染器共同消费，保证「编辑看到的 = 打印出来的」：
 * 1. Excel 式溢出：左对齐单行文本向右、右对齐单行文本向左，横穿连续空单元格；
 * 2. 单行缩字号：溢出后仍放不下时按文本盒宽度保守估宽收缩字号。
 */

import { findAnchorAt } from "./template-grid";
import type { TemplateCell, TemplateGrid } from "./types";

/**
 * react-pdf 会把窄单元格中的文字自动换行，而 Excel 样张中的日期/编号通常是单行。
 * 对未开启 wrap 的单元格做保守的字宽估算，必要时缩小字号以完整放入格内。
 * 单元格内换行（Alt+Enter、未带 wrapText 标志）视为多行排版：按最长一行估宽。
 */
export function fitSingleLineFontSize(
  text: string,
  requestedSize: number,
  cellWidth: number,
  bold = false
): number {
  const availableWidth = Math.max(0, cellWidth - 6);
  if (!text || availableWidth === 0) return requestedSize;

  let emWidth = 0;
  for (const line of text.split(/\r?\n/)) {
    let lineEm = 0;
    for (const char of line) {
      if (/\d/.test(char)) lineEm += 0.56;
      else if (/[A-Z]/.test(char)) lineEm += 0.65;
      else if (/[a-z]/.test(char)) lineEm += 0.5;
      else if (/\s/.test(char)) lineEm += 0.28;
      else lineEm += 0.3;
    }
    emWidth = Math.max(emWidth, lineEm);
  }
  if (bold) emWidth *= 1.05;

  const estimatedWidth = emWidth * requestedSize;
  if (estimatedWidth <= availableWidth) return requestedSize;
  return Math.max(5.5, Math.min(requestedSize, (requestedSize * availableWidth) / estimatedWidth));
}

/** 单元格是否具备溢出排版的基础条件（Excel 仅单行、未换行的文本会溢出） */
function canOverflowBase(cell: TemplateCell): boolean {
  if (!cell.text) return false;
  if (/\r|\n/.test(cell.text)) return false;
  return !cell.style.wrap;
}

/** 该单元格是否参与 Excel 式右侧溢出排版（左对齐文本向右溢出） */
export function canOverflowRight(cell: TemplateCell): boolean {
  return canOverflowBase(cell) && (cell.style.halign === undefined || cell.style.halign === "left");
}

/** 该单元格是否参与 Excel 式左侧溢出排版（右对齐文本向左溢出） */
export function canOverflowLeft(cell: TemplateCell): boolean {
  return canOverflowBase(cell) && cell.style.halign === "right";
}

/** 候选列在源格覆盖的每一行 [row, row+rowSpan) 上是否都没有文本 */
function columnEmptyWithinRows(grid: TemplateGrid, cell: TemplateCell, col: number): boolean {
  for (let row = cell.row; row < cell.row + cell.rowSpan; row += 1) {
    const anchor = findAnchorAt(grid, row, col);
    if (anchor && anchor.text.trim()) return false;
  }
  return true;
}

/** 列前缀和：prefix[i] = 前 i 列累计宽度（pt） */
function columnPrefix(grid: TemplateGrid): number[] {
  const prefix: number[] = [0];
  for (const w of grid.colWidths) prefix.push(prefix[prefix.length - 1] + w);
  return prefix;
}

/**
 * 右溢出扩展后的文本盒宽度（pt）：向右穿过源格行跨度内全部为空文本的连续列，
 * 止于首个带文本的单元格或网格右缘。不满足溢出条件时原样返回 baseWidth。
 */
export function overflowTextWidth(
  grid: TemplateGrid,
  cell: TemplateCell,
  baseWidth: number
): number {
  if (!canOverflowRight(cell)) return baseWidth;
  const colCount = grid.colWidths.length;
  let endCol = cell.col + cell.colSpan; // 源格自身跨列时，从自身右边界之后开始扫描
  while (endCol < colCount && columnEmptyWithinRows(grid, cell, endCol)) endCol += 1;
  let width = 0;
  for (let col = cell.col; col < endCol; col += 1) width += grid.colWidths[col] ?? 0;
  return Math.max(width, baseWidth);
}

export interface CellTextLayout {
  /** 文本盒左缘（pt，网格原点起）：左溢出时向左扩展，否则为格左缘 */
  textBoxLeft: number;
  /** 文本盒宽度（pt）：溢出扩展后或原始宽度 */
  textBoxWidth: number;
  /** 建议字号（pt）：wrap 保持原值，否则按 textBoxWidth 收缩 */
  fontSize: number;
  /** 是否发生了溢出扩展 */
  overflowed: boolean;
}

/**
 * 两个渲染器统一调用的入口：基于网格几何一次算出文本盒位置、宽度与建议字号。
 * 左对齐/未设置对齐 → 向右溢出；右对齐 → 向左溢出；居中不溢出。
 */
export function layoutCellText(
  grid: TemplateGrid,
  cell: TemplateCell,
  requestedFontSize: number
): CellTextLayout {
  const prefix = columnPrefix(grid);
  const colCount = grid.colWidths.length;
  const clamp = (i: number) => Math.min(Math.max(i, 0), prefix.length - 1);
  const ownLeft = clamp(cell.col);
  const ownRight = clamp(cell.col + cell.colSpan);

  let startCol = ownLeft;
  let endCol = ownRight;
  if (canOverflowRight(cell)) {
    while (endCol < colCount && columnEmptyWithinRows(grid, cell, endCol)) endCol += 1;
  } else if (canOverflowLeft(cell)) {
    while (startCol > 0 && columnEmptyWithinRows(grid, cell, startCol - 1)) startCol -= 1;
  }

  const textBoxLeft = prefix[clamp(startCol)];
  const ownWidth = prefix[ownRight] - prefix[ownLeft];
  // 扩展盒不小于自身格宽（防御列宽为 0 等异常几何）
  const textBoxWidth = Math.max(prefix[clamp(endCol)] - textBoxLeft, ownWidth);
  return {
    textBoxLeft,
    textBoxWidth,
    fontSize: cell.style.wrap
      ? requestedFontSize
      : fitSingleLineFontSize(cell.text, requestedFontSize, textBoxWidth, cell.style.bold),
    overflowed: textBoxWidth > ownWidth + 0.05 || textBoxLeft < prefix[ownLeft] - 0.05,
  };
}
