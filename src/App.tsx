import { lazy, Suspense, useEffect } from "react"
import { Link, Navigate, Route, Routes } from "react-router-dom"
import { fetchSiteName, useSiteName } from "@/lib/site-config"
import { AnalyticsLoader } from "@/components/AnalyticsLoader"
import { ConsentBanner } from "@/components/ConsentBanner"
import { SiteLayout } from "@/components/site/SiteLayout"
import { PublicLayout } from "@/components/site/PublicLayout"
import Portal from "@/pages/Portal"
import AdminLayout from "@/admin/AdminLayout"

/**
 * 路由级按需加载：门户与两套布局保持同步加载（首屏与导航立即渲染），
 * 其余页面各自成为独立 chunk，进哪个页面才拉哪份代码。
 * 世系图、谱页、族人表单是主要受益者。
 */
const Home = lazy(() => import("@/pages/Home"))
const Genealogy = lazy(() => import("@/pages/Genealogy"))
const Literature = lazy(() => import("@/pages/Literature"))
const Feedback = lazy(() => import("@/pages/Feedback"))
const Privacy = lazy(() => import("@/pages/Privacy"))
const Terms = lazy(() => import("@/pages/Terms"))
const About = lazy(() => import("@/pages/About"))

const Login = lazy(() => import("@/admin/Login"))
const ChangePassword = lazy(() => import("@/admin/ChangePassword"))
const MfaSetup = lazy(() => import("@/admin/MfaSetup"))
const Dashboard = lazy(() => import("@/admin/Dashboard"))
const FamilyList = lazy(() => import("@/admin/FamilyList"))
const FamilyForm = lazy(() => import("@/admin/FamilyForm"))
const MemberList = lazy(() => import("@/admin/MemberList"))
const MemberForm = lazy(() => import("@/admin/MemberForm"))
const Account = lazy(() => import("@/admin/Account"))
const SiteSettings = lazy(() => import("@/admin/SiteSettings"))
const SubmissionList = lazy(() => import("@/admin/SubmissionList"))
const AdminList = lazy(() => import("@/admin/AdminList"))
const AuditLog = lazy(() => import("@/admin/AuditLog"))
const Domains = lazy(() => import("@/admin/Domains"))

/** 路由切换时的占位：只占位不闪烁，骨架保持页面底色 */
function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-paper-50">
      <p className="text-[12px] tracking-[0.2em] text-muted-foreground">载入中</p>
    </div>
  )
}
import { AuthProvider } from "@/lib/admin-context"
import { FamilyProvider } from "@/lib/family-context"
import { TenantProvider } from "@/lib/tenant-context"
import { ThemeModeProvider } from "@/components/ThemeModeProvider"

function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-paper-50 px-6">
      <p className="font-song text-[54px] leading-none tracking-[0.2em] text-ink-300">四〇四</p>
      <p className="text-[12.5px] tracking-[0.16em] text-muted-foreground">
        此页不在谱中，请循径而归
      </p>
      <Link
        to="/"
        className="mt-2 border border-ink-800/20 px-5 py-2.5 text-[12px] tracking-[0.16em] text-ink-700 transition-colors hover:border-ink-700 hover:bg-paper-100"
      >
        返回网站首页
      </Link>
    </div>
  )
}

function SiteNameSync() {
  const siteName = useSiteName()
  useEffect(() => {
    document.title = siteName
  }, [siteName])
  useEffect(() => {
    void fetchSiteName()
  }, [])
  return null
}

export default function App() {
  return (
    <AuthProvider>
    <SiteNameSync />
    <AnalyticsLoader />
    <ConsentBanner />
      <FamilyProvider>
        <ThemeModeProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
          {/* 门户：公开族谱总目 */}
          <Route index element={<Portal />} />

          {/* 全局法律文档（不依赖特定族谱）；用 PublicLayout 保证页脚固定显示 */}
          <Route
            path="about"
            element={
              <PublicLayout>
                <About />
              </PublicLayout>
            }
          />
          <Route
            path="privacy"
            element={
              <PublicLayout>
                <Privacy />
              </PublicLayout>
            }
          />
          <Route
            path="terms"
            element={
              <PublicLayout>
                <Terms />
              </PublicLayout>
            }
          />

          {/* 首页直达的信息反馈：无族内上下文，需自选所属家族 */}
          <Route
            path="feedback"
            element={
              <PublicLayout>
                <Feedback />
              </PublicLayout>
            }
          />

          {/* 单部族谱：/t/:slug */}
          <Route
            path="/t/:slug"
            element={
              <TenantProvider>
                <SiteLayout />
              </TenantProvider>
            }
          >
            <Route index element={<Home />} />
            <Route path="genealogy" element={<Genealogy />} />
            <Route path="literature" element={<Literature />} />
            <Route path="feedback" element={<Feedback />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="terms" element={<Terms />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          <Route path="/admin/login" element={<Login />} />
          {/* 强制改密独立于后台布局，未改密时无法从导航绕过 */}
          <Route path="/admin/change-password" element={<ChangePassword />} />
          {/* 超管强制绑定验证器，独立于后台布局，否则无法完成绑定 */}
          <Route path="/admin/mfa-setup" element={<MfaSetup />} />

          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="families" element={<FamilyList />} />
            <Route path="families/new" element={<FamilyForm />} />
            <Route path="families/:id" element={<FamilyForm />} />
            <Route path="family" element={<Navigate to="/admin/families" replace />} />
            <Route path="members" element={<MemberList />} />
            <Route path="members/new" element={<MemberForm />} />
            <Route path="members/:id" element={<MemberForm />} />
            <Route path="submissions" element={<SubmissionList />} />
            <Route path="admins" element={<AdminList />} />
            <Route path="audit" element={<AuditLog />} />
            <Route path="domains" element={<Domains />} />
            <Route path="account" element={<Account />} />
            <Route path="site" element={<SiteSettings />} />
          </Route>

          <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ThemeModeProvider>
      </FamilyProvider>
    </AuthProvider>
  )
}
