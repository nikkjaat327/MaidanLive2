import { Suspense, lazy, useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

import { AuthProvider } from "./context/AuthContext.tsx";
import { LanguageProvider } from "./context/LanguageContext.tsx";
import { AdminThemeProvider } from "./context/AdminThemeContext.tsx";
import { LiveMonitorProvider } from "./context/LiveMonitorContext.tsx";
import { BroadcastPreviewProvider } from "./context/BroadcastPreviewContext.tsx";

import { RouteErrorBoundary } from "./components/common/RouteErrorBoundary.tsx";
import { GlobalLiveMonitor } from "./components/streaming/GlobalLiveMonitor.tsx";
import { FloatingYouTubePreviewWindow } from "./components/streaming/FloatingYouTubePreviewWindow.tsx";
import { FloatingScoreboardLogoPreview } from "./components/broadcast/FloatingScoreboardLogoPreview.tsx";

import { offlineScoreService } from "./services/scoreboard/offlineScoreService.ts";
import { useAuth } from "./hooks/useAuth.ts";

import { CustomerLayout } from "./components/layout/CustomerLayout.tsx";
import {
  AdminLayout,
  RequireAdminAuth,
} from "./components/layout/AdminLayout.tsx";
import { BroadcasterLayout } from "./components/layout/BroadcasterLayout.tsx";

// Keep primary Customer landing eager for instant initial paint; lazy-load secondary & heavy studio portals
import { HomePage } from "./pages/customer/HomePage.tsx";

function lazyNamed<T extends Record<string, any>>(
  loader: () => Promise<T>,
  exportName: keyof T
) {
  return lazy(async () => {
    const mod = await loader();
    return { default: mod[exportName] };
  });
}

function RouteLoadingFallback() {
  return (
    <div className="min-h-[45vh] flex items-center justify-center p-8">
      <div className="h-7 w-7 rounded-full border-2 border-slate-300 border-t-[#EA580C] animate-spin" />
    </div>
  );
}

// Secondary Customer Portal Pages (code-split)
const LiveStreamsPage = lazyNamed(() => import("./pages/customer/LiveStreamsPage.tsx"), "LiveStreamsPage");
const LiveMatchDetailPage = lazyNamed(() => import("./pages/customer/LiveMatchDetailPage.tsx"), "LiveMatchDetailPage");
const TournamentsPage = lazyNamed(() => import("./pages/customer/TournamentsPage.tsx"), "TournamentsPage");
const TournamentDetailPage = lazyNamed(() => import("./pages/customer/TournamentDetailPage.tsx"), "TournamentDetailPage");
const TeamsPage = lazyNamed(() => import("./pages/customer/TeamsPage.tsx"), "TeamsPage");
const TeamDetailPage = lazyNamed(() => import("./pages/customer/TeamDetailPage.tsx"), "TeamDetailPage");
const PlayersPage = lazyNamed(() => import("./pages/customer/PlayersPage.tsx"), "PlayersPage");
const PlayerDetailPage = lazyNamed(() => import("./pages/customer/PlayerDetailPage.tsx"), "PlayerDetailPage");
const LeaderboardsPage = lazyNamed(() => import("./pages/customer/LeaderboardsPage.tsx"), "LeaderboardsPage");
const FollowingPage = lazyNamed(() => import("./pages/customer/FollowingPage.tsx"), "FollowingPage");
const NotificationsPage = lazyNamed(() => import("./pages/customer/NotificationsPage.tsx"), "NotificationsPage");
const ReplaysPage = lazyNamed(() => import("./pages/customer/ReplaysPage.tsx"), "ReplaysPage");
const SearchPage = lazyNamed(() => import("./pages/customer/SearchPage.tsx"), "SearchPage");
const CalendarPage = lazyNamed(() => import("./pages/customer/CalendarPage.tsx"), "CalendarPage");
const ProfilePage = lazyNamed(() => import("./pages/customer/ProfilePage.tsx"), "ProfilePage");
const CustomerLoginPage = lazyNamed(() => import("./pages/customer/CustomerLoginPage.tsx"), "CustomerLoginPage");
const CustomerRegisterPage = lazyNamed(() => import("./pages/customer/CustomerRegisterPage.tsx"), "CustomerRegisterPage");

// Admin Portal Pages (code-split)
const AdminLoginPage = lazyNamed(() => import("./pages/admin/AdminLoginPage.tsx"), "AdminLoginPage");
const AdminDashboardPage = lazyNamed(() => import("./pages/admin/AdminDashboardPage.tsx"), "AdminDashboardPage");
const AdminLiveStreamsPage = lazyNamed(() => import("./pages/admin/AdminLiveStreamsPage.tsx"), "AdminLiveStreamsPage");
const AdminMatchHealthPage = lazyNamed(() => import("./pages/admin/AdminMatchHealthPage.tsx"), "AdminMatchHealthPage");
const AdminScoreboardPage = lazyNamed(() => import("./pages/admin/AdminScoreboardPage.tsx"), "AdminScoreboardPage");
const AdminTournamentsPage = lazyNamed(() => import("./pages/admin/AdminTournamentsPage.tsx"), "AdminTournamentsPage");
const AdminFixturesPage = lazyNamed(() => import("./pages/admin/AdminFixturesPage.tsx"), "AdminFixturesPage");
const AdminTeamsPage = lazyNamed(() => import("./pages/admin/AdminTeamsPage.tsx"), "AdminTeamsPage");
const AdminPlayersPage = lazyNamed(() => import("./pages/admin/AdminPlayersPage.tsx"), "AdminPlayersPage");
const AdminRegistrationsPage = lazyNamed(() => import("./pages/admin/AdminRegistrationsPage.tsx"), "AdminRegistrationsPage");
const AdminPaymentsPage = lazyNamed(() => import("./pages/admin/AdminPaymentsPage.tsx"), "AdminPaymentsPage");
const AdminNotificationsPage = lazyNamed(() => import("./pages/admin/AdminNotificationsPage.tsx"), "AdminNotificationsPage");
const AdminHighlightsPage = lazyNamed(() => import("./pages/admin/AdminHighlightsPage.tsx"), "AdminHighlightsPage");
const AdminVenuesPage = lazyNamed(() => import("./pages/admin/AdminVenuesPage.tsx"), "AdminVenuesPage");
const AdminSponsorsPage = lazyNamed(() => import("./pages/admin/AdminSponsorsPage.tsx"), "AdminSponsorsPage");
const AdminModerationPage = lazyNamed(() => import("./pages/admin/AdminModerationPage.tsx"), "AdminModerationPage");
const AdminReportsPage = lazyNamed(() => import("./pages/admin/AdminReportsPage.tsx"), "AdminReportsPage");
const AdminAnalyticsPage = lazyNamed(() => import("./pages/admin/AdminAnalyticsPage.tsx"), "AdminAnalyticsPage");
const AdminOrganizerMonetizationPage = lazyNamed(() => import("./pages/admin/AdminOrganizerMonetizationPage.tsx"), "AdminOrganizerMonetizationPage");
const AdminAuditLogsPage = lazyNamed(() => import("./pages/admin/AdminAuditLogsPage.tsx"), "AdminAuditLogsPage");
const AdminUsersPage = lazyNamed(() => import("./pages/admin/AdminUsersPage.tsx"), "AdminUsersPage");
const AdminPermissionsPage = lazyNamed(() => import("./pages/admin/AdminPermissionsPage.tsx"), "AdminPermissionsPage");
const AdminSettingsPage = lazyNamed(() => import("./pages/admin/AdminSettingsPage.tsx"), "AdminSettingsPage");

// Dedicated Broadcast Studio, Broadcaster Portal & OBS Browser Source Pages (code-split)
const BroadcastOverlayConfigPage = lazyNamed(() => import("./pages/broadcast/BroadcastOverlayConfigPage.tsx"), "BroadcastOverlayConfigPage");
const ObsOverlayViewerPage = lazyNamed(() => import("./pages/broadcast/ObsOverlayViewerPage.tsx"), "ObsOverlayViewerPage");
const AdminObsBroadcastStudioPage = lazyNamed(() => import("./pages/admin/AdminObsBroadcastStudioPage.tsx"), "AdminObsBroadcastStudioPage");
const AdminBroadcastersPage = lazyNamed(() => import("./pages/admin/AdminBroadcastersPage.tsx"), "AdminBroadcastersPage");
const BroadcasterDashboardPage = lazyNamed(() => import("./pages/broadcaster/BroadcasterDashboardPage.tsx"), "BroadcasterDashboardPage");
const BroadcasterStudioPage = lazyNamed(() => import("./pages/broadcaster/BroadcasterStudioPage.tsx"), "BroadcasterStudioPage");
const CameraCompanionPage = lazyNamed(() => import("./pages/broadcast/CameraCompanionPage.tsx"), "CameraCompanionPage");

// Android Back Button Handler (non-blocking double-back exit toast instead of blocking window.confirm)
function AndroidBackButtonHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  const [exitHintVisible, setExitHintVisible] = useState(false);
  const lastBackPressRef = useRef<number>(0);
  const hintTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    let listenerHandle: any;

    CapacitorApp.addListener("backButton", () => {
      if (location.pathname !== "/") {
        navigate(-1);
        return;
      }
      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        CapacitorApp.exitApp();
      } else {
        lastBackPressRef.current = now;
        setExitHintVisible(true);
        if (hintTimerRef.current) {
          window.clearTimeout(hintTimerRef.current);
        }
        hintTimerRef.current = window.setTimeout(() => {
          setExitHintVisible(false);
        }, 2000);
      }
    }).then((handle) => {
      listenerHandle = handle;
    });

    return () => {
      listenerHandle?.remove();
      if (hintTimerRef.current) {
        window.clearTimeout(hintTimerRef.current);
      }
    };
  }, [navigate, location.pathname]);

  if (!exitHintVisible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[120] px-4 py-2 rounded-full bg-slate-900/95 text-white text-xs font-semibold shadow-lg border border-white/10 pointer-events-none"
    >
      Press back again to exit MaidanLive
    </div>
  );
}

function BroadcasterIndexRoute() {
  const { adminUser } = useAuth();

  if (adminUser?.role === "BROADCASTER") {
    return <BroadcasterStudioPage />;
  }

  return <Navigate to="/broadcaster/dashboard" replace />;
}

function RequireNonBroadcasterOverlayAccess() {
  const { adminUser } = useAuth();

  if (adminUser?.role === "BROADCASTER") {
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
            <BroadcastPreviewProvider>
              <BrowserRouter>
                <AndroidBackButtonHandler />

                <RouteErrorBoundary>
                  <Suspense fallback={<RouteLoadingFallback />}>
                    <Routes>
                      {/* Isolated Public OBS Studio Browser Source Route */}
                      <Route
                        path="/broadcast/overlay/view/:matchId"
                        element={<ObsOverlayViewerPage />}
                      />

                  {/* Standalone Mobile Camera Companion Route */}
                  <Route
                    path="/camera-connect/:cameraDocId"
                    element={<CameraCompanionPage />}
                  />

                  {/* OBS Broadcast Overlay Configuration Studio */}
                  <Route
                    path="/broadcast/overlay"
                    element={<RequireAdminAuth />}
                  >
                    <Route element={<AdminLayout />}>
                      <Route
                        index
                        element={<Navigate to="/admin/live-streams" replace />}
                      />
                      <Route
                        path=":matchId"
                        element={<RequireNonBroadcasterOverlayAccess />}
                      />
                    </Route>
                  </Route>

                  {/* Broadcaster Portal Routes */}
                  <Route path="/broadcaster" element={<RequireAdminAuth />}>
                    <Route element={<BroadcasterLayout />}>
                      <Route index element={<BroadcasterIndexRoute />} />
                      <Route
                        path="dashboard"
                        element={<BroadcasterDashboardPage />}
                      />
                      <Route
                        path="control-room"
                        element={<AdminObsBroadcastStudioPage />}
                      />
                      <Route
                        path="control-room/:matchId"
                        element={<AdminObsBroadcastStudioPage />}
                      />
                      <Route
                        path=":matchId"
                        element={<BroadcasterStudioPage />}
                      />
                    </Route>
                  </Route>

                  {/* Admin Portal Routes */}
                  <Route path="/admin/login" element={<AdminLoginPage />} />

                  <Route path="/admin" element={<RequireAdminAuth />}>
                    <Route element={<AdminLayout />}>
                      <Route
                        index
                        element={<Navigate to="/admin/dashboard" replace />}
                      />
                      <Route
                        path="dashboard"
                        element={<AdminDashboardPage />}
                      />
                      <Route
                        path="live-streams"
                        element={<AdminLiveStreamsPage />}
                      />
                      <Route
                        path="broadcasters"
                        element={<AdminBroadcastersPage />}
                      />
                      <Route
                        path="broadcast-studio"
                        element={<AdminObsBroadcastStudioPage />}
                      />
                      <Route
                        path="broadcast-studio/:matchId"
                        element={<AdminObsBroadcastStudioPage />}
                      />
                      <Route
                        path="match-health"
                        element={<AdminMatchHealthPage />}
                      />
                      <Route
                        path="scoreboard"
                        element={<AdminScoreboardPage />}
                      />
                      <Route
                        path="scoreboard/:id"
                        element={<AdminScoreboardPage />}
                      />
                      <Route
                        path="tournaments"
                        element={<AdminTournamentsPage />}
                      />
                      <Route
                        path="tournaments/:id/fixtures"
                        element={<AdminFixturesPage />}
                      />
                      <Route path="fixtures" element={<AdminFixturesPage />} />
                      <Route path="teams" element={<AdminTeamsPage />} />
                      <Route path="players" element={<AdminPlayersPage />} />
                      <Route
                        path="registrations"
                        element={<AdminRegistrationsPage />}
                      />
                      <Route path="payments" element={<AdminPaymentsPage />} />
                      <Route
                        path="notifications"
                        element={<AdminNotificationsPage />}
                      />
                      <Route
                        path="highlights"
                        element={<AdminHighlightsPage />}
                      />
                      <Route path="venues" element={<AdminVenuesPage />} />
                      <Route path="sponsors" element={<AdminSponsorsPage />} />
                      <Route
                        path="moderation"
                        element={<AdminModerationPage />}
                      />
                      <Route path="reports" element={<AdminReportsPage />} />
                      <Route
                        path="analytics"
                        element={<AdminAnalyticsPage />}
                      />
                      <Route
                        path="organizer"
                        element={<AdminOrganizerMonetizationPage />}
                      />
                      <Route
                        path="audit-logs"
                        element={<AdminAuditLogsPage />}
                      />
                      <Route path="users" element={<AdminUsersPage />} />
                      <Route
                        path="permissions"
                        element={<AdminPermissionsPage />}
                      />
                      <Route path="settings" element={<AdminSettingsPage />} />
                    </Route>
                  </Route>

                  {/* Customer Portal Routes */}
                  <Route element={<CustomerLayout />}>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/live" element={<LiveStreamsPage />} />
                    <Route path="/live/:id" element={<LiveMatchDetailPage />} />
                    <Route path="/tournaments" element={<TournamentsPage />} />
                    <Route
                      path="/tournaments/:id"
                      element={<TournamentDetailPage />}
                    />
                    <Route path="/teams" element={<TeamsPage />} />
                    <Route path="/teams/:id" element={<TeamDetailPage />} />
                    <Route path="/players" element={<PlayersPage />} />
                    <Route path="/players/:id" element={<PlayerDetailPage />} />
                    <Route
                      path="/leaderboards"
                      element={<LeaderboardsPage />}
                    />
                    <Route path="/following" element={<FollowingPage />} />
                    <Route
                      path="/notifications"
                      element={<NotificationsPage />}
                    />
                    <Route path="/replays" element={<ReplaysPage />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/calendar" element={<CalendarPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/login" element={<CustomerLoginPage />} />
                    <Route
                      path="/register"
                      element={<CustomerRegisterPage />}
                    />
                  </Route>

                      {/* Fallback */}
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </Suspense>
                </RouteErrorBoundary>

                <GlobalLiveMonitor />
                <FloatingScoreboardLogoPreview />
                <FloatingYouTubePreviewWindow />
              </BrowserRouter>
            </BroadcastPreviewProvider>
          </LiveMonitorProvider>
        </AuthProvider>
      </AdminThemeProvider>
    </LanguageProvider>
  );
}
