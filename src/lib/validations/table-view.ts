/**
 * 表格视图预设校验（表无关的信封结构校验）
 * 只约束 config 的四个容器键存在且类型正确；容器内部的脏数据
 * 由各表格页面在应用时自行严格清洗（见页面目录 table-view 解析模块）
 */

import { z } from "zod"

export const tableViewConfigSchema = z.object({
  filters: z.record(z.string(), z.unknown()),
  sorting: z.array(z.unknown()).max(3),
  columnVisibility: z.record(z.string(), z.unknown()),
  groupOrder: z.array(z.unknown()),
})

export const tableViewCreateSchema = z.object({
  table_key: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "table_key 仅允许小写字母、数字与连字符"),
  name: z.string().trim().min(1, "视图名称不能为空").max(50),
  config: tableViewConfigSchema,
  is_default: z.boolean().optional(),
})

export const tableViewUpdateSchema = z.object({
  name: z.string().trim().min(1, "视图名称不能为空").max(50).optional(),
  config: tableViewConfigSchema.optional(),
  is_default: z.boolean().optional(),
})

export type TableViewConfig = z.infer<typeof tableViewConfigSchema>
