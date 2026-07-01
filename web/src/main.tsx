import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom"
import "./index.css"
import { AppShell } from "@/components/app-shell"
import AlertsPage from "@/routes/alerts"
import ContractsPage from "@/routes/contracts"
import MonitoringPlanPage from "@/routes/monitoring-plan"
import AuditDetailPage from "@/routes/audit-detail"
import SettingsPage from "@/routes/settings"

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/alerts" replace /> },
      { path: "alerts", element: <AlertsPage /> },
      { path: "contracts", element: <ContractsPage /> },
      { path: "monitoring-plan", element: <MonitoringPlanPage /> },
      { path: "audits", element: <AuditDetailPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
