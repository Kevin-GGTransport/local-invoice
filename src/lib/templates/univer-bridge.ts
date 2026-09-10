/**
 * 账单模版 —— Univer 桥接层（TemplateGrid ↔ Univer 工作簿数据）
 * 本地定义 Univer 数据契约的最小结构化子集（不 import Univer 包），
 * 保证纯函数可在 node:test 中运行；编辑器组件负责与 Univer 实例交互。
 * 行高/列宽单位换算 pt ↔ px（×4/3）在本层完成。
 */

import {
  BORDER_WIDTH_PT,
  TEMPLATE_LINE_TO_UNIVER_ENUM,
  UNIVER_ENUM_TO_LINE,
  widthToLineStyle,
} from "./border-style";
import { templateRenderColor } from "./color";
import type {
  TemplateBorderLineStyle,
  TemplateCell,
  TemplateCellStyle,
  TemplateGrid,
  TemplatePageConfig,
} from "./types";

// ---------- Univer 数据契约最小子集（0.25.1 键名与数值枚举契约：bd.t.s / ht / vt / tb 数值、styles Record） ----------

/** 边框（0.25.1 短键契约）：s 为 BorderStyleTypes 数值枚举，cl 为颜色（契约必填，无色时为空对象） */
export interface UniverBorderData {
  s: number;
  cl: { rgb?: string };
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
  bd?: Partial<Record<"t" | "r" | "b" | "l", UniverBorderData>>;
  /** HorizontalAlign 数值枚举：1=left 2=center 3=right */
  ht?: number;
  /** VerticalAlign 数值枚举：1=top 2=middle 3=bottom */
  vt?: number;
  /** WrapStrategy 数值枚举：3=WRAP */
  tb?: number;
}

export interface UniverCell {
  v?: string | number | boolean;
  f?: string;
  /** 样式注册表 id（字符串键，Univer 0.25.1 契约）或内联样式对象 */
  s?: string | UniverStyle;
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
  /** 样式注册表：字符串 id → 样式（对齐 Univer 0.25.1 IWorkbookData.styles 的 Record 形态；数值下标 id 不被运行时解析） */
  styles: Record<string, UniverStyle>;
  sheets: Record<string, UniverWorksheetData>;
}

/** 快照单元格（读取侧宽松）：真实运行时为字符串 id，历史数组形态为数值下标，也可能是内联样式对象 */
export interface UniverSnapshotCell {
  v?: string | number | boolean;
  f?: string;
  s?: number | string | UniverStyle;
}

/** 快照工作表（读取侧）：cellData 单元格形态放宽以兼容上述三种 cell.s */
export interface UniverSnapshotWorksheet extends Omit<UniverWorksheetData, "cellData"> {
  cellData: Record<number, Record<number, UniverSnapshotCell>>;
}

/** Univer getSnapshot() 的返回（读取侧宽松：工作簿多了元数据字段，结构化兼容；styles 兼容 Record 与历史数组形态） */
export interface UniverSnapshotWorkbookData extends Omit<UniverWorkbookData, "styles" | "sheets"> {
  styles: Record<string, UniverStyle> | UniverStyle[];
  sheets: Record<string, UniverSnapshotWorksheet>;
}

export type UniverSnapshot = UniverSnapshotWorkbookData;

// ---------- 单位换算与常量 ----------

const PT_TO_PX = 4 / 3;
const pxToPt = (px: number) => Math.round(px * 0.75 * 10) / 10;
const ptToPx = (pt: number) => Math.round(pt * PT_TO_PX * 10) / 10;
const DEFAULT_ROW_HEIGHT_PT = 15;
const DEFAULT_COL_WIDTH_PT = 48;

// ---------- 对齐/换行枚举（0.25.1 数值契约，仅桥接消费；边框数值映射在 border-style.ts 单点维护） ----------

const UNIVER_HT_ENUM: Record<NonNullable<TemplateCellStyle["halign"]>, number> = {
  left: 1,
  center: 2,
  right: 3,
};
const UNIVER_HT_BACK: Record<number, NonNullable<TemplateCellStyle["halign"]>> = {
  1: "left",
  2: "center",
  3: "right",
};

const UNIVER_VT_ENUM: Record<NonNullable<TemplateCellStyle["valign"]>, number> = {
  top: 1,
  middle: 2,
  bottom: 3,
};
const UNIVER_VT_BACK: Record<number, NonNullable<TemplateCellStyle["valign"]>> = {
  1: "top",
  2: "middle",
  3: "bottom",
};

/** WrapStrategy.WRAP（0.25.1 text-style.d.ts：UNSPECIFIED=0 OVERFLOW=1 CLIP=2 WRAP=3） */
const UNIVER_WRAP = 3;

/** 模板边框侧 ↔ 0.25.1 短键 */
const SIDE_TO_UNIVER_KEY = { top: "t", right: "r", bottom: "b", left: "l" } as const;
const UNIVER_KEY_TO_SIDE = { t: "top", r: "right", b: "bottom", l: "left" } as const;

// ---------- TemplateGrid → Univer ----------

function templateStyleToUniver(style: TemplateCellStyle, baseFontSize: number): UniverStyle {
  const u: UniverStyle = { fs: style.fontSize ?? baseFontSize };
  if (style.bold) u.bl = 1;
  if (style.italic) u.it = 1;
  if (style.underline) u.ul = { s: 1 };
  if (style.strike) u.st = { s: 1 };
  const textColor = templateRenderColor(style.color);
  const fillColor = templateRenderColor(style.fill);
  if (textColor) u.cl = { rgb: textColor };
  if (fillColor) u.bg = { rgb: fillColor };
  if (style.halign) u.ht = UNIVER_HT_ENUM[style.halign];
  if (style.valign) u.vt = UNIVER_VT_ENUM[style.valign];
  if (style.wrap) u.tb = UNIVER_WRAP;
  const b = style.borders;
  if (b) {
    const bd: UniverStyle["bd"] = {};
    for (const side of ["top", "right", "bottom", "left"] as const) {
      if (b[side] == null) continue;
      const line = b.styles?.[side] ?? widthToLineStyle(b[side]!);
      const borderColor = templateRenderColor(b.color);
      bd[SIDE_TO_UNIVER_KEY[side]] = {
        s: TEMPLATE_LINE_TO_UNIVER_ENUM[line],
        cl: borderColor ? { rgb: borderColor } : {},
      };
    }
    if (Object.keys(bd).length > 0) u.bd = bd;
  }
  return u;
}

export function templateGridToWorkbookData(
  grid: TemplateGrid,
  pageConfig: TemplatePageConfig
): UniverWorkbookData {
  const styles: Record<string, UniverStyle> = {};
  let styleSeq = 0;
  const styleIndex = new Map<string, string>();
  const internStyle = (style: TemplateCellStyle): string | undefined => {
    const u = templateStyleToUniver(style, pageConfig.baseFontSize);
    if (Object.keys(u).length === 0) return undefined;
    const key = JSON.stringify(u);
    let id = styleIndex.get(key);
    if (id == null) {
      id = String(styleSeq);
      styleSeq += 1;
      styles[id] = u;
      styleIndex.set(key, id);
    }
    return id;
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
  const textColor = templateRenderColor(u.cl?.rgb);
  const fillColor = templateRenderColor(u.bg?.rgb);
  if (textColor) style.color = textColor;
  if (fillColor) style.fill = fillColor;
  if (u.ht != null && UNIVER_HT_BACK[u.ht]) style.halign = UNIVER_HT_BACK[u.ht];
  if (u.vt != null && UNIVER_VT_BACK[u.vt]) style.valign = UNIVER_VT_BACK[u.vt];
  if (u.tb === UNIVER_WRAP) style.wrap = true;
  if (u.bd) {
    const borders: Record<string, number> = {};
    const borderStyles: Record<string, TemplateBorderLineStyle> = {};
    for (const key of ["t", "r", "b", "l"] as const) {
      const edge = u.bd[key];
      if (!edge) continue;
      // 反向统一走 border-style 单点映射：hair/dashDot/mediumDashed 等真实快照线型归一化，而非丢弃
      const line = UNIVER_ENUM_TO_LINE[edge.s];
      if (!line) continue;
      const side = UNIVER_KEY_TO_SIDE[key];
      borders[side] = BORDER_WIDTH_PT[line];
      // 仅当宽度反推不出线型时才回写 styles：thin/medium/thick 宽度与线型互推一致不写，dashed/dotted/double 必须写
      if (widthToLineStyle(BORDER_WIDTH_PT[line]) !== line) borderStyles[side] = line;
      const borderColor = templateRenderColor(edge.cl?.rgb);
      if (borderColor) (borders as Record<string, unknown>).color = borderColor;
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

  // 真实运行时 styles 为 Record（字符串 id）；历史数组形态的数值下标经字符串键同样命中
  const stylesMap = (snapshot.styles ?? {}) as Record<string, UniverStyle | undefined>;
  const styleOf = (cell: UniverSnapshotCell): TemplateCellStyle => {
    const s = cell.s;
    if (s == null) return {};
    if (typeof s === "object") return univerStyleToTemplate(s, pageConfig.baseFontSize);
    return univerStyleToTemplate(stylesMap[s], pageConfig.baseFontSize);
  };

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
