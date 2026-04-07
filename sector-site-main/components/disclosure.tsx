'use client'
import { useState, PropsWithChildren, ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export function Disclosure({
  summary,
  defaultOpen = false,
  children,
  className = '',
}: PropsWithChildren<{ summary: ReactNode; defaultOpen?: boolean; className?: string }>) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between p-4 cursor-pointer"
      >
        <span className="font-bold text-lg">{summary}</span>
        {open ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
      </button>

      {/* Simple show/hide */}
      {open && <div className="border-t p-4">{children}</div>}
    </div>
  )
}
