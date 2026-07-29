"use client"

import * as React from "react"
import { Calendar as CalendarIcon } from "lucide-react"
import type { Matcher } from "react-day-picker"

import { cn } from "@/lib/utils"
import { formatDate, parseLocalISODate, toLocalISODate } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface DatePickerProps {
  value?: string
  onChange: (v: string) => void
  placeholder?: string
  max?: string
  min?: string
  disabled?: boolean
  id?: string
  /** Merged onto the trigger Button — the default is `w-full`, so a picker
   *  dropped into a flex row (not a `grid gap-2` block) needs an explicit
   *  width here or it eats the row. */
  className?: string
}

function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  max,
  min,
  disabled,
  id,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const selected = parseLocalISODate(value)
  const minDate = parseLocalISODate(min)
  const maxDate = parseLocalISODate(max)

  const disabledMatcher = React.useMemo<Matcher | undefined>(() => {
    if (minDate && maxDate) return { before: minDate, after: maxDate }
    if (minDate) return { before: minDate }
    if (maxDate) return { after: maxDate }
    return undefined
  }, [minDate, maxDate])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {formatDate(value) ?? placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={disabledMatcher}
          onSelect={(date) => {
            if (date) {
              onChange(toLocalISODate(date))
            }
            setOpen(false)
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
