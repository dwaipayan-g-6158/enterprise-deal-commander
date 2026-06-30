"use client"

import * as React from "react"
import { Calendar as CalendarIcon } from "lucide-react"
import type { Matcher } from "react-day-picker"

import { cn } from "@/lib/utils"
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
}

// Parse a "YYYY-MM-DD" string into a local Date (no timezone shift).
function parseISODate(value?: string): Date | undefined {
  if (!value) return undefined
  const parts = value.split("-")
  if (parts.length !== 3) return undefined
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day)
  ) {
    return undefined
  }
  return new Date(year, month - 1, day)
}

// Format a Date into "YYYY-MM-DD" using local date parts (avoids toISOString TZ shift).
function formatISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  max,
  min,
  disabled,
  id,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const selected = parseISODate(value)
  const minDate = parseISODate(min)
  const maxDate = parseISODate(max)

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
            !selected && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selected ? selected.toLocaleDateString() : placeholder}
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
              onChange(formatISODate(date))
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
