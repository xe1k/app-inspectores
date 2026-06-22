import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/components/Toast';
import AppLayout from '@/components/AppLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import RoleProtectedRoute from '@/components/RoleProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import FleetPage from '@/pages/FleetPage';
import TeamDetailPage from '@/pages/TeamDetailPage';
import DashboardPage from '@/pages/DashboardPage';
import CreateInspectionPage from '@/pages/CreateInspectionPage';
import InspectionDetailPage from '@/pages/InspectionDetailPage';
import FindingPage from '@/pages/FindingPage';
import NuevoHallazgoWizard from '@/components/hallazgo-wizard/NuevoHallazgoWizard';
import GuidedReviewPage from '@/pages/GuidedReviewPage';
import TemplatesPage from '@/pages/TemplatesPage';
import TemplateEditorPage from '@/pages/TemplateEditorPage';
import PerfilPage from '@/pages/PerfilPage';
import AdminPage from '@/pages/AdminPage';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<FleetPage />} />
              <Route path="/equipos/:equipoNorm" element={<TeamDetailPage />} />
              <Route path="/inspecciones/nueva" element={<CreateInspectionPage />} />
              <Route path="/inspecciones/:id" element={<InspectionDetailPage />} />
              <Route path="/inspecciones/:id/revision" element={<GuidedReviewPage />} />
              <Route path="/inspecciones/:inspeccionId/hallazgos/nuevo" element={<NuevoHallazgoWizard />} />
              <Route path="/inspecciones/:inspeccionId/hallazgos/:hallazgoId" element={<FindingPage />} />
              <Route path="/plantillas" element={<TemplatesPage />} />
              <Route path="/plantillas/nueva" element={<TemplateEditorPage />} />
              <Route path="/plantillas/:id" element={<TemplateEditorPage />} />
              <Route path="/perfil" element={<PerfilPage />} />
              <Route element={<RoleProtectedRoute roles={['gerencial', 'admin']} />}>
                <Route path="/dashboard" element={<DashboardPage />} />
              </Route>
              <Route element={<RoleProtectedRoute roles={['admin']} />}>
                <Route path="/admin" element={<AdminPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </ToastProvider>
  );
}
