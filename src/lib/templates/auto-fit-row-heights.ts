/**
 * 账单模版 —— 行高自适应（纯函数）
 * 对多行排版格（wrap 或显式换行）按 wrapTextLines 估出的行数撑开行高，
 * 在 renderTemplateData 输出后调用；HTML 预览与 PDF 消费同一结果，
 * 维持「编辑看到的 = 打印出来的」。
 */

import { LINE_HEIGHT_FACTOR, wrapTextLines } from "./cell-layout";
import type { TemplateGrid } from "./types";

/** 文本盒上下留白（pt），与渲染器的 3px 水平 padding 对应的垂直近似 */
const VERTICAL_PADDING_PT = 2;

export function autoFitRowHeights(grid: TemplateGrid, coords?: Set<string>): TemplateGrid {
  const needed = new Array<number>(grid.rowHeights.length).fill(0);
  for (const cell of grid.cells) {
    if (!cell.text) continue;
    const multi = cell.style.wrap || /\r|\n/.test(cell.text);
    if (!multi) continue;
    if (coords && !coords.has(`${cell.row}:${cell.col}`)) continue;
    const fontSize = cell.style.fontSize ?? 10;
    // wrap 格按自身跨度宽度折行（wrap 不参与左右溢出）
    const width = grid.colWidths
      .slice(cell.col, cell.col + cell.colSpan)
      .reduce((sum, w) => sum + w, 0);
    const lines = wrapTextLines(cell.text, fontSize, Math.max(0, width - 6), cell.style.bold);
    const height = lines.length * fontSize * LINE_HEIGHT_FACTOR + VERTICAL_PADDING_PT;
    const span = Math.max(1, Math.min(cell.rowSpan, grid.rowHeights.length - cell.row));
    const perRow = height / span;
    for (let row = cell.row; row < cell.row + span; row += 1) {
      needed[row] = Math.max(needed[row], perRow);
    }
  }
  const rowHeights = grid.rowHeights.map((h, row) => {
    if (needed[row] <= h) return h;
    return Math.round(needed[row] * 10) / 10;
  });
  return rowHeights.some((h, row) => h !== grid.rowHeights[row]) ? { ...grid, rowHeights } : grid;
}
