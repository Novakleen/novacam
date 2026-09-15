import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { AuthProvider, useAuth } from '@/contexts/SupabaseAuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { UploadProvider } from '@/contexts/UploadContext';
import { InvitationProvider } from '@/contexts/InvitationContext';
import { Toaster } from '@/components/ui/toaster';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import LoginPage from '@/pages/LoginPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import DashboardPage from '@/pages/DashboardPage';
import PhotosPage from '@/pages/PhotosPage';
import ProjectDetailPage from '@/pages/ProjectDetailPage';
import ProfilePage from '@/pages/ProfilePage';
import PortfolioPage from '@/pages/PortfolioPage';
import MapPage from '@/pages/MapPage';
import UsersPage from '@/pages/UsersPage';
import SharedGalleryPage from '@/pages/SharedGalleryPage';
import UserManagementPage from '@/pages/UserManagementPage';
import InvitationAcceptancePage from '@/pages/InvitationAcceptancePage';
import LargeFileUploadPage from '@/pages/LargeFileUploadPage';
import HubSpotContactsPage from '@/pages/HubSpotContactsPage';
import HubSpotTestSync from '@/components/hubspot/HubSpotTestSync';
import HubSpotDebugPage from '@/pages/HubSpotDebugPage';
import HubSpotDashboardPage from '@/pages/HubSpotDashboardPage';
import CompanyCamExplorer from '@/pages/CompanyCamExplorer';
import Direct7DebugPage from '@/pages/Direct7DebugPage';
import UploadManager from '@/components/uploads/UploadManager';
import BugHunterPage from '@/pages/BugHunterPage';
import TimeTrackerPage from '@/pages/TimeTrackerPage';
import SprayTrackerPage from '@/pages/SprayTrackerPage';
import CompanyCamProjectDetailPage from '@/pages/CompanyCamProjectDetailPage';

const PrivateRoute = ({ children }) => {
  const { user, loading, connectionError } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
        <div className="text-red-500 mb-4 text-xl">Connection Error</div>
        <p className="mb-4">Unable to verify authentication status.</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }
  
  return user ? children : <Navigate to="/login" />;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  return user ? <Navigate to="/dashboard" /> : children;
};

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Router>
      <Helmet>
        <title>Novakleen - Project Management</title>
        <meta name="description" content="Professional cleaning service project management system for Novakleen" />
      </Helmet>
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/signup" element={<Navigate to="/login" />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          
          <Route path="/invitations/:token" element={<InvitationAcceptancePage />} />
          
          <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
          <Route path="/photos" element={<PrivateRoute><PhotosPage /></PrivateRoute>} />
          <Route path="/map" element={<PrivateRoute><MapPage /></PrivateRoute>} />
          <Route path="/users" element={<PrivateRoute><UsersPage /></PrivateRoute>} />
          <Route path="/admin/users" element={<PrivateRoute><UserManagementPage /></PrivateRoute>} />
          <Route path="/project/:id" element={<PrivateRoute><ProjectDetailPage /></PrivateRoute>} />
          <Route path="/project-cc/:ccId" element={<PrivateRoute><CompanyCamProjectDetailPage /></PrivateRoute>} />
          <Route path="/portfolio" element={<PrivateRoute><PortfolioPage /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
          
          <Route path="/upload-large" element={<PrivateRoute><LargeFileUploadPage /></PrivateRoute>} />

          <Route path="/crm-hubspot" element={<PrivateRoute><HubSpotContactsPage /></PrivateRoute>} />
          <Route path="/hubspot-test" element={<PrivateRoute><HubSpotTestSync /></PrivateRoute>} />
          <Route path="/hubspot-debug" element={<PrivateRoute><HubSpotDebugPage /></PrivateRoute>} />
          <Route path="/hubspot-dashboard" element={<PrivateRoute><HubSpotDashboardPage /></PrivateRoute>} />
          
          {/* Note: The CompanyCam Explorer has been refactored into a full Project Manager */}
          <Route path="/companycam-explorer" element={<PrivateRoute><CompanyCamExplorer /></PrivateRoute>} />
          
          <Route path="/direct7-debug" element={<PrivateRoute><Direct7DebugPage /></PrivateRoute>} />

          <Route path="/bug-hunter" element={<PrivateRoute><BugHunterPage /></PrivateRoute>} />

          <Route path="/time-tracker" element={<PrivateRoute><TimeTrackerPage /></PrivateRoute>} />
          <Route path="/spray-tracker" element={<PrivateRoute><SprayTrackerPage /></PrivateRoute>} />
          
          <Route path="/share/:shareId" element={<SharedGalleryPage />} />
          
          <Route path="/" element={<Navigate to="/dashboard" />} />
        </Routes>
      </ErrorBoundary>
      <Toaster />
      {user && <UploadManager />}
    </Router>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AuthProvider>
          <InvitationProvider>
            <UploadProvider>
              <AppRoutes />
            </UploadProvider>
          </InvitationProvider>
        </AuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;