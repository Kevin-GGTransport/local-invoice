"use client";

/**
 * 账单模版 —— Univer Excel 编辑器容器（仅草稿编辑页加载）
 * 负责 Univer 实例生命周期：加载 TemplateGrid、防抖同步编辑结果回 TemplateGrid、
 * 主题跟随应用（light/dark 重建实例）、对外暴露「向选中格插入令牌」。
 */

import React from "react";
import { useTheme } from "next-themes";
import { createUniver, defaultTheme, LocaleType, mergeLocales } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/presets/preset-sheets-core";
import { UniverSheetsFindReplacePreset } from "@univerjs/presets/preset-sheets-find-replace";
import zhCN from "@univerjs/preset-sheets-core/locales/zh-CN";
import findReplaceZhCN from "@univerjs/presets/preset-sheets-find-replace/locales/zh-CN";
import "@univerjs/presets/lib/styles/preset-sheets-core.css";
import "@univerjs/presets/lib/styles/preset-sheets-find-replace.css";

import {
  templateGridToWorkbookData,
  workbookDataToTemplateGrid,
  type UniverSnapshot,
} from "@/lib/templates/univer-bridge";
import type { TemplateGrid, TemplatePageConfig } from "@/lib/templates/types";

export interface UniverEditorHandle {
  /** 把令牌追加写入当前选中单元格（无选中时仅返回 false，提示由外层令牌面板负责） */
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
      let univerInstance: ReturnType<typeof createUniver>["univer"] | null = null;
      let disposable: { dispose?: () => void } | null = null;
      let syncTimer: ReturnType<typeof setTimeout> | null = null;
      const initializeTimer = setTimeout(() => {
        const isDark = resolvedTheme === "dark";
        const { univerAPI, univer } = createUniver({
          locale: LocaleType.ZH_CN,
          locales: { [LocaleType.ZH_CN]: mergeLocales(zhCN, findReplaceZhCN) },
          theme: defaultTheme,
          darkMode: isDark,
          // container 缺省为 "app" 字符串 id，页面无 #app 元素时 Univer 会挂到游离节点上（永远不可见）
          presets: [
            UniverSheetsCorePreset({
              container,
              header: true,
              toolbar: true,
              ribbonType: "classic",
              formulaBar: true,
              contextMenu: true,
              footer: {
                sheetBar: true,
                statisticBar: true,
                menus: true,
                zoomSlider: true,
              },
            }),
            UniverSheetsFindReplacePreset(),
          ],
        });
        univerInstance = univer;
        apiRef.current = univerAPI;
        univerAPI.createWorkbook(templateGridToWorkbookData(grid, pageConfig));

        const scheduleSync = () => {
          if (syncTimer) clearTimeout(syncTimer);
          syncTimer = setTimeout(() => {
          const snapshot = univerAPI
            .getActiveWorkbook()
            ?.save() as unknown as UniverSnapshot | undefined;
          if (snapshot) onGridChangeRef.current(workbookDataToTemplateGrid(snapshot, pageConfig));
          }, SYNC_DEBOUNCE_MS);
        };
        disposable = univerAPI.onCommandExecuted(() => scheduleSync());
      }, 0);

      return () => {
        clearTimeout(initializeTimer);
        disposable?.dispose?.();
        if (syncTimer) clearTimeout(syncTimer);
        const instanceToDispose = univerInstance;
        setTimeout(() => void instanceToDispose?.dispose(), 0);
        if (univerInstance && apiRef.current) apiRef.current = null;
      };
      // grid/pageConfig 仅用于初始化；编辑回传走 onGridChange，避免循环重建。
      // 主题切换重建实例（编辑内容已经防抖外传，由父层 state 恢复）。
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [templateId, resolvedTheme]);

    return (
      <div
        key={resolvedTheme}
        ref={containerRef}
        className="h-[calc(100dvh-16rem)] min-h-[28rem] w-full overflow-hidden rounded-md border"
      />
    );
  }
);
