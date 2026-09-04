"use client";

/**
 * 账单模版编辑页客户端（仅 admin）
 * 从列表页迁出的整页版绑定向导：可编辑名称（任何状态）、
 * 草稿可编辑网格与绑定 → 试打 → 发布；非草稿只读 + 复制为草稿
 */

import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Loader2, Megaphone, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TemplateEditor } from "@/components/templates/template-editor";
import { TemplatePreview } from "@/components/templates/template-preview";
import { fetchJson, getApiErrorMessage } from "@/lib/api/client";
import { loadIntoPdfWindow, reservePdfWindow } from "@/lib/utils/open-pdf";
import { findAnchorAt, patchCellStyle } from "@/lib/templates/template-grid";
import { renderTemplateData, sampleTemplateRenderData } from "@/lib/templates/render-template-data";
import {
  TEMPLATE_FIELDS,
  type TemplateBinding,
  type TemplateFieldKey,
  type TemplateGrid,
  type TemplatePageConfig,
} from "@/lib/templates/types";

const LIST_URL = "/dashboard/templates";

interface TemplateDetail {
  id: string;
  name: string;
  status: "draft" | "active" | "archived";
  page_config: TemplatePageConfig;
  grid_config: TemplateGrid;
  binding_config: TemplateBinding;
  company: { id: string; code: string; name: string };
}

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  active: "启用中",
  archived: "已归档",
};

const LINE_ROLES = [
  { key: "description", label: "Description", required: true },
  { key: "quantity", label: "Qty", required: false },
  { key: "unitPrice", label: "Rate", required: false },
  { key: "amount", label: "Amount / Total", required: true },
] as const;

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

function draftStorageKey(id: string) {
  return `invoice-template-unsaved:${id}`;
}

export function TemplateEditorClient({ id }: { id: string }) {
  const router = useRouter();
  const [detail, setDetail] = React.useState<TemplateDetail | null>(null);
  const [loadError, setLoadError] = React.useState("");
  const [name, setName] = React.useState("");
  const [binding, setBinding] = React.useState<TemplateBinding>({ fields: {}, lineItems: null });
  const [grid, setGrid] = React.useState<TemplateGrid | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [bindField, setBindField] = React.useState<string>("__none__");
  const [addBindingPosition, setAddBindingPosition] = React.useState(false);
  const [activeLineRole, setActiveLineRole] = React.useState<(typeof LINE_ROLES)[number]["key"] | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [duplicating, setDuplicating] = React.useState(false);
  const [showSample, setShowSample] = React.useState(false);
  const [savedSnapshot, setSavedSnapshot] = React.useState("");

  const currentSnapshot = React.useMemo(
    () => JSON.stringify({ name, grid, binding }),
    [name, grid, binding]
  );
  const isDirty = Boolean(detail && savedSnapshot && currentSnapshot !== savedSnapshot);

  // 初始加载（含本地草稿恢复）
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const d = await fetchJson<TemplateDetail>(`/api/admin/invoice-templates/${id}`);
        if (cancelled) return;
        const nextBinding = d.binding_config ?? { fields: {}, lineItems: null };
        const baseSnapshot = JSON.stringify({ name: d.name, grid: d.grid_config, binding: nextBinding });
        let nextGrid = d.grid_config;
        let restoredBinding = nextBinding;
        let restoredName = d.name;
        const stored = sessionStorage.getItem(draftStorageKey(id));
        if (stored) {
          try {
            const recovery = JSON.parse(stored) as {
              baseSnapshot: string;
              name: string;
              grid: TemplateGrid;
              binding: TemplateBinding;
            };
            if (
              recovery.baseSnapshot === baseSnapshot &&
              window.confirm("检测到这个模版有未保存的本地修改，是否恢复？")
            ) {
              nextGrid = recovery.grid;
              restoredBinding = recovery.binding;
              restoredName = recovery.name;
              toast.success("已恢复未保存的模版修改");
            } else {
              sessionStorage.removeItem(draftStorageKey(id));
            }
          } catch {
            sessionStorage.removeItem(draftStorageKey(id));
          }
        }
        setDetail(d);
        setName(restoredName);
        setBinding(restoredBinding);
        setGrid(nextGrid);
        setSavedSnapshot(baseSnapshot);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "加载模版失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  // 侧栏等站内链接跳转前的未保存保护
  React.useEffect(() => {
    if (!isDirty) return;
    const navigation = (window as Window & {
      navigation?: {
        addEventListener: (type: "navigate", listener: (event: Event & { destination?: { url?: string } }) => void) => void;
        removeEventListener: (type: "navigate", listener: (event: Event & { destination?: { url?: string } }) => void) => void;
      };
    }).navigation;
    if (navigation) {
      const protectNavigation = (event: Event & { destination?: { url?: string } }) => {
        if (event.destination?.url === window.location.href) return;
        if (!window.confirm("当前模版有未保存修改，确定离开吗？")) event.preventDefault();
      };
      navigation.addEventListener("navigate", protectNavigation);
      return () => navigation.removeEventListener("navigate", protectNavigation);
    }
    const protectNavigation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!target || !(target instanceof HTMLAnchorElement)) return;
      if (target.target === "_blank" || target.href === window.location.href) return;
      if (!window.confirm("当前模版有未保存修改，确定离开吗？")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", protectNavigation, true);
    return () => document.removeEventListener("click", protectNavigation, true);
  }, [isDirty]);

  React.useEffect(() => {
    if (!isDirty || !detail || !grid) return;
    sessionStorage.setItem(
      draftStorageKey(detail.id),
      JSON.stringify({ baseSnapshot: savedSnapshot, name, grid, binding })
    );
  }, [binding, detail, grid, isDirty, name, savedSnapshot]);

  const save = async (): Promise<boolean> => {
    if (!detail) return false;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("模版名称不能为空");
      return false;
    }
    setSaving(true);
    try {
      // 非草稿仅允许改名；草稿连同网格与绑定一起保存
      const body =
        detail.status === "draft" && grid
          ? { name: trimmed, grid_config: grid, binding_config: binding }
          : { name: trimmed };
      await fetchJson(`/api/admin/invoice-templates/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setName(trimmed);
      setSavedSnapshot(
        JSON.stringify({
          name: trimmed,
          grid: detail.status === "draft" && grid ? grid : detail.grid_config,
          binding: detail.status === "draft" ? binding : detail.binding_config,
        })
      );
      sessionStorage.removeItem(draftStorageKey(detail.id));
      setDetail((current) =>
        current
          ? {
              ...current,
              name: trimmed,
              ...(detail.status === "draft" && grid
                ? { grid_config: grid, binding_config: binding }
                : {}),
            }
          : current
      );
      toast.success(detail.status === "draft" ? "模版已保存" : "模版名称已保存");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const previewPdf = async () => {
    if (!detail) return;
    // 点击瞬间同步保留弹窗，之后的 await 不会再被拦截
    const popup = reservePdfWindow();
    if (!popup) {
      toast.error("浏览器拦截了弹窗，请允许本站弹出窗口后重试");
      return;
    }
    if (detail.status === "draft") {
      const ok = await save();
      if (!ok) {
        popup.close();
        return;
      }
    }
    setPreviewing(true);
    try {
      await loadIntoPdfWindow(popup, async () => {
        const res = await fetch(`/api/admin/invoice-templates/${detail.id}/preview-pdf`, {
          method: "POST",
        });
        if (!res.ok) throw new Error(await getApiErrorMessage(res, "生成预览失败"));
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return url;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成预览失败");
    } finally {
      setPreviewing(false);
    }
  };

  const publish = async () => {
    if (!detail) return;
    const ok = await save();
    if (!ok) return;
    setPublishing(true);
    try {
      await fetchJson(`/api/admin/invoice-templates/${detail.id}/publish`, { method: "POST" });
      toast.success(`模版已发布启用：${detail.company.name} 之后的发票 PDF 将使用该模版`);
      sessionStorage.removeItem(draftStorageKey(detail.id));
      router.push(LIST_URL);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发布失败");
    } finally {
      setPublishing(false);
    }
  };

  const duplicate = async () => {
    if (!detail) return;
    if (isDirty && !window.confirm("当前模版有未保存修改（如改名），复制将不包含这些修改，确定继续吗？")) {
      return;
    }
    setDuplicating(true);
    try {
      const copy = await fetchJson<{ id: string }>(`/api/admin/invoice-templates/${detail.id}/duplicate`, {
        method: "POST",
      });
      toast.success("已复制为新草稿，可安全编辑后再发布");
      sessionStorage.removeItem(draftStorageKey(detail.id));
      router.replace(`/dashboard/templates/${copy.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "复制模版失败");
    } finally {
      setDuplicating(false);
    }
  };

  const goBack = () => {
    if (isDirty && !window.confirm("当前模版有未保存修改，确定离开吗？")) return;
    if (detail) sessionStorage.removeItem(draftStorageKey(detail.id));
    router.push(LIST_URL);
  };

  const bindCell = (row: number, col: number) => {
    setSelected(`${row}:${col}`);
    if (activeLineRole) {
      const lines = binding.lineItems ?? { startRow: row, endRow: row, columns: {}, minRows: 10 };
      setGrid((current) => {
        if (!current) return current;
        let next = current;
        for (let lineRow = lines.startRow; lineRow <= lines.endRow; lineRow += 1) {
          if (findAnchorAt(next, lineRow, col)) continue;
          next = patchCellStyle(
            next,
            { startRow: lineRow, endRow: lineRow, startCol: col, endCol: col },
            { fontSize: detail?.page_config.baseFontSize ?? 10 }
          );
        }
        return next;
      });
      setBinding((current) => {
        const lineItems = current.lineItems ?? { startRow: row, endRow: row, columns: {}, minRows: 10 };
        return { ...current, lineItems: { ...lineItems, columns: { ...lineItems.columns, [activeLineRole]: col } } };
      });
      toast.success(`${LINE_ROLES.find((role) => role.key === activeLineRole)?.label} 已绑定到 ${columnLabel(col)} 列`);
      setActiveLineRole(null);
      return;
    }
    if (bindField === "__none__") return;
    const fieldDef = TEMPLATE_FIELDS.find((f) => f.key === bindField);
    if (!fieldDef) return;
    setGrid((current) => {
      if (!current || findAnchorAt(current, row, col)) return current;
      return patchCellStyle(
        current,
        { startRow: row, endRow: row, startCol: col, endCol: col },
        { fontSize: detail?.page_config.baseFontSize ?? 10 }
      );
    });
    setBinding((b) => {
      const fields = { ...b.fields };
      for (const field of TEMPLATE_FIELDS) {
        if (field.key === bindField) continue;
        const config = fields[field.key];
        if (!config) continue;
        const cells = config.cells.filter((cell) => cell.row !== row || cell.col !== col);
        if (cells.length === 0) delete fields[field.key];
        else fields[field.key] = { ...config, cells };
      }
      const existing = fields[bindField as TemplateFieldKey]
      const existingCells = addBindingPosition ? (existing?.cells ?? []) : []
      const alreadyBound = existingCells.some((c) => c.row === row && c.col === col)
      return {
        ...b,
        fields: {
          ...fields,
          [bindField as TemplateFieldKey]: {
            cells: alreadyBound ? existingCells : [...existingCells, { row, col }],
            format: fieldDef.format,
          },
        },
      }
    });
    toast.success(`已绑定 ${fieldDef.label} → ${columnLabel(col)}${row + 1}`);
    setAddBindingPosition(false);
    const currentIndex = TEMPLATE_FIELDS.findIndex((field) => field.key === bindField);
    const next = TEMPLATE_FIELDS.slice(currentIndex + 1).find((field) => !binding.fields[field.key]);
    setBindField(next?.key ?? "__none__");
  };

  const unbindField = (key: TemplateFieldKey) => {
    setBinding((b) => {
      const fields = { ...b.fields };
      delete fields[key];
      return { ...b, fields };
    });
  };

  const highlightedCells = new Set(
    Object.values(binding.fields).flatMap((fb) =>
      (fb?.cells ?? []).map((c) => `${c.row}:${c.col}`)
    )
  );

  const renderedGrid = grid
    ? renderTemplateData(grid, binding, sampleTemplateRenderData())
    : null;
  const selectedPosition = selected?.split(":").map(Number);
  const selectedRow = selectedPosition?.[0];
  const selectedCol = selectedPosition?.[1];
  const lineItemColumns = binding.lineItems
    ? Object.values(binding.lineItems.columns).filter((col): col is number => col != null)
    : [];

  const fieldBadges = React.useMemo(() => {
    const badges = new Map<string, string>();
    for (const field of TEMPLATE_FIELDS) {
      for (const cell of binding.fields[field.key]?.cells ?? []) {
        const key = `${cell.row}:${cell.col}`;
        const current = badges.get(key);
        badges.set(key, current ? `${current}、${field.label}` : field.label);
      }
    }
    return badges;
  }, [binding.fields]);

  if (loadError) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => router.push(LIST_URL)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回列表
        </Button>
        <p className="text-sm text-destructive">{loadError}</p>
      </div>
    );
  }

  if (!detail || !grid) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 头部：返回 + 名称编辑 + 状态 + 操作 */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" title="返回列表" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setName((v) => v.trim())}
          maxLength={100}
          aria-label="模版名称"
          className="h-9 w-72 max-w-full text-base font-semibold"
        />
        <span className="text-sm text-muted-foreground">
          {detail.company.name}（{detail.company.code}）· {STATUS_LABEL[detail.status]}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isDirty ? <span className="text-xs font-medium text-amber-700">有未保存修改</span> : null}
          {detail.status === "draft" ? (
            <>
              <Button variant="outline" size="sm" onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Save className="mr-1 size-3.5" />}
                保存模版
              </Button>
              <Button variant="outline" size="sm" onClick={() => void previewPdf()} disabled={previewing}>
                {previewing ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                试打 PDF
              </Button>
              <Button size="sm" onClick={() => void publish()} disabled={publishing}>
                {publishing ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Megaphone className="mr-1 size-3.5" />}
                发布启用
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => void save()} disabled={saving || !isDirty}>
                {saving ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Save className="mr-1 size-3.5" />}
                保存名称
              </Button>
              <Button variant="outline" size="sm" onClick={() => void previewPdf()} disabled={previewing}>
                {previewing ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                试打 PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => void duplicate()} disabled={duplicating}>
                {duplicating ? (
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                ) : (
                  <Copy className="mr-1 size-3.5" />
                )}
                复制为草稿
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 主体：左侧样张网格，右侧绑定面板（sticky） */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-lg border bg-card p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">
              {showSample ? "示例数据渲染效果" : "样张网格"}
            </span>
            <div className="flex items-center gap-3">
              {detail.status === "draft" ? (
                <p className="hidden text-xs text-muted-foreground md:block">
                  双击单元格编辑内容；先在右侧选择字段，再点击目标单元格完成绑定
                </p>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => setShowSample((v) => !v)}>
                {showSample ? "查看原始样张" : "查看示例数据效果"}
              </Button>
            </div>
          </div>
          <div className="max-h-[calc(100dvh-15rem)] overflow-auto">
            {detail.status === "draft" && !showSample ? (
              <TemplateEditor
                key={detail.id}
                grid={grid}
                binding={binding}
                onChange={(nextGrid, nextBinding) => {
                  setGrid(nextGrid);
                  if (nextBinding) setBinding(nextBinding);
                }}
                onCellActivate={bindCell}
                onRowRangeChange={(a, b) => {
                  const startRow = Math.min(a, b);
                  const endRow = Math.max(a, b);
                  setBinding((current) => ({
                    ...current,
                    lineItems: {
                      ...(current.lineItems ?? { columns: {}, minRows: 10 }),
                      startRow,
                      endRow,
                    },
                  }));
                }}
                onColumnPick={(col) => {
                  if (!activeLineRole) return;
                  bindCell(binding.lineItems?.startRow ?? 0, col);
                }}
                lineItemRegion={
                  binding.lineItems
                    ? {
                        startRow: binding.lineItems.startRow,
                        endRow: binding.lineItems.endRow,
                        columns: lineItemColumns,
                      }
                    : null
                }
                fieldBadges={fieldBadges}
                selectedCell={selected}
              />
            ) : (
              <TemplatePreview
                grid={showSample && renderedGrid ? renderedGrid : grid}
                scale={0.75}
                showCoordinates={!showSample}
                highlightedCells={showSample ? undefined : highlightedCells}
                lineItemRegion={
                  !showSample && binding.lineItems
                    ? {
                        startRow: binding.lineItems.startRow,
                        endRow: binding.lineItems.endRow,
                        columns: lineItemColumns,
                      }
                    : null
                }
              />
            )}
          </div>
        </div>

        {detail.status === "draft" ? (
          <div className="space-y-4 pb-4 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:overflow-auto">
            <div className="rounded-md border p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">字段绑定</p>
                  <p className="mt-1 text-xs text-muted-foreground">选择字段，再点左侧目标格</p>
                </div>
                {bindField !== "__none__" ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setBindField("__none__")}>取消选择</Button>
                ) : null}
              </div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">未绑定</p>
              <div className="grid gap-1.5">
                {TEMPLATE_FIELDS.filter((field) => !binding.fields[field.key]).map((field) => (
                  <button
                    key={field.key}
                    type="button"
                    className={`min-h-9 rounded-md border px-2 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${bindField === field.key ? "border-sky-500 bg-sky-50 text-sky-900" : "bg-background hover:bg-muted"}`}
                    onClick={() => {
                      setActiveLineRole(null);
                      setAddBindingPosition(false);
                      setBindField(field.key);
                    }}
                  >
                    {field.label}
                  </button>
                ))}
                {TEMPLATE_FIELDS.every((field) => binding.fields[field.key]) ? (
                  <p className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-700">所有普通字段均已绑定</p>
                ) : null}
              </div>
              <p className="mb-2 mt-4 text-xs font-medium text-muted-foreground">已绑定</p>
              <div className="space-y-2">
                {TEMPLATE_FIELDS.filter((field) => binding.fields[field.key]).map((field) => {
                  const config = binding.fields[field.key]!;
                  return (
                    <div key={field.key} className="rounded-md border bg-muted/20 p-2 text-xs">
                      <div className="font-medium">{field.label}</div>
                      <div className="mt-1 font-mono text-sky-700">
                        {config.cells.map((cell) => `${columnLabel(cell.col)}${cell.row + 1}`).join("、")}
                      </div>
                      <div className="mt-2 flex gap-1">
                        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelected(`${config.cells[0].row}:${config.cells[0].col}`)}>定位</Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setActiveLineRole(null);
                            setAddBindingPosition(true);
                            setBindField(field.key);
                          }}
                        >
                          添加位置
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => unbindField(field.key)}>解绑</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-md border border-sky-200 bg-sky-50/30 p-3">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">明细数据绑定</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    拖动左侧行号选择范围；选择一个列角色，再点击目标列或其中任意单元格。
                  </p>
                </div>
                {binding.lineItems && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => setBinding((b) => ({ ...b, lineItems: null }))}
                  >
                    清除明细绑定
                  </Button>
                )}
              </div>
              <div className="mb-3 rounded-md border bg-background p-2 text-xs">
                {selectedRow != null && selectedCol != null ? (
                  <span>
                    已选：<span className="font-semibold text-amber-700">{columnLabel(selectedCol)}{selectedRow + 1}</span>
                    <span className="ml-2 text-muted-foreground">（第 {selectedRow + 1} 行、第 {selectedCol + 1} 列）</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">请先点击左侧样张中的一个单元格</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">起始行（1 起）</Label>
                  <Input
                    type="number"
                    min={1}
                    value={binding.lineItems ? binding.lineItems.startRow + 1 : ""}
                    onChange={(e) => {
                      const v = Number(e.target.value) - 1;
                      if (!Number.isFinite(v) || v < 0) return;
                      setBinding((b) => {
                        const li =
                          b.lineItems ??
                          { startRow: v, endRow: v, columns: {}, minRows: 10 };
                        return {
                          ...b,
                          lineItems: { ...li, startRow: v, endRow: Math.max(li.endRow, v) },
                        };
                      });
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">结束行（1 起）</Label>
                  <Input
                    type="number"
                    min={1}
                    value={binding.lineItems ? binding.lineItems.endRow + 1 : ""}
                    onChange={(e) => {
                      const v = Number(e.target.value) - 1;
                      if (!Number.isFinite(v) || v < 0) return;
                      setBinding((b) => {
                        const li =
                          b.lineItems ??
                          { startRow: v, endRow: v, columns: {}, minRows: 10 };
                        return {
                          ...b,
                          lineItems: { ...li, endRow: v, startRow: Math.min(li.startRow, v) },
                        };
                      });
                    }}
                  />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={selectedRow == null}
                  onClick={() => {
                    if (selectedRow == null) return;
                    setBinding((b) => {
                      const li = b.lineItems ?? { startRow: selectedRow, endRow: selectedRow, columns: {}, minRows: 10 };
                      return { ...b, lineItems: { ...li, startRow: selectedRow, endRow: Math.max(li.endRow, selectedRow) } };
                    });
                  }}
                >
                  选中行设为起始
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={selectedRow == null}
                  onClick={() => {
                    if (selectedRow == null) return;
                    setBinding((b) => {
                      const li = b.lineItems ?? { startRow: selectedRow, endRow: selectedRow, columns: {}, minRows: 10 };
                      return { ...b, lineItems: { ...li, endRow: selectedRow, startRow: Math.min(li.startRow, selectedRow) } };
                    });
                  }}
                >
                  选中行设为结束
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {LINE_ROLES.map((role) => (
                  <button
                    key={role.key}
                    type="button"
                    className={`min-h-12 rounded-md border px-2 text-left text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${activeLineRole === role.key ? "border-sky-500 bg-sky-100 text-sky-900" : "bg-background hover:bg-muted"}`}
                    onClick={() => {
                      setBindField("__none__");
                      setActiveLineRole(role.key);
                    }}
                  >
                    <span className="block font-medium">
                      {role.label}{role.required ? <span className="ml-1 text-destructive">*</span> : null}
                    </span>
                    <span className="mt-0.5 block text-muted-foreground">
                      {binding.lineItems?.columns[role.key] != null
                        ? `已绑定 ${columnLabel(binding.lineItems.columns[role.key]!)} 列`
                        : "点击后选择列"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-2">
                <Label className="text-xs">最少行数（不足补空行）</Label>
                <Input
                  type="number"
                  min={1}
                  value={binding.lineItems?.minRows ?? ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v) || v < 1) return;
                    setBinding((b) => {
                      const li =
                        b.lineItems ??
                        { startRow: selectedRow ?? 0, endRow: selectedRow ?? 0, columns: {}, minRows: v };
                      return { ...b, lineItems: { ...li, minRows: v } };
                    });
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground xl:sticky xl:top-24">
            该模版为「{STATUS_LABEL[detail.status]}」状态，仅草稿可编辑网格与绑定。
            <br />
            名称可随时修改；复制为草稿后可修改全部内容，发布时再安全替换当前版本。
          </div>
        )}
      </div>
    </div>
  );
}
