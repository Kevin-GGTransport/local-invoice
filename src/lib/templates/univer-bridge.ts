/**
 * 账单模版 —— Univer 桥接层（TemplateGrid ↔ Univer 工作簿数据）
 * 本地定义 Univer 数据契约的最小结构化子集（不 import Univer 包），
 * 保证纯函数可在 node:test 中运行；编辑器组件负责与 Univer 实例交互。
 * 行高/列宽单位换算 pt ↔ px（×4/3）在本层完成。
 */

import { BORDER_WIDTH_PT, widthToLineStyle } from "./border-style";
import type {
  TemplateBorderLineStyle,
  TemplateCell,
  TemplateCellStyle,
  TemplateGrid,
  TemplatePageConfig,
} from "./types";

// ---------- Univer 数据契约最小子集（结构化兼容官方 IWorkbookData） ----------

export interface UniverBorderData {
  style: string;
  color?: string;
}

export interface UniverStyle {
  bl?: number;
  it?: number;
  ul?: { s: number };
  st?: { s: number };
  fs?: number;
  ff?: string;
  cl?: { rgb: string };
  bg?: { rgb: string };
  bd?: Partial<Record<"top" | "right" | "bottom" | "left", UniverBorderData>>;
  at?: string;
  vt?: string;
  tb?: number;
}

export interface UniverCell {
  v?: string | number | boolean;
  f?: string;
  s?: number | UniverStyle;
}

export interface UniverMergeData {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

export interface UniverWorksheetData {
  id: string;
  name: string;
  cellData: Record<number, Record<number, UniverCell>>;
  columnData: Record<number, { w?: number; customWidth?: boolean }>;
  rowData: Record<number, { h?: number; customHeight?: boolean }>;
  mergeData: UniverMergeData[];
  rowCount: number;
  columnCount: number;
}

export interface UniverWorkbookData {
  id: string;
  sheetOrder: string[];
  styles: UniverStyle[];
  sheets: Record<string, UniverWorksheetData>;
}

/** Univer getSnapshot() 的返回（工作簿多了元数据字段，结构化兼容） */
export type UniverSnapshot = UniverWorkbookData;

// ---------- 单位换算与常量 ----------

const PT_TO_PX = 4 / 3;
const pxToPt = (px: number) => Math.round(px * 0.75 * 10) / 10;
const ptToPx = (pt: number) => Math.round(pt * PT_TO_PX * 10) / 10;
const DEFAULT_ROW_HEIGHT_PT = 15;
const DEFAULT_COL_WIDTH_PT = 48;

const LINE_TO_UNIVER: Record<TemplateBorderLineStyle, string> = {
  thin: "thin",
  medium: "medium",
  thick: "thick",
  dashed: "dashed",
  dotted: "dotted",
  double: "double",
};

const UNIVER_VT: Record<string, string> = { top: "vertical", middle: "middle", bottom: "horizontal" };
const UNIVER_VT_BACK: Record<string, string> = { vertical: "top", middle: "middle", horizontal: "bottom" };

// ---------- TemplateGrid → Univer ----------

function templateStyleToUniver(style: TemplateCellStyle, baseFontSize: number): UniverStyle {
  const u: UniverStyle = { fs: style.fontSize ?? baseFontSize };
  if (style.bold) u.bl = 1;
  if (style.italic) u.it = 1;
  if (style.underline) u.ul = { s: 1 };
  if (style.strike) u.st = { s: 1 };
  if (style.color) u.cl = { rgb: style.color };
  if (style.fill) u.bg = { rgb: style.fill };
  if (style.halign) u.at = style.halign;
  if (style.valign) u.vt = UNIVER_VT[style.valign];
  if (style.wrap) u.tb = 1;
  const b = style.borders;
  if (b) {
    const bd: UniverStyle["bd"] = {};
    for (const side of ["top", "right", "bottom", "left"] as const) {
      if (b[side] == null) continue;
      const line = b.styles?.[side] ?? widthToLineStyle(b[side]!);
      bd[side] = { style: LINE_TO_UNIVER[line], ...(b.color ? { color: b.color } : {}) };
    }
    if (Object.keys(bd).length > 0) u.bd = bd;
  }
  return u;
}

export function templateGridToWorkbookData(
  grid: TemplateGrid,
  pageConfig: TemplatePageConfig
): UniverWorkbookData {
  const styles: UniverStyle[] = [];
  const styleIndex = new Map<string, number>();
  const internStyle = (style: TemplateCellStyle): number | undefined => {
    const u = templateStyleToUniver(style, pageConfig.baseFontSize);
    if (Object.keys(u).length === 0) return undefined;
    const key = JSON.stringify(u);
    let idx = styleIndex.get(key);
    if (idx == null) {
      styles.push(u);
      idx = styles.length - 1;
      styleIndex.set(key, idx);
    }
    return idx;
  };

  const sheetId = "sheet-01";
  const cellData: UniverWorksheetData["cellData"] = {};
  const merges: UniverMergeData[] = [];
  for (const cell of grid.cells) {
    if (cell.rowSpan > 1 || cell.colSpan > 1) {
      merges.push({
        startRow: cell.row,
        endRow: cell.row + cell.rowSpan - 1,
        startColumn: cell.col,
        endColumn: cell.col + cell.colSpan - 1,
      });
    }
    const s = internStyle(cell.style);
    const entry: UniverCell = { v: cell.text };
    if (s != null) entry.s = s;
    (cellData[cell.row] ??= {})[cell.col] = entry;
  }

  const rowData: UniverWorksheetData["rowData"] = {};
  grid.rowHeights.forEach((pt, row) => {
    rowData[row] = { h: ptToPx(pt), customHeight: true };
  });
  const columnData: UniverWorksheetData["columnData"] = {};
  grid.colWidths.forEach((pt, col) => {
    columnData[col] = { w: ptToPx(pt), customWidth: true };
  });

  return {
    id: "template-workbook",
    sheetOrder: [sheetId],
    styles,
    sheets: {
      [sheetId]: {
        id: sheetId,
        name: "模板",
        cellData,
        columnData,
        rowData,
        mergeData: merges,
        rowCount: grid.rowHeights.length,
        columnCount: grid.colWidths.length,
      },
    },
  };
}

// ---------- Univer → TemplateGrid ----------

function univerStyleToTemplate(
  u: UniverStyle | undefined,
  baseFontSize: number
): TemplateCellStyle {
  const style: TemplateCellStyle = {};
  if (!u) return style;
  if (u.bl) style.bold = true;
  if (u.it) style.italic = true;
  if (u.ul?.s) style.underline = true;
  if (u.st?.s) style.strike = true;
  if (u.fs != null && u.fs !== baseFontSize) style.fontSize = u.fs;
  if (u.cl?.rgb) style.color = u.cl.rgb;
  if (u.bg?.rgb) style.fill = u.bg.rgb;
  if (u.at === "left" || u.at === "center" || u.at === "right") style.halign = u.at;
  if (u.vt && UNIVER_VT_BACK[u.vt]) style.valign = UNIVER_VT_BACK[u.vt] as TemplateCellStyle["valign"];
  if (u.tb === 1) style.wrap = true;
  if (u.bd) {
    const borders: Record<string, number> = {};
    const borderStyles: Record<string, TemplateBorderLineStyle> = {};
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const edge = u.bd[side];
      if (!edge) continue;
      const line = (Object.keys(BORDER_WIDTH_PT) as TemplateBorderLineStyle[]).find(
        (l) => LINE_TO_UNIVER[l] === edge.style
      );
      if (!line) continue;
      borders[side] = BORDER_WIDTH_PT[line];
      // 仅当宽度反推不出线型时才回写 styles：thin/medium/thick 宽度与线型互推一致不写，dashed/dotted/double 必须写
      if (widthToLineStyle(BORDER_WIDTH_PT[line]) !== line) borderStyles[side] = line;
      if (edge.color) (borders as Record<string, unknown>).color = edge.color;
    }
    if (Object.keys(borders).length > 0) {
      style.borders = {
        ...borders,
        ...(Object.keys(borderStyles).length > 0 ? { styles: borderStyles } : {}),
      } as TemplateCellStyle["borders"];
    }
  }
  return style;
}

export function workbookDataToTemplateGrid(
  snapshot: UniverSnapshot,
  pageConfig: TemplatePageConfig
): TemplateGrid {
  const sheetId = snapshot.sheetOrder[0];
  const sheet = snapshot.sheets[sheetId];

  const styleOf = (cell: UniverCell): TemplateCellStyle =>
    typeof cell.s === "number"
      ? univerStyleToTemplate(snapshot.styles?.[cell.s], pageConfig.baseFontSize)
      : univerStyleToTemplate(cell.s, pageConfig.baseFontSize);

  const covered = new Set<string>();
  for (const merge of sheet.mergeData ?? []) {
    for (let r = merge.startRow; r <= merge.endRow; r += 1) {
      for (let c = merge.startColumn; c <= merge.endColumn; c += 1) {
        if (r !== merge.startRow || c !== merge.startColumn) covered.add(`${r}:${c}`);
      }
    }
  }

  const cells: TemplateCell[] = [];
  let maxRow = -1;
  let maxCol = -1;
  for (const [rowKey, rowCells] of Object.entries(sheet.cellData ?? {})) {
    for (const [colKey, cell] of Object.entries(rowCells)) {
      const row = Number(rowKey);
      const col = Number(colKey);
      if (covered.has(`${row}:${col}`)) continue;
      const text = cell.v == null ? "" : String(cell.v);
      const style = styleOf(cell);
      if (!text && Object.keys(style).length === 0) continue;
      const merge = (sheet.mergeData ?? []).find(
        (m) => m.startRow === row && m.startColumn === col
      );
      cells.push({
        row,
        col,
        rowSpan: merge ? merge.endRow - merge.startRow + 1 : 1,
        colSpan: merge ? merge.endColumn - merge.startColumn + 1 : 1,
        text,
        style,
      });
      maxRow = Math.max(maxRow, row + (merge ? merge.endRow - merge.startRow : 0));
      maxCol = Math.max(maxCol, col + (merge ? merge.endColumn - merge.startColumn : 0));
    }
  }
  // 合并区域可能超出有样式单元格的范围
  for (const merge of sheet.mergeData ?? []) {
    maxRow = Math.max(maxRow, merge.endRow);
    maxCol = Math.max(maxCol, merge.endColumn);
  }

  const rowCount = maxRow + 1;
  const colCount = maxCol + 1;
  const rowHeights = Array.from({ length: rowCount }, (_, row) => {
    const rd = sheet.rowData?.[row];
    return rd?.customHeight && rd.h != null ? pxToPt(rd.h) : DEFAULT_ROW_HEIGHT_PT;
  });
  const colWidths = Array.from({ length: colCount }, (_, col) => {
    const cd = sheet.columnData?.[col];
    return cd?.customWidth && cd.w != null ? pxToPt(cd.w) : DEFAULT_COL_WIDTH_PT;
  });

  return { colWidths, rowHeights, cells: cells.sort((a, b) => a.row - b.row || a.col - b.col) };
}
