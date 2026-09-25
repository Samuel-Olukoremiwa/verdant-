'use client'

import type {
  ChangeEventHandler,
  InputHTMLAttributes,
} from 'react'

import {
  isoToDdMmYyyy,
} from '@/lib/date-format'

type DateFieldProps =
  Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'type' | 'value' | 'onChange'
  > & {
    value: string
    onChange: ChangeEventHandler<HTMLInputElement>
  }

export function DateField({
  value,
  onChange,
  className = '',
  disabled,
  style,
  ...props
}: DateFieldProps) {
  const displayValue =
    isoToDdMmYyyy(value) ||
    'DD/MM/YYYY'

  return (
    <span
      className={[
        'relative block w-full overflow-hidden rounded-lg border px-3 py-2',
        'focus-within:ring-2 focus-within:ring-lime-300',
        disabled
          ? 'cursor-not-allowed opacity-60'
          : 'cursor-pointer',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        minHeight: 44,
        background:
          'var(--surface, #ffffff)',
        color:
          'var(--ink, #17392f)',
        borderColor:
          'var(--line, #d9e0da)',
        ...style,
      }}
    >
      <span
        className="pointer-events-none flex min-h-6 items-center justify-between gap-3"
        aria-hidden="true"
      >
        <span
          style={{
            color: value
              ? 'inherit'
              : 'var(--muted, #7a877f)',
          }}
        >
          {displayValue}
        </span>

        <span
          style={{
            color:
              'var(--muted, #7a877f)',
            fontSize: '0.9rem',
          }}
        >
          ▾
        </span>
      </span>

      <input
        {...props}
        type="date"
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          margin: 0,
          padding: 0,
        }}
      />
    </span>
  )
}
