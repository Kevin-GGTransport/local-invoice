"use client";

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchJson, getApiErrorMessage } from '@/lib/api/client';
import { columnName, type NativeExcelDetail } from '@/lib/templates/native-excel-types';
import { TEMPLATE_FIELDS, type TemplateBinding } from '@/lib/templates/types';

function addressPoint(address: string) {
  const match = /^([A-Z]{1,2})([1-9]\d{0,2}|1000)$/.exec(address.trim().toUpperCase());
  if (!match) throw new Error(`单元格地址无效：${address}，例如 F5`);
  const col = [...match[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  if (col > 99) throw new Error('目前支持 A 至 CV 列');
  return { col, row: Number(match[2]) - 1 };
}

export function NativeExcelEditor({ id }: { id: string }) {
  const router = useRouter();
  const [detail, setDetail] = React.useState<NativeExcelDetail>();
  const [name, setName] = React.useState('');
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [columns, setColumns] = React.useState<Record<string, string>>({});
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [pdf, setPdf] = React.useState('');
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    fetchJson<NativeExcelDetail>(`/api/admin/invoice-templates/${id}`).then(d => {
      if (cancelled) return;
      setDetail(d); setName(d.name);
      setFields(Object.fromEntries(TEMPLATE_FIELDS.map(f => [f.key, (d.binding_config.fields[f.key]?.cells ?? []).map(p => `${columnName(p.col)}${p.row + 1}`).join(', ')])));
      const li = d.binding_config.lineItems;
      setStart(li ? String(li.startRow + 1) : ''); setEnd(li ? String(li.endRow + 1) : '');
      setColumns(Object.fromEntries(Object.entries(li?.columns ?? {}).map(([k, c]) => [k, columnName(c)])));
    }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [id]);
  React.useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf); }, [pdf]);
  React.useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function binding(): TemplateBinding {
    const result: TemplateBinding = { fields: {}, lineItems: null };
    for (const f of TEMPLATE_FIELDS) {
      const addresses = fields[f.key]?.trim();
      if (addresses) result.fields[f.key] = { format: f.format, cells: addresses.split(/[,，\s]+/).filter(Boolean).map(addressPoint) };
    }
    if (start || end || Object.values(columns).some(Boolean)) {
      if (!/^[1-9]\d*$/.test(start) || !/^[1-9]\d*$/.test(end)) throw new Error('请输入有效的明细起始行和结束行');
      result.lineItems = { startRow: Number(start) - 1, endRow: Number(end) - 1, minRows: Number(end) - Number(start) + 1, columns: Object.fromEntries(Object.entries(columns).filter(([, c]) => c.trim()).map(([k, c]) => [k, addressPoint(`${c.trim()}1`).col])) };
    }
    return result;
  }
  async function save() {
    if (detail?.status !== 'draft') return;
    await fetchJson(`/api/admin/invoice-templates/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, native_binding: binding() }) });
    setDirty(false);
  }
  async function action(task: () => Promise<void>) {
    setBusy(true); setError('');
    try { await task(); } catch (e) { const msg = e instanceof Error ? e.message : '操作失败'; setError(msg); toast.error(msg); }
    finally { setBusy(false); }
  }
  async function preview(source: boolean) {
    if (!source) await save();
    const response = await fetch(`/api/admin/invoice-templates/${id}/preview-pdf${source ? '?source=1' : ''}`, { method: 'POST' });
    if (!response.ok) throw new Error(await getApiErrorMessage(response, '预览失败'));
    setPdf(URL.createObjectURL(await response.blob()));
  }
  async function sampleDownload() {
    await save();
    const response = await fetch(`/api/admin/invoice-templates/${id}/source?sample=1`);
    if (!response.ok) throw new Error(await getApiErrorMessage(response, '下载失败'));
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement('a'); a.href = url; a.download = `示例-${detail?.source.filename || 'template.xlsx'}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  if (!detail) return <div className="p-6">{error || '正在加载 Excel 模板…'}</div>;
  const editable = detail.status === 'draft' && !busy;
  return <div className="space-y-5 p-6">
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" onClick={() => { if (!dirty || window.confirm('变量绑定尚未保存，是否离开？')) router.push('/dashboard/templates'); }}>返回模板列表</Button>
      <Input aria-label="模板名称" className="max-w-xs" value={name} disabled={!editable} onChange={e => { setName(e.target.value); setDirty(true); }} />
      <span className="text-sm">{detail.company.name} · 原 Excel 模式 · {detail.status === 'draft' ? '草稿' : '已发布（只读）'}</span>
      {dirty && <span className="text-sm text-amber-700">有未保存修改</span>}
    </div>
    <p className="text-sm text-muted-foreground">原文件：{detail.source.filename}。在「{detail.source.sheetName}」中绑定单元格地址，合并单元格填左上角地址。样式、公式、图片和打印设置来自上传的 Excel。修改版式请在 Excel 中编辑后上传为新模板。</p>
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline"><Link href={`/api/admin/invoice-templates/${id}/source`}>下载原 Excel</Link></Button>
      <Button disabled={busy} variant="outline" onClick={() => void action(() => preview(true))}>预览原件 PDF</Button>
      <Button disabled={busy} variant="outline" onClick={() => void action(sampleDownload)}>下载示例 Excel</Button>
      <Button disabled={busy} variant="outline" onClick={() => void action(() => preview(false))}>预览填入数据后的 PDF</Button>
      {detail.status === 'draft' ? <>
        <Button disabled={busy} onClick={() => void action(async () => { await save(); toast.success('变量绑定已保存'); })}>保存绑定</Button>
        <Button disabled={busy} onClick={() => void action(async () => { await save(); await fetchJson(`/api/admin/invoice-templates/${id}/publish`, { method: 'POST' }); setDetail({ ...detail, status: 'active' }); toast.success('模板已发布'); })}>发布模板</Button>
      </> : <Button disabled={busy} onClick={() => void action(async () => { const copy = await fetchJson<{id: string}>(`/api/admin/invoice-templates/${id}/duplicate`, {method: 'POST'}); router.push(`/dashboard/templates/${copy.id}`); })}>复制为新草稿</Button>}
    </div>
    {error && <p role="alert" className="rounded border border-destructive p-3 text-sm text-destructive">{error}</p>}
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <div className="space-y-4 rounded-lg border p-4">
        <h2 className="font-medium">变量对应的单元格</h2>
        <p className="text-xs text-muted-foreground">例如 F5；多个位置可填 F5, F38。不使用的字段留空，原文件中的文字会保留。</p>
        {TEMPLATE_FIELDS.map(f => <label key={f.key} className="grid grid-cols-[1fr_130px] items-center gap-2 text-sm">
          {f.label}<Input value={fields[f.key] || ''} placeholder="例如 F5" disabled={!editable} onChange={e => { setFields({ ...fields, [f.key]: e.target.value }); setDirty(true); }} />
        </label>)}
        <h2 className="border-t pt-4 font-medium">明细预留区域</h2>
        <label className="flex items-center justify-between gap-2 text-sm">起始行<Input className="w-32" value={start} placeholder="24" disabled={!editable} onChange={e => { setStart(e.target.value); setDirty(true); }} /></label>
        <label className="flex items-center justify-between gap-2 text-sm">结束行<Input className="w-32" value={end} placeholder="37" disabled={!editable} onChange={e => { setEnd(e.target.value); setDirty(true); }} /></label>
        {Object.entries({description:'描述列（必填）', amount:'金额列（必填）', quantity:'数量列（可选）', unitPrice:'单价列（可选）'}).map(([key,label]) => <label key={key} className="flex items-center justify-between gap-2 text-sm">{label}<Input className="w-32" disabled={!editable} value={columns[key] || ''} placeholder={key === 'description' ? 'B' : 'F'} onChange={e => {setColumns({...columns,[key]:e.target.value});setDirty(true);}} /></label>)}
        <p className="text-xs text-muted-foreground">只填入预留行，不移动总计和页脚。超出容量会提示增加 Excel 预留行。金额列请在 Excel 中设置货币格式。</p>
      </div>
      <div className="min-h-[700px] rounded-lg border bg-muted/20">
        {pdf ? <iframe title="Excel 打印预览" src={pdf} className="h-[900px] w-full" /> : <div className="p-8 text-sm text-muted-foreground">点击上方预览按钮查看原 Excel 的打印效果。PDF 使用服务器的表格转换引擎，字体需与原件一致；原 Excel 可直接下载核对。</div>}
      </div>
    </div>
  </div>;
}
