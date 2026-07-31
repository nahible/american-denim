import { useCallback, useRef, useState } from 'react'
import { AppProvider } from './context/AppProvider.jsx'
import { AuthProvider } from './context/AuthProvider.jsx'
import { CartProvider } from './context/CartProvider.jsx'
import { Footer, Navbar } from './components/index.js'
import {
  AboutPage,
  CartPage,
  CheckoutPage,
  ContactPage,
  HomePage,
  LoginPage,
  LookbookPage,
  NotFoundPage,
  OrdersPage,
  ProductDetailsPage,
  ProfilePage,
  ShopPage,
  SignupPage,
  StoryPage,
} from './pages/index.js'
import { useHashPage } from './hooks/useHashPage.js'
import { useOutsidePointerDown } from './hooks/useOutsidePointerDown.js'
import './App.css'

function App() {
  const menuRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const route = useHashPage()

  useOutsidePointerDown(menuRef, () => setMenuOpen(false))

  const navigate = useCallback((hash) => (event) => {
    event.preventDefault()
    setMenuOpen(false)
    window.location.hash = hash === '#' ? '' : hash
    window.scrollTo(0, 0)
  }, [])

  return (
    <AppProvider value={{ page: route.page, productId: route.productId, menuOpen }}>
      <AuthProvider>
        <CartProvider>
          <a
            className="skip-link"
            href="#main-content"
            onClick={(event) => {
              event.preventDefault()
              document.getElementById('main-content')?.focus()
            }}
          >
            Skip to content
          </a>
          <div className="page">
            <svg className="grain" width="0" height="0" aria-hidden="true" focusable="false">
              <filter id="noise">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
              </filter>
            </svg>
            <div className="grain grain--overlay" style={{ filter: 'url(#noise)' }} />

            <Navbar page={route.page} menuOpen={menuOpen} setMenuOpen={setMenuOpen} navigate={navigate} menuRef={menuRef} />

            <main id="main-content" tabIndex="-1">
              {route.page === 'home' && <HomePage />}
              {route.page === 'shop' && <ShopPage />}
              {route.page === 'story' && <StoryPage />}
              {route.page === 'about' && <AboutPage />}
              {route.page === 'lookbook' && <LookbookPage />}
              {route.page === 'contact' && <ContactPage />}
              {route.page === 'cart' && <CartPage />}
              {route.page === 'checkout' && <CheckoutPage />}
              {route.page === 'login' && <LoginPage />}
              {route.page === 'signup' && <SignupPage />}
              {route.page === 'profile' && <ProfilePage />}
              {route.page === 'orders' && <OrdersPage />}
              {route.page === 'product' && <ProductDetailsPage productId={route.productId} />}
              {route.page === '404' && <NotFoundPage />}
            </main>

            <Footer />
          </div>
        </CartProvider>
      </AuthProvider>
    </AppProvider>
  )
}

export default App
