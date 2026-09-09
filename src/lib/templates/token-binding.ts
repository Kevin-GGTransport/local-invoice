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

// extractTokens 返回去掉 {{ }} 的令牌名，映射表也以内名建键
const TOKEN_TO_FIELD = new Map<string, TemplateFieldKey>(
  TEMPLATE_FIELDS.map((f) => [FIELD_TOKENS[f.key].slice(2, -2), f.key])
);
const TOKEN_TO_DETAIL = new Map<string, DetailRole>(
  (Object.keys(DETAIL_TOKENS) as DetailRole[]).map((role) => [DETAIL_TOKENS[role].slice(2, -2), role])
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
  return text.replace(tokenRegex(key), () => value);
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
