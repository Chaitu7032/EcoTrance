import { Navigate, Route, Routes } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { AuditPage } from "./pages/AuditPage";
import { AuditsPage } from "./pages/AuditsPage";
import { ClaimPage } from "./pages/ClaimPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/audits" element={<AuditsPage />} />
      <Route path="/audit/:id" element={<AuditPage />} />
      <Route path="/audit/:id/claim/:claimId" element={<ClaimPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
