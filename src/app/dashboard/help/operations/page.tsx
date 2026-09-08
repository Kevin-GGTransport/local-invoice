import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";

const chapters = [
  {
    id: "start", title: "首页与日常工作", role: "所有用户", href: "/dashboard", action: "打开控制台",
    intro: "首页用于查看业务概况，并进入账单和收款工作。",
    steps: ["登录后查看全部账单、未发账单、负数账单及启用公司数量。统计范围为全部公司、全部时间，在页面加载时更新。", "点击「陆运账单」处理录入、发送及导出；点击「出纳核销」登记收款。", "点击「最近更新的账单」中的编号进入详情，继续查看或处理该账单。", "桌面端可用左上角按钮收起或展开导航；手机端点击菜单按钮选择模块。完成工作后，点击右上角「退出」。"],
    note: "未发账单与负数账单可能重叠，不能将各项数量直接相加。页面提示加载失败时请重新加载，不要将“—”当成 0。",
  },
  {
    id: "invoices", title: "新建与编辑陆运账单", role: "所有用户", href: "/dashboard/finance/accounting-invoices", action: "打开陆运账单",
    intro: "入口：财务管理 → 陆运账单。先准备公司、客户、Load #、取送货信息和费用明细。",
    steps: ["点击「新建账单」，选择所属公司。公司决定发票号前缀和 PDF 使用的启用模版。", "填写合同金额、账单分类、TONU、客户和 Load # 等信息；按实际业务填写取货、交货的日期、公司与地址。", "填写费用明细的描述和金额，需要多项费用时添加明细行，并核对合计及右侧模版实时预览。", "点击「保存」，确认成功提示。总货号、货号由系统分配；Invoice 日期由发账单操作填写。", "修改已有账单时，使用该行的「编辑」入口，修改后点击「更新」。合同金额创建后不可通过编辑修改。"],
    note: "公司没有启用模版时仍可保存账单和导出 Excel，但不能生成 PDF。请管理员先发布该公司的账单模版。",
  },
  {
    id: "filters", title: "查找账单与保存表格视图", role: "所有用户",
    intro: "先选状态，再组合公司、客户、日期等条件缩小范围。",
    steps: ["选择「全部账单」「未发账单」「负数账单」「已收未平」或「有扣钱」。未发表示 Invoice 日期为空；负数表示 Invoice 金额小于 0。", "「已收未平」表示已发、已有有效收款且已收金额与 Invoice 金额不同；「有扣钱」表示填写了扣钱说明。", "公司支持多选；可选账单分类、Invoice 日期范围，或选择年份与月份。「全部月份」清除日期限制，未发账单不显示日期筛选。", "在「客户 / BROKER」输入客户名称，或在搜索框输入发票号、货号、Load #、备注，点击「搜索」或按 Enter。找不到记录时先清空筛选。", "用列设置控制显示字段，点击可排序表头调整顺序；按需要拖动表头分组调整分组顺序。", "在视图菜单选择「保存当前为视图…」，输入名称。勾选「设为默认视图」后，下次进入自动应用；更改配置后用「更新当前视图」保存。也可应用、重命名或删除已有视图。"],
    note: "视图按当前账号保存，记录筛选、排序、列显示和分组顺序。保存视图不会复制或修改账单数据；固定日期范围不会自动滚动到下个月。",
  },
  {
    id: "import", title: "Excel 批量导入", role: "所有用户",
    intro: "用于批量新增或更新账单。导入数据表与打印版式样张是两种不同文件，请从本模块下载导入模板。",
    steps: ["在陆运账单点击「导入账单」→「下载导入模板」，先阅读文件中的填写说明。使用 .xlsx，文件不超过 5MB，一次最多 2000 条数据。", "填写必填列「账单编号」和「公司」；公司填写系统已有的公司代码。账单编号作为匹配依据，同一文件不要重复填写同一编号。", "填写需要导入的业务列。日期按 YYYY-MM-DD 填写；保留编号中的前导零时，先将 Excel 单元格设为文本。", "选择文件，点击「开始导入」。已有编号更新原账单，不存在的编号新增账单。", "如出现错误，按提示的 Excel 行号修正文件后重试。有行未通过校验时整批取消，不会只导入部分合格行；成功后查看新增和更新数量。"],
    note: "覆盖规则：文件中存在的列会更新原值，单元格留空即清空；文件中不存在的列保持原值。货号、明细行、Invoice 日期及对账字段不通过此入口更新；合同金额只在新增时写入。导出文件回导不等于完整恢复备份，更新前请先核对列。",
  },
  {
    id: "send", title: "发账单、打印与导出", role: "所有用户",
    intro: "发账单前，核对客户、金额、Invoice 日期，并确认所属公司已有启用模版。",
    steps: ["在未发账单行点击发送入口，或勾选后点击「批量发账单」，一次最多 40 条，所选账单均须尚未发送。", "在弹窗选择 Invoice 日期并确认。系统保存日期，再在新窗口打开单份或合并 PDF；请允许本站弹出窗口。", "保存或打印 PDF 后，按实际工作流程自行交付客户。当前发账单操作不自动发送邮件，也不提供邮件送达确认。", "需要重打时打开账单 PDF，或勾选后使用批量打印入口（最多 40 条）。打印与导出本身不会填写 Invoice 日期。", "在「批量导出」中选择「导出筛选结果」「导出全部数据」或「导出选中」，分别下载当前筛选范围、全部数据或勾选记录的 Excel 文件。"],
    note: "若发账单后 PDF 打开失败，先刷新确认 Invoice 日期是否已经写入；已写入时直接重打 PDF，不要重复发账单。PDF 使用公司当前启用模版，重新打印可能与旧版版式不同。",
  },
  {
    id: "adjustments", title: "负数账单、扣钱说明与删除", role: "所有用户",
    intro: "批量操作前核对已选记录及数量，避免把其他已勾选账单一起修改。",
    steps: ["切换到「负数账单」，勾选目标记录，点击「批量修改 Invoice 日期」，选择日期并确认，一次最多 1000 条。", "在「已收未平」或「有扣钱」中勾选记录，点击「修改扣钱」。输入说明后保存，最多 200 字；留空可清除说明，一次最多 1000 条。", "需要删除时，使用行内「删除」或勾选后「批量删除」，阅读确认提示并核对编号。存在核销记录的账单不能直接删除，包括已撤销记录；撤销核销后仍不能删除账单。"],
    note: "扣钱是文字说明，不会自动扣减金额或改变差额。删除账单不可撤销；请先确认记录确实不再需要。",
  },
  {
    id: "receipts", title: "出纳登记收款", role: "所有用户", href: "/dashboard/finance/reconciliation", action: "打开出纳核销",
    intro: "入口：财务管理 → 出纳核销。「待收」用于找到账单，「已收」用于查询核销记录。",
    steps: ["在「待收」中选择公司，或输入 Invoice、货号、Load #、备注关键词查找账单，核对公司和账单编号；打开登记收款弹窗后再核对账单信息。", "待收列表只包含已发、Invoice 金额大于 0 且有效已收金额小于 Invoice 金额的账单；未发和负数账单不会出现在这里。", "点击目标账单的登记收款入口，填写支票日期、本次金额和支票号码，备注可选。金额必须大于 0，最多两位小数；支票号码只允许英文字母和数字。", "点击「确认核销」。同一账单可分多次登记，每次仅填写本次实际收款，不要重复填累计已收金额。", "到「已收」查看新增记录。使用支票日期范围、公司、关键词和状态筛选查询；从某账单查看记录时会限定该账单。"],
    note: "差额 = 有效核销记录的收款合计 − Invoice 金额。负数表示尚有未收金额，0 表示金额一致，正数表示超收。撤销记录不计入有效已收金额。",
  },
  {
    id: "corrections", title: "修改与撤销核销记录", role: "仅管理员",
    intro: "普通用户可登记和查询收款；核销记录的修改与撤销由管理员处理。",
    steps: ["进入出纳核销的「已收」，找到需要更正的有效记录。", "点击「修改」，调整支票日期、金额、号码或备注，点击「确认修改」。原记录会标记为已撤销，并生成一条替代记录。", "登记重复或不应收款时点击「撤销」，填写撤销原因，再点击「确认撤销」。", "按状态查询已撤销记录及原因，并回到账单核对最新已收金额与差额。已撤销记录不再提供修改或再次撤销入口。"],
    note: "撤销会保留原记录，不是删除历史。确认前请核对支票号码与金额。",
  },
  {
    id: "companies", title: "公司管理", role: "仅管理员", href: "/dashboard/companies", action: "打开公司管理",
    intro: "入口：基础管理 → 公司管理。公司信息用于账单归属、编号前缀和打印模版关联。",
    steps: ["点击新增公司的按钮，填写唯一的公司代码、公司名称及发票号前缀，保存后检查列表。", "修改公司时点击「编辑」，可调整名称和发票号前缀；公司代码创建后不可修改。", "用启用状态控制公司是否用于新建账单。停用不会删除该公司的历史账单。", "检查模版概况；若没有启用模版，到「账单模版管理」上传或复制草稿、绑定字段并发布。"],
    note: "普通用户看不到基础管理菜单。如果需要新增公司或配置模版，请联系管理员。",
  },
];

export default function OperationsHelpPage() {
  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="rounded-xl border bg-card p-6 sm:p-8">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300"><BookOpen className="size-4" aria-hidden="true" />帮助 · 日常操作</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">系统操作手册</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">按实际工作顺序，从录入账单到核对收款。每章包含入口、操作步骤和结果说明，可通过目录直接跳到需要的内容。</p>
      <Link href="/dashboard/help/invoice-templates" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium underline underline-offset-4">账单模版操作手册 <ArrowRight className="size-4" aria-hidden="true" /></Link>
    </header>
    <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="系统操作手册目录" className="rounded-xl border bg-card p-3 lg:sticky lg:top-20">
        <p className="px-3 py-2 text-xs font-semibold text-muted-foreground">本页目录</p>
        {chapters.map((chapter, index) => <a key={chapter.id} href={`#${chapter.id}`} className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm leading-6 hover:bg-muted focus-visible:outline-2 focus-visible:outline-amber-600">{index + 1}. {chapter.title}</a>)}
        <a href="#faq" className="flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-muted">常见问题</a>
      </nav>
      <article className="min-w-0 space-y-5">
        {chapters.map((chapter, index) => <section id={chapter.id} key={chapter.id} className="scroll-mt-24 rounded-xl border bg-card p-5 sm:p-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{index + 1}. {chapter.title}</h2><span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{chapter.role}</span></div>
          <p className="mb-4 text-sm leading-7 text-muted-foreground">{chapter.intro}</p>
          <ol className="list-decimal space-y-3 pl-5 text-sm leading-7">{chapter.steps.map(step => <li key={step} className="pl-1">{step}</li>)}</ol>
          <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">{chapter.note}</p>
          {chapter.href && <Link href={chapter.href} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium underline underline-offset-4">{chapter.action}<ArrowRight className="size-4" aria-hidden="true" /></Link>}
        </section>)}
        <section id="faq" className="scroll-mt-24 rounded-xl border bg-card p-5 sm:p-7"><h2 className="mb-4 text-lg font-semibold">常见问题</h2><div className="divide-y">{[
          ["保存后找不到新账单", "先切到未发账单并清空搜索、公司等条件。已保存的默认视图也可能限制范围。新建账单尚无 Invoice 日期，按月份查找时可能被排除。"],
          ["PDF 没有弹出或提示没有模版", "允许本站弹出窗口后重试；没有启用模版时联系管理员。若发账单已写入日期，只需重打 PDF。"],
          ["导入失败，是否已经更新了一部分？", "出现行校验错误时整批取消，未写入数据。按行号修正后重新导入；成功提示会列出新增和更新数量。"],
          ["填了扣钱，为什么差额没有变化？", "扣钱说明不参与计算。差额只根据 Invoice 金额和有效核销金额计算，请核对实际收款记录。"],
          ["如何配置打印模版？", "管理员进入基础管理的账单模版管理，按独立的账单模版操作手册完成上传、编辑、绑定、试打和发布。"],
        ].map(([question, answer]) => <div className="py-4" key={question}><h3 className="text-sm font-semibold">{question}</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">{answer}</p></div>)}</div></section>
      </article>
    </div>
  </div>;
}
