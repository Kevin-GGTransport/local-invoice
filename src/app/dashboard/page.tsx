import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpen, Building2, CalendarDays, CheckCheck, CircleDollarSign, FileSliders, ReceiptText, Send } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import styles from "./page.module.css";

const invoicesHref = "/dashboard/finance/accounting-invoices";

async function readOverview() {
  const [total, unsent, negative, companies, recent] = await Promise.all([
    prisma.accounting_invoices.count(),
    prisma.accounting_invoices.count({ where: { invoice_date: null } }),
    prisma.accounting_invoices.count({ where: { invoice_price: { lt: 0 } } }),
    prisma.companies.count({ where: { is_active: true } }),
    prisma.accounting_invoices.findMany({
      take: 5,
      orderBy: [{ updated_at: "desc" }, { id: "desc" }],
      select: { id: true, invoice_number: true, company: true, bill_to: true, invoice_date: true, updated_at: true },
    }),
  ]);
  return { total, unsent, negative, companies, recent };
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const overview = await readOverview().catch((error: unknown) => {
    console.error("Dashboard overview could not be loaded", error);
    return null;
  });
  const now = new Date();
  const date = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", weekday: "long" }).format(now);
  const metrics = [
    { label: "全部账单", value: overview?.total, note: "已录入的陆运账单", icon: ReceiptText },
    { label: "未发账单", value: overview?.unsent, note: "Invoice 日期尚未填写", icon: Send },
    { label: "负数账单", value: overview?.negative, note: "Invoice 金额小于 0", icon: CircleDollarSign },
    { label: "启用公司", value: overview?.companies, note: "当前可用的业务公司", icon: Building2 },
  ];

  return (
    <div className={styles.console}>
      <header className={styles.heading}>
        <div><p className={styles.eyebrow}>G&amp;G · 财务工作台</p><h1>控制台</h1><p className={styles.subtitle}>欢迎，{session.user.name ?? "用户"}。从这里开始今天的账单工作。</p></div>
        <div className={styles.date}><CalendarDays size={16} aria-hidden="true" /><span>{date}</span></div>
      </header>

      {overview === null && <div className={styles.alert} role="alert">暂时无法加载账单概况，请刷新页面重试。你仍可通过下方入口进入业务页面。<a href="/dashboard">重新加载 <ArrowRight size={14} aria-hidden="true" /></a></div>}

      <section aria-label="业务概况" className={styles.metrics}>
        {metrics.map(({ label, value, note, icon: Icon }) => <article className={styles.metric} key={label}>
          <div className={styles.metricLabel}><span>{label}</span><Icon size={17} aria-hidden="true" /></div>
          <p className={styles.number}>{value === undefined ? "—" : value.toLocaleString("zh-CN")}<span>{label === "启用公司" ? "家" : "笔"}</span></p>
          <p className={styles.note}>{note}</p>
        </article>)}
      </section>

      <section className={styles.workflow} aria-labelledby="workflow-title">
        <div className={styles.workflowIntro}><span className={styles.sectionTag}>日常工作</span><h2 id="workflow-title">从账单，到收款。</h2><p>录入与发送账单，再登记收款、核对差额。</p><span className={styles.workflowHint}><CheckCheck size={15} aria-hidden="true" /> 每一步，都有清楚的去处</span></div>
        <Link href={invoicesHref} className={styles.workStep}>
          <span className={styles.stepTop}><span className={styles.stepIcon}><ReceiptText size={22} aria-hidden="true" /></span><span className={styles.stepLabel}>账单处理</span></span>
          <h3>陆运账单</h3><p>新建、导入、发送与导出账单</p><span className={styles.workAction}>管理账单 <ArrowRight size={17} aria-hidden="true" /></span>
        </Link>
        <Link href="/dashboard/finance/reconciliation" className={styles.workStep}>
          <span className={styles.stepTop}><span className={styles.stepIcon}><CircleDollarSign size={22} aria-hidden="true" /></span><span className={styles.stepLabel}>收款核对</span></span>
          <h3>出纳核销</h3><p>登记支票收款，查看核销记录</p><span className={styles.workAction}>进入核销 <ArrowRight size={17} aria-hidden="true" /></span>
        </Link>
      </section>

      <div className={styles.lower}>
        <section className={styles.panel} aria-labelledby="recent-title">
          <div className={styles.panelHeading}><div><h2 id="recent-title">最近更新的账单</h2><p>快速接着处理最近的工作</p></div><Link className={styles.textLink} href={invoicesHref}>全部账单 <ArrowRight size={15} aria-hidden="true" /></Link></div>
          {overview && overview.recent.length > 0 ? <ul className={styles.recentList}>{overview.recent.map((invoice) => <li key={invoice.id.toString()}><Link className={styles.invoiceRow} href={`${invoicesHref}/${invoice.id}`}>
            <span className={styles.receiptIcon}><ReceiptText size={19} aria-hidden="true" /></span>
            <span className={styles.invoiceInfo}><strong>{invoice.invoice_number}</strong><span>{invoice.company} · {invoice.bill_to || "未填写客户"}</span></span>
            <span className={invoice.invoice_date ? styles.sent : styles.unsent}>{invoice.invoice_date ? "已发账单" : "未发账单"}</span>
            <time className={styles.rowDate} dateTime={invoice.updated_at.toISOString()}>{new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit" }).format(invoice.updated_at)}</time>
            <ArrowRight className={styles.rowArrow} size={16} aria-hidden="true" />
          </Link></li>)}</ul> : <div className={styles.empty}><ReceiptText size={30} aria-hidden="true" /><h3>{overview ? "还没有账单" : "账单列表暂时不可用"}</h3><p>{overview ? "进入陆运账单，新建或导入第一笔账单。" : "稍后刷新重试，或进入陆运账单查看。"}</p><Link className={styles.textLink} href={invoicesHref}>进入陆运账单 <ArrowRight size={15} aria-hidden="true" /></Link></div>}
        </section>

        <aside className={styles.side}>
          {session.user.role === "admin" && <section className={styles.panel} aria-labelledby="settings-title"><div className={styles.panelHeading}><h2 id="settings-title">基础管理</h2></div>
            <Link className={styles.shortcut} href="/dashboard/companies"><Building2 size={19} aria-hidden="true" /><span><strong>公司管理</strong><span>维护公司信息与账单前缀</span></span><ArrowRight size={16} aria-hidden="true" /></Link>
            <Link className={styles.shortcut} href="/dashboard/templates"><FileSliders size={19} aria-hidden="true" /><span><strong>账单模版</strong><span>编辑、预览与发布打印模版</span></span><ArrowRight size={16} aria-hidden="true" /></Link>
          </section>}
          <section className={styles.help}><BookOpen size={21} aria-hidden="true" /><h2>账单模版怎么用？</h2><p>从上传 Excel 到发布模版，按操作手册完成设置。</p><Link className={styles.textLink} href="/dashboard/help/invoice-templates">查看操作手册 <ArrowRight size={15} aria-hidden="true" /></Link></section>
        </aside>
      </div>
      <footer className={styles.footer}><span>统计范围：全部公司 · 全部时间</span><span>页面加载时更新 · 未发与负数账单可能重叠</span></footer>
    </div>
  );
}
