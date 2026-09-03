"use client";

/**
 * 公司管理（仅 admin）—— 代码 / 名称 / 发票号前缀 / 启停 / 模版概况
 * code 创建后不可改；停用仅影响新建可选性，不动存量发票
 */

import React from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchJson } from "@/lib/api/client";

interface CompanyRow {
  id: string;
  code: string;
  name: string;
  invoice_prefix: string | null;
  is_active: boolean;
  template_count: number;
  active_template_count: number;
  has_active_template: boolean;
}

interface FormState {
  code: string;
  name: string;
  invoice_prefix: string;
}

const emptyForm: FormState = { code: "", name: "", invoice_prefix: "" };

export function CompaniesClient() {
  const [rows, setRows] = React.useState<CompanyRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CompanyRow | null>(null);
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const list = await fetchJson<CompanyRow[]>("/api/companies");
      setRows(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载公司列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await fetchJson<CompanyRow[]>("/api/companies").catch(() => null);
      if (!cancelled) {
        setRows(list ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (row: CompanyRow) => {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      invoice_prefix: row.invoice_prefix ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("请填写公司名称");
      return;
    }
    if (!editing && !form.code.trim()) {
      toast.error("请填写公司代码");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await fetchJson(`/api/admin/companies/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            invoice_prefix: form.invoice_prefix.trim() || null,
          }),
        });
        toast.success("公司已更新");
      } else {
        await fetchJson("/api/admin/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: form.code.trim(),
            name: form.name.trim(),
            invoice_prefix: form.invoice_prefix.trim() || null,
          }),
        });
        toast.success("公司已创建");
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: CompanyRow, checked: boolean) => {
    const prev = rows;
    setRows((list) => list.map((r) => (r.id === row.id ? { ...r, is_active: checked } : r)));
    try {
      await fetchJson(`/api/admin/companies/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: checked }),
      });
      toast.success(checked ? `已启用 ${row.name}` : `已停用 ${row.name}（存量发票不受影响）`);
    } catch (err) {
      setRows(prev);
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">公司管理</h1>
          <p className="text-sm text-muted-foreground">
            维护开票公司与发票号前缀；上传账单样张前请先在此创建公司
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 size-4" />
          新增公司
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>代码</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>发票号前缀</TableHead>
              <TableHead>模版</TableHead>
              <TableHead>启用</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  暂无公司，点击右上角「新增公司」开始
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className={!row.is_active ? "opacity-60" : undefined}>
                  <TableCell className="font-mono font-medium">{row.code}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="font-mono">{row.invoice_prefix ?? "—"}</TableCell>
                  <TableCell>
                    <span className={row.has_active_template ? "text-emerald-600" : "text-muted-foreground"}>
                      {row.has_active_template ? `启用中 × ${row.active_template_count}` : "无启用模版"}
                    </span>
                    {row.template_count > row.active_template_count && (
                      <span className="ml-1 text-xs text-amber-600">
                        （{row.template_count - row.active_template_count} 份草稿）
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={row.is_active}
                      onCheckedChange={(checked) => void toggleActive(row, checked === true)}
                      aria-label={`启用 ${row.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(row)} aria-label={`编辑 ${row.name}`}>
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `编辑公司：${editing.name}` : "新增公司"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "公司代码创建后不可修改；发票号前缀仅影响之后新开的发票号。"
                : "公司代码用于关联账单数据，创建后不可修改，请与业务一致（如 AA、G&G）。"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>
                公司代码 <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                disabled={!!editing}
                placeholder="如 AA、YG、G&G"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>
                公司名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="如 ALREADY ARRIVED LOGISTICS"
              />
            </div>
            <div className="space-y-2">
              <Label>发票号前缀</Label>
              <Input
                value={form.invoice_prefix}
                onChange={(e) => setForm((f) => ({ ...f, invoice_prefix: e.target.value }))}
                placeholder="如 AA、GG；留空则开票时需手填发票号"
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
