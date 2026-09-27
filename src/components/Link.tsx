import type { MouseEvent, ReactNode } from 'react'
import { navigate } from '../routes'

/**
 * An internal link. Renders a real `<a href>` so middle-click, ctrl/cmd-click,
 * "open in new tab" and link previews all behave normally — only a plain left
 * click is intercepted for client-side navigation.
 *
 * `newTab` opts out of the interception entirely: the browser opens a second
 * tab and this one keeps its state. Use it where navigating away would destroy
 * something the user can't get back by pressing Back.
 */
export default function Link({
  to,
  children,
  className,
  title,
  newTab,
}: {
  to: string
  children: ReactNode
  className?: string
  title?: string
  newTab?: boolean
}) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (newTab) return
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to)
  }
  return (
    <a
      href={to}
      onClick={onClick}
      className={className}
      title={title}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener' : undefined}
    >
      {children}
    </a>
  )
}
