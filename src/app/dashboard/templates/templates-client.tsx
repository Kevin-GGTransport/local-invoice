"use client";

/**
 * 账单模版管理（仅 admin）
 * 流程：上传 .xlsx 样张 → 网格预览上点选单元格绑定业务字段 →
 * 框定明细行区域并指定列角色 → 示例数据试打 → 校验通过后发布启用
 */

import React from "react";
import { Eye, FileUp, Loader2, Megaphone, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchJson, getApiErrorMessage } from "@/lib/api/client";
import { TemplatePreview } from "@/components/templates/template-preview";
import { renderTemplateData, sampleTemplateRenderData } from "@/lib/templates/render-template-data";
import {
  TEMPLATE_FIELDS,
  type TemplateBinding,
  type TemplateFieldKey,
  type TemplateGrid,
  type TemplatePageConfig,
} from "@/lib/templates/types";

interface CompanyRow {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  has_active_template: boolean;
}

interface TemplateListRow {
  id: string;
  name: string;
  status: "draft" | "active" | "archived";
  updated_at: string;
  company: { id: string; code: string; name: string };
}

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

async function openPreviewPdf(id: string) {
  const res = await fetch(`/api/admin/invoice-templates/${id}/preview-pdf`, { method: "POST" });
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "生成预览失败"));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function TemplatesClient() {
  const [companies, setCompanies] = React.useState<CompanyRow[]>([]);
  const [companyCode, setCompanyCode] = React.useState<string>("__all__");
  const [rows, setRows] = React.useState<TemplateListRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);

  const [uploadCompany, setUploadCompany] = React.useState<string>("");
  const [uploadName, setUploadName] = React.useState("");
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);

  const [detail, setDetail] = React.useState<TemplateDetail | null>(null);
  const [binding, setBinding] = React.useState<TemplateBinding>({ fields: {}, lineItems: null });
  const [selected, setSelected] = React.useState<string | null>(null);
  const [bindField, setBindField] = React.useState<string>("__none__");
  const [saving, setSaving] = React.useState(false);
  const [previewingId, setPreviewingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [publishing, setPublishing] = React.useState(false);
  const [showSample, setShowSample] = React.useState(false);

  const loadCompanies = React.useCallback(async () => {
    const list = await fetchJson<CompanyRow[]>("/api/companies");
    setCompanies(list);
    return list;
  }, []);

  const loadTemplates = React.useCallback(async () => {
    try {
      const qs = companyCode === "__all__" ? "" : `?company=${encodeURIComponent(companyCode)}`;
      const list = await fetchJson<TemplateListRow[]>(`/api/admin/invoice-templates${qs}`);
      setRows(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载模版列表失败");
    } finally {
      setLoading(false);
    }
  }, [companyCode]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await loadCompanies().catch(() => null);
      if (cancelled || !list) return;
      setCompanies(list);
      if (list.length > 0) setUploadCompany((prev) => prev || list[0].id);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCompanies]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const qs = companyCode === "__all__" ? "" : `?company=${encodeURIComponent(companyCode)}`;
      const list = await fetchJson<TemplateListRow[]>(`/api/admin/invoice-templates${qs}`).catch(
        () => null
      );
      if (cancelled) return;
      setRows(list ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyCode]);

  const openDetail = async (id: string) => {
    try {
      const d = await fetchJson<TemplateDetail>(`/api/admin/invoice-templates/${id}`);
      setDetail(d);
      setBinding(d.binding_config ?? { fields: {}, lineItems: null });
      setSelected(null);
      setBindField("__none__");
      setShowSample(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载模版失败");
    }
  };

  const handleUpload = async () => {
    if (!uploadCompany) {
      toast.error("请选择公司");
      return;
    }
    if (!uploadFile) {
      toast.error("请选择 .xlsx 样张文件");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("company_id", uploadCompany);
      form.set("name", uploadName.trim() || uploadFile.name.replace(/\.xlsx$/i, ""));
      form.set("file", uploadFile);
      const res = await fetch("/api/admin/invoice-templates/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "上传失败"));
      toast.success("样张已解析为草稿模版，请绑定字段");
      setUploadFile(null);
      setUploadName("");
      await loadTemplates();
      await loadCompanies();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const saveBinding = async (): Promise<boolean> => {
    if (!detail) return false;
    setSaving(true);
    try {
      await fetchJson(`/api/admin/invoice-templates/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ binding_config: binding }),
      });
      toast.success("绑定已保存");
      await loadTemplates();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const previewDetailPdf = async () => {
    if (!detail) return;
    const ok = await saveBinding();
    if (!ok) return;
    setPreviewingId(detail.id);
    try {
      await openPreviewPdf(detail.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成预览失败");
    } finally {
      setPreviewingId(null);
    }
  };

  const publish = async () => {
    if (!detail) return;
    const ok = await saveBinding();
    if (!ok) return;
    setPublishing(true);
    try {
      await fetchJson(`/api/admin/invoice-templates/${detail.id}/publish`, { method: "POST" });
      toast.success(`模版已发布启用：${detail.company.name} 之后的发票 PDF 将使用该模版`);
      setDetail(null);
      await loadTemplates();
      await loadCompanies();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发布失败");
    } finally {
      setPublishing(false);
    }
  };

  const bindSelectedCell = () => {
    if (!selected || bindField === "__none__") return;
    const [row, col] = selected.split(":").map(Number);
    const fieldDef = TEMPLATE_FIELDS.find((f) => f.key === bindField);
    if (!fieldDef) return;
    setBinding((b) => {
      const existing = b.fields[bindField as TemplateFieldKey]
      const existingCells = existing?.cells ?? []
      const alreadyBound = existingCells.some((c) => c.row === row && c.col === col)
      return {
        ...b,
        fields: {
          ...b.fields,
          [bindField as TemplateFieldKey]: {
            cells: alreadyBound ? existingCells : [...existingCells, { row, col }],
            format: fieldDef.format,
          },
        },
      }
    });
    toast.success(`已绑定 ${fieldDef.label} → 第 ${row + 1} 行 第 ${col + 1} 列`);
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

  const renderedGrid = detail
    ? renderTemplateData(detail.grid_config, binding, sampleTemplateRenderData())
    : null;
  const selectedPosition = selected?.split(":").map(Number);
  const selectedRow = selectedPosition?.[0];
  const selectedCol = selectedPosition?.[1];
  const lineItemColumns = binding.lineItems
    ? Object.values(binding.lineItems.columns).filter((col): col is number => col != null)
    : [];

  const handleListPreview = async (id: string) => {
    setPreviewingId(id);
    try {
      await openPreviewPdf(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成预览失败");
    } finally {
      setPreviewingId(null);
    }
  };

  const handleDelete = async (row: TemplateListRow) => {
    const activeWarning =
      row.status === "active" ? "\n该模版正在使用，删除后该公司将暂无可用的账单 PDF 模版。" : "";
    if (!window.confirm(`确定删除模版「${row.name}」吗？${activeWarning}\n此操作无法撤销。`)) {
      return;
    }

    setDeletingId(row.id);
    try {
      await fetchJson(`/api/admin/invoice-templates/${row.id}`, { method: "DELETE" });
      if (detail?.id === row.id) setDetail(null);
      toast.success(`已删除模版：${row.name}`);
      await Promise.all([loadTemplates(), loadCompanies()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除模版失败");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">账单模版管理</h1>
          <p className="text-sm text-muted-foreground">
            上传公司 Excel 账单样张 → 绑定业务字段 → 试打预览 → 发布启用
          </p>
        </div>
        <Select value={companyCode} onValueChange={setCompanyCode}>
          <SelectTrigger className="w-44" aria-label="按公司筛选">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部公司</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.code}>
                {c.name}（{c.code}）
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 上传区 */}
      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
        <div className="space-y-1.5">
          <Label>公司</Label>
          <Select value={uploadCompany} onValueChange={setUploadCompany}>
            <SelectTrigger>
              <SelectValue placeholder="选择公司" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}（{c.code}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>模版名称</Label>
          <Input
            value={uploadName}
            onChange={(e) => setUploadName(e.target.value)}
            placeholder="如 AA 标准版 2026"
          />
        </div>
        <div className="space-y-1.5">
          <Label>.xlsx 样张</Label>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            className="flex h-9 w-full cursor-pointer text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
        </div>
        <div className="flex items-end">
          <Button onClick={() => void handleUpload()} disabled={uploading || companies.length === 0}>
            {uploading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <FileUp className="mr-2 size-4" />
            )}
            上传解析
          </Button>
        </div>
      </div>

      {/* 模版列表 */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>模版</TableHead>
              <TableHead>公司</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead className="w-72">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  暂无模版，上传公司 Excel 账单样张开始
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    {row.company.name}（{row.company.code}）
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        row.status === "active"
                          ? "text-emerald-600"
                          : row.status === "draft"
                            ? "text-amber-600"
                            : "text-muted-foreground"
                      }
                    >
                      {STATUS_LABEL[row.status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(row.updated_at).toLocaleString("zh-CN")}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => void openDetail(row.id)}>
                        <Eye className="mr-1 size-3.5" />
                        {row.status === "draft" ? "绑定字段" : "查看"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleListPreview(row.id)}
                        disabled={previewingId === row.id}
                      >
                        {previewingId === row.id ? (
                          <Loader2 className="mr-1 size-3.5 animate-spin" />
                        ) : null}
                        试打预览
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => void handleDelete(row)}
                        disabled={deletingId === row.id}
                      >
                        {deletingId === row.id ? (
                          <Loader2 className="mr-1 size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="mr-1 size-3.5" />
                        )}
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 绑定向导 */}
      {detail && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">
                {detail.name}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {detail.company.name} · {STATUS_LABEL[detail.status]}
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                点击网格中的单元格选中，再选择字段绑定；明细行区域按行号与列号框定
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setDetail(null)}>
              <X className="mr-1 size-3.5" />
              关闭
            </Button>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {showSample ? "示例数据渲染效果" : "样张网格"}
                </span>
                <Button variant="outline" size="sm" onClick={() => setShowSample((v) => !v)}>
                  {showSample ? "查看原始样张" : "查看示例数据效果"}
                </Button>
              </div>
              <div className="max-h-[560px] overflow-auto">
                <TemplatePreview
                  grid={showSample && renderedGrid ? renderedGrid : detail.grid_config}
                  onCellClick={
                    detail.status === "draft" && !showSample
                      ? (row, col) => setSelected(`${row}:${col}`)
                      : undefined
                  }
                  highlightedCells={showSample ? undefined : highlightedCells}
                  selectedCell={selected}
                  scale={0.75}
                  showCoordinates={!showSample}
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
              </div>
            </div>

            {detail.status === "draft" ? (
              <div className="space-y-4">
                <div className="rounded-md border p-3">
                  <p className="mb-2 text-sm font-medium">字段绑定</p>
                  <div className="mb-3 text-xs text-muted-foreground">
                    {selected ? (
                      <>
                        已选中单元格：第 {Number(selected.split(":")[0]) + 1} 行 / 第{" "}
                        {Number(selected.split(":")[1]) + 1} 列
                      </>
                    ) : (
                      "先点击左侧网格选择一个单元格"
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Select value={bindField} onValueChange={setBindField}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="选择字段" />
                      </SelectTrigger>
                      <SelectContent>
                        {TEMPLATE_FIELDS.map((f) => (
                          <SelectItem key={f.key} value={f.key}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      onClick={bindSelectedCell}
                      disabled={!selected || bindField === "__none__"}
                    >
                      绑定
                    </Button>
                  </div>
                  <div className="mt-3 space-y-1">
                    {TEMPLATE_FIELDS.map((f) => {
                      const fb = binding.fields[f.key];
                      return (
                        <div key={f.key} className="flex items-center justify-between text-xs">
                          <span className={fb ? "text-foreground" : "text-muted-foreground"}>
                            {f.label}
                            {fb && (
                              <span className="ml-1 font-mono text-sky-600">
                                → {fb.cells.map((c) => `${c.row + 1}行${c.col + 1}列`).join("、")}
                              </span>
                            )}
                          </span>
                          {fb && (
                            <button
                              type="button"
                              className="text-destructive hover:underline"
                              onClick={() => unbindField(f.key)}
                            >
                              解绑
                            </button>
                          )}
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
                        先点左侧单元格，再用它的行或列完成绑定。蓝色区域是会被账单明细替换的范围。
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
                  <div className="mt-2 grid gap-2">
                    {LINE_ROLES.map((role) => (
                      <div key={role.key} className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-2">
                        <Label className="text-xs">
                          {role.label}
                          {role.required ? <span className="ml-1 text-destructive">*</span> : null}
                        </Label>
                        <Select
                          value={
                            binding.lineItems?.columns[role.key] != null
                              ? String(binding.lineItems.columns[role.key])
                              : "__none__"
                          }
                          onValueChange={(v) => {
                            setBinding((b) => {
                              const li =
                                b.lineItems ??
                                { startRow: selectedRow ?? 0, endRow: selectedRow ?? 0, columns: {}, minRows: 10 };
                              const columns = { ...li.columns } as Record<string, number | undefined>;
                              if (v === "__none__") delete columns[role.key];
                              else columns[role.key] = Number(v);
                              return {
                                ...b,
                                lineItems: {
                                  ...li,
                                  columns,
                                } as TemplateBinding["lineItems"],
                              };
                            });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">不绑定</SelectItem>
                            {detail.grid_config.colWidths.map((_, idx) => (
                              <SelectItem key={idx} value={String(idx)}>
                                {columnLabel(idx)} 列（第 {idx + 1} 列）
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={selectedCol == null}
                          onClick={() => {
                            if (selectedCol == null) return;
                            setBinding((b) => {
                              const li = b.lineItems ?? {
                                startRow: selectedRow ?? 0,
                                endRow: selectedRow ?? 0,
                                columns: {},
                                minRows: 10,
                              };
                              const columns = { ...li.columns, [role.key]: selectedCol };
                              return { ...b, lineItems: { ...li, columns } };
                            });
                          }}
                        >
                          用 {selectedCol == null ? "选中列" : `${columnLabel(selectedCol)} 列`}
                        </Button>
                      </div>
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

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => void saveBinding()} disabled={saving}>
                    {saving ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 size-4" />
                    )}
                    保存绑定
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void previewDetailPdf()}
                    disabled={previewingId === detail.id}
                  >
                    {previewingId === detail.id ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    试打 PDF
                  </Button>
                  <Button onClick={() => void publish()} disabled={publishing}>
                    {publishing ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Megaphone className="mr-2 size-4" />
                    )}
                    发布启用
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                该模版为「{STATUS_LABEL[detail.status]}」状态，仅草稿可编辑绑定。
                <br />
                如需调整版式，请重新上传样张生成新草稿后发布替换。
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
