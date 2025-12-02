import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { MeetingProvider } from './context/MeetingContext';
import { SidebarProvider } from './context/SidebarContext';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import MeetingCreation from './pages/MeetingCreation';
import QRScanner from './pages/QRScanner';
import TranscriptionViewer from './pages/TranscriptionViewer';
import MinutesReview from './pages/MinutesReview';
import TaskList from './pages/TaskList';
import './App.css';

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('accessToken');
  return token ? children : <Navigate to="/login" />;
};

function App() {
  return (
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
            </Routes>
          </div>
        </Router>
        </SidebarProvider>
      </MeetingProvider>
    </AuthProvider>
  );
}

export default App;
