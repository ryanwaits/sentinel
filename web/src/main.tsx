import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom"
import "./index.css"
import { AppShell } from "@/components/app-shell"
import AlertsPage from "@/routes/alerts"

function Placeholder({ name }: { name: string }) {
  return (
    <div className="mx-auto max-w-[960px] px-6 pt-7">
      <h1 className="text-2xl font-semibold">{name}</h1>
      <p className="mt-2 text-[13.5px] text-muted-foreground">Ported soon.</p>
    </div>
  )
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/alerts" replace /> },
      { path: "alerts", element: <AlertsPage /> },
      { path: "contracts", element: <Placeholder name="Contracts" /> },
      { path: "monitoring-plan", element: <Placeholder name="Monitoring Plan" /> },
      { path: "audits", element: <Placeholder name="Audits" /> },
      { path: "settings", element: <Placeholder name="Settings" /> },
    ],
  },
])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
