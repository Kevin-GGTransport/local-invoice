# 设计：Univer Excel 模板编辑器 + 令牌式绑定

- 日期：2026-09-09
- 状态：已与用户对齐（含绑定简化与多行渲染两轮修订）
- 影响范围：模板编辑子系统（编辑器 UI、绑定模型、渲染排版）；数据库结构、PDF 服务签名、上传解析入口不变

## 1. 背景与目标

现有模板编辑器是自研"类 Excel"网格（`src/components/templates/template-editor.tsx`），存在四类痛点：

1. 编辑手感不如 Excel（无框选、Ctrl+C/V、填充柄、撤销重做等）
2. 样式能力不够细（无下划线/删除线、边框线型、逐边边框 UI 未暴露）
3. 行列/合并操作不便
4. **绑定向导太复杂**：两步式"点面板字段→再点格子"，明细区域还要手配 startRow/endRow/4 列角色，用户不会操作
5. **绑定值压成一行**：`fitSingleLineFontSize`（`src/lib/templates/cell-layout.ts:16`）把放不下的值缩字号塞进一行（最低 5.5pt）；`wrap=true` 格子虽折行但行高固定会溢出；明细行高固定（`src/lib/templates/render-template-data.ts:51`）

目标：用完整 Excel 引擎替换编辑器；绑定改为**令牌式**（在格子里写 `{{令牌}}` 即绑定）；绑定值**多行自适应渲染**。

非目标（明确排除）：模板导出 xlsx、图表/图片嵌入、多人协同、公式持久化（见 §8）。

## 2. 技术选型

**Univer**（`@univerjs/presets` + `@univerjs/preset-sheets-core`，锁定 0.25.x 精确版本）。

- Luckysheet 官方继任者，活跃维护；MIT 免费核心覆盖全部需求（编辑、样式、选区、复制粘贴、撤销重做、自带完整 ribbon 工具栏与右键菜单）
- 付费部分（xlsx 导入导出、图表、透视表、打印）全部用不到：xlsx 解析已有 ExcelJS，打印已有 react-pdf
- 备选否决：Luckysheet/Fortune-sheet 已停维护；x-data-spreadsheet/jspreadsheet CE 能力不足；Handsontable 商业授权收费

## 3. 总体架构

```
上传 xlsx → ExcelJS 解析（不变）→ TemplateGrid JSON
                                        ↓ templateGridToWorkbookData()
                        Univer 编辑器（替换自研网格编辑器）
                          ↓ 用户写 {{令牌}} 编辑内容/样式
                                        ↓ workbookDataToTemplateGrid()
                        deriveBindingFromGrid() → PATCH API（grid + 推导的 binding）
                                        ↓
        renderTemplateData（+ autoFitRowHeights）→ HTML 预览 / react-pdf（消费方不变）
```

- 数据源仍是 `grid_config`（TemplateGrid JSON）。数据库 schema 零改动；`binding_config` 保留，保存时由令牌推导写入
- 非草稿（active/archived）：继续用现有 `TemplatePreview` 只读渲染（不加载 Univer，省包体，已有绑定角标）
- 新文件：`src/lib/templates/univer-bridge.ts`（双向转换）、`src/lib/templates/token-binding.ts`（令牌推导）；重写 `template-editor.tsx`

## 4. 令牌式绑定

### 4.1 语法与令牌表

单元格文本中出现 `{{令牌}}` 即绑定该格。令牌与空白宽容：`{{ 发票号 }}` 等价。令牌可嵌在静态文本中（渲染时只替换令牌部分），如 `Invoice No: {{发票号}}`——支持发票上最常见的"标签+值"模式。

| 字段 key | 令牌 |
|---|---|
| invoice_number | `{{发票号}}` |
| invoice_date | `{{发票日期}}` |
| load_number | `{{Load No.}}` |
| bill_to | `{{收款方}}` |
| total | `{{合计}}` |
| pickup_date | `{{取货日期}}` |
| pickup_company | `{{取货公司}}` |
| pickup_address | `{{取货地址}}` |
| drop_date | `{{交货日期}}` |
| drop_company | `{{交货公司}}` |
| drop_address | `{{交货地址}}` |

明细令牌（写在同一行即定义明细模板行）：`{{描述}}`、`{{数量}}`、`{{单价}}`、`{{金额}}`（描述、金额必填）。

解绑 = 删除格内令牌文本，无独立操作。

令牌表定义在 `token-binding.ts`，与 `TEMPLATE_FIELDS` 注册表同源维护（key ↔ 令牌字符串双向映射）。

### 4.2 推导函数

```ts
deriveBindingFromGrid(grid: TemplateGrid, opts?: { minRows?: number }): {
  binding: TemplateBinding
  unknownTokens: string[]   // 如 {{xxx}}，保存时给中文警告（不阻断保存）
  errors: string[]          // 明细令牌出现在多行等结构性错误
}
```

- 扫描全部 cell 文本，正则 `/\{\{\s*([^{}]+?)\s*\}\}/g` 提取令牌 → 字段映射到 cells 列表；同一字段多格即多位置绑定（取代"添加位置"）
- 含明细令牌的行 = 明细模板行；推导 lineItems 为 `startRow = endRow = 该行`，columns 取令牌所在列；要求明细令牌只出现在一行，否则 errors
- minRows 默认 5，由编辑页面板输入，PATCH 随 grid 一起提交

### 4.3 渲染替换规则（`render-template-data.ts` 小改，签名不变）

绑定格渲染时：文本中**只替换令牌出现处**，保留周围静态文本；整格只有令牌时等价于现在的整格替换（向后兼容旧 binding_config：旧数据格内无令牌 → 整格替换，行为不变）。

同时（多行渲染的关键钩子）：`renderTemplateData` 对**替换过值的格子强制 `style.wrap = true`**（字段格 + 明细数据格），使下游排版统一走"wrap → 多行 + 行高自适应"分支（见 §7）。

### 4.4 上传入口的免费增强

上传 xlsx 解析后即调 `deriveBindingFromGrid`：样张里已含令牌则自动完成绑定；未知令牌以警告返回前端提示。

### 4.5 编辑页右侧面板（从向导降级为速查辅助）

- **令牌速查**：11 个字段 + 4 个明细令牌的列表；点击即把令牌插入当前选中的 Univer 单元格（光标处/追加）
- 明细最少行数输入（minRows）
- 校验结果区：`deriveBindingFromGrid` 的 unknownTokens/errors + `validateBindingForPublish(derived)` 的实时结果
- 不再有任何两步式绑定交互

## 5. Univer 编辑器接入

### 5.1 桥接层 `src/lib/templates/univer-bridge.ts`

- `templateGridToWorkbookData(grid, pageConfig): IWorkbookData`：cells → Univer cellData（文本 + 样式引用）；`TemplateCellStyle` → `IStyleData`（bl/it/ul/st、fs、字体色/填充色、at/vt 对齐、tb wrap、逐边 border style+color）；合并 → mergeData；行高/列宽 → rowData/columnData，**pt ↔ px 单位换算（×4/3）在此层完成**
- `workbookDataToTemplateGrid(snapshot): TemplateGrid`：反向；公式格取**计算后的显示值**（`v`），模型不存公式；数字格式同理取显示值
- 桥接层是 Univer 类型唯一被引用的地方（除编辑器组件），保证 Univer 可整体替换

### 5.2 编辑器组件

- `next/dynamic(..., { ssr: false })` 客户端加载 Univer + CSS；locale zh-CN；主题跟随应用 light/dark
- 页面结构：顶部（模板名 + 状态 + 保存草稿/试打 PDF/发布/复制草稿，沿用现有按钮与流程）｜中间 Univer 自适应高度（自带 ribbon，**删除全部自研工具栏**）｜右侧 380px sticky 辅助面板
- 保存：快照 → `workbookDataToTemplateGrid` → 行列上限校验（80 行 × 30 列，与解析上限一致）→ `trimGridToContent` → `deriveBindingFromGrid` → PATCH（grid + minRows；binding 由服务端同函数推导）
- 草稿自动暂存 sessionStorage（debounce，存转换后的 TemplateGrid，复用现有恢复逻辑）；beforeunload 离开保护保留
- 试打/发布前自动保存（沿用现有流程）

## 6. 样式模型补齐

现有 `TemplateCellStyle` 已支持 bold/italic/fontSize/color/fill/逐边边框宽度+色/halign/valign/wrap（`src/lib/templates/types.ts:17-36`），补三样：

| 缺口 | 改动 |
|---|---|
| 下划线、删除线 | `TemplateCellStyle` 增加 `underline?: boolean`、`strike?: boolean` |
| 边框线型 | `TemplateCellBorders` 增加可选 `styles?: { top?; right?; bottom?; left?: BorderLineStyle }`，`BorderLineStyle = 'thin' \| 'medium' \| 'thick' \| 'dashed' \| 'dotted' \| 'double'`（与 Univer BorderStyleType 对齐）；与现有宽度字段并存，旧 JSON 天然兼容 |
| PDF/预览渲染 | `generic-template-pdf.tsx`：`fontStyle: italic`、`textDecoration: underline/line-through`、边框 `BorderStyle: solid/dashed/dotted`；`double` 画双细线模拟；`TemplatePreview` 同步（`text-decoration` + `border-style` 映射） |

`parse-xlsx.ts` 同步导入 underline/strike（ExcelJS `font.underline/strike`）与边框线型（ExcelJS 线型字符串与本枚举 1:1）。`cell-layout.ts` 估宽器对 italic/underline 不额外加权（视觉差异可忽略）。

## 7. 绑定值多行渲染

| 内容类型 | 规则 |
|---|---|
| 静态文本（未被绑定替换） | Excel 语义不变：先右/左溢出到空邻格，仍放不下缩字号 |
| 绑定值（字段格 + 明细数据格，即 `renderTemplateData` 强制 wrap 的格子） | 值含换行按换行；超格宽自动折行；行高自适应撑开；**永不缩字号** |

实现（两个纯函数，HTML 预览与 PDF 共用，维持"编辑看到的 = 打印出来的"）：

- `cell-layout.ts` 新增：`wrapTextLines(text, fontSize, boxWidth, bold): string[]`（复用现有 em 估宽做断行，尊重 `\n`）；行高系数常量 `LINE_HEIGHT_FACTOR = 1.3`（验收时可微调，但必须单一来源、两渲染器统一取值）
- `src/lib/templates/auto-fit-row-heights.ts` 新增 `autoFitRowHeights(grid): TemplateGrid`：对 wrap 格按折行所需高度撑开行高（`rowHeight = max(原高, 行数 × fontSize × LINE_HEIGHT_FACTOR + 上下留白)`）；在 `renderTemplateData` 输出之后调用，因此明细数据行同样自适应（长描述撑高该行，每行独立计算）

## 8. 公式与数字格式边界

模板里可以写公式（Univer 核心含公式引擎，编辑时所见即所得）；保存取显示值，模型不存公式。发票字段绑定渲染时整段替换/令牌替换，值由服务端格式化，此策略无副作用。

## 9. 存量模板迁移（一次性脚本）

`scripts/migrate-templates-to-tokens.ts`（仿 `seed-legacy-templates.ts` 模式，幂等，支持 dry-run）：

1. 逐模板读 grid + binding；每个绑定格文本替换为对应令牌（整格令牌；旧渲染本就整格替换，输出不变）
2. 明细区域：startRow 的各列角色格写入对应明细令牌；**删除 startRow+1..endRow 的占位行**（现有渲染本就丢弃这些行、只克隆首行，行位移数学已核对 `render-template-data.ts:62-77`，输出逐字节不变）；推导 lineItems 为单行区域
3. `deriveBindingFromGrid` 推导回写 binding_config（minRows 沿用旧值）
4. 安全网：迁移前各模板渲染 PDF 留档比对（人工抽检）；推导失败即中止该模板并报告，不动库

## 10. 错误处理

- 保存前校验：行列超限（80×30）、桥接转换失败 → 行内中文错误，阻断保存
- 未知令牌：中文警告（保存不阻断，面板常显）
- 结构性错误（明细令牌分散多行等）：来自 `deriveBindingFromGrid().errors`，中文提示；保存/发布接口聚合「推导 errors + `validateBindingForPublish(derived)`」两路结果阻断发布
- `trimGridToContent` 沿用，防拖出超大空网格

## 11. 包体与性能

- Univer 仅草稿编辑页动态加载（几 MB，admin-only）；非草稿页、开票表单侧边预览不受影响
- `@univerjs/presets` 与 `@univerjs/preset-sheets-core` 锁定 0.25.x 精确小版本，防 0.x breaking change；升级走专门 PR

## 12. 测试

- **单元（node:test，沿用现有测试目录）**：
  - `token-binding`：纯令牌/嵌静态文本/多格同字段/明细行推导/未知令牌/多行明细令牌报错
  - `render-template-data`：令牌子串替换、整格替换向后兼容（无令牌旧数据）、绑定格强制 wrap
  - `auto-fit-row-heights`：折行数 → 行高、明细行独立撑高、原高更大时不变
  - `univer-bridge`：round-trip（grid → workbookData → grid，模型支持子集等价：文本/样式/合并/行列尺寸/新样式字段）
  - 样式兼容：旧 JSON（无新字段）读写正常
- **现有 4 套测试回归**：parse-xlsx、render-template-data、cell-layout、template-grid
- **手动 Playwright 验收**：上传（含令牌样张自动绑定）→ Excel 式编辑（框选/复制粘贴/逐边边框/下划线）→ 插令牌 → 试打 PDF（多行值正确折行撑高）→ 发布 → 真实发票 PDF 正确；迁移脚本前后 PDF 对比

## 13. 决策记录

- Univer 替代自研编辑器而非双编辑器并存：用户明确拒绝打补丁式方案；两套编辑器维护成本不可接受
- TemplateGrid 仍是唯一数据源而非存 xlsx 文件：现有模板无缝兼容，PDF/发布链路零改动；Excel 保真度超出渲染模型的部分（图表等）本就无法打印，不损失任何实际能力
- 令牌式绑定替代向导：把绑定操作降为"打字填空"，令牌在格内可见即所得
- 绑定值永不缩字号：缩到 5.5pt 的地址在发票上没有意义；完整可读优先于版面不变形
