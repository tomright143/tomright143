import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Workspace from "@/pages/Workspace";
import Pricing from "@/pages/Pricing";
import Settings from "@/pages/Settings";
import AuthCallback from "@/pages/AuthCallback";
import Admin from "@/pages/Admin";
import SharedReview from "@/pages/SharedReview";
import { Toaster } from "sonner";

function Router() {
  const location = useLocation();
  // Handle Emergent OAuth callback synchronously during render
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/workspace/:id" element={<ProtectedRoute><Workspace /></ProtectedRoute>} />
      <Route path="/pricing" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
      <Route path="/shared/:token" element={<SharedReview />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Router />
        </BrowserRouter>
      </AuthProvider>
      <Toaster theme="dark" position="bottom-right"/>
    </div>
  );
}

export default App;
