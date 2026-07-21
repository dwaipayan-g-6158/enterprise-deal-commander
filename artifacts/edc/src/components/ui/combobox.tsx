"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface ComboboxOption {
  value: string
  label: string
}

export interface ComboboxProps {
  options: ComboboxOption[]
  value?: string
  onChange: (v: string) => void
  placeholder?: string
  emptyText?: string
  onCreate?: (
    label: string
  ) => Promise<ComboboxOption | void> | ComboboxOption | void
  disabled?: boolean
}

function hasExactLabel(options: ComboboxOption[], search: string): boolean {
  const trimmed = search.trim().toLowerCase()
  return options.some((o) => o.label.toLowerCase() === trimmed)
}

function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  emptyText = "No matches found.",
  onCreate,
  disabled,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const selected = options.find((o) => o.value === value)

  const showCreate =
    !!onCreate && search.trim().length > 0 && !hasExactLabel(options, search)

  const handleCreate = async () => {
    if (!onCreate) return
    const label = search.trim()
    const created = await onCreate(label)
    if (created) {
      onChange(created.value)
    }
    setSearch("")
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground"
          )}
        >
          {selected ? selected.label : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value)
                    setSearch("")
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
              {showCreate && (
                <CommandItem
                  value={`__create__${search}`}
                  onSelect={handleCreate}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add &quot;{search.trim()}&quot;
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export interface MultiComboboxProps {
  options: ComboboxOption[]
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  emptyText?: string
  onCreate?: (
    label: string
  ) => Promise<ComboboxOption | void> | ComboboxOption | void
  disabled?: boolean
}

function MultiCombobox({
  options,
  value,
  onChange,
  placeholder = "Select options",
  emptyText = "No matches found.",
  onCreate,
  disabled,
}: MultiComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const selectedOptions = options.filter((o) => value.includes(o.value))

  const showCreate =
    !!onCreate && search.trim().length > 0 && !hasExactLabel(options, search)

  const toggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue))
    } else {
      onChange([...value, optionValue])
    }
  }

  const remove = (optionValue: string) => {
    onChange(value.filter((v) => v !== optionValue))
  }

  const handleCreate = async () => {
    if (!onCreate) return
    const label = search.trim()
    const created = await onCreate(label)
    if (created && !value.includes(created.value)) {
      onChange([...value, created.value])
    }
    setSearch("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-auto min-h-9 w-full justify-between font-normal",
            selectedOptions.length === 0 && "text-muted-foreground"
          )}
        >
          <span className="flex flex-1 flex-wrap gap-1">
            {selectedOptions.length > 0 ? (
              selectedOptions.map((option) => (
                <Badge
                  key={option.value}
                  variant="secondary"
                  className="gap-1"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    remove(option.value)
                  }}
                >
                  {option.label}
                  <X className="h-3 w-3" />
                </Badge>
              ))
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = value.includes(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggle(option.value)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option.label}
                  </CommandItem>
                )
              })}
              {showCreate && (
                <CommandItem
                  value={`__create__${search}`}
                  onSelect={handleCreate}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add &quot;{search.trim()}&quot;
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { Combobox, MultiCombobox }
