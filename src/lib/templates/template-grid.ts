import {
  TEMPLATE_FIELDS,
  type TemplateBinding,
  type TemplateCell,
  type TemplateCellStyle,
  type TemplateFieldKey,
  type TemplateGrid,
} from "./types";

export const TEMPLATE_MAX_ROWS = 80;
export const TEMPLATE_MAX_COLS = 30;

export interface GridRange {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

export function normalizeRange(aRow: number, aCol: number, bRow: number, bCol: number): GridRange {
  return {
    startRow: Math.min(aRow, bRow),
    endRow: Math.max(aRow, bRow),
    startCol: Math.min(aCol, bCol),
    endCol: Math.max(aCol, bCol),
  };
}

export function cellKey(row: number, col: number) {
  return `${row}:${col}`;
}

export function findCell(grid: TemplateGrid, row: number, col: number): TemplateCell | undefined {
  return grid.cells.find((cell) => cell.row === row && cell.col === col);
}

export function findAnchorAt(grid: TemplateGrid, row: number, col: number): TemplateCell | undefined {
  return grid.cells.find(
    (cell) =>
      row >= cell.row &&
      row < cell.row + cell.rowSpan &&
      col >= cell.col &&
      col < cell.col + cell.colSpan
  );
}

function hasStyle(style: TemplateCellStyle): boolean {
  return Object.values(style).some((value) => value != null);
}

export function updateCell(
  grid: TemplateGrid,
  row: number,
  col: number,
  update: (cell: TemplateCell) => TemplateCell
): TemplateGrid {
  const anchor = findAnchorAt(grid, row, col);
  const existing = anchor ?? { row, col, rowSpan: 1, colSpan: 1, text: "", style: {} };
  const next = update(existing);
  const cells = grid.cells.filter((cell) => cell !== anchor);
  if (next.text || hasStyle(next.style) || next.rowSpan > 1 || next.colSpan > 1) cells.push(next);
  cells.sort((a, b) => a.row - b.row || a.col - b.col);
  return { ...grid, cells };
}

export function setCellText(grid: TemplateGrid, row: number, col: number, text: string): TemplateGrid {
  return updateCell(grid, row, col, (cell) => ({ ...cell, text }));
}

export function patchCellStyle(
  grid: TemplateGrid,
  range: GridRange,
  patch: Partial<TemplateCellStyle>
): TemplateGrid {
  let next = grid;
  const processed = new Set<string>();
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const anchor = findAnchorAt(next, row, col);
      const targetRow = anchor?.row ?? row;
      const targetCol = anchor?.col ?? col;
      const key = cellKey(targetRow, targetCol);
      if (processed.has(key)) continue;
      processed.add(key);
      next = updateCell(next, targetRow, targetCol, (cell) => ({
        ...cell,
        style: { ...cell.style, ...patch },
      }));
    }
  }
  return next;
}

export function resizeRow(grid: TemplateGrid, row: number, height: number): TemplateGrid {
  const rowHeights = [...grid.rowHeights];
  rowHeights[row] = Math.max(8, Math.min(200, Math.round(height * 10) / 10));
  return { ...grid, rowHeights };
}

export function resizeColumn(grid: TemplateGrid, col: number, width: number): TemplateGrid {
  const colWidths = [...grid.colWidths];
  colWidths[col] = Math.max(16, Math.min(400, Math.round(width * 10) / 10));
  return { ...grid, colWidths };
}

type GridBindingResult = { grid: TemplateGrid; binding: TemplateBinding; error?: string };

function compactFields(fields: TemplateBinding["fields"]): TemplateBinding["fields"] {
  const next = { ...fields };
  for (const field of TEMPLATE_FIELDS) {
    if (next[field.key]?.cells.length === 0) delete next[field.key];
  }
  return next;
}

export function insertRow(
  grid: TemplateGrid,
  binding: TemplateBinding,
  index: number
): GridBindingResult {
  if (grid.rowHeights.length >= TEMPLATE_MAX_ROWS) {
    return { grid, binding, error: `模板最多支持 ${TEMPLATE_MAX_ROWS} 行` };
  }
  const rowHeights = [...grid.rowHeights];
  rowHeights.splice(index, 0, grid.rowHeights[index] ?? grid.rowHeights[index - 1] ?? 15);
  const cells = grid.cells.map((cell) => {
    if (cell.row >= index) return { ...cell, row: cell.row + 1 };
    if (cell.row + cell.rowSpan > index) return { ...cell, rowSpan: cell.rowSpan + 1 };
    return cell;
  });
  const fields = { ...binding.fields };
  for (const field of TEMPLATE_FIELDS) {
    const config = fields[field.key];
    if (!config) continue;
    fields[field.key] = {
      ...config,
      cells: config.cells.map((cell) => ({ ...cell, row: cell.row >= index ? cell.row + 1 : cell.row })),
    };
  }
  const lineItems = binding.lineItems
    ? binding.lineItems.startRow >= index
      ? { ...binding.lineItems, startRow: binding.lineItems.startRow + 1, endRow: binding.lineItems.endRow + 1 }
      : binding.lineItems.endRow >= index
        ? { ...binding.lineItems, endRow: binding.lineItems.endRow + 1 }
        : binding.lineItems
    : null;
  return { grid: { ...grid, rowHeights, cells }, binding: { ...binding, fields, lineItems } };
}

export function deleteRow(
  grid: TemplateGrid,
  binding: TemplateBinding,
  index: number
): GridBindingResult {
  if (grid.rowHeights.length <= 1) return { grid, binding, error: "模板至少保留一行" };
  const rowHeights = grid.rowHeights.filter((_, row) => row !== index);
  const cells = grid.cells.flatMap((cell): TemplateCell[] => {
    if (index < cell.row) return [{ ...cell, row: cell.row - 1 }];
    if (index >= cell.row + cell.rowSpan) return [cell];
    if (cell.rowSpan === 1) return [];
    return [{ ...cell, rowSpan: cell.rowSpan - 1 }];
  });
  const fields = { ...binding.fields };
  for (const field of TEMPLATE_FIELDS) {
    const config = fields[field.key];
    if (!config) continue;
    fields[field.key] = {
      ...config,
      cells: config.cells.flatMap((bound) => {
        if (bound.row > index) return [{ ...bound, row: bound.row - 1 }];
        if (bound.row < index) return [bound];
        const anchor = findCell(grid, bound.row, bound.col);
        return anchor && anchor.rowSpan > 1 ? [bound] : [];
      }),
    };
  }
  let lineItems = binding.lineItems;
  if (lineItems) {
    if (index < lineItems.startRow) {
      lineItems = { ...lineItems, startRow: lineItems.startRow - 1, endRow: lineItems.endRow - 1 };
    } else if (index <= lineItems.endRow) {
      lineItems = lineItems.startRow === lineItems.endRow ? null : { ...lineItems, endRow: lineItems.endRow - 1 };
    }
  }
  return {
    grid: { ...grid, rowHeights, cells },
    binding: { ...binding, fields: compactFields(fields), lineItems },
  };
}

export function insertColumn(
  grid: TemplateGrid,
  binding: TemplateBinding,
  index: number
): GridBindingResult {
  if (grid.colWidths.length >= TEMPLATE_MAX_COLS) {
    return { grid, binding, error: `模板最多支持 ${TEMPLATE_MAX_COLS} 列` };
  }
  const colWidths = [...grid.colWidths];
  colWidths.splice(index, 0, grid.colWidths[index] ?? grid.colWidths[index - 1] ?? 48);
  const cells = grid.cells.map((cell) => {
    if (cell.col >= index) return { ...cell, col: cell.col + 1 };
    if (cell.col + cell.colSpan > index) return { ...cell, colSpan: cell.colSpan + 1 };
    return cell;
  });
  const fields = { ...binding.fields };
  for (const field of TEMPLATE_FIELDS) {
    const config = fields[field.key];
    if (!config) continue;
    fields[field.key] = {
      ...config,
      cells: config.cells.map((cell) => ({ ...cell, col: cell.col >= index ? cell.col + 1 : cell.col })),
    };
  }
  const lineItems = binding.lineItems
    ? {
        ...binding.lineItems,
        columns: Object.fromEntries(
          Object.entries(binding.lineItems.columns).map(([key, col]) => [
            key,
            col != null && col >= index ? col + 1 : col,
          ])
        ),
      }
    : null;
  return { grid: { ...grid, colWidths, cells }, binding: { ...binding, fields, lineItems } };
}

export function deleteColumn(
  grid: TemplateGrid,
  binding: TemplateBinding,
  index: number
): GridBindingResult {
  if (grid.colWidths.length <= 1) return { grid, binding, error: "模板至少保留一列" };
  const colWidths = grid.colWidths.filter((_, col) => col !== index);
  const cells = grid.cells.flatMap((cell): TemplateCell[] => {
    if (index < cell.col) return [{ ...cell, col: cell.col - 1 }];
    if (index >= cell.col + cell.colSpan) return [cell];
    if (cell.colSpan === 1) return [];
    return [{ ...cell, colSpan: cell.colSpan - 1 }];
  });
  const fields = { ...binding.fields };
  for (const field of TEMPLATE_FIELDS) {
    const config = fields[field.key];
    if (!config) continue;
    fields[field.key] = {
      ...config,
      cells: config.cells.flatMap((bound) => {
        if (bound.col > index) return [{ ...bound, col: bound.col - 1 }];
        if (bound.col < index) return [bound];
        const anchor = findCell(grid, bound.row, bound.col);
        return anchor && anchor.colSpan > 1 ? [bound] : [];
      }),
    };
  }
  const lineItems = binding.lineItems
    ? {
        ...binding.lineItems,
        columns: Object.fromEntries(
          Object.entries(binding.lineItems.columns).flatMap(([key, col]) => {
            if (col == null || col === index) return [];
            return [[key, col > index ? col - 1 : col]];
          })
        ),
      }
    : null;
  return {
    grid: { ...grid, colWidths, cells },
    binding: { ...binding, fields: compactFields(fields), lineItems },
  };
}

function cellInsideRange(cell: TemplateCell, range: GridRange): boolean {
  return (
    cell.row >= range.startRow &&
    cell.col >= range.startCol &&
    cell.row + cell.rowSpan - 1 <= range.endRow &&
    cell.col + cell.colSpan - 1 <= range.endCol
  );
}

function cellIntersectsRange(cell: TemplateCell, range: GridRange): boolean {
  return !(
    cell.row + cell.rowSpan - 1 < range.startRow ||
    cell.row > range.endRow ||
    cell.col + cell.colSpan - 1 < range.startCol ||
    cell.col > range.endCol
  );
}

function bindingsInRange(binding: TemplateBinding, range: GridRange): TemplateFieldKey[] {
  return TEMPLATE_FIELDS.flatMap((field) => {
    const cells = binding.fields[field.key]?.cells ?? [];
    return cells.some(
      (cell) =>
        cell.row >= range.startRow &&
        cell.row <= range.endRow &&
        cell.col >= range.startCol &&
        cell.col <= range.endCol
    )
      ? [field.key]
      : [];
  });
}

export function mergeRange(
  grid: TemplateGrid,
  binding: TemplateBinding,
  range: GridRange
): { grid: TemplateGrid; binding: TemplateBinding; error?: string } {
  if (range.startRow === range.endRow && range.startCol === range.endCol) {
    return { grid, binding, error: "请至少选择两个单元格进行合并" };
  }
  const intersecting = grid.cells.filter((cell) => cellIntersectsRange(cell, range));
  if (intersecting.some((cell) => !cellInsideRange(cell, range))) {
    return { grid, binding, error: "选区与已有合并单元格交叉，请先取消原合并" };
  }
  if (intersecting.filter((cell) => cell.text.trim()).length > 1) {
    return { grid, binding, error: "选区内有多个非空单元格，合并会丢失文字，请先保留一个内容" };
  }
  const boundFields = bindingsInRange(binding, range);
  if (new Set(boundFields).size > 1) {
    return { grid, binding, error: "选区内存在多个不同字段绑定，请先解绑后再合并" };
  }
  const lines = binding.lineItems;
  const lineColumns = lines
    ? Object.values(lines.columns).filter((col): col is number => col != null)
    : [];
  if (
    lines &&
    range.startRow <= lines.startRow &&
    range.endRow >= lines.startRow &&
    lineColumns.some((col) => col >= range.startCol && col <= range.endCol)
  ) {
    return { grid, binding, error: "选区包含明细模板列，合并会导致明细内容无法输出，请先调整明细绑定" };
  }

  const anchor =
    intersecting.find((cell) => cell.row === range.startRow && cell.col === range.startCol) ??
    intersecting.find((cell) => cell.text) ??
    intersecting[0] ??
    { row: range.startRow, col: range.startCol, rowSpan: 1, colSpan: 1, text: "", style: {} };
  const merged: TemplateCell = {
    ...anchor,
    row: range.startRow,
    col: range.startCol,
    rowSpan: range.endRow - range.startRow + 1,
    colSpan: range.endCol - range.startCol + 1,
  };
  const cells = grid.cells.filter((cell) => !cellIntersectsRange(cell, range));
  cells.push(merged);
  cells.sort((a, b) => a.row - b.row || a.col - b.col);

  const fields = { ...binding.fields };
  for (const field of TEMPLATE_FIELDS) {
    const config = fields[field.key];
    if (!config) continue;
    const outside = config.cells.filter(
      (cell) =>
        cell.row < range.startRow ||
        cell.row > range.endRow ||
        cell.col < range.startCol ||
        cell.col > range.endCol
    );
    if (outside.length !== config.cells.length) {
      fields[field.key] = {
        ...config,
        cells: [...outside, { row: range.startRow, col: range.startCol }],
      };
    }
  }
  return { grid: { ...grid, cells }, binding: { ...binding, fields } };
}

export function unmergeAt(grid: TemplateGrid, row: number, col: number): TemplateGrid {
  const anchor = findAnchorAt(grid, row, col);
  if (!anchor || (anchor.rowSpan === 1 && anchor.colSpan === 1)) return grid;
  return updateCell(grid, anchor.row, anchor.col, (cell) => ({ ...cell, rowSpan: 1, colSpan: 1 }));
}

export function validateTemplateGrid(grid: TemplateGrid, binding?: TemplateBinding): string[] {
  const errors: string[] = [];
  if (!Array.isArray(grid.rowHeights) || grid.rowHeights.length < 1 || grid.rowHeights.length > TEMPLATE_MAX_ROWS) {
    errors.push(`模板行数必须为 1-${TEMPLATE_MAX_ROWS}`);
  }
  if (!Array.isArray(grid.colWidths) || grid.colWidths.length < 1 || grid.colWidths.length > TEMPLATE_MAX_COLS) {
    errors.push(`模板列数必须为 1-${TEMPLATE_MAX_COLS}`);
  }
  if (grid.rowHeights.some((value) => !Number.isFinite(value) || value < 8 || value > 200)) {
    errors.push("行高必须在 8-200pt 之间");
  }
  if (grid.colWidths.some((value) => !Number.isFinite(value) || value < 16 || value > 400)) {
    errors.push("列宽必须在 16-400pt 之间");
  }

  const occupied = new Set<string>();
  const anchors = new Set<string>();
  for (const cell of grid.cells) {
    if (!Number.isInteger(cell.row) || !Number.isInteger(cell.col) || cell.row < 0 || cell.col < 0) {
      errors.push("单元格坐标不合法");
      continue;
    }
    if (!Number.isInteger(cell.rowSpan) || !Number.isInteger(cell.colSpan) || cell.rowSpan < 1 || cell.colSpan < 1) {
      errors.push(`单元格 ${cellKey(cell.row, cell.col)} 的跨度不合法`);
      continue;
    }
    if (cell.row + cell.rowSpan > grid.rowHeights.length || cell.col + cell.colSpan > grid.colWidths.length) {
      errors.push(`单元格 ${cellKey(cell.row, cell.col)} 超出模板范围`);
      continue;
    }
    const anchorKey = cellKey(cell.row, cell.col);
    if (anchors.has(anchorKey)) errors.push(`单元格 ${anchorKey} 重复`);
    anchors.add(anchorKey);
    for (let row = cell.row; row < cell.row + cell.rowSpan; row += 1) {
      for (let col = cell.col; col < cell.col + cell.colSpan; col += 1) {
        const key = cellKey(row, col);
        if (occupied.has(key)) errors.push(`合并区域在 ${key} 重叠`);
        occupied.add(key);
      }
    }
  }

  if (binding) {
    for (const field of TEMPLATE_FIELDS) {
      for (const cell of binding.fields[field.key]?.cells ?? []) {
        if (!anchors.has(cellKey(cell.row, cell.col))) {
          errors.push(`${field.label} 绑定的单元格不存在或不是合并锚点`);
        }
      }
    }
    const lines = binding.lineItems;
    if (lines) {
      if (lines.startRow < 0 || lines.endRow >= grid.rowHeights.length || lines.endRow < lines.startRow) {
        errors.push("明细行区域超出模板范围");
      }
      for (const col of Object.values(lines.columns)) {
        if (col != null && (col < 0 || col >= grid.colWidths.length)) errors.push("明细列超出模板范围");
        if (col != null) {
          const source = findCell(grid, lines.startRow, col);
          if (!source || source.rowSpan !== 1) {
            errors.push(`明细列 ${col + 1} 在起始行没有独立的模板单元格`);
          }
        }
      }
    }
  }
  return [...new Set(errors)];
}
