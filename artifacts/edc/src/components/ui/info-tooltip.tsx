"use client"

import * as React from "react"
import { Info } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export interface InfoTooltipProps {
  children: React.ReactNode
  className?: string
}

function InfoTooltip({ children, className }: InfoTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center">
            <Info
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground cursor-help",
                className
              )}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export { InfoTooltip }
