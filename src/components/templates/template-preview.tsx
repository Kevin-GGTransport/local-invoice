import React from "react";

import type { TemplateCellStyle, TemplateGrid } from "@/lib/templates/types";
import { cn } from "@/lib/utils";

/**
 * 账单模版 HTML 预览：绝对定位还原网格（pt → px × 96/72），
 * 与 PDF 渲染器消费同一 TemplateGrid，视觉效果保持一致。
 */
const PT_TO_PX = 96 / 72;

function borderPx(pt: number | undefined): number | undefined {
  return pt == null ? undefined : Math.max(1, Math.round(pt * PT_TO_PX * 10) / 10);
}

function cellBoxStyle(
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
    color: style.color,
    fontWeight: style.bold ? 700 : undefined,
    fontStyle: style.italic ? "italic" : undefined,
    fontSize: (style.fontSize ?? 10) * PT_TO_PX,
    lineHeight: 1.1,
    textAlign: style.halign ?? "left",
    display: "flex",
    alignItems:
      style.valign === "bottom" ? "flex-end" : style.valign === "middle" ? "center" : "flex-start",
    justifyContent:
      style.halign === "center" ? "center" : style.halign === "right" ? "flex-end" : "flex-start",
    borderTop: b?.top != null ? `${borderPx(b.top)}px solid ${borderColor}` : undefined,
    borderRight: b?.right != null ? `${borderPx(b.right)}px solid ${borderColor}` : undefined,
    borderBottom: b?.bottom != null ? `${borderPx(b.bottom)}px solid ${borderColor}` : undefined,
    borderLeft: b?.left != null ? `${borderPx(b.left)}px solid ${borderColor}` : undefined,
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
}

export function TemplatePreview({
  grid,
  onCellClick,
  highlightedCells,
  selectedCell,
  className,
  scale = 1,
}: TemplatePreviewProps) {
  const colX: number[] = [0];
  for (const w of grid.colWidths) colX.push(colX[colX.length - 1] + w);
  const rowY: number[] = [0];
  for (const h of grid.rowHeights) rowY.push(rowY[rowY.length - 1] + h);
  const totalW = colX[colX.length - 1];
  const totalH = rowY[rowY.length - 1];

  return (
    <div className={cn("overflow-auto rounded-md border bg-white p-3", className)}>
      {/* 外层按缩放后尺寸占位：transform 只缩视觉不缩布局，包一层保证滚动/裁切行为正确 */}
      <div style={{ width: totalW * PT_TO_PX * scale, height: totalH * PT_TO_PX * scale }}>
      <div
        style={{
          position: "relative",
          width: totalW * PT_TO_PX,
          height: totalH * PT_TO_PX,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {grid.cells.map((cell, i) => {
          const left = colX[cell.col] ?? 0;
          const top = rowY[cell.row] ?? 0;
          const right =
            colX[Math.min(cell.col + cell.colSpan, colX.length - 1)] ??
            left + (grid.colWidths[cell.col] ?? 0);
          const bottom =
            rowY[Math.min(cell.row + cell.rowSpan, rowY.length - 1)] ??
            top + (grid.rowHeights[cell.row] ?? 0);
          const key = `${cell.row}:${cell.col}`;
          const clickable = !!onCellClick;
          const highlighted = highlightedCells?.has(key);
          const selected = selectedCell === key;
          return (
            <div
              key={`${key}-${i}`}
              style={cellBoxStyle(cell.style, left, top, right - left, bottom - top)}
              onClick={clickable ? () => onCellClick?.(cell.row, cell.col) : undefined}
              className={cn(
                clickable && "cursor-pointer hover:z-10 hover:bg-sky-50/80",
                highlighted && "outline-2 outline-offset-[-2px] outline-sky-500",
                selected && "outline-2 outline-offset-[-2px] outline-amber-500 ring-2 ring-amber-300"
              )}
            >
              {cell.text || "\u00A0"}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
