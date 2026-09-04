"use client";

/**
 * 账单模版管理（仅 admin）—— 列表页
 * 流程：上传 .xlsx 样张 → 跳转独立编辑页绑定字段 → 校验通过后发布启用
 */

import React from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, FileUp, Loader2, Trash2 } from "lucide-react";
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
import { loadIntoPdfWindow, reservePdfWindow } from "@/lib/utils/open-pdf";

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

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  active: "启用中",
  archived: "已归档",
};

const EDIT_URL = "/dashboard/templates";

export function TemplatesClient() {
  const router = useRouter();
  const [companies, setCompanies] = React.useState<CompanyRow[]>([]);
  const [companyCode, setCompanyCode] = React.useState<string>("__all__");
  const [rows, setRows] = React.useState<TemplateListRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);

  const [uploadCompany, setUploadCompany] = React.useState<string>("");
  const [uploadName, setUploadName] = React.useState("");
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const [previewingId, setPreviewingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = React.useState<string | null>(null);

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
      const created = (await res.json()) as { data?: { id?: string } };
      toast.success("样张已解析为草稿模版，即将进入编辑页绑定字段");
      setUploadFile(null);
      setUploadName("");
      await loadCompanies();
      if (created.data?.id) router.push(`${EDIT_URL}/${created.data.id}`);
      else await loadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleListPreview = async (id: string) => {
    // 点击瞬间同步保留弹窗，避免后续 fetch 导致弹窗被拦截
    const popup = reservePdfWindow();
    if (!popup) {
      toast.error("浏览器拦截了弹窗，请允许本站弹出窗口后重试");
      return;
    }
    setPreviewingId(id);
    try {
      await loadIntoPdfWindow(popup, async () => {
        const res = await fetch(`/api/admin/invoice-templates/${id}/preview-pdf`, { method: "POST" });
        if (!res.ok) throw new Error(await getApiErrorMessage(res, "生成预览失败"));
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return url;
      });
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
      toast.success(`已删除模版：${row.name}`);
      await Promise.all([loadTemplates(), loadCompanies()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除模版失败");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDuplicate = async (row: TemplateListRow) => {
    setDuplicatingId(row.id);
    try {
      const copy = await fetchJson<{ id: string }>(`/api/admin/invoice-templates/${row.id}/duplicate`, {
        method: "POST",
      });
      toast.success("已复制为新草稿，可安全编辑后再发布");
      router.push(`${EDIT_URL}/${copy.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "复制模版失败");
    } finally {
      setDuplicatingId(null);
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
                      <Button variant="outline" size="sm" onClick={() => router.push(`${EDIT_URL}/${row.id}`)}>
                        <Eye className="mr-1 size-3.5" />
                        {row.status === "draft" ? "编辑" : "查看"}
                      </Button>
                      {row.status !== "draft" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDuplicate(row)}
                          disabled={duplicatingId === row.id}
                        >
                          {duplicatingId === row.id ? (
                            <Loader2 className="mr-1 size-3.5 animate-spin" />
                          ) : (
                            <Copy className="mr-1 size-3.5" />
                          )}
                          复制为草稿
                        </Button>
                      ) : null}
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
    </div>
  );
}
