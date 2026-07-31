export function Button({ as: Component = 'button', variant = 'plate', className = '', children, ...props }) {
  const classes = [variant === 'checkout' ? 'checkout__button' : 'btn-plate', className]
    .filter(Boolean)
    .join(' ')

  return (
    <Component className={classes} {...props}>
      {variant === 'plate' && <span className="rivet" aria-hidden="true" />}
      {children}
      {variant === 'plate' && <span className="rivet" aria-hidden="true" />}
    </Component>
  )
}
