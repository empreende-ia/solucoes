"use client"

import * as React from "react"
import { ChevronDown, Check } from "lucide-react"
import {
  defaultCountries,
  parseCountry,
  usePhoneInput,
  getActiveFormattingMask,
  type CountryIso2,
  type CountryData,
} from "react-international-phone"

import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"

export interface InternationalPhoneInputProps {
  value: string
  onChange: (phoneE164: string) => void

  /** Defaults to locale-based guess, then "us". */
  defaultCountry?: CountryIso2

  /** Countries pinned to the top. If omitted, a smart list based on locale is used. */
  preferredCountries?: CountryIso2[]

  /** Full list of available countries (defaults to library list). */
  countries?: CountryData[]

  disabled?: boolean
  className?: string
  inputClassName?: string

  /** Placeholder strategy. */
  placeholderMode?: "example" | "none"
}

function uniqueIso2(list: Array<CountryIso2 | undefined | null>): CountryIso2[] {
  const seen = new Set<string>()
  const out: CountryIso2[] = []
  for (const item of list) {
    if (!item) continue
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key as CountryIso2)
  }
  return out
}

function getLocaleCountryIso2(): CountryIso2 | undefined {
  try {
    const lang = typeof navigator !== "undefined" ? navigator.language : ""
    if (!lang) return undefined

    // Prefer region when available (e.g. pt-BR -> BR)
    // Intl.Locale exists on modern browsers, but we keep a safe fallback.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const IntlLocale: any = (Intl as any)?.Locale
    if (IntlLocale) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const loc = new IntlLocale(lang)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const region = (loc?.region as string | undefined) ?? undefined
      if (region && region.length === 2) return region.toLowerCase() as CountryIso2
    }

    const parts = lang.split(/[-_]/g)
    const maybeRegion = parts[1]
    if (maybeRegion && maybeRegion.length === 2) return maybeRegion.toLowerCase() as CountryIso2

    const language = parts[0]?.toLowerCase()
    if (language === "pt") return "br"
    if (language === "es") return "es"
    if (language === "en") return "us"
    if (language === "fr") return "fr"
    if (language === "de") return "de"
    if (language === "it") return "it"

    return undefined
  } catch {
    return undefined
  }
}

function buildSmartPreferredCountries(localeCountry?: CountryIso2): CountryIso2[] {
  return uniqueIso2([
    localeCountry,
    "br",
    "us",
    "pt",
    "mx",
    "ar",
    "cl",
    "co",
    "es",
    "fr",
    "de",
    "it",
  ])
}

function buildExamplePlaceholder(countryIso2: CountryIso2, dialCode: string): string {
  // Mask is for the national number portion.
  const countryData = defaultCountries.find((c) => parseCountry(c).iso2 === countryIso2)
  const parsed = countryData ? parseCountry(countryData) : undefined

  const mask = parsed
    ? getActiveFormattingMask({ phone: `+${dialCode}`, country: parsed, defaultMask: "............", disableFormatting: false })
    : "............"

  const exampleNational = mask.replace(/\./g, "5")
  return exampleNational.trim()
}

export function InternationalPhoneInput({
  value,
  onChange,
  defaultCountry,
  preferredCountries,
  countries = defaultCountries,
  disabled,
  className,
  inputClassName,
  placeholderMode = "example",
}: InternationalPhoneInputProps) {
  const localeCountry = React.useMemo(() => getLocaleCountryIso2(), [])
  const smartDefaultCountry = defaultCountry ?? localeCountry ?? "us"
  const smartPreferred = React.useMemo(
    () => preferredCountries ?? buildSmartPreferredCountries(localeCountry ?? smartDefaultCountry),
    [preferredCountries, localeCountry, smartDefaultCountry]
  )

  const [open, setOpen] = React.useState(false)

  const {
    inputValue,
    country,
    setCountry,
    handlePhoneValueChange,
    inputRef,
  } = usePhoneInput({
    defaultCountry: smartDefaultCountry,
    value,
    countries,
    preferredCountries: smartPreferred,
    // We render the DDI as a separate segment so the input can keep a real placeholder example.
    disableDialCodeAndPrefix: true,
    onChange: ({ phone }) => onChange(phone),
  })

  const placeholder = React.useMemo(() => {
    if (placeholderMode === "none") return undefined
    return buildExamplePlaceholder(country.iso2, country.dialCode)
  }, [placeholderMode, country.iso2, country.dialCode])

  const preferredSet = React.useMemo(() => new Set(smartPreferred), [smartPreferred])

  const parsedCountries = React.useMemo(() => countries.map((c) => parseCountry(c)), [countries])

  const preferredList = React.useMemo(
    () => parsedCountries.filter((c) => preferredSet.has(c.iso2)),
    [parsedCountries, preferredSet]
  )
  const otherList = React.useMemo(
    () => parsedCountries.filter((c) => !preferredSet.has(c.iso2)),
    [parsedCountries, preferredSet]
  )

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "flex w-full items-stretch rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)]",
          disabled && "opacity-60"
        )}
      >
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-l-xl border-r border-[var(--ds-border-default)] px-3",
                "bg-[var(--ds-bg-surface)] hover:bg-[var(--ds-bg-hover)]",
                "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-0"
              )}
              aria-label="Selecionar país"
            >
              <span className="text-lg" aria-hidden>
                {/* Emoji fallback keeps bundle small and is perfectly fine here */}
                {String.fromCodePoint(
                  ...country.iso2
                    .toUpperCase()
                    .split("")
                    .map((c) => 127397 + c.charCodeAt(0))
                )}
              </span>
              <ChevronDown className="h-4 w-4 text-[var(--ds-text-secondary)]" />
            </button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            sideOffset={8}
            className={cn(
              "w-[340px] border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-0 text-[var(--ds-text-primary)] shadow-xl",
              "rounded-xl"
            )}
          >
            <Command>
              <CommandInput placeholder="Buscar país…" autoFocus />
              <CommandList>
                <CommandEmpty>Nenhum país encontrado.</CommandEmpty>

                {preferredList.length > 0 && (
                  <>
                    <CommandGroup heading="Sugestões">
                      {preferredList.map((c) => (
                        <CommandItem
                          key={c.iso2}
                          value={`${c.name} ${c.iso2} +${c.dialCode}`}
                          onSelect={() => {
                            setCountry(c.iso2, { focusOnInput: true })
                            setOpen(false)
                          }}
                          className="flex items-center gap-3"
                        >
                          <span className="text-base" aria-hidden>
                            {String.fromCodePoint(
                              ...c.iso2
                                .toUpperCase()
                                .split("")
                                .map((ch) => 127397 + ch.charCodeAt(0))
                            )}
                          </span>
                          <span className="flex-1 truncate">{c.name}</span>
                          <span className="text-xs text-[var(--ds-text-secondary)]">+{c.dialCode}</span>
                          {c.iso2 === country.iso2 && <Check className="h-4 w-4 text-primary-500" />}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    <CommandSeparator />
                  </>
                )}

                <CommandGroup heading="Todos">
                  {otherList.map((c) => (
                    <CommandItem
                      key={c.iso2}
                      value={`${c.name} ${c.iso2} +${c.dialCode}`}
                      onSelect={() => {
                        setCountry(c.iso2, { focusOnInput: true })
                        setOpen(false)
                      }}
                      className="flex items-center gap-3"
                    >
                      <span className="text-base" aria-hidden>
                        {String.fromCodePoint(
                          ...c.iso2
                            .toUpperCase()
                            .split("")
                            .map((ch) => 127397 + ch.charCodeAt(0))
                        )}
                      </span>
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-[var(--ds-text-secondary)]">+{c.dialCode}</span>
                      {c.iso2 === country.iso2 && <Check className="h-4 w-4 text-primary-500" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <div className="flex shrink-0 items-center border-r border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 text-sm text-[var(--ds-text-primary)]">
          +{country.dialCode}
        </div>

        <input
          ref={inputRef}
          type="tel"
          value={inputValue}
          onChange={handlePhoneValueChange}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            "min-w-0 flex-1 rounded-r-xl bg-[var(--ds-bg-surface)] px-4 py-3 text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)]",
            "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent",
            inputClassName
          )}
        />
      </div>
    </div>
  )
}
