"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, Minus } from "lucide-react"

import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, checked, ...props }, ref) => {
  // 检查是否为半选状态
  const isIndeterminate = checked === "indeterminate"
  
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        "peer relative h-5 w-5 shrink-0 rounded-md border-2 border-input/60 dark:border-input bg-background dark:bg-card ring-offset-background transition-all duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-gradient-to-br data-[state=checked]:from-primary data-[state=checked]:to-primary/80 data-[state=checked]:border-primary data-[state=checked]:shadow-lg data-[state=checked]:shadow-primary/30 data-[state=indeterminate]:bg-gradient-to-br data-[state=indeterminate]:from-primary data-[state=indeterminate]:to-primary/80 data-[state=indeterminate]:border-primary data-[state=indeterminate]:shadow-lg data-[state=indeterminate]:shadow-primary/30 hover:border-primary/60 dark:hover:border-primary hover:shadow-sm",
        className
      )}
      checked={checked}
      {...props}
    >
      {/* 选中状态：显示对勾（只在 checked=true 时通过 Indicator 显示） */}
      {!isIndeterminate && (
        <CheckboxPrimitive.Indicator
          className={cn("flex items-center justify-center text-white animate-in fade-in-0 zoom-in-95 duration-200")}
        >
          <Check className="h-3.5 w-3.5 stroke-[3]" />
        </CheckboxPrimitive.Indicator>
      )}
      
      {/* 半选状态：显示短横线（只在 indeterminate 时显示） */}
      {isIndeterminate && (
        <div className="absolute inset-0 flex items-center justify-center text-white pointer-events-none">
          <Minus className="h-3.5 w-3.5 stroke-[3]" />
        </div>
      )}
    </CheckboxPrimitive.Root>
  )
})
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }

