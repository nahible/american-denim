import { footerColumns } from '../constants/index.js'
import { BrandMark } from './BrandMark.jsx'

export function Footer() {
  return (
    <footer>
      <div className="footer__flag" aria-hidden="true" />
      <div className="footer__top">
        <div className="footer__brand">
          <BrandMark />
          <p>elevated everyday basic essentials, made for the field, the dock, and everywhere between.</p>
        </div>

        {footerColumns.map((column) => (
          <div key={column.title} className="footer__col">
            <h4>{column.title}</h4>
            {column.links.map((link) => (
              <a key={link.label} href={link.href || link.hash}>
                {link.label}
              </a>
            ))}
          </div>
        ))}
      </div>

      <div className="footer__bottom">
        <span>(c) 2026 americandrm</span>
        <span>WYO 549725 - EST. JULY</span>
      </div>
    </footer>
  )
}
