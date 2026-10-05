import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { FeatureFlagsProvider } from './context/FeatureFlagsContext'
import { SubsidiaryProvider } from './context/SubsidiaryContext'
import ToastViewport from './components/common/Toast'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/Login'
import DashboardPage from './pages/Dashboard'
import CompliancePage from './pages/Compliance'
import EmployeesPage from './pages/Employees'
import EmployeeDetailsPage from './pages/EmployeeDetails'
import LeavesPage from './pages/Leaves'
import PassportsPage from './pages/Passports'
import VehiclesPage from './pages/Vehicles'
import FlightsPage from './pages/Flights'
import NotificationsPage from './pages/Notifications'
import SettingsPage from './pages/Settings'

// HRMS Phase 1 Pages
import WorkQueuePage from './pages/WorkQueue'
import KsaCompliancePage from './pages/KsaCompliance'
import UaeCompliancePage from './pages/UaeCompliance'
import RequestsHubPage from './pages/RequestsHub'
import AdvanceRequestsPage from './pages/AdvanceRequests'
import LetterRequestsPage from './pages/LetterRequests'
import DocumentsPage from './pages/Documents'
import PerformancePage from './pages/Performance'
import AuditTrailPage from './pages/AuditTrail'
import ReportsPage from './pages/Reports'
import AdministrationPage from './pages/Administration'

import { canAccessMenu } from './utils/permissions'

function ProtectedRoute({ children, menuKey }) {
  const { isAuthenticated, user } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (menuKey && !canAccessMenu(user?.role, menuKey)) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

function HomeRedirect() {
  const { isAuthenticated } = useAuth()
  return <Navigate to={isAuthenticated ? '/work-queue' : '/login'} replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />

        {/* HRMS Phase 1 Primary Operational Routes */}
        <Route
          path="/work-queue"
          element={
            <ProtectedRoute menuKey="workQueue">
              <WorkQueuePage />
            </ProtectedRoute>
          }
        />
        <Route path="/compliance" element={<CompliancePage />} />
        <Route
          path="/compliance/ksa"
          element={
            <ProtectedRoute menuKey="compliance">
              <KsaCompliancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/compliance/uae"
          element={
            <ProtectedRoute menuKey="compliance">
              <UaeCompliancePage />
            </ProtectedRoute>
          }
        />

        {/* Requests & Advances */}
        <Route
          path="/requests"
          element={
            <ProtectedRoute menuKey="requests">
              <RequestsHubPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/requests/advance"
          element={
            <ProtectedRoute menuKey="requests">
              <AdvanceRequestsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/requests/letters"
          element={
            <ProtectedRoute menuKey="requests">
              <LetterRequestsPage />
            </ProtectedRoute>
          }
        />

        {/* Document Center & Continuous Performance */}
        <Route
          path="/documents"
          element={
            <ProtectedRoute menuKey="documents">
              <DocumentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/performance"
          element={
            <ProtectedRoute menuKey="performance">
              <PerformancePage />
            </ProtectedRoute>
          }
        />

        {/* Reports, Audit & Administration */}
        <Route
          path="/reports"
          element={
            <ProtectedRoute menuKey="reports">
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit"
          element={
            <ProtectedRoute menuKey="audit">
              <AuditTrailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/administration"
          element={
            <ProtectedRoute menuKey="administration">
              <AdministrationPage />
            </ProtectedRoute>
          }
        />

        {/* Existing EICS Operational Routes Preserved */}
        <Route
          path="/employees"
          element={
            <ProtectedRoute menuKey="employees">
              <EmployeesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employees/:id"
          element={
            <ProtectedRoute menuKey="employees">
              <EmployeeDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/leaves" element={<LeavesPage />} />
        <Route path="/passports" element={<PassportsPage />} />
        <Route path="/vehicles" element={<VehiclesPage />} />
        <Route path="/flights" element={<FlightsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route
          path="/settings"
          element={
            <ProtectedRoute menuKey="settings">
              <SettingsPage />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  )
}

export default function App() {
  return (
    <FeatureFlagsProvider>
      <AuthProvider>
        <SubsidiaryProvider>
          <ToastProvider>
            <AppRoutes />
            <ToastViewport />
          </ToastProvider>
        </SubsidiaryProvider>
      </AuthProvider>
    </FeatureFlagsProvider>
  )
}
