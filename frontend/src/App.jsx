import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { MeetingProvider } from './context/MeetingContext';
import { SidebarProvider } from './context/SidebarContext';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import MeetingCreation from './pages/MeetingCreation';
import MeetingList from './pages/MeetingList';
import MeetingDetail from './pages/MeetingDetail';
import MeetingQR from './pages/MeetingQR';
import QRScanner from './pages/QRScanner';
import Transcription from './pages/Transcription';
import TranscriptionViewer from './pages/TranscriptionViewer';
import MinutesReview from './pages/MinutesReview';
import TaskList from './pages/TaskList';
import TaskCreation from './pages/TaskCreation';
import TaskDetail from './pages/TaskDetail';
import Analytics from './pages/Analytics';
import NotFound from './pages/NotFound';
import './App.css';

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('accessToken');
  return token ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <MeetingProvider>
          <SidebarProvider>
            <Router>
              <div className="app">
                <Navbar />
              <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route
                path="/"
                element={
                  <PrivateRoute>
                    <div className="app-layout">
                      <Sidebar />
                      <main className="app-main">
                        <Dashboard />
                      </main>
                    </div>
                  </PrivateRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <PrivateRoute>
                    <div className="app-layout">
                      <Sidebar />
                      <main className="app-main">
                        <Dashboard />
                      </main>
                    </div>
                  </PrivateRoute>
                }
              />
              <Route
                path="/meetings"
                element={
                  <PrivateRoute>
                    <div className="app-layout">
                      <Sidebar />
                      <main className="app-main">
                        <MeetingList />
                      </main>
                    </div>
                  </PrivateRoute>
                }
              />
              <Route
                path="/meetings/create"
                element={
                  <PrivateRoute>
                    <div className="app-layout">
                      <Sidebar />
                      <main className="app-main">
                        <MeetingCreation />
                      </main>
                    </div>
                  </PrivateRoute>
                }
              />
              <Route
                path="/meetings/:id"
                element={
                  <PrivateRoute>
                    <div className="app-layout">
                      <Sidebar />
                      <main className="app-main">
                        <MeetingDetail />
                      </main>
                    </div>
                  </PrivateRoute>
                }
              />
              <Route
                path="/meetings/:id/qr"
                element={
                  <PrivateRoute>
                    <div className="app-layout">
                      <Sidebar />
                      <main className="app-main">
                        <MeetingQR />
                      </main>
                    </div>
                  </PrivateRoute>
                }
              />
              <Route
                path="/qr-scanner"
                element={
                  <PrivateRoute>
                    <div className="app-layout">
                      <Sidebar />
                      <main className="app-main">
                        <QRScanner />
                      </main>
                    </div>
                  </PrivateRoute>
                }
              />
              <Route
                path="/transcription"
                element={
                  <PrivateRoute>
                    <div className="app-layout">
                      <Sidebar />
                      <main className="app-main">
                        <Transcription />
                      </main>
                    </div>
                  </PrivateRoute>
                }
              />
              <Route
                path="/transcription/:meetingId"
                element={
                  <PrivateRoute>
                    <div className="app-layout">
                      <Sidebar />
                      <main className="app-main">
                        <TranscriptionViewer />
                      </main>
                    </div>
                  </PrivateRoute>
                }
              />
              <Route
                path="/minutes"
                element={
                  <PrivateRoute>
                    <div className="app-layout">
                      <Sidebar />
                      <main className="app-main">
                        <MinutesReview />
                      </main>
                    </div>
                  </PrivateRoute>
                }
              />
              <Route
                path="/tasks"
                element={
                  <PrivateRoute>
                    <div className="app-layout">
                      <Sidebar />
                      <main className="app-main">
                        <TaskList />
                      </main>
                    </div>
                  </PrivateRoute>
                }
              />
              <Route
                path="/tasks/create"
                element={
                  <PrivateRoute>
                    <div className="app-layout">
                      <Sidebar />
                      <main className="app-main">
                        <TaskCreation />
                      </main>
                    </div>
                  </PrivateRoute>
                }
              />
              <Route
                path="/tasks/:id"
                element={
                  <PrivateRoute>
                    <div className="app-layout">
                      <Sidebar />
                      <main className="app-main">
                        <TaskDetail />
                      </main>
                    </div>
                  </PrivateRoute>
                }
              />
              <Route
                path="/analytics"
                element={
                  <PrivateRoute>
                    <div className="app-layout">
                      <Sidebar />
                      <main className="app-main">
                        <Analytics />
                      </main>
                    </div>
                  </PrivateRoute>
                }
              />
              {/* 404 - Catch all unmatched routes */}
              <Route
                path="*"
                element={
                  <div className="app-layout">
                    <main className="app-main">
                      <NotFound />
                    </main>
                  </div>
                }
              />
            </Routes>
          </div>
        </Router>
        </SidebarProvider>
      </MeetingProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
