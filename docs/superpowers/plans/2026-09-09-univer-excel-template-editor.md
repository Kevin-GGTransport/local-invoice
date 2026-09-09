# Univer Excel 模板编辑器 + 令牌式绑定 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Univer Excel 引擎替换自研模板网格编辑器；绑定改为单元格写 `{{令牌}}` 即绑定；绑定值多行渲染 + 行高自适应。

**Architecture:** TemplateGrid JSON 仍是唯一数据源（DB schema、PDF 服务签名不变）。新增令牌推导纯函数（保存/发布/预览共用）、Univer 桥接层（TemplateGrid ↔ Univer 快照双向转换）、UniverEditor 容器组件；`renderTemplateData` 改为令牌子串替换 + 对替换格强制 wrap + 行高自适应。存量模板用一次性脚本迁移到令牌。

**Tech Stack:** Next.js 16 App Router、React 19、`@univerjs/presets` + `@univerjs/preset-sheets-core`（版本精确锁定）、react-pdf、ExcelJS、node:test + tsx。

**Spec:** `docs/superpowers/specs/2026-09-09-univer-excel-template-editor-design.md`

## Global Constraints

- 文案与错误消息一律中文（项目铁律）
- Prisma 固定 ^6.19.0，数据库 schema 零改动（本计划无迁移）
- Univer 依赖必须**精确版本**（不带 `^`），两个包同版本；0.x 防意外升级
- 测试框架 node:test + `tsx --test`；**每个新测试文件都要加进 `package.json` 的 `test` script**（该脚本是显式文件清单）
- 边框线型/宽度映射单一来源：`src/lib/templates/border-style.ts`（parse-xlsx、univer-bridge、PDF 渲染共用，禁止各自定义映射）
- 单测不依赖浏览器/DOM；Univer 类型只允许出现在 `src/components/templates/univer-editor.tsx` 与 `univer-bridge.ts` 的最小本地类型中（桥接层用本地结构化类型，不 import Univer 包，保证 node:test 可跑）
- 现有 4 套模板测试 + generic-template-pdf 测试必须全绿；除非测试断言的行为是本计划**有意**改变的（只有一处：绑定格强制 wrap 后行为，见 Task 2）
- 每个任务结束时跑 `pnpm type-check` 通过再提交

---

### Task 1: 令牌绑定模块 `token-binding.ts`

**Files:**
- Create: `src/lib/templates/token-binding.ts`
- Test: `src/lib/templates/__tests__/token-binding.test.ts`
- Modify: `package.json`（test script 追加新测试文件）

**Interfaces:**
- Consumes: `TEMPLATE_FIELDS`、`TemplateFieldKey`、`LineItemsBinding`、`TemplateBinding`、`TemplateGrid`（均来自 `./types`，已存在）
- Produces（后续任务依赖，签名固定）:
  - `FIELD_TOKENS: Record<TemplateFieldKey, string>`
  - `DETAIL_TOKENS: { description: '{{描述}}'; quantity: '{{数量}}'; unitPrice: '{{单价}}'; amount: '{{金额}}' }`
  - `type DetailRole = keyof typeof DETAIL_TOKENS`
  - `deriveBindingFromGrid(grid: TemplateGrid, opts?: { minRows?: number }): DerivedBinding`，`DerivedBinding = { binding: TemplateBinding; unknownTokens: string[]; errors: string[] }`
  - `containsFieldToken(text: string, key: TemplateFieldKey): boolean`
  - `replaceFieldToken(text: string, key: TemplateFieldKey, value: string): string`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/templates/__tests__/token-binding.test.ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  FIELD_TOKENS,
  DETAIL_TOKENS,
  deriveBindingFromGrid,
  containsFieldToken,
  replaceFieldToken,
} from '../token-binding'
import type { TemplateGrid } from '../types'

function cell(row: number, col: number, text: string) {
  return { row, col, rowSpan: 1, colSpan: 1, text, style: {} }
}

function grid(cells: ReturnType<typeof cell>[], rows = 8, cols = 6): TemplateGrid {
  return { colWidths: Array.from({ length: cols }, () => 50), rowHeights: Array.from({ length: rows }, () => 20), cells }
}

describe('deriveBindingFromGrid', () => {
  it('纯令牌格推导字段绑定（含同字段多格）', () => {
    const g = grid([cell(0, 1, '{{发票号}}'), cell(2, 0, '{{发票号}}'), cell(3, 3, '{{合计}}')])
    const { binding, unknownTokens, errors } = deriveBindingFromGrid(g)
    assert.deepEqual(binding.fields.invoice_number?.cells, [{ row: 0, col: 1 }, { row: 2, col: 0 }])
    assert.deepEqual(binding.fields.total?.cells, [{ row: 3, col: 3 }])
    assert.equal(binding.fields.total?.format, 'money')
    assert.deepEqual(unknownTokens, [])
    assert.deepEqual(errors, [])
  })

  it('令牌嵌在静态文本中也能推导，且空白宽容', () => {
    const g = grid([cell(0, 0, 'Invoice No: {{ 发票号 }}')])
    const { binding } = deriveBindingFromGrid(g)
    assert.deepEqual(binding.fields.invoice_number?.cells, [{ row: 0, col: 0 }])
  })

  it('明细令牌同行推导 lineItems（单行区域 + 列角色）', () => {
    const g = grid([cell(1, 0, '{{描述}}'), cell(1, 1, '{{数量}}'), cell(1, 2, '{{单价}}'), cell(1, 3, '{{金额}}')])
    const { binding } = deriveBindingFromGrid(g, { minRows: 7 })
    assert.deepEqual(binding.lineItems, {
      startRow: 1,
      endRow: 1,
      columns: { description: 0, quantity: 1, unitPrice: 2, amount: 3 },
      minRows: 7,
    })
  })

  it('明细令牌分散多行报结构错误', () => {
    const g = grid([cell(1, 0, '{{描述}}'), cell(2, 3, '{{金额}}')])
    const { binding, errors } = deriveBindingFromGrid(g)
    assert.equal(binding.lineItems, null)
    assert.ok(errors.length === 1 && errors[0].includes('明细令牌'))
  })

  it('同一明细令牌出现在同行不同列报错', () => {
    const g = grid([cell(1, 0, '{{描述}}'), cell(1, 4, '{{描述}}')])
    const { errors } = deriveBindingFromGrid(g)
    assert.ok(errors.some((e) => e.includes('{{描述}}')))
  })

  it('未知令牌收集为警告不报错', () => {
    const g = grid([cell(0, 0, '{{不存在}}'), cell(1, 0, '{{发票号}}{{另一个}}')])
    const { unknownTokens, errors } = deriveBindingFromGrid(g)
    assert.deepEqual([...unknownTokens].sort(), ['另一个', '不存在'])
    assert.deepEqual(errors, [])
  })

  it('minRows 缺省为 10', () => {
    const g = grid([cell(0, 0, '{{描述}}')])
    assert.equal(deriveBindingFromGrid(g).binding.lineItems?.minRows, 10)
  })
})

describe('containsFieldToken / replaceFieldToken', () => {
  it('检测与替换（含空白变体、多处出现）', () => {
    const text = 'Invoice No: {{发票号}} / {{ 发票号 }}'
    assert.equal(containsFieldToken(text, 'invoice_number'), true)
    assert.equal(containsFieldToken(text, 'total'), false)
    assert.equal(replaceFieldToken(text, 'invoice_number', 'A1'), 'Invoice No: A1 / A1')
    // 令牌含正则元字符（Load No. 的点号）不被误解释
    assert.equal(replaceFieldToken('L: {{Load No.}}', 'load_number', '99'), 'L: 99')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec tsx --test src/lib/templates/__tests__/token-binding.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// src/lib/templates/token-binding.ts
/**
 * 账单模版 —— 令牌式字段绑定
 * 单元格文本中出现 {{令牌}} 即视为绑定；deriveBindingFromGrid 扫描网格推导
 * TemplateBinding，是 binding_config 的唯一生成来源（保存 / 发布 / 预览共用）。
 */

import {
  TEMPLATE_FIELDS,
  type LineItemsBinding,
  type TemplateBinding,
  type TemplateFieldKey,
  type TemplateGrid,
} from "./types";

/** 字段令牌（写入单元格即绑定） */
export const FIELD_TOKENS: Record<TemplateFieldKey, string> = {
  invoice_number: "{{发票号}}",
  invoice_date: "{{发票日期}}",
  load_number: "{{Load No.}}",
  bill_to: "{{收款方}}",
  total: "{{合计}}",
  pickup_date: "{{取货日期}}",
  pickup_company: "{{取货公司}}",
  pickup_address: "{{取货地址}}",
  drop_date: "{{交货日期}}",
  drop_company: "{{交货公司}}",
  drop_address: "{{交货地址}}",
};

/** 明细令牌（出现在同一行即定义明细模板行） */
export const DETAIL_TOKENS = {
  description: "{{描述}}",
  quantity: "{{数量}}",
  unitPrice: "{{单价}}",
  amount: "{{金额}}",
} as const;

export type DetailRole = keyof typeof DETAIL_TOKENS;

export interface DerivedBinding {
  binding: TemplateBinding;
  /** 文本中出现的未知令牌（如 {{xxx}}），保存时提示、不阻断 */
  unknownTokens: string[];
  /** 结构性错误（明细令牌分散多行等），阻断保存/发布 */
  errors: string[];
}

const TOKEN_TO_FIELD = new Map<string, TemplateFieldKey>(
  TEMPLATE_FIELDS.map((f) => [FIELD_TOKENS[f.key], f.key])
);
const TOKEN_TO_DETAIL = new Map<string, DetailRole>(
  (Object.keys(DETAIL_TOKENS) as DetailRole[]).map((role) => [DETAIL_TOKENS[role], role])
);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 提取文本中全部令牌（已去首尾空白） */
export function extractTokens(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((m) => m[1].trim());
}

function tokenRegex(key: TemplateFieldKey): RegExp {
  const inner = escapeRegExp(FIELD_TOKENS[key].slice(2, -2));
  return new RegExp(`\\{\\{\\s*${inner}\\s*\\}\\}`, "g");
}

export function containsFieldToken(text: string, key: TemplateFieldKey): boolean {
  if (!text.includes("{{")) return false;
  return new RegExp(tokenRegex(key).source).test(text);
}

export function replaceFieldToken(text: string, key: TemplateFieldKey, value: string): string {
  if (!text.includes("{{")) return text;
  return text.replace(tokenRegex(key), value);
}

export function deriveBindingFromGrid(
  grid: TemplateGrid,
  opts?: { minRows?: number }
): DerivedBinding {
  const fields: TemplateBinding["fields"] = {};
  const detailRows = new Map<number, { role: DetailRole; col: number }[]>();
  const unknownTokens = new Set<string>();
  const errors: string[] = [];

  for (const cell of grid.cells) {
    for (const token of extractTokens(cell.text)) {
      const fieldKey = TOKEN_TO_FIELD.get(token);
      if (fieldKey) {
        const format = TEMPLATE_FIELDS.find((f) => f.key === fieldKey)!.format;
        const existing = fields[fieldKey] ?? { cells: [], format };
        if (!existing.cells.some((c) => c.row === cell.row && c.col === cell.col)) {
          existing.cells.push({ row: cell.row, col: cell.col });
        }
        fields[fieldKey] = existing;
        continue;
      }
      const role = TOKEN_TO_DETAIL.get(token);
      if (role) {
        const list = detailRows.get(cell.row) ?? [];
        list.push({ role, col: cell.col });
        detailRows.set(cell.row, list);
        continue;
      }
      unknownTokens.add(token);
    }
  }

  for (const key of Object.keys(fields) as TemplateFieldKey[]) {
    const config = fields[key]!;
    if (config.cells.length === 0) delete fields[key];
    else config.cells.sort((a, b) => a.row - b.row || a.col - b.col);
  }

  let lineItems: LineItemsBinding | null = null;
  if (detailRows.size > 1) {
    const rows = [...detailRows.keys()].sort((a, b) => a - b).map((r) => r + 1).join("、");
    errors.push(`明细令牌（${DETAIL_TOKENS.description} 等）只能出现在同一行，当前分布在第 ${rows} 行`);
  } else if (detailRows.size === 1) {
    const [row, list] = [...detailRows][0];
    const columns: LineItemsBinding["columns"] = {};
    for (const { role, col } of list) {
      if (columns[role] != null && columns[role] !== col) {
        errors.push(`明细令牌 ${DETAIL_TOKENS[role]} 在同一行只能出现一次`);
      } else {
        columns[role] = col;
      }
    }
    lineItems = { startRow: row, endRow: row, columns, minRows: opts?.minRows ?? 10 };
  }

  return { binding: { fields, lineItems }, unknownTokens: [...unknownTokens], errors };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec tsx --test src/lib/templates/__tests__/token-binding.test.ts`
Expected: PASS 全绿

- [ ] **Step 5: 加入 pnpm test 清单并提交**

`package.json` 的 `"test"` script 文件列表末尾追加 ` src/lib/templates/__tests__/token-binding.test.ts`。

Run: `pnpm type-check && pnpm test`
Expected: 全绿

```bash
git add src/lib/templates/token-binding.ts src/lib/templates/__tests__/token-binding.test.ts package.json
git commit -m "feat(templates): 令牌式绑定推导模块"
```

---

### Task 2: `render-template-data` 令牌子串替换 + 绑定格强制 wrap

**Files:**
- Modify: `src/lib/templates/render-template-data.ts`
- Test: `src/lib/templates/__tests__/render-template-data.test.ts`（追加用例）

**Interfaces:**
- Consumes: Task 1 的 `containsFieldToken`、`replaceFieldToken`
- Produces: `renderTemplateData(grid, binding, data)` 签名不变；行为变化——① 含令牌的绑定格只替换令牌部分 ② 被替换值的格子 `style.wrap = true`（下游排版永不缩字号）

- [ ] **Step 1: 追加失败测试**（追加到现有 describe 内）

```ts
  it('绑定格含令牌时只替换令牌、保留静态文本，并强制 wrap', () => {
    const g = grid(2, 2)
    g.cells = [{ row: 0, col: 0, rowSpan: 1, colSpan: 1, text: 'Invoice No: {{发票号}}', style: {} }]
    const binding: TemplateBinding = {
      fields: { invoice_number: { cells: [{ row: 0, col: 0 }], format: 'text' } },
      lineItems: null,
    }
    const out = renderTemplateData(g, binding, sampleTemplateRenderData())
    const target = out.cells.find((c) => c.row === 0 && c.col === 0)!
    assert.equal(target.text, 'Invoice No: AA082026001')
    assert.equal(target.style.wrap, true)
  })

  it('绑定格不含令牌（旧数据）时整格替换，行为与旧版一致', () => {
    const g = grid(2, 2)
    g.cells = [{ row: 0, col: 0, rowSpan: 1, colSpan: 1, text: '旧占位文本', style: {} }]
    const binding: TemplateBinding = {
      fields: { invoice_number: { cells: [{ row: 0, col: 0 }], format: 'text' } },
      lineItems: null,
    }
    const out = renderTemplateData(g, binding, sampleTemplateRenderData())
    const target = out.cells.find((c) => c.row === 0 && c.col === 0)!
    assert.equal(target.text, 'AA082026001')
    assert.equal(target.style.wrap, true)
  })

  it('明细模板行令牌格生成的数据行也强制 wrap', () => {
    const g = grid(3, 2)
    g.cells = [
      { row: 1, col: 0, rowSpan: 1, colSpan: 1, text: '{{描述}}', style: {} },
      { row: 1, col: 1, rowSpan: 1, colSpan: 1, text: '{{金额}}', style: {} },
    ]
    const binding: TemplateBinding = {
      fields: {},
      lineItems: { startRow: 1, endRow: 1, columns: { description: 0, amount: 1 }, minRows: 2 },
    }
    const out = renderTemplateData(g, binding, sampleTemplateRenderData())
    const desc = out.cells.find((c) => c.row === 1 && c.col === 0)!
    assert.equal(desc.text, 'Carrier Charge')
    assert.equal(desc.style.wrap, true)
  })
```

- [ ] **Step 2: 跑测试确认新用例失败**

Run: `pnpm exec tsx --test src/lib/templates/__tests__/render-template-data.test.ts`
Expected: 新增 3 个用例 FAIL（令牌原样保留、wrap 未设置）

- [ ] **Step 3: 实现**

`render-template-data.ts` 顶部加 import：

```ts
import { containsFieldToken, replaceFieldToken } from './token-binding'
import type { TemplateFieldKey } from './types'
```

「—— 1. 简单字段替换 ——」整段替换为：

```ts
  // —— 1. 简单字段替换 ——
  // 含令牌的格只替换令牌部分（支持「Invoice No: {{发票号}}」标签+值模式）；
  // 不含令牌的旧数据整格替换。替换过值的格强制 wrap：
  // 下游排版走「多行 + 行高自适应」分支，永不缩字号。
  const cells = grid.cells.map((cell) => ({ ...cell, style: { ...cell.style } }))
  for (const [key, fb] of Object.entries(binding.fields)) {
    if (!fb) continue
    const valueKey = FIELD_VALUE_KEY[key]
    if (!valueKey) continue
    const fieldKey = key as TemplateFieldKey
    const value = String(data[valueKey] ?? '')
    for (const anchor of fb.cells) {
      const target = cells.find((c) => c.row === anchor.row && c.col === anchor.col)
      if (!target) continue
      target.text = containsFieldToken(target.text, fieldKey)
        ? replaceFieldToken(target.text, fieldKey, value)
        : value
      target.style.wrap = true
    }
  }
```

（注意原代码 `let cells` 且后面明细段 `cells = cells.flatMap(...)` 重新赋值——把声明改回 `const cells` 不行，明细段要重赋值；保持 `let cells` 不动，只改字段替换段。）

明细生成段（`for (let i = 0; i < dataRows; i++)` 内）生成的角色列格加 wrap：

```ts
      const generated = { ...src, style: { ...src.style }, row: li.startRow + i, text: '' }
      const textFn = lineTexts[src.col]
      if (textFn) {
        generated.text = textFn(line)
        generated.style.wrap = true
      } else if (src.text) {
```

- [ ] **Step 4: 跑测试确认全部通过（含旧用例回归）**

Run: `pnpm exec tsx --test src/lib/templates/__tests__/render-template-data.test.ts`
Expected: PASS（旧 5 例 + 新 3 例）

- [ ] **Step 5: 提交**

```bash
git add src/lib/templates/render-template-data.ts src/lib/templates/__tests__/render-template-data.test.ts
git commit -m "feat(templates): 渲染支持令牌子串替换，绑定值强制多行排版"
```

---

### Task 3: 折行估算 + 行高自适应 `auto-fit-row-heights.ts`

**Files:**
- Modify: `src/lib/templates/cell-layout.ts`
- Create: `src/lib/templates/auto-fit-row-heights.ts`
- Modify: `src/lib/templates/render-template-data.ts`（末尾接入）
- Test: `src/lib/templates/__tests__/auto-fit-row-heights.test.ts`

**Interfaces:**
- Consumes: `TemplateGrid`、Task 2 的替换坐标追踪（本任务在 renderTemplateData 内部新增收集）
- Produces:
  - `LINE_HEIGHT_FACTOR = 1.3`（cell-layout 导出，PDF/HTML/自适应共用单一来源）
  - `wrapTextLines(text: string, fontSize: number, boxWidth: number, bold?: boolean): string[]`
  - `autoFitRowHeights(grid: TemplateGrid, coords?: Set<string>): TemplateGrid`（`coords` 为 `"r:c"` 集合时只处理这些格；缺省处理全部多行格）

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/templates/__tests__/auto-fit-row-heights.test.ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { wrapTextLines, LINE_HEIGHT_FACTOR } from '../cell-layout'
import { autoFitRowHeights } from '../auto-fit-row-heights'
import type { TemplateGrid } from '../types'

function cell(row: number, col: number, text: string, style: Record<string, unknown> = {}) {
  return { row, col, rowSpan: 1, colSpan: 1, text, style } as TemplateGrid['cells'][number]
}

function grid(cells: TemplateGrid['cells'], rows = 3, cols = 2): TemplateGrid {
  return { colWidths: Array.from({ length: cols }, () => 50), rowHeights: Array.from({ length: rows }, () => 20), cells }
}

describe('wrapTextLines', () => {
  it('按宽度折行，尊重显式换行，CJK 按 1em 估宽', () => {
    // 50pt 宽 / 10pt 字号 = 5em；6 个 CJK 字符 → 2 行
    assert.deepEqual(wrapTextLines('发票号码测试', 10, 50), ['发票号码测', '试'])
    assert.deepEqual(wrapTextLines('ab\ncd', 10, 100), ['ab', 'cd'])
    assert.deepEqual(wrapTextLines('', 10, 100), [''])
  })
})

describe('autoFitRowHeights', () => {
  it('wrap 格按行数撑开行高', () => {
    const g = grid([cell(0, 0, '一二三四五六七八九十', { wrap: true })])
    // 20 格 5em/行 → 4 行 → 4 × 10 × 1.3 + 2 = 54
    const out = autoFitRowHeights(g)
    assert.equal(out.rowHeights[0], 54)
    assert.equal(out.rowHeights[1], 20)
  })

  it('coords 限定时非目标格不撑高', () => {
    const g = grid([cell(0, 0, '一二三四五六七八九十', { wrap: true }), cell(1, 0, '一二三四五六七八九十', { wrap: true })])
    const out = autoFitRowHeights(g, new Set(['1:0']))
    assert.equal(out.rowHeights[0], 20)
    assert.equal(out.rowHeights[1], 54)
  })

  it('原行高更大时保持不变（返回原对象引用）', () => {
    const g = grid([cell(0, 0, '一', { wrap: true })])
    g.rowHeights[0] = 60
    assert.equal(autoFitRowHeights(g), g)
  })

  it('合并单元格跨行时高度均摊', () => {
    const g = grid([cell(0, 0, '一二三四五六', { wrap: true })])
    g.cells[0].rowSpan = 2
    const out = autoFitRowHeights(g)
    const total = out.rowHeights[0] + out.rowHeights[1]
    assert.ok(total >= 3 * 10 * LINE_HEIGHT_FACTOR + 1.9, `总高 ${total} 应按 3 行撑开`)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec tsx --test src/lib/templates/__tests__/auto-fit-row-heights.test.ts`
Expected: FAIL（模块/导出不存在）

- [ ] **Step 3: 实现 cell-layout 追加导出**

在 `cell-layout.ts` 末尾追加（不动现有 `fitSingleLineFontSize`——其 ASCII 估宽服务于缩字号场景，保持既有渲染输出不变）：

```ts
/** 多行排版的行高系数（行高自适应 / PDF / HTML 共用单一来源） */
export const LINE_HEIGHT_FACTOR = 1.3;

/** 单字符宽度（em）：折行估算用；CJK/全角按 1em，其余沿用 ASCII 经验值 */
function charEmWidth(char: string): number {
  if (/\d/.test(char)) return 0.56;
  if (/[A-Z]/.test(char)) return 0.65;
  if (/[a-z]/.test(char)) return 0.5;
  if (/\s/.test(char)) return 0.28;
  if (/[　-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/.test(char)) return 1;
  return 0.6;
}

/** 按盒宽把文本折成行（尊重显式 \n；CJK 可在任意字符间断行） */
export function wrapTextLines(
  text: string,
  fontSize: number,
  boxWidth: number,
  bold = false
): string[] {
  if (!text) return [""];
  const maxEm = Math.max(0.01, boxWidth / fontSize / (bold ? 1.05 : 1));
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    let em = 0;
    for (const char of paragraph) {
      const w = charEmWidth(char);
      if (em > 0 && em + w > maxEm) {
        out.push(line);
        line = char;
        em = w;
      } else {
        line += char;
        em += w;
      }
    }
    out.push(line);
  }
  return out;
}
```

新建 `auto-fit-row-heights.ts`：

```ts
/**
 * 账单模版 —— 行高自适应（纯函数）
 * 对多行排版格（wrap 或显式换行）按 wrapTextLines 估出的行数撑开行高，
 * 在 renderTemplateData 输出后调用；HTML 预览与 PDF 消费同一结果，
 * 维持「编辑看到的 = 打印出来的」。
 */

import { LINE_HEIGHT_FACTOR, wrapTextLines } from "./cell-layout";
import type { TemplateGrid } from "./types";

/** 文本盒上下留白（pt），与渲染器的 3px 水平 padding 对应的垂直近似 */
const VERTICAL_PADDING_PT = 2;

export function autoFitRowHeights(grid: TemplateGrid, coords?: Set<string>): TemplateGrid {
  const needed = new Array<number>(grid.rowHeights.length).fill(0);
  for (const cell of grid.cells) {
    if (!cell.text) continue;
    const multi = cell.style.wrap || /\r|\n/.test(cell.text);
    if (!multi) continue;
    if (coords && !coords.has(`${cell.row}:${cell.col}`)) continue;
    const fontSize = cell.style.fontSize ?? 10;
    // wrap 格按自身跨度宽度折行（wrap 不参与左右溢出）
    const width = grid.colWidths
      .slice(cell.col, cell.col + cell.colSpan)
      .reduce((sum, w) => sum + w, 0);
    const lines = wrapTextLines(cell.text, fontSize, Math.max(0, width - 6), cell.style.bold);
    const height = lines.length * fontSize * LINE_HEIGHT_FACTOR + VERTICAL_PADDING_PT;
    const span = Math.max(1, Math.min(cell.rowSpan, grid.rowHeights.length - cell.row));
    const perRow = height / span;
    for (let row = cell.row; row < cell.row + span; row += 1) {
      needed[row] = Math.max(needed[row], perRow);
    }
  }
  const rowHeights = grid.rowHeights.map((h, row) => {
    if (needed[row] <= h) return h;
    return Math.round(needed[row] * 10) / 10;
  });
  return rowHeights.some((h, row) => h !== grid.rowHeights[row]) ? { ...grid, rowHeights } : grid;
}
```

- [ ] **Step 4: render-template-data 接入**

`render-template-data.ts` 顶部加 `import { autoFitRowHeights } from './auto-fit-row-heights'`。

字段替换段收集坐标（替换 `target.style.wrap = true` 那行后追加）：

```ts
      target.style.wrap = true
      replacedCoords.add(`${target.row}:${target.col}`)
```

函数开头声明 `const replacedCoords = new Set<string>()`。

明细生成段 `generated.style.wrap = true` 后同样加 `replacedCoords.add(\`${generated.row}:${generated.col}\`)`。

两个 return 收尾改为包一层自适应（「无明细」分支和末尾分支都要）：

```ts
  if (!li) return autoFitRowHeights({ colWidths: grid.colWidths, rowHeights: grid.rowHeights, cells }, replacedCoords)
```

```ts
  cells.sort((a, b) => a.row - b.row || a.col - b.col)
  return autoFitRowHeights({ colWidths: grid.colWidths, rowHeights, cells }, replacedCoords)
```

- [ ] **Step 5: 跑测试（新测试 + render 回归）**

Run: `pnpm exec tsx --test src/lib/templates/__tests__/auto-fit-row-heights.test.ts src/lib/templates/__tests__/render-template-data.test.ts`
Expected: PASS。若 render 旧用例断言行高数值的失败，属**有意行为变化**（绑定值格现在撑高），更新该断言并在提交信息注明。

- [ ] **Step 6: package.json test 清单追加 + 提交**

`"test"` script 追加 ` src/lib/templates/__tests__/auto-fit-row-heights.test.ts`。

```bash
git add src/lib/templates/cell-layout.ts src/lib/templates/auto-fit-row-heights.ts src/lib/templates/render-template-data.ts src/lib/templates/__tests__/auto-fit-row-heights.test.ts src/lib/templates/__tests__/render-template-data.test.ts package.json
git commit -m "feat(templates): 绑定值多行渲染与行高自适应"
```

---

### Task 4: 样式模型扩展 + 边框映射单一来源 + parse-xlsx 导入

**Files:**
- Modify: `src/lib/templates/types.ts`
- Create: `src/lib/templates/border-style.ts`
- Modify: `src/lib/templates/parse-xlsx.ts`
- Test: `src/lib/templates/__tests__/parse-xlsx.test.ts`（追加用例）

**Interfaces:**
- Produces:
  - `type TemplateBorderLineStyle = 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double'`
  - `TemplateCellBorders.styles?: { top?: TemplateBorderLineStyle; right?: TemplateBorderLineStyle; bottom?: TemplateBorderLineStyle; left?: TemplateBorderLineStyle }`
  - `TemplateCellStyle.underline?: boolean; strike?: boolean`
  - `border-style.ts`：`BORDER_WIDTH_PT: Record<TemplateBorderLineStyle, number>`、`widthToLineStyle(widthPt: number): TemplateBorderLineStyle`、`EXCEL_BORDER_TO_LINE: Record<string, TemplateBorderLineStyle>`

- [ ] **Step 1: types.ts 扩展**

`TemplateCellBorders` 上方加类型、接口内加 `styles` 字段；`TemplateCellStyle` 加两行：

```ts
/** 边框线型（与 Univer BorderStyleType 对齐的子集） */
export type TemplateBorderLineStyle =
  | "thin"
  | "medium"
  | "thick"
  | "dashed"
  | "dotted"
  | "double";

export interface TemplateCellBorders {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  color?: string;
  /** 每边线型；缺省按宽度渲染实线（宽度→thin/medium/thick） */
  styles?: {
    top?: TemplateBorderLineStyle;
    right?: TemplateBorderLineStyle;
    bottom?: TemplateBorderLineStyle;
    left?: TemplateBorderLineStyle;
  };
}
```

```ts
export interface TemplateCellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  // ...其余字段不动
}
```

- [ ] **Step 2: 新建 border-style.ts（单一映射来源）**

```ts
/**
 * 账单模版 —— 边框线型/宽度映射（单一来源）
 * parse-xlsx（ExcelJS 线型字符串）、univer-bridge（Univer BorderStyleType）、
 * PDF/HTML 渲染（宽度与线型）共用，禁止在其他位置各自定义映射。
 */

import type { TemplateBorderLineStyle } from "./types";

/** 线型 → 近似 pt 宽度（导入与桥接反向换算共用） */
export const BORDER_WIDTH_PT: Record<TemplateBorderLineStyle, number> = {
  thin: 1,
  medium: 2,
  thick: 3,
  dashed: 0.5,
  dotted: 0.5,
  double: 2.5,
};

/** 只有宽度没有线型时，按宽度反推线型 */
export function widthToLineStyle(widthPt: number): TemplateBorderLineStyle {
  if (widthPt >= 3) return "thick";
  if (widthPt >= 2) return "medium";
  return "thin";
}

/** ExcelJS / Univer 共用的线型字符串 → 模板线型 */
export const EXCEL_BORDER_TO_LINE: Record<string, TemplateBorderLineStyle> = {
  thin: "thin",
  medium: "medium",
  thick: "thick",
  double: "double",
  dotted: "dotted",
  dashed: "dashed",
  hair: "dashed",
  dashDot: "dashed",
  dashDotDot: "dashed",
  slantDashDot: "dashed",
  mediumDashed: "dashed",
  mediumDashDot: "dashed",
  mediumDashDotDot: "dashed",
};
```

- [ ] **Step 3: parse-xlsx 导入新样式**

`parse-xlsx.ts`：

1. 删除私有函数 `borderWidthPt`，改为：

```ts
import { BORDER_WIDTH_PT, EXCEL_BORDER_TO_LINE } from './border-style'
```

```ts
/** Excel 边框样式 → 近似 pt 宽度 */
function borderWidthPt(style: string | undefined): number | undefined {
  const line = style != null ? EXCEL_BORDER_TO_LINE[style] : undefined;
  return line == null ? undefined : BORDER_WIDTH_PT[line];
}
```

2. `hasFont` 判定加下划线/删除线：`const hasFont = font && (font.bold || font.italic || font.underline || font.strike || font.size || fontColor)`

3. 样式赋值段加：

```ts
      if (font?.underline) style.underline = true
      if (font?.strike) style.strike = true
```

4. 边框段记录线型（替换现有 `if (hasBorder) { ... }` 整块）：

```ts
      if (hasBorder) {
        const borders: Record<string, number> = {}
        const borderStyles: Record<string, TemplateBorderLineStyle> = {}
        const sides = ['top', 'right', 'bottom', 'left'] as const
        for (const side of sides) {
          const rawStyle = border?.[side]?.style
          if (rawStyle == null) continue
          const w = borderWidthPt(rawStyle)
          if (w != null) borders[side] = w
          const line = EXCEL_BORDER_TO_LINE[rawStyle]
          if (line) borderStyles[side] = line
        }
        if (Object.keys(borders).length > 0) {
          const bc = colorToHex(border?.top?.color) ?? colorToHex(border?.bottom?.color)
          style.borders = {
            ...borders,
            ...(bc ? { color: bc } : {}),
            ...(Object.keys(borderStyles).length > 0 ? { styles: borderStyles } : {}),
          }
        }
      }
```

（`types` import 行追加 `TemplateBorderLineStyle`。）

- [ ] **Step 4: 追加测试用例并跑全量**

在 `parse-xlsx.test.ts` 现有 describe 内追加（沿用该文件已有的 xlsx 构造辅助；若其辅助函数名不同，按现有模式改写，断言不变）：

```ts
  it('导入下划线、删除线与边框线型', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('S')
    const c = ws.getCell(1, 1)
    c.value = 'x'
    c.font = { underline: true, strike: true }
    c.border = { top: { style: 'double' }, bottom: { style: 'dashed' } }
    const buffer = await wb.xlsx.writeBuffer()
    const { grid } = await parseTemplateXlsx(Buffer.from(buffer))
    const cell = grid.cells[0]
    assert.equal(cell.style.underline, true)
    assert.equal(cell.style.strike, true)
    assert.equal(cell.style.borders?.styles?.top, 'double')
    assert.equal(cell.style.borders?.styles?.bottom, 'dashed')
    assert.equal(cell.style.borders?.top, 2.5)
  })
```

Run: `pnpm exec tsx --test src/lib/templates/__tests__/parse-xlsx.test.ts`
Expected: PASS（含旧用例——`borderWidthPt` 行为与原实现一致）

- [ ] **Step 5: 提交**

```bash
git add src/lib/templates/types.ts src/lib/templates/border-style.ts src/lib/templates/parse-xlsx.ts src/lib/templates/__tests__/parse-xlsx.test.ts
git commit -m "feat(templates): 样式模型支持下划线/删除线与边框线型"
```

---

### Task 5: PDF 与 HTML 预览渲染新样式

**Files:**
- Modify: `src/lib/services/print/generic-template-pdf.tsx`
- Modify: `src/components/templates/template-preview.tsx`

**Interfaces:**
- Consumes: Task 4 的 `TemplateBorderLineStyle`、`widthToLineStyle`
- Produces: 渲染能力（无新接口）。已知限制：Noto Sans SC 可变字体无斜体字形，PDF 中 italic 维持现状不模拟（与改造前一致）；underline/strike 用 `textDecoration` 实现（任何字体都有效）

- [ ] **Step 1: PDF 渲染器**

`generic-template-pdf.tsx` 顶部加：

```ts
import { widthToLineStyle } from "@/lib/templates/border-style";
import type { TemplateBorderLineStyle } from "@/lib/templates/types";

/** 线型 → react-pdf BorderStyle；double 由外层实线 + 内层细线双 View 模拟 */
const PDF_BORDER_STYLE: Record<Exclude<TemplateBorderLineStyle, "double">, string> = {
  thin: "solid",
  medium: "solid",
  thick: "solid",
  dashed: "dashed",
  dotted: "dotted",
};

function pdfBorderStyle(line: TemplateBorderLineStyle | undefined): string {
  if (line && line !== "double") return PDF_BORDER_STYLE[line];
  return "solid";
}
```

第一遍背景渲染的 View style 改为（保留原宽度逻辑，逐边加线型 + double 内层线）：

```tsx
          {grid.cells.map((cell, i) => {
            const { left, top, width, height } = cellRect(cell);
            const b = cell.style.borders;
            const lineOf = (side: "top" | "right" | "bottom" | "left"): TemplateBorderLineStyle | undefined =>
              b?.styles?.[side] ?? (b?.[side] != null ? widthToLineStyle(b[side]!) : undefined);
            const doubleSides = (["top", "right", "bottom", "left"] as const).filter(
              (side) => lineOf(side) === "double" && b?.[side] != null
            );
            return (
              <React.Fragment key={`bg-${i}`}>
                <View
                  style={{
                    position: "absolute",
                    left,
                    top,
                    width,
                    height,
                    backgroundColor: cell.style.fill,
                    borderWidth: 0,
                    borderTopWidth: b?.top != null ? b.top * scale : 0,
                    borderRightWidth: b?.right != null ? b.right * scale : 0,
                    borderBottomWidth: b?.bottom != null ? b.bottom * scale : 0,
                    borderLeftWidth: b?.left != null ? b.left * scale : 0,
                    borderColor: b?.color ?? "#000000",
                    borderTopStyle: pdfBorderStyle(lineOf("top")),
                    borderRightStyle: pdfBorderStyle(lineOf("right")),
                    borderBottomStyle: pdfBorderStyle(lineOf("bottom")),
                    borderLeftStyle: pdfBorderStyle(lineOf("left")),
                  }}
                />
                {doubleSides.length > 0 ? (
                  // double：内缩细线与外线组成双线
                  <View
                    style={{
                      position: "absolute",
                      left: left + 1.5 * scale,
                      top: top + 1.5 * scale,
                      width: Math.max(0, width - 3 * scale),
                      height: Math.max(0, height - 3 * scale),
                      borderWidth: 0,
                      borderTopWidth: doubleSides.includes("top") ? 0.5 * scale : 0,
                      borderRightWidth: doubleSides.includes("right") ? 0.5 * scale : 0,
                      borderBottomWidth: doubleSides.includes("bottom") ? 0.5 * scale : 0,
                      borderLeftWidth: doubleSides.includes("left") ? 0.5 * scale : 0,
                      borderColor: b?.color ?? "#000000",
                    }}
                  />
                ) : null}
              </React.Fragment>
            );
          })}
```

第二遍文本 `<Text style>` 加 textDecoration：

```tsx
                      textDecoration:
                        s.underline && s.strike
                          ? "underline line-through"
                          : s.underline
                            ? "underline"
                            : s.strike
                              ? "line-through"
                              : undefined,
```

- [ ] **Step 2: HTML 预览**

`template-preview.tsx`：

`cellBackgroundStyle` 每边 border 加线型（CSS `border-style`）：

```ts
import { widthToLineStyle, type BorderSideStyle } from "@/lib/templates/border-style";
```

在 border-style.ts 追加导出（供 HTML 用）：

```ts
/** 线型 → CSS border-style；double 用 CSS 原生支持 */
export const CSS_BORDER_STYLE: Record<TemplateBorderLineStyle, string> = {
  thin: "solid",
  medium: "solid",
  thick: "solid",
  dashed: "dashed",
  dotted: "dotted",
  double: "double",
};
```

```ts
function borderSideStyle(style: TemplateCellStyle, side: "top" | "right" | "bottom" | "left"): string | undefined {
  const b = style.borders;
  if (b?.[side] == null) return undefined;
  const line = b.styles?.[side] ?? widthToLineStyle(b[side]!);
  return CSS_BORDER_STYLE[line];
}
```

四条 border 改形如：

```ts
    borderTop:
      b?.top != null
        ? `${borderPx(b.top)}px ${borderSideStyle(style, "top")} ${borderColor}`
        : undefined,
    // right/bottom/left 同理
```

`cellTextStyle` 加：

```ts
    textDecoration:
      style.underline && style.strike
        ? "underline line-through"
        : style.underline
          ? "underline"
          : style.strike
            ? "line-through"
            : undefined,
```

（`border-style.ts` 需要 `import type { TemplateCellStyle }` 于 `borderSideStyle` 所在处——`borderSideStyle` 放 template-preview.tsx 本地即可，border-style.ts 只加 `CSS_BORDER_STYLE`。）

- [ ] **Step 3: 回归测试**

Run: `pnpm exec tsx --test src/lib/services/print/__tests__/generic-template-pdf.test.ts && pnpm type-check`
Expected: PASS（现有 PDF 测试不断言新样式；渲染结构变化 Fragment 包裹不影响其断言）

- [ ] **Step 4: 提交**

```bash
git add src/lib/services/print/generic-template-pdf.tsx src/components/templates/template-preview.tsx src/lib/templates/border-style.ts
git commit -m "feat(templates): PDF 与预览支持下划线/删除线/边框线型渲染"
```

---

### Task 6: 安装 Univer + 桥接层 `univer-bridge.ts`

**Files:**
- Modify: `package.json`（dependencies + 精确版本）
- Create: `src/lib/templates/univer-bridge.ts`
- Test: `src/lib/templates/__tests__/univer-bridge.test.ts`

**Interfaces:**
- Consumes: `TemplateGrid`、`TemplateCellStyle`、Task 4 的 `BORDER_WIDTH_PT`、`widthToLineStyle`
- Produces（Task 7 依赖）:
  - `templateGridToWorkbookData(grid: TemplateGrid, pageConfig: TemplatePageConfig): UniverWorkbookData`
  - `workbookDataToTemplateGrid(snapshot: UniverSnapshot, pageConfig: TemplatePageConfig): TemplateGrid`
  - 本地最小类型 `UniverWorkbookData / UniverSnapshot / UniverCell / UniverStyle`（结构化兼容 Univer 官方 IWorkbookData 子集；**不 import Univer 包**）

- [ ] **Step 1: 安装依赖（精确版本）**

```bash
pnpm view @univerjs/presets version
```

用查到的版本（记为 `X.Y.Z`）安装并锁精确：

```bash
pnpm add @univerjs/presets@X.Y.Z @univerjs/preset-sheets-core@X.Y.Z
```

确认 package.json 中两项**无 `^` 前缀**。验证资源路径存在（Task 7 引用）：

```bash
ls node_modules/@univerjs/presets/lib | grep -E 'index.css|locales' ; ls node_modules/@univerjs/presets/lib/preset-sheets-core | grep css
```

若 CSS/locale 路径与 `@univerjs/presets/lib/index.css`、`@univerjs/presets/lib/preset-sheets-core/index.css`、`@univerjs/presets/lib/locales/zh-CN` 不符，记录实际路径供 Task 7 使用。

- [ ] **Step 2: 写失败测试（round-trip）**

```ts
// src/lib/templates/__tests__/univer-bridge.test.ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { templateGridToWorkbookData, workbookDataToTemplateGrid } from '../univer-bridge'
import type { TemplateGrid, TemplatePageConfig } from '../types'

const pageConfig: TemplatePageConfig = {
  size: 'A4',
  margin: { top: 24, right: 24, bottom: 24, left: 24 },
  fontFamily: 'Noto Sans SC',
  baseFontSize: 10,
  textColor: '#000000',
}

describe('univer-bridge round-trip', () => {
  it('文本/样式/合并/尺寸往返等价（模型支持子集）', () => {
    const grid: TemplateGrid = {
      colWidths: [48, 60, 72],
      rowHeights: [15, 20, 24],
      cells: [
        { row: 0, col: 0, rowSpan: 1, colSpan: 2, text: '标题', style: { bold: true, fontSize: 14, underline: true } },
        { row: 1, col: 2, rowSpan: 2, colSpan: 1, text: '{{发票号}}', style: { italic: true, strike: true, color: '#FF0000', fill: '#FFFF00', halign: 'center', valign: 'middle', wrap: true } },
        { row: 2, col: 0, rowSpan: 1, colSpan: 1, text: '带框', style: { borders: { top: 1, right: 2, bottom: 1, left: 1, color: '#333333', styles: { top: 'thin', right: 'medium', bottom: 'dashed', left: 'double' } } } },
      ],
    }
    const workbook = templateGridToWorkbookData(grid, pageConfig)
    const back = workbookDataToTemplateGrid(workbook, pageConfig)
    assert.deepEqual(back, grid)
  })

  it('空文本但有样式的格保留', () => {
    const grid: TemplateGrid = {
      colWidths: [48],
      rowHeights: [15],
      cells: [{ row: 0, col: 0, rowSpan: 1, colSpan: 1, text: '', style: { fill: '#EEEEEE' } }],
    }
    const back = workbookDataToTemplateGrid(templateGridToWorkbookData(grid, pageConfig), pageConfig)
    assert.deepEqual(back, grid)
  })

  it('公式格取显示值（v），不保留公式', () => {
    const workbook = templateGridToWorkbookData(
      { colWidths: [48], rowHeights: [15], cells: [{ row: 0, col: 0, rowSpan: 1, colSpan: 1, text: '', style: {} }] },
      pageConfig
    )
    const sheet = workbook.sheets[workbook.sheetOrder[0]]
    sheet.cellData[0] = { 0: { v: 42, f: '=SUM(1,41)' } }
    const back = workbookDataToTemplateGrid(workbook, pageConfig)
    assert.equal(back.cells.find((c) => c.row === 0 && c.col === 0)?.text, '42')
    assert.ok(!back.cells[0].text.includes('='))
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm exec tsx --test src/lib/templates/__tests__/univer-bridge.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现桥接层**

```ts
/**
 * 账单模版 —— Univer 桥接层（TemplateGrid ↔ Univer 工作簿数据）
 * 本地定义 Univer 数据契约的最小结构化子集（不 import Univer 包），
 * 保证纯函数可在 node:test 中运行；编辑器组件负责与 Univer 实例交互。
 * 行高/列宽单位换算 pt ↔ px（×4/3）在本层完成。
 */

import { BORDER_WIDTH_PT, widthToLineStyle } from "./border-style";
import type {
  TemplateBorderLineStyle,
  TemplateCell,
  TemplateCellStyle,
  TemplateGrid,
  TemplatePageConfig,
} from "./types";

// ---------- Univer 数据契约最小子集（结构化兼容官方 IWorkbookData） ----------

export interface UniverBorderData {
  style: string;
  color?: string;
}

export interface UniverStyle {
  bl?: number;
  it?: number;
  ul?: { s: number };
  st?: { s: number };
  fs?: number;
  ff?: string;
  cl?: { rgb: string };
  bg?: { rgb: string };
  bd?: Partial<Record<"top" | "right" | "bottom" | "left", UniverBorderData>>;
  at?: string;
  vt?: string;
  tb?: number;
}

export interface UniverCell {
  v?: string | number | boolean;
  f?: string;
  s?: number | UniverStyle;
}

export interface UniverMergeData {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

export interface UniverWorksheetData {
  id: string;
  name: string;
  cellData: Record<number, Record<number, UniverCell>>;
  columnData: Record<number, { w?: number; customWidth?: boolean }>;
  rowData: Record<number, { h?: number; customHeight?: boolean }>;
  mergeData: UniverMergeData[];
  rowCount: number;
  columnCount: number;
}

export interface UniverWorkbookData {
  id: string;
  sheetOrder: string[];
  styles: UniverStyle[];
  sheets: Record<string, UniverWorksheetData>;
}

/** Univer getSnapshot() 的返回（工作簿多了元数据字段，结构化兼容） */
export type UniverSnapshot = UniverWorkbookData;

// ---------- 单位换算与常量 ----------

const PT_TO_PX = 4 / 3;
const pxToPt = (px: number) => Math.round(px * 0.75 * 10) / 10;
const ptToPx = (pt: number) => Math.round(pt * PT_TO_PX * 10) / 10;
const DEFAULT_ROW_HEIGHT_PT = 15;
const DEFAULT_COL_WIDTH_PT = 48;

const LINE_TO_UNIVER: Record<TemplateBorderLineStyle, string> = {
  thin: "thin",
  medium: "medium",
  thick: "thick",
  dashed: "dashed",
  dotted: "dotted",
  double: "double",
};

const UNIVER_VT: Record<string, string> = { top: "vertical", middle: "middle", bottom: "horizontal" };
const UNIVER_VT_BACK: Record<string, string> = { vertical: "top", middle: "middle", horizontal: "bottom" };

// ---------- TemplateGrid → Univer ----------

function templateStyleToUniver(style: TemplateCellStyle, baseFontSize: number): UniverStyle {
  const u: UniverStyle = { fs: style.fontSize ?? baseFontSize };
  if (style.bold) u.bl = 1;
  if (style.italic) u.it = 1;
  if (style.underline) u.ul = { s: 1 };
  if (style.strike) u.st = { s: 1 };
  if (style.color) u.cl = { rgb: style.color };
  if (style.fill) u.bg = { rgb: style.fill };
  if (style.halign) u.at = style.halign;
  if (style.valign) u.vt = UNIVER_VT[style.valign];
  if (style.wrap) u.tb = 1;
  const b = style.borders;
  if (b) {
    const bd: UniverStyle["bd"] = {};
    for (const side of ["top", "right", "bottom", "left"] as const) {
      if (b[side] == null) continue;
      const line = b.styles?.[side] ?? widthToLineStyle(b[side]!);
      bd[side] = { style: LINE_TO_UNIVER[line], ...(b.color ? { color: b.color } : {}) };
    }
    if (Object.keys(bd).length > 0) u.bd = bd;
  }
  return u;
}

export function templateGridToWorkbookData(
  grid: TemplateGrid,
  pageConfig: TemplatePageConfig
): UniverWorkbookData {
  const styles: UniverStyle[] = [];
  const styleIndex = new Map<string, number>();
  const internStyle = (style: TemplateCellStyle): number | undefined => {
    const u = templateStyleToUniver(style, pageConfig.baseFontSize);
    if (Object.keys(u).length === 0) return undefined;
    const key = JSON.stringify(u);
    let idx = styleIndex.get(key);
    if (idx == null) {
      styles.push(u);
      idx = styles.length - 1;
      styleIndex.set(key, idx);
    }
    return idx;
  };

  const sheetId = "sheet-01";
  const cellData: UniverWorksheetData["cellData"] = {};
  const merges: UniverMergeData[] = [];
  for (const cell of grid.cells) {
    if (cell.rowSpan > 1 || cell.colSpan > 1) {
      merges.push({
        startRow: cell.row,
        endRow: cell.row + cell.rowSpan - 1,
        startColumn: cell.col,
        endColumn: cell.col + cell.colSpan - 1,
      });
    }
    const s = internStyle(cell.style);
    const entry: UniverCell = { v: cell.text };
    if (s != null) entry.s = s;
    (cellData[cell.row] ??= {})[cell.col] = entry;
  }

  const rowData: UniverWorksheetData["rowData"] = {};
  grid.rowHeights.forEach((pt, row) => {
    rowData[row] = { h: ptToPx(pt), customHeight: true };
  });
  const columnData: UniverWorksheetData["columnData"] = {};
  grid.colWidths.forEach((pt, col) => {
    columnData[col] = { w: ptToPx(pt), customWidth: true };
  });

  return {
    id: "template-workbook",
    sheetOrder: [sheetId],
    styles,
    sheets: {
      [sheetId]: {
        id: sheetId,
        name: "模板",
        cellData,
        columnData,
        rowData,
        mergeData: merges,
        rowCount: grid.rowHeights.length,
        columnCount: grid.colWidths.length,
      },
    },
  };
}

// ---------- Univer → TemplateGrid ----------

function univerStyleToTemplate(
  u: UniverStyle | undefined,
  baseFontSize: number
): TemplateCellStyle {
  const style: TemplateCellStyle = {};
  if (!u) return style;
  if (u.bl) style.bold = true;
  if (u.it) style.italic = true;
  if (u.ul?.s) style.underline = true;
  if (u.st?.s) style.strike = true;
  if (u.fs != null && u.fs !== baseFontSize) style.fontSize = u.fs;
  if (u.cl?.rgb) style.color = u.cl.rgb;
  if (u.bg?.rgb) style.fill = u.bg.rgb;
  if (u.at === "left" || u.at === "center" || u.at === "right") style.halign = u.at;
  if (u.vt && UNIVER_VT_BACK[u.vt]) style.valign = UNIVER_VT_BACK[u.vt] as TemplateCellStyle["valign"];
  if (u.tb === 1) style.wrap = true;
  if (u.bd) {
    const borders: Record<string, number> = {};
    const borderStyles: Record<string, TemplateBorderLineStyle> = {};
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const edge = u.bd[side];
      if (!edge) continue;
      const line = (Object.keys(BORDER_WIDTH_PT) as TemplateBorderLineStyle[]).find(
        (l) => LINE_TO_UNIVER[l] === edge.style
      );
      if (!line) continue;
      borders[side] = BORDER_WIDTH_PT[line];
      if (line !== "thin" || widthToLineStyle(BORDER_WIDTH_PT[line]) !== "thin") borderStyles[side] = line;
      if (edge.color) (borders as Record<string, unknown>).color = edge.color;
    }
    if (Object.keys(borders).length > 0) {
      style.borders = {
        ...borders,
        ...(Object.keys(borderStyles).length > 0 ? { styles: borderStyles } : {}),
      } as TemplateCellStyle["borders"];
    }
  }
  return style;
}

export function workbookDataToTemplateGrid(
  snapshot: UniverSnapshot,
  pageConfig: TemplatePageConfig
): TemplateGrid {
  const sheetId = snapshot.sheetOrder[0];
  const sheet = snapshot.sheets[sheetId];

  const styleOf = (cell: UniverCell): TemplateCellStyle =>
    typeof cell.s === "number"
      ? univerStyleToTemplate(snapshot.styles?.[cell.s], pageConfig.baseFontSize)
      : univerStyleToTemplate(cell.s, pageConfig.baseFontSize);

  const covered = new Set<string>();
  for (const merge of sheet.mergeData ?? []) {
    for (let r = merge.startRow; r <= merge.endRow; r += 1) {
      for (let c = merge.startColumn; c <= merge.endColumn; c += 1) {
        if (r !== merge.startRow || c !== merge.startColumn) covered.add(`${r}:${c}`);
      }
    }
  }

  const cells: TemplateCell[] = [];
  let maxRow = -1;
  let maxCol = -1;
  for (const [rowKey, rowCells] of Object.entries(sheet.cellData ?? {})) {
    for (const [colKey, cell] of Object.entries(rowCells)) {
      const row = Number(rowKey);
      const col = Number(colKey);
      if (covered.has(`${row}:${col}`)) continue;
      const text = cell.v == null ? "" : String(cell.v);
      const style = styleOf(cell);
      if (!text && Object.keys(style).length === 0) continue;
      const merge = (sheet.mergeData ?? []).find(
        (m) => m.startRow === row && m.startColumn === col
      );
      cells.push({
        row,
        col,
        rowSpan: merge ? merge.endRow - merge.startRow + 1 : 1,
        colSpan: merge ? merge.endColumn - merge.startColumn + 1 : 1,
        text,
        style,
      });
      maxRow = Math.max(maxRow, row + (merge ? merge.endRow - merge.startRow : 0));
      maxCol = Math.max(maxCol, col + (merge ? merge.endColumn - merge.startColumn : 0));
    }
  }
  // 合并区域可能超出有样式单元格的范围
  for (const merge of sheet.mergeData ?? []) {
    maxRow = Math.max(maxRow, merge.endRow);
    maxCol = Math.max(maxCol, merge.endColumn);
  }

  const rowCount = maxRow + 1;
  const colCount = maxCol + 1;
  const rowHeights = Array.from({ length: rowCount }, (_, row) => {
    const rd = sheet.rowData?.[row];
    return rd?.customHeight && rd.h != null ? pxToPt(rd.h) : DEFAULT_ROW_HEIGHT_PT;
  });
  const colWidths = Array.from({ length: colCount }, (_, col) => {
    const cd = sheet.columnData?.[col];
    return cd?.customWidth && cd.w != null ? pxToPt(cd.w) : DEFAULT_COL_WIDTH_PT;
  });

  return { colWidths, rowHeights, cells: cells.sort((a, b) => a.row - b.row || a.col - b.col) };
}
```

**实现要点（写入代码注释不必，执行者须知）**：
- 边框颜色在 Univer → Template 方向只有一份 `color`（四边共用），来自最后一个带颜色的边——与 parse-xlsx「top 优先」略有差异，可接受（模型本来就是单色）
- `borderStyles` 回转时只在「非默认宽度对应线型」时写入，保证 round-trip 测试 `deepEqual` 通过：thin(1pt)/medium(2pt)/thick(3pt) 宽度与线型互推一致不写 `styles`；dashed/dotted(0.5)/double(2.5) 宽度反推不出线型，必须写。若 round-trip 测试仍不等，优先修 `univerStyleToTemplate` 的裁剪逻辑而不是改断言

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm exec tsx --test src/lib/templates/__tests__/univer-bridge.test.ts && pnpm type-check`
Expected: PASS

- [ ] **Step 6: package.json test 清单追加 + 提交**

`"test"` script 追加 ` src/lib/templates/__tests__/univer-bridge.test.ts`。

```bash
git add package.json src/lib/templates/univer-bridge.ts src/lib/templates/__tests__/univer-bridge.test.ts
git commit -m "feat(templates): Univer 桥接层与依赖（精确版本锁定）"
```

---

### Task 7: `UniverEditor` 容器组件

**Files:**
- Create: `src/components/templates/univer-editor.tsx`

**Interfaces:**
- Consumes: Task 6 的 `templateGridToWorkbookData`、`workbookDataToTemplateGrid`、`UniverSnapshot`
- Produces（Task 8 依赖）:

```ts
export interface UniverEditorHandle {
  /** 把令牌追加写入当前选中单元格（无选中时提示并返回 false） */
  insertTokenAtSelection: (token: string) => boolean;
}

interface UniverEditorProps {
  templateId: string;
  grid: TemplateGrid;
  pageConfig: TemplatePageConfig;
  onGridChange: (grid: TemplateGrid) => void;
}
// 组件用 React.forwardRef<UniverEditorHandle, UniverEditorProps> 导出
```

- [ ] **Step 1: 实现组件**

```tsx
"use client";

/**
 * 账单模版 —— Univer Excel 编辑器容器（仅草稿编辑页加载）
 * 负责 Univer 实例生命周期：加载 TemplateGrid、防抖同步编辑结果回 TemplateGrid、
 * 主题跟随应用（light/dark 重建实例）、对外暴露「向选中格插入令牌」。
 */

import React from "react";
import { useTheme } from "next-themes";
import { createUniver, defaultTheme, darkTheme, LocaleType } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/presets/preset-sheets-core";
import zhCN from "@univerjs/presets/lib/locales/zh-CN";
import "@univerjs/presets/lib/index.css";
import "@univerjs/presets/lib/preset-sheets-core/index.css";

import {
  templateGridToWorkbookData,
  workbookDataToTemplateGrid,
  type UniverSnapshot,
} from "@/lib/templates/univer-bridge";
import type { TemplateGrid, TemplatePageConfig } from "@/lib/templates/types";

export interface UniverEditorHandle {
  insertTokenAtSelection: (token: string) => boolean;
}

interface UniverEditorProps {
  templateId: string;
  grid: TemplateGrid;
  pageConfig: TemplatePageConfig;
  onGridChange: (grid: TemplateGrid) => void;
}

const SYNC_DEBOUNCE_MS = 500;

export const UniverEditor = React.forwardRef<UniverEditorHandle, UniverEditorProps>(
  function UniverEditor({ templateId, grid, pageConfig, onGridChange }, ref) {
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const apiRef = React.useRef<ReturnType<typeof createUniver>["univerAPI"] | null>(null);
    const { resolvedTheme } = useTheme();
    const onGridChangeRef = React.useRef(onGridChange);
    onGridChangeRef.current = onGridChange;

    React.useImperativeHandle(
      ref,
      () => ({
        insertTokenAtSelection(token: string): boolean {
          const api = apiRef.current;
          const sheet = api?.getActiveWorkbook()?.getActiveSheet();
          const range = sheet?.getSelection().getActiveRange();
          if (!api || !sheet || !range) return false;
          const current = range.getValue();
          range.setValue(current == null || current === "" ? token : `${current}${token}`);
          return true;
        },
      }),
      []
    );

    React.useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const isDark = resolvedTheme === "dark";
      const { univerAPI, univer } = createUniver({
        locale: LocaleType.ZH_CN,
        locales: { [LocaleType.ZH_CN]: zhCN },
        theme: isDark ? darkTheme.name : defaultTheme.name,
        themes: { [defaultTheme.name]: defaultTheme, [darkTheme.name]: darkTheme },
        presets: [UniverSheetsCorePreset({})],
      });
      apiRef.current = univerAPI;
      univerAPI.createWorkbook(templateGridToWorkbookData(grid, pageConfig));

      let timer: ReturnType<typeof setTimeout> | null = null;
      const scheduleSync = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          const snapshot = univerAPI
            .getActiveWorkbook()
            ?.getSnapshot() as unknown as UniverSnapshot | undefined;
          if (snapshot) onGridChangeRef.current(workbookDataToTemplateGrid(snapshot, pageConfig));
        }, SYNC_DEBOUNCE_MS);
      };
      const disposable = univerAPI.onCommandExecuted(() => scheduleSync());

      return () => {
        disposable?.dispose?.();
        if (timer) clearTimeout(timer);
        void univer.dispose();
        apiRef.current = null;
      };
      // grid/pageConfig 仅用于初始化；编辑回传走 onGridChange，避免循环重建。
      // 主题切换重建实例（编辑内容已经防抖外传，由父层 state 恢复）。
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [templateId, resolvedTheme]);

    return <div ref={containerRef} className="h-[calc(100dvh-16rem)] min-h-[28rem] w-full overflow-hidden rounded-md border" />;
  }
);
```

**执行者注意**：
1. `univerAPI.onCommandExecuted` / `getSelection().getActiveRange()` / `range.getValue()/setValue()` 是 Univer facade API——`pnpm type-check` 会校验签名；若类型名不符（0.x 演进），以 node_modules 内类型定义为准调整调用方式，**不得**改变本组件对外接口（Handle/Props）
2. Task 6 Step 1 记录的 CSS/locale 实际路径若不同，以记录为准
3. `grid` 在 effect 依赖中被刻意排除（初始化专用）——eslint 注释已带；父层用 `key={templateId}` 保证换模版重建

- [ ] **Step 2: 验证编译**

Run: `pnpm type-check && pnpm lint`
Expected: 通过（此任务无单测；运行时验证在 Task 10）

- [ ] **Step 3: 提交**

```bash
git add src/components/templates/univer-editor.tsx
git commit -m "feat(templates): Univer 编辑器容器组件"
```

---

### Task 8: API 改造（PATCH 服务端推导 + 上传即推导）

**Files:**
- Modify: `src/app/api/admin/invoice-templates/[id]/route.ts`
- Modify: `src/app/api/admin/invoice-templates/upload/route.ts`

**Interfaces:**
- Consumes: Task 1 的 `deriveBindingFromGrid`；现有 `validateTemplateGrid`
- Produces:
  - PATCH 请求体：`{ name?, company_id?, grid_config?, line_item_min_rows?: number }`——**移除 `binding_config` 字段**（客户端不再发送；服务端由 grid 推导）
  - upload 响应追加 `warnings: string[]`

- [ ] **Step 1: PATCH route 改造**

1. import 加：`import { deriveBindingFromGrid } from "@/lib/templates/token-binding"`；`TemplateBinding` 类型 import 若不再使用则移除
2. `patchSchema`：
   - 删除整个 `binding_config` 字段
   - `grid_config.cells[].style` 增加三段：`underline: z.boolean().optional(), strike: z.boolean().optional()`，`borders` 增加 `styles: z.object({ top: z.enum(["thin","medium","thick","dashed","dotted","double"]).optional(), right: z.enum(["thin","medium","thick","dashed","dotted","double"]).optional(), bottom: z.enum(["thin","medium","thick","dashed","dotted","double"]).optional(), left: z.enum(["thin","medium","thick","dashed","dotted","double"]).optional() }).optional()`
   - 新增顶层 `line_item_min_rows: z.number().int().min(1).max(80).optional()`
3. 事务内绑定校验段（原 `if (binding) {...}` 块）与 grid 校验段合并替换为：

```ts
      // 网格保存时由令牌推导绑定（binding_config 唯一生成来源）
      let bindingToSave: TemplateBinding | undefined;
      if (grid) {
        const minRows =
          parsed.data.line_item_min_rows ??
          ((existing.binding_config as unknown as TemplateBinding).lineItems?.minRows ?? 10);
        const derived = deriveBindingFromGrid(grid, { minRows });
        if (derived.errors.length > 0) return jsonError(derived.errors.join("；"), 400);
        bindingToSave = derived.binding;
        const gridErrors = validateTemplateGrid(grid, derived.binding);
        if (gridErrors.length > 0) return jsonError(gridErrors[0], 400);
      }
```

（保留 `TemplateBinding` 的 type import。原 `const binding = ...` 行删除，`editsDraftOnlyFields` 判定改为 `Boolean(grid || changesCompany)`。）

4. `updateMany` 的 data 中 `...(binding ? { binding_config: ... } : {})` 改为 `...(bindingToSave ? { binding_config: bindingToSave as unknown as object } : {})`。

- [ ] **Step 2: upload route 改造**

import 加 `deriveBindingFromGrid`。`parseTemplateXlsx` 成功后、`create` 前加：

```ts
    // 样张中已含令牌则自动完成绑定；未知令牌收集为警告返回前端提示
    const derived = deriveBindingFromGrid(parsed.grid)
    const warnings: string[] = []
    if (derived.unknownTokens.length > 0) {
      warnings.push(`样张中存在未知令牌：${derived.unknownTokens.map((t) => `{{${t}}}`).join("、")}`)
    }
    if (derived.errors.length > 0) warnings.push(...derived.errors)
```

`create` 的 `binding_config: { fields: {}, lineItems: null }` 改为 `binding_config: derived.binding as unknown as object`；`jsonOk({ id: template.id, name: template.name, status: template.status }, 201)` 改为 `jsonOk({ id: template.id, name: template.name, status: template.status, warnings }, 201)`。

- [ ] **Step 3: 回归 + 提交**

Run: `pnpm type-check && pnpm test`
Expected: 通过（API 无单测，编译级验证；行为验证在 Task 10）

```bash
git add "src/app/api/admin/invoice-templates/[id]/route.ts" src/app/api/admin/invoice-templates/upload/route.ts
git commit -m "feat(templates): 保存与上传改为令牌推导绑定"
```

---

### Task 9: 编辑页重写（令牌面板 + Univer 接入），删除旧编辑器

**Files:**
- Modify: `src/app/dashboard/templates/[id]/template-editor-client.tsx`（大改）
- Delete: `src/components/templates/template-editor.tsx`

**Interfaces:**
- Consumes: Task 1 `FIELD_TOKENS/DETAIL_TOKENS/deriveBindingFromGrid`、Task 7 `UniverEditor(Handle)`、Task 8 PATCH 新请求体
- Produces: 无（页面级）

- [ ] **Step 1: 重写 template-editor-client.tsx**

保留不动：文件头注释改为「令牌式绑定说明」、`LIST_URL`、`TemplateDetail/CompanyRow/TemplateSaveResult/STATUS_LABEL`、`columnLabel`、`draftStorageKey`、加载/恢复 effect、beforeunload/navigation 保护 effect、sessionStorage 暂存 effect、`save/previewPdf/publish/duplicate/goBack` 六个函数主体。改动点：

1. **import 区**：删除 `TemplateEditor`、`patchCellStyle/findAnchorAt` import；新增：

```tsx
import { UniverEditor, type UniverEditorHandle } from "@/components/templates/univer-editor";
import { FIELD_TOKENS, DETAIL_TOKENS, deriveBindingFromGrid } from "@/lib/templates/token-binding";
```

2. **UniverEditor 动态加载**（组件外定义）：

```tsx
const LazyUniverEditor = React.lazy(() =>
  import("@/components/templates/univer-editor").then((m) => ({ default: m.UniverEditor }))
);
```

3. **state 区**：删除 `binding/setBinding`、`selected/setSelected`、`bindField/setBindField`、`addBindingPosition`、`activeLineRole`；新增：

```tsx
  const editorRef = React.useRef<UniverEditorHandle | null>(null);
  const [minRows, setMinRows] = React.useState(10);
  const [insertTokenError] = React.useState(""); // 保留位：插入失败 toast 即时提示，无需 state
```

（`insertTokenError` 若 lint 报未使用则直接删掉该行——插入失败用 toast。）

4. **快照/脏检查**：`currentSnapshot`/`savedSnapshot`/sessionStorage 暂存里 `binding` 字段全部移除，改为 `{ name, companyId, grid }` 三元组（恢复逻辑同步删 binding 相关行，`minRows` 从恢复数据 `binding.lineItems?.minRows` 初始化一次）。

5. **派生绑定**（`fieldBadges` 之前）：

```tsx
  const derived = React.useMemo(
    () => (grid ? deriveBindingFromGrid(grid, { minRows }) : null),
    [grid, minRows]
  );
  const binding = derived?.binding ?? { fields: {}, lineItems: null };
```

（后续 `renderTemplateData(grid, binding, ...)`、`fieldBadges`、`highlightedCells`、`lineItemColumns` 引用保持原名即可工作。）

6. **save() 请求体**：

```tsx
      const body =
        detail.status === "draft" && grid
          ? { name: trimmed, company_id: companyId, grid_config: grid, line_item_min_rows: minRows }
          : { name: trimmed };
```

保存成功后 `setSavedSnapshot`/`nextDetail` 中不再回写 `binding_config`（字段已随服务端推导，前端无需持有）。

7. **左侧主体**：draft 且非 sample 视图时渲染：

```tsx
              <React.Suspense fallback={<div className="flex h-96 items-center justify-center text-sm text-muted-foreground">编辑器加载中…</div>}>
                <LazyUniverEditor
                  key={detail.id}
                  ref={editorRef}
                  templateId={detail.id}
                  grid={grid}
                  pageConfig={detail.page_config}
                  onGridChange={setGrid}
                />
              </React.Suspense>
```

顶部提示文案改为：`在表格中直接编辑；把要变成发票数据的位置写成令牌（右侧可一键插入）`。

8. **右侧面板整块替换**为令牌速查面板（`detail.status === "draft"` 分支）：

```tsx
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
```

9. **删除**：`bindCell/unbindField` 函数、`LINE_ROLES` 常量、明细区域绑定面板 JSX（起始/结束行输入、列角色按钮、选中行设为起止）全部移除。

10. 非草稿右侧提示文案追加一句：「该模版使用 {{令牌}} 标记数据位置，复制为草稿后可编辑。」

- [ ] **Step 2: 删除旧编辑器组件**

```bash
git rm src/components/templates/template-editor.tsx
```

全库确认无残留引用：

```bash
grep -rn "template-editor\"" src/ || true
```

Expected: 无输出（`template-editor-client` 自身文件名除外）

- [ ] **Step 3: 编译与全量测试**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: 全绿

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat(templates): 编辑页接入 Univer 与令牌面板，移除两步式绑定向导"
```

---

### Task 10: 存量模板迁移脚本

**Files:**
- Create: `scripts/migrate-templates-to-tokens.ts`

**Interfaces:**
- Consumes: Task 1 的 `FIELD_TOKENS/DETAIL_TOKENS/deriveBindingFromGrid`、`trimGridToContent`（不用于本任务）、`validateTemplateGrid`
- Produces: 一次性脚本，`pnpm exec tsx scripts/migrate-templates-to-tokens.ts [--dry-run]`；输出逐模板迁移报告

- [ ] **Step 1: 实现脚本**

```ts
/**
 * 一次性迁移：存量模板改为令牌式绑定
 * 1) 绑定字段格文本替换为对应令牌；2) 明细区域压成单模板行（首行写明细令牌，
 *    删除 startRow+1..endRow 占位行——旧渲染本就丢弃这些行只克隆首行，输出不变）；
 * 3) deriveBindingFromGrid 推导回写 binding_config。
 * 幂等：网格已含令牌且推导结果与库内一致的模板跳过。
 * 运行：pnpm exec tsx scripts/migrate-templates-to-tokens.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client'
import { deriveBindingFromGrid, FIELD_TOKENS, DETAIL_TOKENS, type DetailRole } from '../src/lib/templates/token-binding'
import { validateTemplateGrid } from '../src/lib/templates/template-grid'
import { TEMPLATE_FIELDS, type TemplateBinding, type TemplateGrid } from '../src/lib/templates/types'

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

function removeRows(grid: TemplateGrid, start: number, end: number): TemplateGrid {
  const drop = end - start + 1
  const rowHeights = grid.rowHeights.filter((_, row) => row < start || row > end)
  const cells = grid.cells
    .filter((cell) => cell.row < start || cell.row > end)
    .map((cell) => (cell.row > end ? { ...cell, row: cell.row - drop } : cell))
    .map((cell) => {
      // 合并区域跨入被删区间的收缩跨度
      if (cell.row < start && cell.row + cell.rowSpan > start) {
        const overlap = Math.min(cell.row + cell.rowSpan - 1, end) - start + 1
        return { ...cell, rowSpan: Math.max(1, cell.rowSpan - overlap) }
      }
      return cell
    })
  return { colWidths: grid.colWidths, rowHeights, cells }
}

async function main() {
  const templates = await prisma.invoice_templates.findMany({ orderBy: { id: 'asc' } })
  console.log(`共 ${templates.length} 个模板${dryRun ? '（dry-run，不写库）' : ''}`)
  for (const t of templates) {
    const grid = structuredClone(t.grid_config) as TemplateGrid
    const binding = t.binding_config as unknown as TemplateBinding
    const idAndName = `#${t.id} ${t.name} [${t.status}]`

    // 幂等检查：已迁移（网格含字段令牌且推导一致）
    const already = deriveBindingFromGrid(grid, { minRows: binding.lineItems?.minRows ?? 10 })
    const alreadyOk =
      grid.cells.some((c) => Object.values(FIELD_TOKENS).some((token) => c.text.includes(token))) &&
      JSON.stringify(already.binding) === JSON.stringify(binding)
    if (alreadyOk) {
      console.log(`跳过（已迁移） ${idAndName}`)
      continue
    }

    // 1) 字段绑定格写入令牌
    let touched = 0
    for (const field of TEMPLATE_FIELDS) {
      for (const bound of binding.fields[field.key]?.cells ?? []) {
        const target = grid.cells.find((c) => c.row === bound.row && c.col === bound.col)
        if (target && target.text !== FIELD_TOKENS[field.key]) {
          target.text = FIELD_TOKENS[field.key]
          touched++
        }
      }
    }

    // 2) 明细区域 → 单模板行
    const li = binding.lineItems
    if (li) {
      for (const [role, col] of Object.entries(li.columns) as [DetailRole, number | undefined][]) {
        if (col == null) continue
        const target = grid.cells.find((c) => c.row === li.startRow && c.col === col)
        if (target) {
          target.text = DETAIL_TOKENS[role]
          touched++
        }
      }
      if (li.endRow > li.startRow) {
        grid.cells = removeRows(grid, li.startRow + 1, li.endRow).cells
        grid.rowHeights = removeRows({ ...grid, cells: [] }, li.startRow + 1, li.endRow).rowHeights
        touched++
      }
    }

    // 3) 推导回写 + 校验
    const derived = deriveBindingFromGrid(grid, { minRows: li?.minRows ?? 10 })
    const errors = [...derived.errors, ...validateTemplateGrid(grid, derived.binding)]
    if (errors.length > 0) {
      console.error(`中止（未写库） ${idAndName}：${errors.join('；')}`)
      continue
    }
    // 安全断言：推导出的明细与旧配置等价（行号平移后）
    if (li && derived.binding.lineItems) {
      const shift = (li.endRow - li.startRow) // 删除的行数
      const expectedStart = li.startRow // 删除发生在 startRow 之后，起始行不动
      if (derived.binding.lineItems.startRow !== expectedStart + 0 || shift < 0) {
        console.error(`中止（明细行号异常） ${idAndName}`)
        continue
      }
    }
    console.log(`${idAndName}：改写 ${touched} 处 → 令牌`)
    if (!dryRun) {
      await prisma.invoice_templates.update({
        where: { id: t.id },
        data: { grid_config: grid as unknown as object, binding_config: derived.binding as unknown as object },
      })
    }
  }
}

main().finally(() => prisma.$disconnect())
```

（安全断言段若在自测中发现逻辑冗余可精简，但**不得**移除 errors 校验与 dry-run。）

- [ ] **Step 2: dry-run 验证**

Run: `pnpm exec tsx scripts/migrate-templates-to-tokens.ts --dry-run`
Expected: 每个存量模板输出「改写 N 处」或「跳过/中止」；中止的模板人工检查其 binding_config

- [ ] **Step 3: 正式执行 + 抽检**

Run: `pnpm exec tsx scripts/migrate-templates-to-tokens.ts`
再跑一次 dry-run 确认全部「跳过（已迁移）」。在 Prisma Studio（`pnpm db:studio`）或 SQL 抽检 active 模板：grid_config 中绑定格文本为令牌、binding_config 与令牌位置一致。

- [ ] **Step 4: 提交**

```bash
git add scripts/migrate-templates-to-tokens.ts
git commit -m "feat(templates): 存量模板令牌化迁移脚本"
```

---

### Task 11: 帮助文档更新 + 全量回归

**Files:**
- Modify: `src/app/dashboard/help/invoice-templates/page.tsx`

**Interfaces:** 无代码接口；内容更新。

- [ ] **Step 1: 更新帮助文档**

读取该文件，把「绑定向导」相关章节（选择字段→点击单元格、明细区域起始/结束行、列角色按钮等操作说明）替换为令牌式说明，核心内容：

1. **字段绑定**：在模板中把要显示发票数据的位置写成令牌，如 `Invoice No: {{发票号}}`；令牌可嵌在文字中；同一令牌可出现在多个位置（如 Total 与 Balance Due）
2. **令牌表**：11 个字段令牌 + 4 个明细令牌的完整列表（从 `FIELD_TOKENS`/`DETAIL_TOKENS` 抄录，含说明「右侧面板点击可一键插入」）
3. **明细行**：同一行写 `{{描述}}`（必填）、`{{数量}}`、`{{单价}}`、`{{金额}}`（必填）即定义明细模板行；打印时按行数自动扩展、不足最少行数补空行
4. **编辑能力**：现在是完整 Excel 编辑（框选、复制粘贴、填充、撤销重做、逐边边框、下划线删除线等）
5. **绑定值渲染**：绑定值永不缩字号；过长自动折行并撑高行高
6. 保留上传/发布/复制草稿/试打等既有说明（如与两步式绑定有关则同步改写）

- [ ] **Step 2: 全量回归**

Run: `pnpm type-check && pnpm lint && pnpm test && pnpm build`
Expected: 全绿（build 含 prisma generate，首次引入 Univer 后验证打包成功）

- [ ] **Step 3: 提交**

```bash
git add src/app/dashboard/help/invoice-templates/page.tsx
git commit -m "docs(templates): 帮助文档改为令牌式绑定说明"
```

---

### Task 12: Playwright 手动验收（端到端）

**Files:** 无代码改动（验收任务；发现问题则修后再验）

- [ ] **Step 1: 启动开发服务器**

```bash
pnpm dev
```

（端口 3001；用 Playwright MCP 打开 `http://localhost:3001`，admin 账号登录——凭据从用户处或 `prisma/seed.ts` 读取）

- [ ] **Step 2: 验收清单（逐项截图留档 `.playwright-mcp/`）**

1. **迁移后回归**：打开 `/dashboard/templates`，进入已迁移的 active 模板 → 只读预览正常、绑定角标位置正确 → 「试打 PDF」与迁移前视觉一致（多行地址正确折行撑高）
2. **上传自动绑定**：上传一个含 `Invoice No: {{发票号}}` 与明细令牌行的 xlsx → 列表出现 draft → 编辑页校验面板显示「明细模板行：第 N 行」
3. **Excel 编辑手感**：草稿编辑页 → Univer 工具栏完整加载 → 框选多格、Ctrl+C/V、插入行列、合并/取消合并、设置逐边虚线边框、下划线 → 内容保留
4. **令牌插入**：右侧面板点「发票号」令牌 → 选中格追加 `{{发票号}}` → 校验面板无未知令牌
5. **保存与试打**：保存 → 试打 PDF 新窗口 → 令牌被示例数据替换、`Invoice No: AA082026001` 标签保留、长地址折行且行高撑开
6. **发布链路**：发布启用 → toast 成功 → 财务发票 PDF（`/api/finance/accounting-invoices/[id]/pdf`）用新模板渲染正确
7. **暗色主题**：切换应用主题 → Univer 跟随（无白底刺眼）
8. **非草稿保护**：active 模板编辑页无 Univer 工具栏、仅改名可用

- [ ] **Step 3: 修复与复验**

验收发现的任何缺陷：修复 → 重跑相关单测 → 复验该项。全部通过后输出验收报告（逐项 ✓ + 截图路径）。

- [ ] **Step 4: 收尾提交（如有修复）**

```bash
git add -A
git commit -m "fix(templates): 端到端验收修复"
```

---

## Self-Review 记录

- **Spec 覆盖**：§3 架构（Task 6/7/8/9）、§4 令牌绑定（Task 1/2/8）、§5 Univer 接入（Task 6/7/9）、§6 样式补齐（Task 4/5）、§7 多行渲染（Task 2/3）、§9 迁移（Task 10）、§10 错误处理（Task 8 校验 + Task 9 校验面板）、§11 包体（Task 6 精确版本 + Task 9 React.lazy）、§12 测试（各任务 TDD + Task 11/12）、上传自动绑定（Task 8）✓
- **占位符扫描**：无 TBD/「适当处理」；Task 11 为内容改写任务已给出具体段落要点
- **类型一致性**：`deriveBindingFromGrid(grid, opts?)`/`FIELD_TOKENS`/`DETAIL_TOKENS`（Task 1 定义，8/9/10 消费签名一致）；`wrapTextLines(text, fontSize, boxWidth, bold?)`（Task 3 内自洽）；`templateGridToWorkbookData(grid, pageConfig)`/`workbookDataToTemplateGrid(snapshot, pageConfig)`（Task 6 定义，Task 7 消费一致）；`UniverEditorHandle.insertTokenAtSelection(token): boolean`（Task 7 定义，Task 9 消费一致）✓
