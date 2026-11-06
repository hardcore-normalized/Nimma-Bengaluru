import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { ThemeProvider } from './lib/theme';
import { LangProvider } from './lib/i18n';
import { ToastProvider } from './lib/toast';
import { CitizenProvider, ConfigProvider, OfficialProvider } from './lib/store';
import PublicLayout from './layouts/PublicLayout';
import Home from './pages/public/Home';
import Report from './pages/public/Report';
import Track from './pages/public/Track';
import MyReports from './pages/public/MyReports';
import About from './pages/public/About';
import Connect from './pages/public/Connect';
import { Empty, Spinner } from './components/ui';
import { CrayonDefs } from './components/CrayonArt';

// The admin portal is loaded only when needed (keeps the citizen app light on phones)
const OfficialLayout = lazy(() => import('./layouts/OfficialLayout'));
const Login = lazy(() => import('./pages/official/Login'));
const Dashboard = lazy(() => import('./pages/official/Dashboard'));
const Reports = lazy(() => import('./pages/official/Reports'));
const ReportDetail = lazy(() => import('./pages/official/ReportDetail'));
const OfficialMap = lazy(() => import('./pages/official/OfficialMap'));
const Reporter = lazy(() => import('./pages/official/Reporter'));
const Evidence = lazy(() => import('./pages/official/Evidence'));
const Account = lazy(() => import('./pages/official/Account'));
const Areas = lazy(() => import('./pages/official/admin/Areas'));
const WatchList = lazy(() => import('./pages/official/admin/WatchList'));
const Blocks = lazy(() => import('./pages/official/admin/Blocks'));
const Audit = lazy(() => import('./pages/official/admin/Audit'));
const Settings = lazy(() => import('./pages/official/admin/Settings'));
const Usage = lazy(() => import('./pages/official/admin/Usage'));
const Firewall = lazy(() => import('./pages/official/admin/Firewall'));

const S = ({ children }: { children: ReactNode }) => <Suspense fallback={<Spinner />}>{children}</Suspense>;

function NotFound() {
  return (
    <Empty title="Page not found">
      <Link to="/">Go to the home page</Link>
    </Empty>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <ToastProvider>
          <ConfigProvider>
            <CitizenProvider>
              <OfficialProvider>
                <CrayonDefs />
                <BrowserRouter>
                  <Routes>
                    <Route element={<PublicLayout />}>
                      <Route index element={<Home />} />
                      <Route path="report" element={<Report />} />
                      <Route path="track" element={<Track />} />
                      <Route path="track/:ref" element={<Track />} />
                      <Route path="my-reports" element={<MyReports />} />
                      <Route path="about" element={<About />} />
                      <Route path="connect" element={<Connect />} />
                      <Route path="*" element={<NotFound />} />
                    </Route>
                    <Route
                      path="official/login"
                      element={
                        <S>
                          <Login />
                        </S>
                      }
                    />
                    <Route
                      path="official/reporters/:id/evidence"
                      element={
                        <S>
                          <Evidence />
                        </S>
                      }
                    />
                    <Route
                      path="official"
                      element={
                        <S>
                          <OfficialLayout />
                        </S>
                      }
                    >
                      <Route index element={<S><Dashboard /></S>} />
                      <Route path="reports" element={<S><Reports /></S>} />
                      <Route path="reports/:ref" element={<S><ReportDetail /></S>} />
                      <Route path="map" element={<S><OfficialMap /></S>} />
                      <Route path="reporters/:id" element={<S><Reporter /></S>} />
                      <Route path="account" element={<S><Account /></S>} />
                      <Route path="admin/areas" element={<S><Areas /></S>} />
                      <Route path="admin/reporters" element={<S><WatchList /></S>} />
                      <Route path="admin/blocks" element={<S><Blocks /></S>} />
                      <Route path="admin/audit" element={<S><Audit /></S>} />
                      <Route path="admin/settings" element={<S><Settings /></S>} />
                      <Route path="admin/usage" element={<S><Usage /></S>} />
                      <Route path="admin/firewall" element={<S><Firewall /></S>} />
                    </Route>
                  </Routes>
                </BrowserRouter>
              </OfficialProvider>
            </CitizenProvider>
          </ConfigProvider>
        </ToastProvider>
      </LangProvider>
    </ThemeProvider>
  );
}
