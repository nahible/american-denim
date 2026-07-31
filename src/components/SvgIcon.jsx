export function SvgIcon({ children, viewBox = '0 0 24 24', ...props }) {
  return (
    <svg viewBox={viewBox} fill="none" stroke="currentColor" aria-hidden="true" {...props}>
      {children}
    </svg>
  )
}
