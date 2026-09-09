"use client";

/**
 * 账单模版编辑页客户端（仅 admin）
 * 左侧 Univer 电子表格直接编辑样张；右侧令牌面板一键插入 {{令牌}}，
 * 绑定由网格中的令牌实时推导 → 试打 → 发布；非草稿只读 + 复制为草稿
 */

import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Loader2, Megaphone, Save } from "lucide-react";
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
import type { UniverEditorHandle } from "@/components/templates/univer-editor";
import { TemplatePreview } from "@/components/templates/template-preview";
import { fetchJson, getApiErrorMessage } from "@/lib/api/client";
import { loadIntoPdfWindow, reservePdfWindow } from "@/lib/utils/open-pdf";
import { renderTemplateData, sampleTemplateRenderData } from "@/lib/templates/render-template-data";
import {
  DETAIL_TOKENS,
  FIELD_TOKENS,
  deriveBindingFromGrid,
} from "@/lib/templates/token-binding";
import {
  TEMPLATE_FIELDS,
  type TemplateBinding,
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

interface CompanyRow {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface TemplateSaveResult {
  id: string;
  name: string;
  status: TemplateDetail["status"];
  company: TemplateDetail["company"];
}

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  active: "启用中",
  archived: "已归档",
};

function draftStorageKey(id: string) {
  return `invoice-template-unsaved:${id}`;
}

/** Univer 体积较大，仅草稿编辑时按需加载 */
const LazyUniverEditor = React.lazy(() =>
  import("@/components/templates/univer-editor").then((m) => ({ default: m.UniverEditor }))
);

export function TemplateEditorClient({ id }: { id: string }) {
  const router = useRouter();
  const [detail, setDetail] = React.useState<TemplateDetail | null>(null);
  const [loadError, setLoadError] = React.useState("");
  const [name, setName] = React.useState("");
  const [companyId, setCompanyId] = React.useState("");
  const [companies, setCompanies] = React.useState<CompanyRow[]>([]);
  const [grid, setGrid] = React.useState<TemplateGrid | null>(null);
  const [minRows, setMinRows] = React.useState(10);
  const [saving, setSaving] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [duplicating, setDuplicating] = React.useState(false);
  const [showSample, setShowSample] = React.useState(false);
  const [savedSnapshot, setSavedSnapshot] = React.useState("");
  const editorRef = React.useRef<UniverEditorHandle | null>(null);

  const currentSnapshot = React.useMemo(
    () => JSON.stringify({ name, companyId, grid }),
    [name, companyId, grid]
  );
  const isDirty = Boolean(detail && savedSnapshot && currentSnapshot !== savedSnapshot);
  const isBusy = saving || previewing || publishing || duplicating;

  // 绑定不再独立存储：由网格中的 {{令牌}} + 最少行数实时推导
  const derived = React.useMemo(
    () => (grid ? deriveBindingFromGrid(grid, { minRows }) : null),
    [grid, minRows]
  );
  const binding: TemplateBinding = derived?.binding ?? { fields: {}, lineItems: null };

  // 初始加载（含本地草稿恢复）
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [d, companyList] = await Promise.all([
          fetchJson<TemplateDetail>(`/api/admin/invoice-templates/${id}`),
          fetchJson<CompanyRow[]>("/api/companies").catch(() => null),
        ]);
        if (cancelled) return;
        if (d.status === "draft" && !companyList) {
          throw new Error("加载公司列表失败，请刷新后重试");
        }
        const availableCompanies = companyList ?? [];
        const baseSnapshot = JSON.stringify({
          name: d.name,
          companyId: d.company.id,
          grid: d.grid_config,
        });
        let nextGrid = d.grid_config;
        let nextMinRows = d.binding_config?.lineItems?.minRows ?? 10;
        let restoredName = d.name;
        let restoredCompanyId = d.company.id;
        const stored = sessionStorage.getItem(draftStorageKey(id));
        if (stored) {
          try {
            const recovery = JSON.parse(stored) as {
              baseSnapshot: string;
              name: string;
              companyId: string;
              grid: TemplateGrid;
            };
            if (
              recovery.baseSnapshot === baseSnapshot &&
              window.confirm("检测到这个模版有未保存的本地修改，是否恢复？")
            ) {
              nextGrid = recovery.grid;
              // 恢复载荷不再携带绑定：网格仍有明细模板行则保留已持久化的最少行数，否则回默认 10
              nextMinRows = deriveBindingFromGrid(recovery.grid).binding.lineItems ? nextMinRows : 10;
              restoredName = recovery.name;
              const recoveredCompanyIsSelectable =
                recovery.companyId === d.company.id ||
                availableCompanies.some(
                  (company) => company.id === recovery.companyId && company.is_active
                );
              restoredCompanyId = recoveredCompanyIsSelectable
                ? recovery.companyId
                : d.company.id;
              if (!recoveredCompanyIsSelectable) {
                toast.warning("未保存的目标公司已停用，所属公司已恢复为原公司");
              }
              toast.success("已恢复未保存的模版修改");
            } else {
              sessionStorage.removeItem(draftStorageKey(id));
            }
          } catch {
            sessionStorage.removeItem(draftStorageKey(id));
          }
        }
        setDetail(d);
        setCompanies(availableCompanies);
        setName(restoredName);
        setCompanyId(restoredCompanyId);
        setGrid(nextGrid);
        setMinRows(nextMinRows);
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
      JSON.stringify({ baseSnapshot: savedSnapshot, name, companyId, grid })
    );
  }, [companyId, detail, grid, isDirty, name, savedSnapshot]);

  const save = async (): Promise<TemplateDetail | null> => {
    if (!detail) return null;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("模版名称不能为空");
      return null;
    }
    if (detail.status === "draft" && !companyId) {
      toast.error("请选择所属公司");
      return null;
    }
    setSaving(true);
    try {
      // 非草稿仅允许改名；草稿连同公司、网格与最少行数一起保存（绑定由服务端按令牌推导）
      const body =
        detail.status === "draft" && grid
          ? { name: trimmed, company_id: companyId, grid_config: grid, line_item_min_rows: minRows }
          : { name: trimmed };
      const saved = await fetchJson<TemplateSaveResult>(`/api/admin/invoice-templates/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setName(trimmed);
      setCompanyId(saved.company.id);
      setSavedSnapshot(
        JSON.stringify({
          name: trimmed,
          companyId: saved.company.id,
          grid: detail.status === "draft" && grid ? grid : detail.grid_config,
        })
      );
      sessionStorage.removeItem(draftStorageKey(detail.id));
      const nextDetail: TemplateDetail = {
        ...detail,
        name: saved.name,
        status: saved.status,
        company: saved.company,
        ...(detail.status === "draft" && grid ? { grid_config: grid } : {}),
      };
      setDetail(nextDetail);
      toast.success(detail.status === "draft" ? "模版已保存" : "模版名称已保存");
      return nextDetail;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
      return null;
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
    setPreviewing(true);
    try {
      if (detail.status === "draft") {
        const saved = await save();
        if (!saved) {
          popup.close();
          return;
        }
      }
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
    setPublishing(true);
    try {
      const saved = await save();
      if (!saved) return;
      await fetchJson(`/api/admin/invoice-templates/${detail.id}/publish`, { method: "POST" });
      toast.success(`模版已发布启用：${saved.company.name} 之后的发票 PDF 将使用该模版`);
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

  const highlightedCells = new Set(
    Object.values(binding.fields).flatMap((fb) =>
      (fb?.cells ?? []).map((c) => `${c.row}:${c.col}`)
    )
  );

  const renderedGrid = grid
    ? renderTemplateData(grid, binding, sampleTemplateRenderData())
    : null;
  const lineItemColumns = binding.lineItems
    ? Object.values(binding.lineItems.columns).filter((col): col is number => col != null)
    : [];

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
          disabled={isBusy}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setName((v) => v.trim())}
          maxLength={100}
          aria-label="模版名称"
          className="h-9 w-72 max-w-full text-base font-semibold"
        />
        {detail.status === "draft" ? (
          <div className="w-56 max-w-full">
            <Label htmlFor="template-company" className="sr-only">所属公司</Label>
            <Select value={companyId} onValueChange={setCompanyId} disabled={isBusy}>
              <SelectTrigger id="template-company" aria-label="所属公司" className="h-9">
                <SelectValue placeholder="选择所属公司" />
              </SelectTrigger>
              <SelectContent>
                {companies
                  .filter((company) => company.is_active || company.id === detail.company.id)
                  .map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}（{company.code}）{company.is_active ? "" : " · 已停用"}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            {detail.company.name}（{detail.company.code}）
          </span>
        )}
        <span className="text-sm text-muted-foreground">· {STATUS_LABEL[detail.status]}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isDirty ? <span className="text-xs font-medium text-amber-700">有未保存修改</span> : null}
          {detail.status === "draft" ? (
            <>
              <Button variant="outline" size="sm" onClick={() => void save()} disabled={isBusy}>
                {saving ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Save className="mr-1 size-3.5" />}
                保存模版
              </Button>
              <Button variant="outline" size="sm" onClick={() => void previewPdf()} disabled={isBusy}>
                {previewing ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                试打 PDF
              </Button>
              <Button size="sm" onClick={() => void publish()} disabled={isBusy}>
                {publishing ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Megaphone className="mr-1 size-3.5" />}
                发布启用
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => void save()} disabled={isBusy || !isDirty}>
                {saving ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Save className="mr-1 size-3.5" />}
                保存名称
              </Button>
              <Button variant="outline" size="sm" onClick={() => void previewPdf()} disabled={isBusy}>
                {previewing ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                试打 PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => void duplicate()} disabled={isBusy}>
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

      {/* 主体：左侧 Univer 电子表格，右侧令牌面板（sticky） */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-lg border bg-card p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">
              {showSample ? "示例数据渲染效果" : "样张网格"}
            </span>
            <div className="flex items-center gap-3">
              {detail.status === "draft" ? (
                <p className="hidden text-xs text-muted-foreground md:block">
                  在表格中直接编辑；把要变成发票数据的位置写成令牌（右侧可一键插入）
                </p>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => setShowSample((v) => !v)}>
                {showSample ? "查看原始样张" : "查看示例数据效果"}
              </Button>
            </div>
          </div>
          <div className="max-h-[calc(100dvh-15rem)] overflow-auto">
            {detail.status === "draft" && !showSample ? (
              <React.Suspense
                fallback={
                  <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
                    编辑器加载中…
                  </div>
                }
              >
                <LazyUniverEditor
                  key={detail.id}
                  ref={editorRef}
                  templateId={detail.id}
                  grid={grid}
                  pageConfig={detail.page_config}
                  onGridChange={setGrid}
                />
              </React.Suspense>
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
          <fieldset
            disabled={isBusy}
            className="min-w-0 space-y-4 border-0 p-0 pb-4 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:overflow-auto"
          >
            <div className="rounded-md border p-3">
              <p className="text-sm font-medium">字段令牌</p>
              <p className="mt-1 text-xs text-muted-foreground">
                选中左侧单元格后点击令牌即可插入；同一令牌可写在多个位置。
              </p>
              <div className="mt-3 grid gap-1.5">
                {TEMPLATE_FIELDS.map((field) => {
                  const bound = Boolean(binding.fields[field.key]);
                  return (
                    <button
                      key={field.key}
                      type="button"
                      className={`flex min-h-9 items-center justify-between rounded-md border px-2 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${bound ? "border-sky-200 bg-sky-50 text-sky-900" : "bg-background hover:bg-muted"}`}
                      onClick={() => {
                        if (!editorRef.current?.insertTokenAtSelection(FIELD_TOKENS[field.key])) {
                          toast.error("请先在左侧表格中选中一个单元格");
                        }
                      }}
                    >
                      <span>{field.label}</span>
                      <code className="font-mono text-[11px] text-muted-foreground">{FIELD_TOKENS[field.key]}</code>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-md border border-sky-200 bg-sky-50/30 p-3">
              <p className="text-sm font-medium">明细行令牌</p>
              <p className="mt-1 text-xs text-muted-foreground">
                在同一行写入以下令牌即定义明细模板行（描述、金额必填），打印时按数据行数自动扩展。
              </p>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {(Object.keys(DETAIL_TOKENS) as (keyof typeof DETAIL_TOKENS)[]).map((role) => (
                  <button
                    key={role}
                    type="button"
                    className="min-h-9 rounded-md border bg-background px-2 text-left text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                    onClick={() => {
                      if (!editorRef.current?.insertTokenAtSelection(DETAIL_TOKENS[role])) {
                        toast.error("请先在左侧表格中选中一个单元格");
                      }
                    }}
                  >
                    <code className="font-mono text-[11px]">{DETAIL_TOKENS[role]}</code>
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <Label className="text-xs" htmlFor="line-min-rows">最少行数（不足补空行）</Label>
                <Input
                  id="line-min-rows"
                  type="number"
                  min={1}
                  max={80}
                  value={minRows}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 1) setMinRows(Math.floor(v));
                  }}
                />
              </div>
            </div>

            <div className="rounded-md border p-3 text-xs">
              <p className="text-sm font-medium">校验</p>
              {derived && derived.errors.length > 0 ? (
                <ul className="mt-2 space-y-1 text-destructive">
                  {derived.errors.map((e) => <li key={e}>· {e}</li>)}
                </ul>
              ) : null}
              {derived && derived.unknownTokens.length > 0 ? (
                <p className="mt-2 text-amber-700">
                  未知令牌：{derived.unknownTokens.map((t) => `{{${t}}}`).join("、")}
                </p>
              ) : null}
              {binding.lineItems ? (
                <p className="mt-2 text-emerald-700">
                  明细模板行：第 {binding.lineItems.startRow + 1} 行 · 最少 {binding.lineItems.minRows} 行
                </p>
              ) : (
                <p className="mt-2 text-muted-foreground">尚未定义明细模板行</p>
              )}
            </div>
          </fieldset>
        ) : (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground xl:sticky xl:top-24">
            该模版为「{STATUS_LABEL[detail.status]}」状态，仅草稿可编辑网格与绑定。
            <br />
            名称可随时修改；复制为草稿后可修改全部内容，发布时再安全替换当前版本。
            <br />
            该模版使用 {"{{令牌}}"} 标记数据位置，复制为草稿后可编辑。
          </div>
        )}
      </div>
    </div>
  );
}
