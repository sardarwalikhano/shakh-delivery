import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
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
import { PaymentsPage } from '@/features/dashboard/PaymentsPage';
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
import { NotificationsPage } from '@/features/notifications/pages/NotificationsPage';
import { RoleRequestsPage } from '@/features/role-requests/pages/RoleRequestsPage';
import { PostsPage } from '@/features/posts/pages/PostsPage';
import { CreatePostPage } from '@/features/posts/pages/CreatePostPage';
import { PostDetailPage } from '@/features/posts/pages/PostDetailPage';
import { MyPostsPage } from '@/features/posts/pages/MyPostsPage';
import { ApparelPostOrdersPage } from '@/features/posts/pages/ApparelPostOrdersPage';
import { FoodPostCheckoutPage } from '@/features/posts/pages/FoodPostCheckoutPage';
import { AdvancePaymentPage } from '@/features/posts/pages/AdvancePaymentPage';
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
        <Route path="/orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
        <Route path="/orders/:id" element={<RequireAuth><OrderDetailPage /></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
        <Route path="/posts" element={<RequireAuth><RequirePermission permission="posts.view"><PostsPage /></RequirePermission></RequireAuth>} />
        <Route path="/posts/:id" element={<RequireAuth><RequirePermission permission="posts.view"><PostDetailPage /></RequirePermission></RequireAuth>} />
        <Route path="/post-orders" element={<RequireAuth><RequirePermission permission="posts.view"><ApparelPostOrdersPage /></RequirePermission></RequireAuth>} />
        <Route path="/dashboard/posts/manage" element={<RequireAuth><RequirePermission permission="posts.update_own"><MyPostsPage /></RequirePermission></RequireAuth>} />
        <Route path="/dashboard/posts/new" element={<RequireAuth><RequirePermission permission="posts.create"><CreatePostPage /></RequirePermission></RequireAuth>} />
        <Route path="/checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
        <Route path="/food-post-checkout" element={<RequireAuth><FoodPostCheckoutPage /></RequireAuth>} />
        <Route path="/advance-payment/:postId" element={<RequireAuth><AdvancePaymentPage /></RequireAuth>} />
        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="/dashboard" element={<RequireAuth><RequirePermission permission="dashboard.view"><DashboardPage /></RequirePermission></RequireAuth>} />
        <Route path="/dashboard/store" element={<RequireAuth><RequirePermission permission="vendors.view"><VendorStorePage /></RequirePermission></RequireAuth>} />
        <Route path="/dashboard/products" element={<RequireAuth><RequirePermission permission="products.manage"><VendorProductsPage /></RequirePermission></RequireAuth>} />
        <Route path="/dashboard/orders" element={<RequireAuth><RequirePermission permission="orders.view"><VendorOrdersPage /></RequirePermission></RequireAuth>} />
        <Route path="/dashboard/deliveries" element={<RequireAuth><RequirePermission permission="deliveries.view"><DeliveryPage /></RequirePermission></RequireAuth>} />
        <Route path="/dashboard/payments" element={<RequireAuth><RequirePermission permission="payments.view"><PaymentsPage /></RequirePermission></RequireAuth>} />
        <Route path="/dashboard/notifications" element={<RequireAuth><RequirePermission permission="notifications.view_own"><NotificationsPage /></RequirePermission></RequireAuth>} />
        <Route path="/dashboard/role-requests" element={<RequireAuth><RequirePermission permission="role_requests.review"><RoleRequestsPage /></RequirePermission></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
        <Route path="/dashboard/*" element={<RequireAuth><RequirePermission permission="dashboard.view"><DashboardPage /></RequirePermission></RequireAuth>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}

