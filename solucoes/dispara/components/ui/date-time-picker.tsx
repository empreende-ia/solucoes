"use client"

import * as React from "react"
import { Clock } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

export interface DateTimePickerProps {
  /** Current time value in HH:mm format */
  value?: string
  /** Callback when time changes */
  onChange?: (value: string) => void
  /** Additional CSS classes for the popover content */
  className?: string
  /** Whether the picker is disabled */
  disabled?: boolean
}

const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"))

export default function DateTimePicker({
  value,
  onChange,
  className,
  disabled,
}: DateTimePickerProps) {
  const [hour, setHour] = React.useState("12")
  const [minute, setMinute] = React.useState("00")
  const hourRef = React.useRef(hour)
  const minuteRef = React.useRef(minute)

  React.useEffect(() => {
    if (!value) return
    const [h, m] = value.split(":")
    if (h && m) {
      hourRef.current = h
      minuteRef.current = m
      setHour(h)
      setMinute(m)
    }
  }, [value])

  const display = `${hour}:${minute}`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "w-full rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 py-3 text-sm text-[var(--ds-text-primary)] flex items-center justify-between gap-3",
            disabled ? "opacity-50 cursor-not-allowed" : null,
          )}
        >
          <span className="text-[var(--ds-text-primary)]">{display}</span>
          <Clock className="h-4 w-4 text-primary-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-52 border border-[var(--ds-border-default)] bg-[var(--ds-bg-base)] p-4", className)}>
        <div className="flex items-center justify-center gap-2 text-sm text-[var(--ds-text-primary)]">
          <Select
            value={hour}
            onValueChange={(next) => {
              hourRef.current = next
              setHour(next)
              onChange?.(`${next}:${minuteRef.current}`)
            }}
          >
            <SelectTrigger className="h-9 w-[64px] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-primary)] border-[var(--ds-border-default)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-56">
              {hours.map((h) => (
                <SelectItem key={h} value={h}>
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-[var(--ds-text-muted)]">:</span>

          <Select
            value={minute}
            onValueChange={(next) => {
              minuteRef.current = next
              setMinute(next)
              onChange?.(`${hourRef.current}:${next}`)
            }}
          >
            <SelectTrigger className="h-9 w-[64px] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-primary)] border-[var(--ds-border-default)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-56">
              {minutes.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  )
}
