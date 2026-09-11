import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  Grid3X3,
  Lightbulb,
  Megaphone,
  PenLine,
  Trash2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DETAIL_TOKENS, FIELD_TOKENS } from "@/lib/templates/token-binding";
import { TEMPLATE_FIELDS } from "@/lib/templates/types";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/auth";

const steps = [
  { number: "01", title: "准备样张", description: "整理 Excel 格式、合并格和占位行", icon: FileSpreadsheet },
  { number: "02", title: "上传解析", description: "选择公司后上传 .xlsx 生成草稿", icon: Upload },
  { number: "03", title: "编辑版式", description: "在网格中直接修改文字、样式与行列", icon: PenLine },
  { number: "04", title: "写入字段令牌", description: "在目标单元格写入 {{令牌}}", icon: Grid3X3 },
  { number: "05", title: "定义明细行", description: "同一行写入 Description / Amount 令牌", icon: Grid3X3 },
  { number: "06", title: "试打发布", description: "检查 PDF 后发布为该公司启用版", icon: Megaphone },
] as const;

const toc = [
  ["prepare", "1. 准备 Excel 样张"],
  ["upload", "2. 上传并解析"],
  ["grid", "3. 编辑网格版式"],
  ["fields", "4. 写入基础字段令牌"],
  ["lines", "5. 定义明细模板行"],
  ["publish", "6. 试打与发布"],
  ["actual-invoice-check", "真实账单效果检查"],
  ["maintain", "7. 版本维护与删除"],
  ["troubleshooting", "常见问题"],
] as const;

function Section({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex items-center gap-3 border-b pb-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 font-mono text-xs font-bold text-amber-300 dark:bg-amber-400 dark:text-slate-950">
          {number}
        </span>
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
      </div>
      <div className="space-y-4 text-sm leading-7 text-slate-700 dark:text-slate-300">{children}</div>
    </section>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <CheckCircle2 className="mt-1 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Callout({
  tone = "tip",
  children,
}: {
  tone?: "tip" | "warning";
  children: React.ReactNode;
}) {
  const warning = tone === "warning";
  const Icon = warning ? AlertTriangle : Lightbulb;
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-3",
        warning
          ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
          : "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100"
      )}
    >
      <Icon className="mt-1 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export default async function InvoiceTemplateHelpPage() {
  const session = await auth();
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-lg">
        <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
              <BookOpen className="size-4" aria-hidden="true" />
              G&amp;G 系统操作手册
            </div>
            <h1 className="max-w-3xl text-2xl font-semibold tracking-tight sm:text-4xl">
              账单模版操作手册
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              从 Excel 样张到可用的账单 PDF：上传解析后用完整 Excel 编辑器调整版式、写入字段令牌，试打确认后发布启用。
            </p>
          </div>
          {session?.user?.role === "admin" && <Button asChild className="bg-amber-400 text-slate-950 hover:bg-amber-300">
            <Link href="/dashboard/templates">
              打开账单模版管理
              <ArrowRight className="ml-2 size-4" aria-hidden="true" />
            </Link>
          </Button>}
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-5 py-3 text-sm">
        <p className="text-muted-foreground">模版管理仅管理员可操作；普通用户可阅读本手册，并使用已启用模版打印账单。</p>
        <Link href="/dashboard/help/operations" className="inline-flex min-h-11 items-center gap-2 font-medium underline underline-offset-4">系统操作手册 <ArrowRight className="size-4" aria-hidden="true" /></Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {steps.map((step) => (
          <div key={step.number} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <step.icon className="size-5 text-amber-600" aria-hidden="true" />
              <span className="font-mono text-xs font-bold text-slate-400">{step.number}</span>
            </div>
            <h2 className="font-semibold">{step.title}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</p>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="rounded-xl border bg-card p-3 shadow-sm lg:sticky lg:top-20">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">本页目录</p>
          <nav aria-label="操作手册目录" className="space-y-1">
            {toc.map(([href, label]) => (
              <a key={href} href={`#${href}`} className="block rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <article className="space-y-5">
          <Section id="prepare" number="01" title="准备 Excel 样张">
            <Checklist items={[
              "仅支持 .xlsx 文件，文件大小不超过 5MB。",
              "系统读取第一个工作表，最大解析 80 行 × 30 列。",
              "支持列宽、行高、合并格、字号、对齐及部分颜色和边框；主题色和特殊边框效果以试打 PDF 为准。",
              "在明细表中预留至少一行样式完整的模板行，并写入明细令牌。",
              "PDF 使用内嵌的 Noto Sans SC 字体，不保留 Excel 原字体名称；支持中文、英文和常用全角字符。",
            ]} />
            <Callout>可直接在 Excel 样张中写入令牌，例如 <code>Invoice No: {FIELD_TOKENS.invoice_number}</code>；上传后系统会自动识别绑定。</Callout>
          </Section>

          <Section id="upload" number="02" title="上传并解析样张">
            <ol className="list-decimal space-y-2 pl-5">
              <li>打开「基础管理 → 账单模版管理」。</li>
              <li>选择模版所属公司，输入容易识别的模版名称。</li>
              <li>选择 .xlsx 样张，点击「上传解析」。</li>
              <li>解析成功后会生成「草稿」，样张中的令牌会自动生成字段绑定，然后进入编辑页检查。</li>
            </ol>
            <Callout>已有相近的启用或归档模版且只想小改时，可跳过上传：在列表中点击该模版的「复制为草稿」，直接在复制出的草稿上编辑。</Callout>
            <Callout>系统会保留样张有效范围内的空白预留行、行高列宽、边框、填充、对齐和合并单元格；如 Excel 设置了打印区域，则以该区域作为模板边界。</Callout>
            <Callout tone="warning">同一公司可以有多个草稿，但同一时间只有一个启用模版。</Callout>
          </Section>

          <Section id="grid" number="03" title="编辑网格版式">
            <p>解析完成后，草稿模版会在 Univer Excel 编辑器中打开，小的版式差异不必重新上传样张。编辑页顶部的名称输入框可随时修改模版名称（任何状态均可改名）。</p>
            <Checklist items={[
              "框选一个或多个单元格，支持复制粘贴、拖拽填充、撤销和重做。",
              "用 Excel 工具栏插入或删除行列，合并或取消合并单元格。",
              "设置字号、粗体、斜体、下划线、删除线、水平 / 垂直对齐和自动换行。",
              "调整文字颜色、填充颜色和逐边边框，支持实线、虚线、点线和双线。",
              "拖动列标右侧、行号下方的边界，调整列宽与行高。",
            ]} />
            <Callout tone="warning">编辑不会自动保存到服务器，修改后需点击「保存模版」。同一标签页会话内重新进入且服务器版本未变化时，可能提示恢复本地修改；关闭标签页后不保证恢复，请及时保存。</Callout>
            <Callout>只有「草稿」状态的模版可以编辑 Excel 网格与令牌，已发布 / 已归档模版为只读（仍可改名）。网格上限为 80 行 × 30 列。</Callout>
          </Section>

          <Section id="fields" number="04" title="写入基础字段令牌">
            <p>在模版中把要显示发票数据的位置写成 <code>{'{{令牌}}'}</code>。令牌可单独放在单元格中，也可嵌入固定文字；例如 <code>Invoice No: {FIELD_TOKENS.invoice_number}</code>。同一令牌可出现多次，例如同时填入 Total 和 Balance Due。</p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>先在 Excel 编辑器中选中目标单元格。</li>
              <li>在右侧「基础字段令牌」面板点击字段，可一键插入到当前选区；也可手工输入下表令牌。</li>
              <li>查看右侧校验面板，确认令牌已识别且没有未知令牌。</li>
            </ol>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-muted/60"><tr><th className="px-3 py-2 font-medium">数据字段</th><th className="px-3 py-2 font-medium">令牌</th></tr></thead>
                <tbody className="divide-y">
                  {TEMPLATE_FIELDS.map((field) => <tr key={field.key}><td className="px-3 py-2">{field.label}</td><td className="px-3 py-2 font-mono">{FIELD_TOKENS[field.key]}</td></tr>)}
                </tbody>
              </table>
            </div>
            <Callout>删除或改正单元格中的令牌即可取消或更改绑定。基础字段按业务需要使用；请人工核对发票号、日期、客户和总金额，且不要把基础字段令牌放在明细模板行内。</Callout>
          </Section>

          <Section id="lines" number="05" title="定义明细模板行">
            <p>在同一行写入明细令牌，系统就会把该行识别为「明细模板行」，并把令牌行到下方总计行之间的连续空行识别为明细区域（容量 = 令牌行 + 这些空行）。打印时：明细数不超过容量就逐行填入既有空行，版式与样张完全一致；超过容量才自动加行，后续总计和底部内容同步下移。</p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>在明细表的一个数据行中，分别把令牌写入对应列。可在右侧「明细行令牌」面板点击一键插入。</li>
              <li><code>{DETAIL_TOKENS.description}</code>（Description）和 <code>{DETAIL_TOKENS.amount}</code>（Amount / Total）必填；<code>{DETAIL_TOKENS.quantity}</code>（Qty）和 <code>{DETAIL_TOKENS.unitPrice}</code>（Rate）按样张需要选填。</li>
              <li>确保所有明细令牌在同一行且位于不同列；需要更多明细空行时，直接在编辑器里于总计行上方插入空行即可扩大容量。</li>
              <li>检查校验面板显示的「明细模板行：第 N 行 · 容量 M 行」是否与样张一致。</li>
            </ol>
            <Callout tone="warning">明细令牌分散在多行、同一令牌在同行重复，或 Description / Amount 缺失时无法发布。请不要把明细令牌放在合并格的覆盖位置。</Callout>
            <Callout>基础字段和明细的绑定值永不缩小字号；内容过长时会自动折行并撑高行高。</Callout>
          </Section>

          <Section id="publish" number="06" title="试打、保存与发布">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                [Eye, "查看示例数据", "在网格中快速检查数据是否落在正确位置。"],
                [FileSpreadsheet, "试打 PDF", "检查字号、换行、边框、总金额和页面完整性。"],
                [Megaphone, "发布启用", "通过校验后发布，该公司之后的 PDF 使用此版本。"],
              ].map(([Icon, title, text]) => {
                const StepIcon = Icon as typeof Eye;
                return (
                  <div key={String(title)} className="rounded-lg border bg-muted/30 p-3">
                    <StepIcon className="mb-2 size-5 text-amber-600" aria-hidden="true" />
                    <p className="font-medium text-foreground">{String(title)}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{String(text)}</p>
                  </div>
                );
              })}
            </div>
            <Callout>配置过程中可随时点击「保存模版」暂存进度。「试打 PDF」和「发布启用」都会先保存草稿，保存失败则不会继续。草稿不会影响当前启用版本。</Callout>
            <Checklist items={[
              "所有基础字段都落在预期单元格内。",
              "PICKUPS / DROPS 日期、公司和地址没有越界或遮挡。",
              "多条明细一条占一行；明细数不超容量时版式与样张一致，超出时总金额和底部内容自动下移。",
              "发票号、日期、Load No. 和金额格式正确。",
            ]} />
          </Section>

          <section id="actual-invoice-check" className="scroll-mt-24 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="actual-invoice-title">
            <h2 id="actual-invoice-title" className="mb-3 text-lg font-semibold">用真实账单确认效果</h2>
            <div className="space-y-3 text-sm leading-7 text-slate-700 dark:text-slate-300">
              <p>「查看示例数据」和「试打 PDF」使用系统内置示例（两条明细），不是业务账单。试打会在新窗口打开，请允许本站弹窗。</p>
              <p>发布后进入「财务管理 → 陆运账单」，选取该公司的账单打开 PDF，检查长客户名称、取送货地址和多条费用明细。内容过宽或过高时会整体缩小到单页，尤其要核对文字是否清晰。</p>
              <p>账单 PDF 按公司当前启用模版生成；发布新版本后重新打印旧账单，也会使用新版本。需要留存旧版文件时，请保存已生成的 PDF。</p>
              <p>这里上传的是打印版式样张；批量录入业务数据请使用陆运账单的「导入账单」，并下载该入口提供的导入模板。</p>
            </div>
          </section>

          <Section id="maintain" number="07" title="版本维护与删除">
            <p>发布新模版后，同公司原来的启用版会自动变为「已归档」。已发布 / 已归档模版的版式与令牌为只读，可查看和试打预览；仍可修改名称，再点击「保存名称」。</p>
            <p>需要调整版式时，在模版列表或详情中点击「复制为草稿」：系统会复制出一份「原名称 - 新版本」的草稿，在草稿上修改并发布后即可安全替换当前版本，无需重新上传样张。复制使用服务器已保存内容，未保存修改不会带入新草稿。</p>
            <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
              <Trash2 className="mt-1 size-4 shrink-0" aria-hidden="true" />
              <p>删除操作无法撤销。删除「启用中」的模版后，该公司将无法生成账单 PDF，应先发布替代版本。</p>
            </div>
          </Section>

          <section id="troubleshooting" className="scroll-mt-24 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
            <h2 className="mb-4 text-lg font-semibold tracking-tight sm:text-xl">常见问题</h2>
            <div className="divide-y">
              {[
                ["上传后版式不一致", "检查原 Excel 是否使用了图片、文本框、条件格式或非实心填充。建议使用标准单元格样式；解析后的小差异可直接在草稿编辑器中调整字号、对齐、边框和合并格。"],
                ["字段显示在错误位置", "找到错误单元格，删除其中令牌，再把正确令牌写入目标单元格。保存前查看右侧校验面板的已识别位置。"],
                ["明细数据落在错误列", "把 {{描述}}、{{数量}}、{{单价}}、{{金额}} 移到同一模板行的正确列，每种令牌只使用一次。"],
                ["日期、编号或地址太长", "绑定值不会缩小字号，而会自动折行并撑高行高。若仍不易阅读，可在草稿编辑器中加宽该列或调整样张布局。"],
                ["无法合并单元格", "确认已正确框选多个单元格，且令牌保留在合并后的左上角锚点格中。明细令牌应放在独立单元格，不要放在合并覆盖位置。"],
                ["想修改已发布的模版", "已发布 / 已归档模版为只读。点击「复制为草稿」得到新草稿，修改后发布即可安全替换当前版本。"],
                ["关闭页面后修改会丢失吗", "本地恢复只用于同一标签页会话，且要求服务器版本未变化。关闭标签页后不保证恢复，修改完成后请点击「保存模版」。"],
                ["无法发布", "按右侧校验面板修正未知令牌或明细结构错误。明细令牌必须在同一行，{{描述}} 和 {{金额}} 必填，且同一角色不可重复。"],
                ["PDF 没打开或文字太小", "允许本站弹出窗口后重试。内容过宽或过高会整体缩小以适应单页；请精简版式、缩小空白区域，并用实际多明细账单检查可读性。"],
              ].map(([question, answer]) => (
                <div key={question} className="py-4 first:pt-0 last:pb-0">
                  <h3 className="font-medium">{question}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{answer}</p>
                </div>
              ))}
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}
