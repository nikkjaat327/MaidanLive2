import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.tsx';
import { LanguageProvider } from './context/LanguageContext.tsx';
import { AdminThemeProvider } from './context/AdminThemeContext.tsx';
import { LiveMonitorProvider } from './context/LiveMonitorContext.tsx';
import { GlobalLiveMonitor } from './components/streaming/GlobalLiveMonitor.tsx';
import { offlineScoreService } from './services/scoreboard/offlineScoreService.ts';
import { useAuth } from './hooks/useAuth.ts';
import { CustomerLayout } from './components/layout/CustomerLayout.tsx';
import { AdminLayout, RequireAdminAuth } from './components/layout/AdminLayout.tsx';
import { BroadcasterLayout } from './components/layout/BroadcasterLayout.tsx';

// Customer Portal Pages
import { HomePage } from './pages/customer/HomePage.tsx';
import { LiveStreamsPage } from './pages/customer/LiveStreamsPage.tsx';
import { LiveMatchDetailPage } from './pages/customer/LiveMatchDetailPage.tsx';
import { TournamentsPage } from './pages/customer/TournamentsPage.tsx';
import { TournamentDetailPage } from './pages/customer/TournamentDetailPage.tsx';
import { TeamsPage } from './pages/customer/TeamsPage.tsx';
import { TeamDetailPage } from './pages/customer/TeamDetailPage.tsx';
import { PlayersPage } from './pages/customer/PlayersPage.tsx';
import { PlayerDetailPage } from './pages/customer/PlayerDetailPage.tsx';
import { LeaderboardsPage } from './pages/customer/LeaderboardsPage.tsx';
import { FollowingPage } from './pages/customer/FollowingPage.tsx';
import { NotificationsPage } from './pages/customer/NotificationsPage.tsx';
import { ReplaysPage } from './pages/customer/ReplaysPage.tsx';
import { SearchPage } from './pages/customer/SearchPage.tsx';
import { CalendarPage } from './pages/customer/CalendarPage.tsx';
import { ProfilePage } from './pages/customer/ProfilePage.tsx';
import { CustomerLoginPage } from './pages/customer/CustomerLoginPage.tsx';
import { CustomerRegisterPage } from './pages/customer/CustomerRegisterPage.tsx';

// Admin Portal Pages
import { AdminLoginPage } from './pages/admin/AdminLoginPage.tsx';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage.tsx';
import { AdminLiveStreamsPage } from './pages/admin/AdminLiveStreamsPage.tsx';
import { AdminMatchHealthPage } from './pages/admin/AdminMatchHealthPage.tsx';
import { AdminScoreboardPage } from './pages/admin/AdminScoreboardPage.tsx';
import { AdminTournamentsPage } from './pages/admin/AdminTournamentsPage.tsx';
import { AdminFixturesPage } from './pages/admin/AdminFixturesPage.tsx';
import { AdminTeamsPage } from './pages/admin/AdminTeamsPage.tsx';
import { AdminPlayersPage } from './pages/admin/AdminPlayersPage.tsx';
import { AdminRegistrationsPage } from './pages/admin/AdminRegistrationsPage.tsx';
import { AdminPaymentsPage } from './pages/admin/AdminPaymentsPage.tsx';
import { AdminNotificationsPage } from './pages/admin/AdminNotificationsPage.tsx';
import { AdminHighlightsPage } from './pages/admin/AdminHighlightsPage.tsx';
import { AdminVenuesPage } from './pages/admin/AdminVenuesPage.tsx';
import { AdminSponsorsPage } from './pages/admin/AdminSponsorsPage.tsx';
import { AdminModerationPage } from './pages/admin/AdminModerationPage.tsx';
import { AdminReportsPage } from './pages/admin/AdminReportsPage.tsx';
import { AdminAnalyticsPage } from './pages/admin/AdminAnalyticsPage.tsx';
import { AdminOrganizerMonetizationPage } from './pages/admin/AdminOrganizerMonetizationPage.tsx';
import { AdminAuditLogsPage } from './pages/admin/AdminAuditLogsPage.tsx';
import { AdminUsersPage } from './pages/admin/AdminUsersPage.tsx';
import { AdminPermissionsPage } from './pages/admin/AdminPermissionsPage.tsx';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage.tsx';

// Dedicated Broadcast Studio, Broadcaster Portal & OBS Browser Source Pages
import { BroadcastOverlayConfigPage } from './pages/broadcast/BroadcastOverlayConfigPage.tsx';
import { ObsOverlayViewerPage } from './pages/broadcast/ObsOverlayViewerPage.tsx';
import { AdminObsBroadcastStudioPage } from './pages/admin/AdminObsBroadcastStudioPage.tsx';
import { AdminBroadcastersPage } from './pages/admin/AdminBroadcastersPage.tsx';
import { BroadcasterDashboardPage } from './pages/broadcaster/BroadcasterDashboardPage.tsx';
import { BroadcasterStudioPage } from './pages/broadcaster/BroadcasterStudioPage.tsx';
import { CameraCompanionPage } from './pages/broadcast/CameraCompanionPage.tsx';

function BroadcasterIndexRoute() {
  const { adminUser } = useAuth();
  if (adminUser?.role === 'BROADCASTER') {
    return <BroadcasterStudioPage />;
  }
  return <Navigate to="/broadcaster/dashboard" replace />;
}

function RequireNonBroadcasterOverlayAccess() {
  const { adminUser } = useAuth();
  if (adminUser?.role === 'BROADCASTER') {
    return <Navigate to="/broadcaster" replace />;
  }
  return <BroadcastOverlayConfigPage />;
}

export default function App() {
  useEffect(() => {
    offlineScoreService.ensureLifecycleListeners();
  }, []);

  return (
    <LanguageProvider>
      <AdminThemeProvider>
        <AuthProvider>
          <LiveMonitorProvider>
            <BrowserRouter>
              <Routes>
              {/* Isolated Public OBS Studio Browser Source Route (zero chrome, genuine transparency) */}
              <Route path="/broadcast/overlay/view/:matchId" element={<ObsOverlayViewerPage />} />

              {/* Standalone Mobile Camera Companion Route (Scoped Camera Push Token Auth) */}
              <Route path="/camera-connect/:cameraDocId" element={<CameraCompanionPage />} />

              {/* Dedicated OBS Broadcast Overlay Configuration Studio (Auth Protected) */}
              <Route path="/broadcast/overlay" element={<RequireAdminAuth />}>
                <Route index element={<Navigate to="/admin/live-streams" replace />} />
                <Route path=":matchId" element={<RequireNonBroadcasterOverlayAccess />} />
              </Route>

              {/* Broadcaster Portal Routes */}
              <Route path="/broadcaster" element={<RequireAdminAuth />}>
                <Route element={<BroadcasterLayout />}>
                  <Route index element={<BroadcasterIndexRoute />} />
                  <Route path="dashboard" element={<BroadcasterDashboardPage />} />
                  <Route path="control-room" element={<AdminObsBroadcastStudioPage />} />
                  <Route path="control-room/:matchId" element={<AdminObsBroadcastStudioPage />} />
                  <Route path=":matchId" element={<BroadcasterStudioPage />} />
                </Route>
              </Route>

              {/* Admin Portal Routes (Completely separate layout & auth) */}
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/admin" element={<RequireAdminAuth />}>
                <Route element={<AdminLayout />}>
                  <Route index element={<Navigate to="/admin/dashboard" replace />} />
                  <Route path="dashboard" element={<AdminDashboardPage />} />
                  <Route path="live-streams" element={<AdminLiveStreamsPage />} />
                  <Route path="broadcasters" element={<AdminBroadcastersPage />} />
                  <Route path="broadcast-studio" element={<AdminObsBroadcastStudioPage />} />
                  <Route path="broadcast-studio/:matchId" element={<AdminObsBroadcastStudioPage />} />
                  <Route path="match-health" element={<AdminMatchHealthPage />} />
                  <Route path="scoreboard" element={<AdminScoreboardPage />} />
                  <Route path="scoreboard/:id" element={<AdminScoreboardPage />} />
                  <Route path="tournaments" element={<AdminTournamentsPage />} />
                  <Route path="tournaments/:id/fixtures" element={<AdminFixturesPage />} />
                  <Route path="fixtures" element={<AdminFixturesPage />} />
                  <Route path="teams" element={<AdminTeamsPage />} />
                  <Route path="players" element={<AdminPlayersPage />} />
                  <Route path="registrations" element={<AdminRegistrationsPage />} />
                  <Route path="payments" element={<AdminPaymentsPage />} />
                  <Route path="notifications" element={<AdminNotificationsPage />} />
                  <Route path="highlights" element={<AdminHighlightsPage />} />
                  <Route path="venues" element={<AdminVenuesPage />} />
                  <Route path="sponsors" element={<AdminSponsorsPage />} />
                  <Route path="moderation" element={<AdminModerationPage />} />
                  <Route path="reports" element={<AdminReportsPage />} />
                  <Route path="analytics" element={<AdminAnalyticsPage />} />
                  <Route path="organizer" element={<AdminOrganizerMonetizationPage />} />
                  <Route path="audit-logs" element={<AdminAuditLogsPage />} />
                  <Route path="users" element={<AdminUsersPage />} />
                  <Route path="permissions" element={<AdminPermissionsPage />} />
                  <Route path="settings" element={<AdminSettingsPage />} />
                </Route>
              </Route>

              {/* Customer Portal Routes */}
              <Route element={<CustomerLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/live" element={<LiveStreamsPage />} />
                <Route path="/live/:id" element={<LiveMatchDetailPage />} />
                <Route path="/tournaments" element={<TournamentsPage />} />
                <Route path="/tournaments/:id" element={<TournamentDetailPage />} />
                <Route path="/teams" element={<TeamsPage />} />
                <Route path="/teams/:id" element={<TeamDetailPage />} />
                <Route path="/players" element={<PlayersPage />} />
                <Route path="/players/:id" element={<PlayerDetailPage />} />
                <Route path="/leaderboards" element={<LeaderboardsPage />} />
                <Route path="/following" element={<FollowingPage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/replays" element={<ReplaysPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/login" element={<CustomerLoginPage />} />
                <Route path="/register" element={<CustomerRegisterPage />} />
              </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <GlobalLiveMonitor />
            </BrowserRouter>
          </LiveMonitorProvider>
        </AuthProvider>
      </AdminThemeProvider>
    </LanguageProvider>
  );
}
