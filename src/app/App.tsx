import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { HomePage } from '@/routes/HomePage';
import { NotFoundPage } from '@/routes/NotFoundPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage';
import { VerifyEmailPage } from '@/features/auth/pages/VerifyEmailPage';
import { AccountPage } from '@/features/auth/pages/AccountPage';
import { RequireAuth } from '@/routes/RequireAuth';
import { RequirePermission } from '@/routes/RequirePermission';
import { ForbiddenPage } from '@/routes/ForbiddenPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { MarketplacePage } from '@/features/marketplace/pages/MarketplacePage';
import { ProductDetailPage } from '@/features/marketplace/pages/ProductDetailPage';
import { WishlistPage } from '@/features/marketplace/pages/WishlistPage';
import { CartPage } from '@/features/marketplace/pages/CartPage';
import { VendorStorePage } from '@/features/vendor/pages/VendorStorePage';
import { VendorProductsPage } from '@/features/vendor/pages/VendorProductsPage';
import { DeliveryPage } from '@/features/delivery/pages/DeliveryPage';
import { CheckoutPage } from '@/features/checkout/CheckoutPage';
import { OrdersPage } from '@/features/orders/OrdersPage';
import { OrderDetailPage } from '@/features/orders/OrderDetailPage';
import { NotificationsPage } from '@/features/notifications/pages/NotificationsPage';
import { RoleRequestsPage } from '@/features/role-requests/pages/RoleRequestsPage';

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/search" element={<MarketplacePage />} />
        <Route path="/cart" element={<RequireAuth><CartPage /></RequireAuth>} />
        <Route path="/wishlist" element={<RequireAuth><WishlistPage /></RequireAuth>} />
        <Route path="/product/:slug" element={<ProductDetailPage />} />
        <Route path="/orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
        <Route path="/orders/:id" element={<RequireAuth><OrderDetailPage /></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
        <Route path="/checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="/dashboard" element={<RequireAuth><RequirePermission permission="dashboard.view"><DashboardPage /></RequirePermission></RequireAuth>} />
        <Route path="/dashboard/store" element={<RequireAuth><RequirePermission permission="vendors.view"><VendorStorePage /></RequirePermission></RequireAuth>} />
        <Route path="/dashboard/products" element={<RequireAuth><RequirePermission permission="products.manage"><VendorProductsPage /></RequirePermission></RequireAuth>} />
        <Route path="/dashboard/deliveries" element={<RequireAuth><RequirePermission permission="deliveries.view"><DeliveryPage /></RequirePermission></RequireAuth>} />
        <Route path="/dashboard/notifications" element={<RequireAuth><RequirePermission permission="notifications.view_own"><NotificationsPage /></RequirePermission></RequireAuth>} />
        <Route path="/dashboard/role-requests" element={<RequireAuth><RequirePermission permission="role_requests.review"><RoleRequestsPage /></RequirePermission></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
        <Route path="/dashboard/*" element={<RequireAuth><RequirePermission permission="dashboard.view"><DashboardPage /></RequirePermission></RequireAuth>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
