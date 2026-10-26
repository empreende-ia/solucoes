import React from 'react'

interface CheckCircleFilledProps {
  size: number
  className?: string
}

/**
 * Filled check circle icon (checkmark inside a solid circle).
 * Used for success states and selection indicators.
 */
export function CheckCircleFilled({ size, className }: CheckCircleFilledProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      className={className}
    >
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-1.25 17.292l-4.5-4.364 1.857-1.858 2.643 2.506 5.643-5.784 1.857 1.857-7.5 7.643z" />
    </svg>
  )
}
