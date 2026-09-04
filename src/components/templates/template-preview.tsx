import React from "react";

import { layoutCellText } from "@/lib/templates/cell-layout";
import type { GridRange } from "@/lib/templates/template-grid";
import type { TemplateCellStyle, TemplateGrid } from "@/lib/templates/types";
import { cn } from "@/lib/utils";

/**
 * 账单模版 HTML 预览：绝对定位还原网格（pt → px × 96/72），
 * 与 PDF 渲染器消费同一 TemplateGrid 与 cell-layout 排版模型
 * （Excel 式右溢出 + 单行缩字号），视觉效果保持一致。
 * 文本画在背景之上（z-10），交互由更高层的命中层（z-20）接管。
 */
const PT_TO_PX = 96 / 72;
const COORDINATE_HEADER_HEIGHT = 28;
const COORDINATE_GUTTER_WIDTH = 40;

function columnLabel(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function borderPx(pt: number | undefined): number | undefined {
  return pt == null ? undefined : Math.max(1, Math.round(pt * PT_TO_PX * 10) / 10);
}

/** 背景层样式：原始格矩形 + 填充 + 边框 */
function cellBackgroundStyle(
  style: TemplateCellStyle,
  left: number,
  top: number,
  width: number,
  height: number
): React.CSSProperties {
  const b = style.borders;
  const borderColor = b?.color ?? "#000000";
  return {
    position: "absolute",
    left: left * PT_TO_PX,
    top: top * PT_TO_PX,
    width: width * PT_TO_PX,
    height: height * PT_TO_PX,
    boxSizing: "border-box",
    backgroundColor: style.fill,
    borderTop: b?.top != null ? `${borderPx(b.top)}px solid ${borderColor}` : undefined,
    borderRight: b?.right != null ? `${borderPx(b.right)}px solid ${borderColor}` : undefined,
    borderBottom: b?.bottom != null ? `${borderPx(b.bottom)}px solid ${borderColor}` : undefined,
    borderLeft: b?.left != null ? `${borderPx(b.left)}px solid ${borderColor}` : undefined,
  };
}

/** 文本层样式：字体/对齐/内边距，字号为 cell-layout 给出的建议字号（与 PDF 一致） */
function cellTextStyle(style: TemplateCellStyle, fontSize: number): React.CSSProperties {
  return {
    position: "absolute",
    boxSizing: "border-box",
    color: style.color,
    fontWeight: style.bold ? 700 : undefined,
    fontStyle: style.italic ? "italic" : undefined,
    fontSize: fontSize * PT_TO_PX,
    lineHeight: 1.1,
    textAlign: style.halign ?? "left",
    display: "flex",
    alignItems:
      style.valign === "bottom" ? "flex-end" : style.valign === "middle" ? "center" : "flex-start",
    justifyContent:
      style.halign === "center" ? "center" : style.halign === "right" ? "flex-end" : "flex-start",
    overflow: "hidden",
    padding: "0 3px",
    whiteSpace: style.wrap ? "pre-wrap" : "pre",
  };
}

export interface TemplatePreviewProps {
  grid: TemplateGrid;
  /** 可选：单元格点击（绑定向导用） */
  onCellClick?: (row: number, col: number) => void;
  /** 高亮的单元格（"row:col" 集合，绑定向导用） */
  highlightedCells?: Set<string>;
  selectedCell?: string | null;
  className?: string;
  /** 网格缩放（1 = 原始 pt→px 尺寸） */
  scale?: number;
  /** 显示 Excel 式行号与列标（绑定向导用） */
  showCoordinates?: boolean;
  /** 明细数据区域，用于在绑定时同步标记行与列 */
  lineItemRegion?: { startRow: number; endRow: number; columns: number[] } | null;
  selection?: GridRange | null;
  onSelectionChange?: (range: GridRange) => void;
  onCellDoubleClick?: (row: number, col: number) => void;
  onRowRangeChange?: (startRow: number, endRow: number) => void;
  onColumnPick?: (col: number) => void;
  onResizeRow?: (row: number, height: number) => void;
  onResizeColumn?: (col: number, width: number) => void;
  fieldBadges?: Map<string, string>;
}

export function TemplatePreview({
  grid,
  onCellClick,
  highlightedCells,
  selectedCell,
  className,
  scale = 1,
  showCoordinates = false,
  lineItemRegion,
  selection,
  onSelectionChange,
  onCellDoubleClick,
  onRowRangeChange,
  onColumnPick,
  onResizeRow,
  onResizeColumn,
  fieldBadges,
}: TemplatePreviewProps) {
  const dragRef = React.useRef<
    | { kind: "cells"; row: number; col: number }
    | { kind: "rows"; row: number }
    | null
  >(null);
  const resizeRef = React.useRef<
    | { kind: "row"; index: number; start: number; size: number }
    | { kind: "col"; index: number; start: number; size: number }
    | null
  >(null);
  const clickTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggedRef = React.useRef(false);

  React.useEffect(() => {
    const finish = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };
    const move = (event: PointerEvent) => {
      const resize = resizeRef.current;
      if (!resize) return;
      if (resize.kind === "row") {
        onResizeRow?.(
          resize.index,
          resize.size + (event.clientY - resize.start) / (PT_TO_PX * scale)
        );
      } else {
        onResizeColumn?.(
          resize.index,
          resize.size + (event.clientX - resize.start) / (PT_TO_PX * scale)
        );
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
  }, [onResizeColumn, onResizeRow, scale]);

  React.useEffect(
    () => () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    },
    []
  );
  const colX: number[] = [0];
  for (const w of grid.colWidths) colX.push(colX[colX.length - 1] + w);
  const rowY: number[] = [0];
  for (const h of grid.rowHeights) rowY.push(rowY[rowY.length - 1] + h);
  const totalW = colX[colX.length - 1];
  const totalH = rowY[rowY.length - 1];
  const clickable = !!onCellClick;
  const selectedParts = selectedCell?.split(":").map(Number);
  const selectedRow = selectedParts?.[0];
  const selectedCol = selectedParts?.[1];
  const headerHeight = showCoordinates ? COORDINATE_HEADER_HEIGHT : 0;
  const gutterWidth = showCoordinates ? COORDINATE_GUTTER_WIDTH : 0;
  const selectionLeft = selection ? colX[selection.startCol] * PT_TO_PX : 0;
  const selectionTop = selection ? rowY[selection.startRow] * PT_TO_PX : 0;
  const selectionRight = selection ? colX[selection.endCol + 1] * PT_TO_PX : 0;
  const selectionBottom = selection ? rowY[selection.endRow + 1] * PT_TO_PX : 0;

  /** 与 PDF 渲染器共用的格矩形计算（含合并跨度，钳制在网格范围内） */
  const cellRect = (cell: TemplateGrid["cells"][number]) => {
    const left = colX[cell.col] ?? 0;
    const top = rowY[cell.row] ?? 0;
    const right =
      colX[Math.min(cell.col + cell.colSpan, colX.length - 1)] ??
      left + (grid.colWidths[cell.col] ?? 0);
    const bottom =
      rowY[Math.min(cell.row + cell.rowSpan, rowY.length - 1)] ??
      top + (grid.rowHeights[cell.row] ?? 0);
    return { left, top, width: right - left, height: bottom - top };
  };

  return (
    <div className={cn("overflow-auto rounded-md border bg-white p-3", className)}>
      {/* 外层按缩放后尺寸占位：transform 只缩视觉不缩布局，包一层保证滚动/裁切行为正确 */}
      <div
        className="relative"
        style={{
          width: gutterWidth + totalW * PT_TO_PX * scale,
          height: headerHeight + totalH * PT_TO_PX * scale,
        }}
      >
        {showCoordinates && (
          <>
            <div
              className="absolute left-0 top-0 z-20 flex items-center justify-center border-b border-r bg-slate-100 text-[10px] font-semibold text-slate-500"
              style={{ width: gutterWidth, height: headerHeight }}
              aria-hidden="true"
            >
              行/列
            </div>
            {grid.colWidths.map((width, col) => (
              <div
                key={`col-${col}`}
                className={cn(
                  "absolute top-0 z-10 flex items-center justify-center border-b border-r text-xs font-semibold",
                  selectedCol === col
                    ? "bg-amber-100 text-amber-800"
                    : lineItemRegion?.columns.includes(col)
                      ? "bg-sky-100 text-sky-800"
                      : "bg-slate-100 text-slate-600"
                )}
                style={{
                  left: gutterWidth + colX[col] * PT_TO_PX * scale,
                  width: width * PT_TO_PX * scale,
                  height: headerHeight,
                }}
                title={`第 ${col + 1} 列`}
                role={onColumnPick ? "button" : undefined}
                tabIndex={onColumnPick ? 0 : undefined}
                onClick={() => onColumnPick?.(col)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onColumnPick?.(col);
                }}
              >
                {columnLabel(col)}
                {onResizeColumn ? (
                  <span
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      resizeRef.current = { kind: "col", index: col, start: event.clientX, size: width };
                    }}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            ))}
            {grid.rowHeights.map((height, row) => (
              <div
                key={`row-${row}`}
                className={cn(
                  "absolute left-0 z-10 flex items-center justify-center border-b border-r text-xs font-semibold tabular-nums",
                  selectedRow === row
                    ? "bg-amber-100 text-amber-800"
                    : lineItemRegion && row >= lineItemRegion.startRow && row <= lineItemRegion.endRow
                      ? "bg-sky-100 text-sky-800"
                      : "bg-slate-100 text-slate-600"
                )}
                style={{
                  top: headerHeight + rowY[row] * PT_TO_PX * scale,
                  width: gutterWidth,
                  height: height * PT_TO_PX * scale,
                }}
                role={onRowRangeChange ? "button" : undefined}
                tabIndex={onRowRangeChange ? 0 : undefined}
                onPointerDown={() => {
                  if (!onRowRangeChange) return;
                  dragRef.current = { kind: "rows", row };
                  onRowRangeChange(row, row);
                }}
                onPointerEnter={() => {
                  const drag = dragRef.current;
                  if (drag?.kind === "rows") onRowRangeChange?.(drag.row, row);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onRowRangeChange?.(row, row);
                }}
              >
                {row + 1}
                {onResizeRow ? (
                  <span
                    className="absolute bottom-0 left-0 h-2 w-full cursor-row-resize"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      resizeRef.current = { kind: "row", index: row, start: event.clientY, size: height };
                    }}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            ))}
          </>
        )}
        <div
          style={{
            position: "absolute",
            left: gutterWidth,
            top: headerHeight,
            width: totalW * PT_TO_PX,
            height: totalH * PT_TO_PX,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {/* 背景层 z-0：所有格的填充/边框/高亮（原始矩形） */}
          <div className="absolute inset-0 z-0" style={{ pointerEvents: "none" }} aria-hidden="true">
            {grid.cells.map((cell, i) => {
              const { left, top, width, height } = cellRect(cell);
              const key = `${cell.row}:${cell.col}`;
              const highlighted = highlightedCells?.has(key);
              const selected = selectedCell === key;
              const inLineItemRegion =
                lineItemRegion && cell.row >= lineItemRegion.startRow && cell.row <= lineItemRegion.endRow;
              const isLineItemColumn = lineItemRegion?.columns.includes(cell.col);
              return (
                <div
                  key={`bg-${key}-${i}`}
                  style={cellBackgroundStyle(cell.style, left, top, width, height)}
                  className={cn(
                    inLineItemRegion && "after:pointer-events-none after:absolute after:inset-0 after:bg-sky-400/10",
                    inLineItemRegion && isLineItemColumn && "after:bg-sky-400/20",
                    highlighted && "outline-2 outline-offset-[-2px] outline-sky-500",
                    selected && "outline-2 outline-offset-[-2px] outline-amber-500 ring-2 ring-amber-300"
                  )}
                />
              );
            })}
          </div>
          {/* 文本层 z-10：盒位置/宽度与字号来自 cell-layout（左/右溢出 + 缩字号），与 PDF 一致 */}
          <div className="absolute inset-0 z-10" style={{ pointerEvents: "none" }} aria-hidden="true">
            {grid.cells
              .filter((cell) => cell.text)
              .map((cell, i) => {
                const { top, height } = cellRect(cell);
                const { textBoxLeft, textBoxWidth, fontSize } = layoutCellText(
                  grid,
                  cell,
                  cell.style.fontSize ?? 10
                );
                return (
                  <div
                    key={`tx-${cell.row}:${cell.col}-${i}`}
                    style={{
                      ...cellTextStyle(cell.style, fontSize),
                      left: textBoxLeft * PT_TO_PX,
                      top: top * PT_TO_PX,
                      width: textBoxWidth * PT_TO_PX,
                      height: height * PT_TO_PX,
                    }}
                  >
                    {cell.text}
                  </div>
                );
              })}
          </div>
          {/* 徽标层 z-[15]：锚定原始格矩形，画在溢出文本之上、命中层之下 */}
          {fieldBadges && fieldBadges.size > 0 ? (
            <div className="absolute inset-0 z-[15]" style={{ pointerEvents: "none" }} aria-hidden="true">
              {grid.cells
                .filter((cell) => fieldBadges.get(`${cell.row}:${cell.col}`))
                .map((cell, i) => {
                  const { left, top, width, height } = cellRect(cell);
                  return (
                    <div
                      key={`badge-${cell.row}:${cell.col}-${i}`}
                      className="absolute"
                      style={{
                        left: left * PT_TO_PX,
                        top: top * PT_TO_PX,
                        width: width * PT_TO_PX,
                        height: height * PT_TO_PX,
                      }}
                    >
                      <span className="pointer-events-none absolute right-0 top-0 max-w-full truncate rounded-bl bg-sky-600 px-1 py-0.5 text-[8px] font-medium leading-none text-white">
                        {fieldBadges.get(`${cell.row}:${cell.col}`)}
                      </span>
                    </div>
                  );
                })}
            </div>
          ) : null}
          {(onSelectionChange || onCellClick || onCellDoubleClick) &&
            grid.rowHeights.flatMap((height, row) =>
              grid.colWidths.map((width, col) => (
                <div
                  key={`hit-${row}-${col}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${columnLabel(col)}${row + 1}`}
                  className={cn(
                    "absolute z-20 border border-transparent bg-transparent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-600",
                    clickable && "cursor-pointer"
                  )}
                  style={{
                    left: colX[col] * PT_TO_PX,
                    top: rowY[row] * PT_TO_PX,
                    width: width * PT_TO_PX,
                    height: height * PT_TO_PX,
                  }}
                  onPointerDown={() => {
                    draggedRef.current = false;
                    dragRef.current = { kind: "cells", row, col };
                    onSelectionChange?.({ startRow: row, endRow: row, startCol: col, endCol: col });
                  }}
                  onPointerEnter={() => {
                    const drag = dragRef.current;
                    if (drag?.kind !== "cells") return;
                    if (drag.row !== row || drag.col !== col) draggedRef.current = true;
                    onSelectionChange?.({
                      startRow: Math.min(drag.row, row),
                      endRow: Math.max(drag.row, row),
                      startCol: Math.min(drag.col, col),
                      endCol: Math.max(drag.col, col),
                    });
                  }}
                  onClick={() => {
                    if (draggedRef.current) return;
                    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
                    clickTimerRef.current = setTimeout(() => {
                      onCellClick?.(row, col);
                      clickTimerRef.current = null;
                    }, 220);
                  }}
                  onDoubleClick={() => {
                    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
                    clickTimerRef.current = null;
                    onCellDoubleClick?.(row, col);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      onSelectionChange?.({ startRow: row, endRow: row, startCol: col, endCol: col });
                      onCellClick?.(row, col);
                    }
                  }}
                />
              ))
            )}
          {selection ? (
            <div
              className="pointer-events-none absolute z-30 border-2 border-amber-500 bg-amber-300/10"
              style={{
                left: selectionLeft,
                top: selectionTop,
                width: selectionRight - selectionLeft,
                height: selectionBottom - selectionTop,
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
