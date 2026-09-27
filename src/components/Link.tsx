import type { MouseEvent, ReactNode } from 'react'
import { navigate } from '../routes'

/**
 * An internal link. Renders a real `<a href>` so middle-click, ctrl/cmd-click,
 * "open in new tab" and link previews all behave normally — only a plain left
 * click is intercepted for client-side navigation.
 */
export default function Link({
  to,
  children,
  className,
  title,
}: {
  to: string
  children: ReactNode
  className?: string
  title?: string
}) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to)
  }
  return (
    <a href={to} onClick={onClick} className={className} title={title}>
      {children}
    </a>
  )
}
