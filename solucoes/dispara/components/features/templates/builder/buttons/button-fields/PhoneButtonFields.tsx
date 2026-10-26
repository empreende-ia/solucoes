'use client'

import React from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ButtonData } from '../types'

interface PhoneButtonFieldsProps {
  button: ButtonData
  index: number
  buttons: ButtonData[]
  updateButtons: (buttons: ButtonData[]) => void
  splitPhone: (phone: string) => { country: string; number: string }
  joinPhone: (country: string, number: string) => string
}

export function PhoneButtonFields({
  button,
  index,
  buttons,
  updateButtons,
  splitPhone,
  joinPhone,
}: PhoneButtonFieldsProps) {
  const { country, number } = splitPhone(String(button?.phone_number || ''))

  const handleCountryChange = (v: string) => {
    const next = [...buttons]
    next[index] = { ...button, phone_number: joinPhone(v, number) }
    updateButtons(next)
  }

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = [...buttons]
    next[index] = { ...button, phone_number: joinPhone(country, e.target.value) }
    updateButtons(next)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-1">
        <div className="text-xs font-medium text-[var(--ds-text-secondary)]">Pais</div>
        <Select value={country} onValueChange={handleCountryChange}>
          <SelectTrigger className="h-11 w-full bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="55">BR +55</SelectItem>
            <SelectItem value="1">US +1</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-[var(--ds-text-secondary)]">Telefone</div>
        <Input
          value={number}
          onChange={handleNumberChange}
          className="h-11 bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]"
          placeholder="(11) 99999-7777"
        />
      </div>
    </div>
  )
}
