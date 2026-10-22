import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AppShell } from '@/components/AppShell';
import { PwaManager } from '@/components/PwaManager';
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
import { DashboardLayout } from '@/features/dashboard/DashboardLayout';
import { MarketplacePage } from '@/features/marketplace/pages/MarketplacePage';
import { ProductDetailPage } from '@/features/marketplace/pages/ProductDetailPage';
import { WishlistPage } from '@/features/marketplace/pages/WishlistPage';
import { CartPage } from '@/features/marketplace/pages/CartPage';
import { VendorStorePage } from '@/features/vendor/pages/VendorStorePage';
import { VendorProductsPage } from '@/features/vendor/pages/VendorProductsPage';
import { DeliveryPage } from '@/features/delivery/pages/DeliveryPage';
import { CheckoutPage } from '@/features/checkout/CheckoutPage';
import { OrdersPage } from '@/features/orders/OrdersPage';
import { VendorOrdersPage } from '@/features/orders/VendorOrdersPage';
import { OrderDetailPage } from '@/features/orders/OrderDetailPage';
import { OrderReceiptsPage } from '@/features/orders/OrderReceiptsPage';
import { NotificationsPage } from '@/features/notifications/pages/NotificationsPage';
import { RoleRequestsPage } from '@/features/role-requests/pages/RoleRequestsPage';
import { PostsPage } from '@/features/posts/pages/PostsPage';
import { CreatePostPage } from '@/features/posts/pages/CreatePostPage';
import { PostDetailPage } from '@/features/posts/pages/PostDetailPage';
import { MyPostsPage } from '@/features/posts/pages/MyPostsPage';
import { ApparelPostOrdersPage } from '@/features/posts/pages/ApparelPostOrdersPage';
import { FoodPostCheckoutPage } from '@/features/posts/pages/FoodPostCheckoutPage';
import { ReferralWalletPage } from '@/features/posts/pages/ReferralWalletPage';
import { PrepaidWalletPage } from '@/features/posts/pages/PrepaidWalletPage';
import { SuperAdminWalletCreditPage } from '@/features/posts/pages/SuperAdminWalletCreditPage';
import { useAuth } from '@/lib/auth/AuthContext';

export function App() {
  const { isPasswordRecovery } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (isPasswordRecovery && location.pathname !== '/reset-password') {
      navigate('/reset-password', { replace: true });
    }
  }, [isPasswordRecovery, location.pathname, navigate]);

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
        <Route path="/checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
        <Route path="/food-post-checkout" element={<RequireAuth><FoodPostCheckoutPage /></RequireAuth>} />
        <Route path="/orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
        <Route path="/orders/:id" element={<RequireAuth><OrderDetailPage /></RequireAuth>} />
        <Route path="/receipts" element={<RequireAuth><OrderReceiptsPage /></RequireAuth>} />
        <Route path="/receipts/:id" element={<RequireAuth><OrderReceiptsPage /></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
        <Route path="/403" element={<ForbiddenPage />} />

        <Route element={<RequireAuth><DashboardLayout /></RequireAuth>}>
          <Route path="/dashboard" element={<RequirePermission permission="dashboard.view"><DashboardPage /></RequirePermission>} />
          <Route path="/dashboard/store" element={<RequirePermission permission="vendors.view"><VendorStorePage /></RequirePermission>} />
          <Route path="/dashboard/products" element={<RequirePermission permission="products.manage"><VendorProductsPage /></RequirePermission>} />
          <Route path="/dashboard/orders" element={<RequirePermission permission="orders.view"><VendorOrdersPage /></RequirePermission>} />
          <Route path="/dashboard/deliveries" element={<RequirePermission permission="deliveries.view"><DeliveryPage /></RequirePermission>} />
          <Route path="/dashboard/notifications" element={<RequirePermission permission="notifications.view_own"><NotificationsPage /></RequirePermission>} />
          <Route path="/dashboard/role-requests" element={<RequirePermission permission="role_requests.review"><RoleRequestsPage /></RequirePermission>} />
          <Route path="/dashboard/posts/manage" element={<RequirePermission permission="posts.update_own"><MyPostsPage /></RequirePermission>} />
          <Route path="/dashboard/referral-wallet" element={<RequirePermission permission="posts.view"><ReferralWalletPage /></RequirePermission>} />
          <Route path="/dashboard/wallet" element={<RequirePermission permission="wallets.view_own"><PrepaidWalletPage /></RequirePermission>} />
          <Route path="/dashboard/wallet/admin-credit" element={<RequirePermission permission="wallets.manage"><SuperAdminWalletCreditPage /></RequirePermission>} />
          <Route path="/dashboard/posts/new" element={<RequirePermission permission="posts.create"><CreatePostPage /></RequirePermission>} />
          <Route path="/posts" element={<RequirePermission permission="posts.view"><PostsPage /></RequirePermission>} />
          <Route path="/posts/:id" element={<RequirePermission permission="posts.view"><PostDetailPage /></RequirePermission>} />
          <Route path="/post-orders" element={<RequirePermission permission="posts.view"><ApparelPostOrdersPage /></RequirePermission>} />
          <Route path="/dashboard/*" element={<RequirePermission permission="dashboard.view"><DashboardPage /></RequirePermission>} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <PwaManager />
    </AppShell>
  );
}
