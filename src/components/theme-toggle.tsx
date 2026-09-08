"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { setTheme } = useTheme()

  return (
    <>
      <Button type="button" variant="outline" size="icon" className="size-11 dark:hidden"
        aria-label="切换到深色模式" title="切换到深色模式" onClick={() => setTheme("dark")}>
        <Moon className="size-4" aria-hidden="true" />
      </Button>
      <Button type="button" variant="outline" size="icon" className="hidden size-11 dark:inline-flex"
        aria-label="切换到浅色模式" title="切换到浅色模式" onClick={() => setTheme("light")}>
        <Sun className="size-4" aria-hidden="true" />
      </Button>
    </>
  )
}
