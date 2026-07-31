import { navLinks, navMenuItems } from '../constants/index.js'
import { BrandMark } from './BrandMark.jsx'
import { SvgIcon } from './SvgIcon.jsx'

export function Navbar({ page, menuOpen, setMenuOpen, navigate, menuRef }) {
  const activePage = page === 'home' ? 'home' : page
  const focusCatalogSearch = (event) => {
    navigate('#shop')(event)
    window.setTimeout(() => document.getElementById('catalog-search')?.focus(), 0)
  }

  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav__links">
        {navLinks.map((link) => (
          <a
            key={link.label}
            href={link.hash}
            onClick={navigate(link.hash)}
            aria-current={activePage === link.hash.slice(1) ? 'page' : undefined}
          >
            {link.label}
          </a>
        ))}
      </div>

      <a className="nav__logo" href="#" onClick={navigate('#')} aria-label="americandrm home">
        <BrandMark className="nav__logo-mark" />
      </a>

      <div className="nav__actions">
        <div className="nav__icons" aria-label="Utility actions">
          <button type="button" aria-label="Search products" onClick={focusCatalogSearch}>
            <SvgIcon>
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.6" y2="16.6" />
            </SvgIcon>
          </button>
          <a className="nav__cart" href="#cart" onClick={navigate('#cart')} aria-label="Cart">
            <SvgIcon>
              <path d="M6 8h12l-1 13H7L6 8z" />
              <path d="M9 8V6a3 3 0 0 1 6 0v2" />
            </SvgIcon>
          </a>
        </div>

        <div
          className="nav__menu"
          ref={menuRef}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setMenuOpen(false)
              event.currentTarget.querySelector('.nav__menu-button')?.focus()
            }
          }}
        >
          <button
            type="button"
            className={`nav__menu-button${menuOpen ? ' nav__menu-button--open' : ''}`}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="nav-options-menu"
            onClick={() => setMenuOpen((current) => !current)}
          >
            <SvgIcon>
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </SvgIcon>
          </button>

          {menuOpen && (
            <div className="nav__menu-panel" id="nav-options-menu" aria-label="Options menu">
              {navMenuItems.map((item) => (
                <a
                  key={item.label}
                  href={item.hash}
                  onClick={navigate(item.hash)}
                  aria-current={activePage === item.hash.slice(1) ? 'page' : undefined}
                >
                  <span>{item.label}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
