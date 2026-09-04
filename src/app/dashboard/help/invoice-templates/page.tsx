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
  MousePointer2,
  Trash2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const steps = [
  { number: "01", title: "准备样张", description: "整理 Excel 格式、合并格和占位行", icon: FileSpreadsheet },
  { number: "02", title: "上传解析", description: "选择公司后上传 .xlsx 生成草稿", icon: Upload },
  { number: "03", title: "绑定字段", description: "绑定发票号、日期、地址与金额", icon: MousePointer2 },
  { number: "04", title: "绑定明细", description: "设置行区域及 Description / Amount 列", icon: Grid3X3 },
  { number: "05", title: "试打发布", description: "检查 PDF 后发布为该公司启用版", icon: Megaphone },
] as const;

const toc = [
  ["prepare", "1. 准备 Excel 样张"],
  ["upload", "2. 上传并解析"],
  ["fields", "3. 绑定基础字段"],
  ["lines", "4. 绑定明细数据"],
  ["publish", "5. 试打与发布"],
  ["maintain", "6. 版本维护与删除"],
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

export default function InvoiceTemplateHelpPage() {
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
              从 Excel 样张到可用的账单 PDF：按顺序完成上传、字段绑定、明细区域配置、试打和发布。
            </p>
          </div>
          <Button asChild className="bg-amber-400 text-slate-950 hover:bg-amber-300">
            <Link href="/dashboard/templates">
              打开账单模版管理
              <ArrowRight className="ml-2 size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
              "保留列宽、行高、合并格、字号、对齐、颜色和边框。",
              "在明细表中预留至少一行样式完整的空白占位行。",
              "当前 PDF 字体仅支持英文，样张中不要放中文文字。",
            ]} />
            <Callout>业务数据对应的单元格可以留空，但必须在 Excel 中先设好字号、对齐和边框。</Callout>
          </Section>

          <Section id="upload" number="02" title="上传并解析样张">
            <ol className="list-decimal space-y-2 pl-5">
              <li>打开「基础管理 → 账单模版管理」。</li>
              <li>选择模版所属公司，输入容易识别的模版名称。</li>
              <li>选择 .xlsx 样张，点击「上传解析」。</li>
              <li>解析成功后会生成「草稿」，点击「绑定字段」开始配置。</li>
            </ol>
            <Callout tone="warning">同一公司可以有多个草稿，但同一时间只有一个启用模版。</Callout>
          </Section>

          <Section id="fields" number="03" title="绑定基础字段">
            <ol className="list-decimal space-y-2 pl-5">
              <li>在左侧样张网格中点击要填入数据的单元格。</li>
              <li>参考顶部列标 A、B、C 和左侧行号，确认选中坐标。</li>
              <li>在「字段绑定」中选择业务字段，点击「绑定」。</li>
              <li>重复操作，完成发票号、发票日期、Load No.、Bill To、PICKUPS、DROPS 和 Total。</li>
            </ol>
            <Callout>同一字段可绑定到多个单元格。如果选错，在已绑定字段右侧点击「解绑」后重新操作。</Callout>
          </Section>

          <Section id="lines" number="04" title="绑定明细数据">
            <p>明细区域会按账单实际数据重复生成，配置时要同时确定「行区域」和「字段列」。</p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>点击明细表第一个占位行，点击「选中行设为起始」。</li>
              <li>点击最后一个占位行，点击「选中行设为结束」。</li>
              <li>点击 Description 所在列，在 Description 一行点击「用 X 列」。</li>
              <li>用相同方式绑定 Amount / Total；Qty 和 Rate 可按样张需要选择绑定。</li>
              <li>设置「最少行数」。实际数据不足时会自动补空行，超出时会自动增加。</li>
            </ol>
            <Callout tone="warning">Description 和 Amount / Total 是发布必填列，不能绑定到同一列。蓝色网格是当前明细区域，发布前必须检查范围是否准确。</Callout>
          </Section>

          <Section id="publish" number="05" title="试打、保存与发布">
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
            <Checklist items={[
              "所有基础字段都落在预期单元格内。",
              "PICKUPS / DROPS 日期、公司和地址没有越界或遮挡。",
              "多条明细能正确增长，总金额和底部内容会同步下移。",
              "发票号、日期、Load No. 和金额格式正确。",
            ]} />
          </Section>

          <Section id="maintain" number="06" title="版本维护与删除">
            <p>发布新模版后，同公司原来的启用版会自动变为「已归档」。已发布或已归档模版不能再修改绑定，需要调整时请重新上传样张生成新草稿。</p>
            <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
              <Trash2 className="mt-1 size-4 shrink-0" aria-hidden="true" />
              <p>删除操作无法撤销。删除「启用中」的模版后，该公司将无法生成账单 PDF，应先发布替代版本。</p>
            </div>
          </Section>

          <section id="troubleshooting" className="scroll-mt-24 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
            <h2 className="mb-4 text-lg font-semibold tracking-tight sm:text-xl">常见问题</h2>
            <div className="divide-y">
              {[
                ["上传后版式不一致", "检查原 Excel 是否使用了图片、文本框、条件格式或非实心填充。建议使用标准单元格样式。"],
                ["字段显示在错误位置", "根据行号和列标重新选择单元格，先解绑错误坐标，再重新绑定。"],
                ["明细数据落在第一列或列对不上", "清除明细绑定后重新设置。确保每个字段都使用选中列明确绑定，不要重复使用同一列。"],
                ["日期或编号太长", "系统会对不换行的窄单元格自动缩小字号。如果仍难以阅读，请在 Excel 样张中加宽该列。"],
                ["无法发布", "检查是否已配置明细起止行，并绑定 Description 和 Amount / Total 两个必填列。"],
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
