import { useEffect } from "react"
import { Link, Navigate, Route, Routes } from "react-router-dom"
import { fetchSiteName, useSiteName } from "@/lib/site-config"
import { SiteLayout } from "@/components/site/SiteLayout"
import { PublicLayout } from "@/components/site/PublicLayout"
import Portal from "@/pages/Portal"
import Home from "@/pages/Home"
import Genealogy from "@/pages/Genealogy"
import PrintPage from "@/pages/PrintPage"
import Literature from "@/pages/Literature"
import Feedback from "@/pages/Feedback"
import Privacy from "@/pages/Privacy"
import Terms from "@/pages/Terms"
import About from "@/pages/About"
import AdminLayout from "@/admin/AdminLayout"
import Login from "@/admin/Login"
import ChangePassword from "@/admin/ChangePassword"
import Dashboard from "@/admin/Dashboard"
import FamilyList from "@/admin/FamilyList"
import FamilyForm from "@/admin/FamilyForm"
import MemberList from "@/admin/MemberList"
import MemberForm from "@/admin/MemberForm"
import Account from "@/admin/Account"
import SiteSettings from "@/admin/SiteSettings"
import MfaSetup from "@/admin/MfaSetup"
import SubmissionList from "@/admin/SubmissionList"
import AdminList from "@/admin/AdminList"
import AuditLog from "@/admin/AuditLog"
import Domains from "@/admin/Domains"
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
      <FamilyProvider>
        <ThemeModeProvider>
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

          {/* 谱页：独立纸面视图，只包 TenantProvider，不套 SiteLayout（无站点导航与水印） */}
          <Route
            path="/t/:slug/print"
            element={
              <TenantProvider>
                <PrintPage />
              </TenantProvider>
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
        </ThemeModeProvider>
      </FamilyProvider>
    </AuthProvider>
  )
}
