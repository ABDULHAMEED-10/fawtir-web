import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AddressContactPage } from './pages/AddressContactPage'
import { AboutBusinessPage } from './pages/AboutBusinessPage'
import { BusinessIdentityPage } from './pages/BusinessIdentityPage'
import { BusinessTypePage } from './pages/BusinessTypePage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { NewPasswordPage } from './pages/NewPasswordPage'
import { PlansPage } from './pages/PlansPage'
import { PaymentPage } from './pages/PaymentPage'
import { SignupPage } from './pages/SignupPage'
import { SubBusinessTypePage } from './pages/SubBusinessTypePage'
import { VerifyCodePage } from './pages/VerifyCodePage'

function App() {
  const { i18n } = useTranslation()
  const isRtl = i18n.language === 'ar' || i18n.language.startsWith('ar')

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-dvh font-sans text-text-primary">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/verify-code" element={<VerifyCodePage />} />
          <Route path="/new-password" element={<NewPasswordPage />} />
          <Route path="/about-business" element={<AboutBusinessPage />} />
          <Route path="/business-type" element={<BusinessTypePage />} />
          <Route path="/sub-business-type" element={<SubBusinessTypePage />} />
          <Route path="/business-identity" element={<BusinessIdentityPage />} />
          <Route path="/address-contact" element={<AddressContactPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App
