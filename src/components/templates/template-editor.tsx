"use client";

import React from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Minus,
  Merge,
  Plus,
  Rows3,
  SplitSquareHorizontal,
  WrapText,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { TemplatePreview } from "@/components/templates/template-preview";
import {
  deleteColumn,
  deleteRow,
  findAnchorAt,
  insertColumn,
  insertRow,
  mergeRange,
  patchCellStyle,
  resizeColumn,
  resizeRow,
  setCellText,
  unmergeAt,
  type GridRange,
} from "@/lib/templates/template-grid";
import type { TemplateBinding, TemplateGrid } from "@/lib/templates/types";

interface TemplateEditorProps {
  grid: TemplateGrid;
  binding: TemplateBinding;
  onChange: (grid: TemplateGrid, binding?: TemplateBinding) => void;
  onCellActivate?: (row: number, col: number) => void;
  onRowRangeChange?: (startRow: number, endRow: number) => void;
  onColumnPick?: (col: number) => void;
  lineItemRegion?: { startRow: number; endRow: number; columns: number[] } | null;
  fieldBadges?: Map<string, string>;
  selectedCell?: string | null;
}

function cellAddress(row: number, col: number): string {
  let value = col + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return `${label}${row + 1}`;
}

export function TemplateEditor({
  grid,
  binding,
  onChange,
  onCellActivate,
  onRowRangeChange,
  onColumnPick,
  lineItemRegion,
  fieldBadges,
  selectedCell,
}: TemplateEditorProps) {
  const [selection, setSelection] = React.useState<GridRange>({
    startRow: 0,
    endRow: 0,
    startCol: 0,
    endCol: 0,
  });
  const [editingCell, setEditingCell] = React.useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = React.useState("");

  const selectedAnchor = findAnchorAt(grid, selection.startRow, selection.startCol);
  const selectedStyle = selectedAnchor?.style ?? {};

  const patchStyle = (patch: Parameters<typeof patchCellStyle>[2]) => {
    onChange(patchCellStyle(grid, selection, patch));
  };

  const startEditing = (row: number, col: number) => {
    const anchor = findAnchorAt(grid, row, col);
    const target = anchor ?? { row, col, text: "" };
    setEditingCell({ row: target.row, col: target.col });
    setEditValue(target.text);
  };

  const commitEdit = () => {
    if (!editingCell) return;
    onChange(setCellText(grid, editingCell.row, editingCell.col, editValue));
    setEditingCell(null);
  };

  const handleMerge = () => {
    const result = mergeRange(grid, binding, selection);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    onChange(result.grid, result.binding);
  };

  const handleUnmerge = () => {
    const next = unmergeAt(grid, selection.startRow, selection.startCol);
    if (next === grid) {
      toast.info("当前单元格不是合并单元格");
      return;
    }
    onChange(next);
  };

  const applyStructureChange = (
    operation: (grid: TemplateGrid, binding: TemplateBinding, index: number) => {
      grid: TemplateGrid;
      binding: TemplateBinding;
      error?: string;
    },
    index: number,
    kind: "row" | "col",
    deleting = false
  ) => {
    const result = operation(grid, binding, index);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    onChange(result.grid, result.binding);
    if (deleting) {
      setSelection((current) => {
        const maxRow = result.grid.rowHeights.length - 1;
        const maxCol = result.grid.colWidths.length - 1;
        return {
          startRow: Math.min(current.startRow, maxRow),
          endRow: Math.min(current.endRow, maxRow),
          startCol: Math.min(current.startCol, maxCol),
          endCol: Math.min(current.endCol, maxCol),
        };
      });
    } else if (kind === "row") {
      setSelection((current) => ({ ...current, startRow: index, endRow: index }));
    } else {
      setSelection((current) => ({ ...current, startCol: index, endCol: index }));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-2" role="toolbar" aria-label="单元格格式">
        <span className="mr-1 min-w-14 rounded border bg-background px-2 py-1 text-center font-mono text-xs font-semibold">
          {cellAddress(selection.startRow, selection.startCol)}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => applyStructureChange(insertRow, selection.startRow, "row")}>
          <Plus className="mr-1 size-3.5" />上方插行
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => applyStructureChange(deleteRow, selection.startRow, "row", true)}>
          <Minus className="mr-1 size-3.5" />删除行
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => applyStructureChange(insertColumn, selection.startCol, "col")}>
          <Plus className="mr-1 size-3.5" />左侧插列
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => applyStructureChange(deleteColumn, selection.startCol, "col", true)}>
          <Minus className="mr-1 size-3.5" />删除列
        </Button>
        <select
          className="h-8 rounded-md border bg-background px-2 text-xs"
          aria-label="字号"
          value={selectedStyle.fontSize ?? 10}
          onChange={(event) => patchStyle({ fontSize: Number(event.target.value) })}
        >
          {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24].map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
        <Button
          type="button"
          size="icon"
          variant={selectedStyle.bold ? "secondary" : "ghost"}
          className="size-8"
          aria-label="粗体"
          onClick={() => patchStyle({ bold: !selectedStyle.bold })}
        >
          <Bold className="size-4" />
        </Button>
        {([
          ["left", AlignLeft, "左对齐"],
          ["center", AlignCenter, "居中"],
          ["right", AlignRight, "右对齐"],
        ] as const).map(([value, Icon, label]) => (
          <Button
            key={value}
            type="button"
            size="icon"
            variant={selectedStyle.halign === value ? "secondary" : "ghost"}
            className="size-8"
            aria-label={label}
            onClick={() => patchStyle({ halign: value })}
          >
            <Icon className="size-4" />
          </Button>
        ))}
        <select
          className="h-8 rounded-md border bg-background px-2 text-xs"
          aria-label="垂直对齐"
          value={selectedStyle.valign ?? "top"}
          onChange={(event) => patchStyle({ valign: event.target.value as "top" | "middle" | "bottom" })}
        >
          <option value="top">顶部</option>
          <option value="middle">垂直居中</option>
          <option value="bottom">底部</option>
        </select>
        <Button
          type="button"
          size="icon"
          variant={selectedStyle.wrap ? "secondary" : "ghost"}
          className="size-8"
          aria-label="自动换行"
          onClick={() => patchStyle({ wrap: !selectedStyle.wrap })}
        >
          <WrapText className="size-4" />
        </Button>
        <label className="flex h-8 items-center gap-1 rounded-md px-2 text-xs hover:bg-muted">
          文字
          <input
            type="color"
            className="size-5 cursor-pointer border-0 bg-transparent p-0"
            value={selectedStyle.color ?? "#000000"}
            onChange={(event) => patchStyle({ color: event.target.value })}
          />
        </label>
        <label className="flex h-8 items-center gap-1 rounded-md px-2 text-xs hover:bg-muted">
          填充
          <input
            type="color"
            className="size-5 cursor-pointer border-0 bg-transparent p-0"
            value={selectedStyle.fill ?? "#ffffff"}
            onChange={(event) => patchStyle({ fill: event.target.value })}
          />
        </label>
        <Button type="button" variant="ghost" size="sm" onClick={() => patchStyle({ borders: { top: 1, right: 1, bottom: 1, left: 1, color: "#000000" } })}>
          <Rows3 className="mr-1 size-4" />全部边框
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleMerge}>
          <Merge className="mr-1 size-4" />合并
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleUnmerge}>
          <SplitSquareHorizontal className="mr-1 size-4" />取消合并
        </Button>
      </div>

      {editingCell ? (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2">
          <span className="w-12 text-center font-mono text-xs font-semibold text-amber-900">
            {cellAddress(editingCell.row, editingCell.col)}
          </span>
          <input
            autoFocus
            className="h-8 min-w-0 flex-1 rounded border bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
            value={editValue}
            onChange={(event) => setEditValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitEdit();
              if (event.key === "Escape") setEditingCell(null);
            }}
            onBlur={commitEdit}
            aria-label="编辑单元格文字"
          />
          <span className="text-xs text-amber-800">Enter 保存 · Esc 取消</span>
        </div>
      ) : null}

      <TemplatePreview
        grid={grid}
        showCoordinates
        scale={0.75}
        selection={selection}
        onSelectionChange={setSelection}
        onCellClick={(row, col) => {
          const anchor = findAnchorAt(grid, row, col);
          onCellActivate?.(anchor?.row ?? row, anchor?.col ?? col);
        }}
        onCellDoubleClick={startEditing}
        onRowRangeChange={onRowRangeChange}
        onColumnPick={onColumnPick}
        onResizeRow={(row, height) => onChange(resizeRow(grid, row, height))}
        onResizeColumn={(col, width) => onChange(resizeColumn(grid, col, width))}
        selectedCell={selectedCell}
        lineItemRegion={lineItemRegion}
        fieldBadges={fieldBadges}
      />
    </div>
  );
}
