import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router-dom"
import "./index.css"
import { AppShell } from "@/components/app-shell"
import { MarketingLayout } from "@/components/site-shell"
import HomePage from "@/routes/home"
import PricingPage from "@/routes/pricing"
import SignInPage from "@/routes/sign-in"
import OnboardingPage from "@/routes/onboarding"
import LogPage from "@/routes/log"
import MocksPage from "@/routes/mocks"
import AlertsPage from "@/routes/alerts"
import ContractsPage from "@/routes/contracts"
import MonitoringPlanPage from "@/routes/monitoring-plan"
import AuditDetailPage from "@/routes/audit-detail"
import SettingsPage from "@/routes/settings"

const router = createBrowserRouter([
  // Marketing pages — one shared header + footer, rendered once by the layout so no page can drift.
  {
    element: <MarketingLayout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/pricing", element: <PricingPage /> },
      { path: "/sign-in", element: <SignInPage /> },
      { path: "/onboarding", element: <OnboardingPage /> },
    ],
  },
  // Findings log manages its own header/footer directly (index vs. hard-nav detail both live in
  // one component keyed off runtime nav state, not just the URL — doesn't fit the static layout above).
  { path: "/log", element: <LogPage /> },
  { path: "/log/:id", element: <LogPage /> },
  { path: "/mocks", element: <MocksPage /> },
  // Authenticated app, wrapped in the sidebar + top-bar shell.
  {
    element: <AppShell />,
    children: [
      { path: "/alerts", element: <AlertsPage /> },
      { path: "/contracts", element: <ContractsPage /> },
      { path: "/monitoring-plan", element: <MonitoringPlanPage /> },
      { path: "/audits", element: <AuditDetailPage /> },
      { path: "/settings", element: <SettingsPage /> },
    ],
  },
])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
