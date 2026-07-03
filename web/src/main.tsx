import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router-dom"
import "./index.css"
import { AppShell } from "@/components/app-shell"
import HomePage from "@/routes/home"
import LandingPage from "@/routes/landing"
import PricingPage from "@/routes/pricing"
import SignInPage from "@/routes/sign-in"
import OnboardingPage from "@/routes/onboarding"
import MocksPage from "@/routes/mocks"
import AlertsPage from "@/routes/alerts"
import ContractsPage from "@/routes/contracts"
import MonitoringPlanPage from "@/routes/monitoring-plan"
import AuditDetailPage from "@/routes/audit-detail"
import SettingsPage from "@/routes/settings"

const router = createBrowserRouter([
  // Full-page (marketing + onboarding + auth), no app chrome.
  { path: "/", element: <HomePage /> },
  { path: "/landing", element: <LandingPage /> },
  { path: "/pricing", element: <PricingPage /> },
  { path: "/sign-in", element: <SignInPage /> },
  { path: "/onboarding", element: <OnboardingPage /> },
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
