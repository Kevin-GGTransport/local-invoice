"use client"

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return (
    <CollapsiblePrimitive.Root 
      data-slot="collapsible" 
      {...props}
      // Radix UI 内部使用随机 ID，这会导致 hydration 错误
      // 我们通过确保只在客户端渲染（动态导入）来避免这个问题
      suppressHydrationWarning
    />
  )
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
      suppressHydrationWarning
    />
  )
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
      suppressHydrationWarning
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
