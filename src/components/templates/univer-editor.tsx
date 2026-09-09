"use client";

/**
 * 账单模版 —— Univer Excel 编辑器容器（仅草稿编辑页加载）
 * 负责 Univer 实例生命周期：加载 TemplateGrid、防抖同步编辑结果回 TemplateGrid、
 * 主题跟随应用（light/dark 重建实例）、对外暴露「向选中格插入令牌」。
 */

import React from "react";
import { useTheme } from "next-themes";
import { createUniver, defaultTheme, LocaleType, type IWorkbookData } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/presets/preset-sheets-core";
import zhCN from "@univerjs/preset-sheets-core/locales/zh-CN";
import "@univerjs/presets/lib/styles/preset-sheets-core.css";

import {
  templateGridToWorkbookData,
  workbookDataToTemplateGrid,
  type UniverSnapshot,
} from "@/lib/templates/univer-bridge";
import type { TemplateGrid, TemplatePageConfig } from "@/lib/templates/types";

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
          const range = sheet?.getSelection()?.getActiveRange();
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
        theme: defaultTheme,
        darkMode: isDark,
        presets: [UniverSheetsCorePreset({})],
      });
      apiRef.current = univerAPI;
      // 0.25.1 的 IWorkbookData.styles 类型为 Record<string, IStyleData>，桥接层产出数组形态；
      // Univer 运行时按 for...in 读取，数值键数组与 Record 等价，此处仅做类型层转换。
      univerAPI.createWorkbook(
        templateGridToWorkbookData(grid, pageConfig) as unknown as Partial<IWorkbookData>
      );

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

    return (
      <div
        ref={containerRef}
        className="h-[calc(100dvh-16rem)] min-h-[28rem] w-full overflow-hidden rounded-md border"
      />
    );
  }
);
