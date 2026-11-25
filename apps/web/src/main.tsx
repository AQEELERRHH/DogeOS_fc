import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./styles.css";
import { WalletRoot } from "./wallet/WalletContext";
import { Landing } from "./pages/Landing";

const Play = lazy(() => import("./pages/Play").then((m) => ({ default: m.Play })));

function Loading() {
  return <div className="grid min-h-screen place-items-center font-pixel text-xs text-cyan">WARMING UP…</div>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <WalletRoot>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/play" element={<Play />} />
            <Route path="/football" element={<Navigate to="/play" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </WalletRoot>
    </BrowserRouter>
  </StrictMode>,
);
